import JSON5 from 'json5';
import * as prettier from 'prettier/standalone';
import * as prettierPluginBabel from 'prettier/plugins/babel';
import * as prettierPluginEstree from 'prettier/plugins/estree';

import {
  generate,
  type ParamKeys,
  type GenerateParams,
  type StringifyFunction,
} from '../src/index';

declare global {
  interface Window {
    generate: typeof generate;
  }
}

const PARAM_KEYS: ParamKeys[] = [
  'protocol',
  'hostname',
  'port',
  'username',
  'password',
  'pathname',
  'search',
  'hash',
];

interface StringifierOption {
  value: 'default' | 'json' | 'urlsearch' | 'custom';
  label: string;
}

interface PatternInfo {
  pattern: URLPattern;
  code: string;
}

type ParamInputValue = GenerateParams[ParamKeys];

const stringifierOptions: StringifierOption[] = [
  { value: 'default', label: 'default (String)' },
  { value: 'json', label: 'JSON.stringify' },
  { value: 'urlsearch', label: 'URLSearchParams for objects' },
  { value: 'custom', label: 'custom' },
];

window.generate = generate;

const patternCodeEl = getElementById('pattern-code', HTMLPreElement);
const outputCodeEl = getElementById('output-code', HTMLPreElement);
const outputEl = getElementById('output', HTMLDivElement);
const statusEl = getElementById('status', HTMLParagraphElement);
const execInput = getElementById('exec-input', HTMLInputElement);
const execButton = getElementById('exec-button', HTMLButtonElement);
const execOutput = getElementById('exec-output', HTMLDivElement);
const generateButton = getElementById('generate', HTMLButtonElement);
const optionsBody = getElementById('options-body', HTMLTableSectionElement);
const groupsGrid = getElementById('groups-grid', HTMLDivElement);
const tabButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('.tab-button'),
);
const tabContents = Array.from(
  document.querySelectorAll<HTMLElement>('.tab-content'),
);
const customStringifiers = new Map<ParamKeys, string>();

function getElementById<T extends typeof HTMLElement>(
  id: string,
  expectedType: T,
): InstanceType<T> {
  const element = document.getElementById(id);

  if (!(element instanceof expectedType)) {
    throw new Error(`Missing required element #${id}`);
  }

  return element as InstanceType<T>;
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function setCode(target: HTMLElement, text: string, isError = false): void {
  target.textContent = text;
  target.classList.toggle('code-error', isError);
}

function setOutput(message: string, isError = false): void {
  outputEl.textContent = message;
  outputEl.classList.toggle('error', isError);
}

function getActiveTab(): string | undefined {
  return document.querySelector<HTMLElement>('.tab-button.active')?.dataset[
    'tab'
  ];
}

function buildPatternFromUI(): PatternInfo {
  if (getActiveTab() === 'string') {
    const patternString = getElementById(
      'pattern-string',
      HTMLInputElement,
    ).value;

    return {
      pattern: new URLPattern(patternString),
      code: `const pattern = new URLPattern(${JSON.stringify(patternString)});`,
    };
  }

  const patternObject: Partial<Record<ParamKeys, string>> = {};

  for (const field of PARAM_KEYS) {
    const value = getElementById(field, HTMLInputElement).value;

    if (value) {
      patternObject[field] = value;
    }
  }

  return {
    pattern: new URLPattern(patternObject),
    code: `const pattern = new URLPattern(${JSON.stringify(patternObject, null, 2)});`,
  };
}

function parseGroups(key: ParamKeys): Record<string, unknown> {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    `[data-groups="${key}"]`,
  );

  if (!textarea) {
    return {};
  }

  const raw = textarea.value.trim();

  if (!raw) {
    return {};
  }

  return JSON5.parse(raw);
}

function buildCustomStringifier(text: string): StringifyFunction | undefined {
  const trimmed = text.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    // The demo allows user-authored stringifiers and intentionally evaluates them.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
    const candidate = new Function(`return (${trimmed})`)() as unknown;

    if (typeof candidate === 'function') {
      return candidate as StringifyFunction;
    }
  } catch {
    // Fall through to function-body parsing.
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return new Function('value', trimmed) as unknown as StringifyFunction;
  } catch {
    return undefined;
  }
}

function resolveStringifier(key: ParamKeys): StringifyFunction | undefined {
  const select = document.querySelector<HTMLSelectElement>(
    `[data-stringifier="${key}"]`,
  );

  if (!select) {
    return undefined;
  }

  if (select.value === 'default') {
    return undefined;
  }

  if (select.value === 'json') {
    return (value) => JSON.stringify(value);
  }

  if (select.value === 'urlsearch') {
    return (value) => {
      if (value instanceof URLSearchParams) {
        return value.toString();
      }

      if (value && typeof value === 'object') {
        return new URLSearchParams(
          value as Record<string, string> | string[][] | URLSearchParams,
        ).toString();
      }

      return String(value);
    };
  }

  if (select.value === 'custom') {
    return buildCustomStringifier(customStringifiers.get(key) ?? '');
  }

  return undefined;
}

function buildParams(): GenerateParams {
  const params: GenerateParams = {};

  for (const key of PARAM_KEYS) {
    let groups: Record<string, unknown>;

    try {
      groups = parseGroups(key);
    } catch {
      throw new Error(`Invalid JSON5 for ${key} groups.`);
    }

    const disableEncoding =
      document.querySelector<HTMLInputElement>(`[data-disable="${key}"]`)
        ?.checked ?? false;
    const stringify = resolveStringifier(key);
    const value: NonNullable<ParamInputValue> = { groups };

    if (disableEncoding) {
      value.disableEncoding = true;
    }

    if (stringify) {
      value.stringify = stringify;
    }

    if (Object.keys(groups).length > 0 || disableEncoding || stringify) {
      params[key] = value;
    }
  }

  return params;
}

function buildParamsCode(params: GenerateParams): string {
  const entries = Object.entries(params) as [
    ParamKeys,
    NonNullable<ParamInputValue>,
  ][];

  if (entries.length === 0) {
    return 'const params = {};';
  }

  const serialized = entries.map(([key, value]) => {
    const lines = [`groups: ${JSON.stringify(value.groups ?? {}, null, 2)}`];
    const stringifierSelect = document.querySelector<HTMLSelectElement>(
      `[data-stringifier="${key}"]`,
    );

    if (value.disableEncoding) {
      lines.push('disableEncoding: true');
    }

    if (value.stringify && stringifierSelect?.value === 'custom') {
      lines.push(
        `stringify: ${(customStringifiers.get(key) ?? '() => ""').trim()}`,
      );
    }

    if (value.stringify && stringifierSelect?.value === 'json') {
      lines.push('stringify: JSON.stringify');
    }

    if (value.stringify && stringifierSelect?.value === 'urlsearch') {
      lines.push('stringify: (value) => new URLSearchParams(value).toString()');
    }

    return `  ${key}: {\n    ${lines.join(',\n    ')}\n  }`;
  });

  return `const params = {\n${serialized.join(',\n')}\n};`;
}

async function formatCode(code: string): Promise<string> {
  try {
    return await prettier.format(code, {
      parser: 'babel',
      plugins: [prettierPluginBabel, prettierPluginEstree],
      singleQuote: true,
      trailingComma: 'all',
    });
  } catch {
    return code;
  }
}

function updatePatternCode(): void {
  try {
    const { code } = buildPatternFromUI();

    setCode(patternCodeEl, code);
  } catch (error) {
    setCode(patternCodeEl, `// Error: ${getErrorMessage(error)}`, true);
  }
}

function execPattern(): void {
  setStatus('');

  try {
    const { pattern } = buildPatternFromUI();
    const value = execInput.value.trim();
    const result = value ? pattern.exec(value) : null;

    execOutput.innerHTML = '';

    if (!result) {
      return;
    }

    const rootDetails = document.createElement('details');

    const rootSummary = document.createElement('summary');
    rootSummary.textContent = 'match';
    rootDetails.appendChild(rootSummary);

    for (const key of PARAM_KEYS) {
      const component = result[key];

      if (!component) {
        continue;
      }

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      const pre = document.createElement('pre');
      summary.textContent = key;
      pre.className = 'code-block';
      pre.textContent = JSON.stringify(component, null, 2);
      details.appendChild(summary);
      details.appendChild(pre);
      rootDetails.appendChild(details);
    }

    execOutput.appendChild(rootDetails);
  } catch (error) {
    execOutput.innerHTML = '';

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const pre = document.createElement('pre');
    summary.textContent = 'Error';
    pre.className = 'code-block';
    pre.textContent = getErrorMessage(error);
    details.appendChild(summary);
    details.appendChild(pre);
    execOutput.appendChild(details);
  }
}

async function generateUrl(): Promise<void> {
  setStatus('');

  let patternInfo: PatternInfo | undefined;
  let params: GenerateParams | undefined;
  let paramsCode = '';

  try {
    patternInfo = buildPatternFromUI();
    params = buildParams();
    paramsCode = buildParamsCode(params);

    const outputCode = await formatCode(
      `${patternInfo.code}\n\n${paramsCode}\n\nconst url = generate(pattern, params);`,
    );
    const url = generate(patternInfo.pattern, params);

    setCode(patternCodeEl, patternInfo.code);
    setCode(outputCodeEl, outputCode);
    setOutput(url.href);
    execInput.value = url.href;
  } catch (error) {
    if (patternInfo?.code) {
      setCode(patternCodeEl, patternInfo.code);
    } else {
      updatePatternCode();
    }

    if (!paramsCode && params) {
      paramsCode = buildParamsCode(params);
    }

    const parts = [];

    if (patternInfo?.code) {
      parts.push(patternInfo.code);
    }

    if (paramsCode) {
      parts.push(paramsCode);
    }

    if (patternInfo?.code || paramsCode) {
      parts.push('const url = generate(pattern, params);');
    }

    const errorLine = `// Error: ${getErrorMessage(error)}`;
    const outputCode = await formatCode(
      parts.length > 0 ? `${parts.join('\n\n')}\n\n${errorLine}` : errorLine,
    );

    setCode(outputCodeEl, outputCode, true);
    setOutput(`Error: ${getErrorMessage(error)}`, true);
    setStatus(getErrorMessage(error));
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handleCopy(event: Event): void {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
    '[data-copy]',
  );

  if (!target) {
    return;
  }

  const source =
    target.dataset['copy'] === 'pattern' ? patternCodeEl : outputCodeEl;
  void navigator.clipboard.writeText(source.textContent ?? '');
}

function setupTabs(): void {
  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      const tab = button.dataset['tab'];

      for (const candidate of tabButtons) {
        candidate.classList.toggle('active', candidate.dataset['tab'] === tab);
      }

      for (const content of tabContents) {
        content.hidden = content.dataset['tab'] !== tab;
      }

      updatePatternCode();
    });
  }
}

function renderOptions(): void {
  optionsBody.innerHTML = '';

  for (const key of PARAM_KEYS) {
    const row = document.createElement('tr');
    const paramCell = document.createElement('td');
    const disableCell = document.createElement('td');
    const disableInput = document.createElement('input');
    const stringifierCell = document.createElement('td');
    const select = document.createElement('select');
    const actionCell = document.createElement('td');
    const editButton = document.createElement('button');
    const popover = document.createElement('div');
    const closeButton = document.createElement('button');
    const popoverLabel = document.createElement('label');
    const textarea = document.createElement('textarea');

    paramCell.textContent = key;
    disableInput.type = 'checkbox';
    disableInput.dataset['disable'] = key;
    disableCell.appendChild(disableInput);

    select.dataset['stringifier'] = key;

    for (const option of stringifierOptions) {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      select.appendChild(opt);
    }

    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.className = 'secondary';
    editButton.style.display = 'none';

    popover.className = 'popover';
    popover.popover = 'auto';
    popover.id = `popover-${key}`;

    closeButton.type = 'button';
    closeButton.className = 'secondary popover-close';
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => popover.hidePopover());

    popoverLabel.textContent = `Custom stringifier for ${key}`;
    textarea.placeholder = 'e.g. (value) => JSON.stringify(value)';
    textarea.value = customStringifiers.get(key) ?? '(value) => String(value)';
    customStringifiers.set(key, textarea.value);
    textarea.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') {
        return;
      }

      event.preventDefault();

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      textarea.value = `${value.slice(0, start)}\t${value.slice(end)}`;
      textarea.selectionStart = start + 1;
      textarea.selectionEnd = start + 1;
    });

    textarea.addEventListener('input', () => {
      customStringifiers.set(key, textarea.value);
    });

    popover.appendChild(closeButton);
    popover.appendChild(popoverLabel);
    popover.appendChild(textarea);

    editButton.setAttribute('popovertarget', popover.id);

    select.addEventListener('change', () => {
      editButton.style.display =
        select.value === 'custom' ? 'inline-flex' : 'none';
    });

    popover.addEventListener('toggle', () => {
      if (!popover.matches(':popover-open')) {
        return;
      }

      setTimeout(() => textarea.focus(), 0);
    });

    stringifierCell.appendChild(select);
    actionCell.appendChild(editButton);
    actionCell.appendChild(popover);
    row.appendChild(paramCell);
    row.appendChild(disableCell);
    row.appendChild(stringifierCell);
    row.appendChild(actionCell);
    optionsBody.appendChild(row);
  }
}

function renderGroups(): void {
  groupsGrid.innerHTML = '';

  for (const key of PARAM_KEYS) {
    const row = document.createElement('div');
    const label = document.createElement('label');
    const textarea = document.createElement('textarea');

    row.className = 'groups-row';
    label.textContent = key;
    textarea.dataset['groups'] = key;
    textarea.value =
      key === 'pathname' ? '{ id: 123 }'
      : key === 'search' ? "{ q: 'red shoes' }"
      : key === 'hash' ? "{ '0': 1 }"
      : '{}';

    row.appendChild(label);
    row.appendChild(textarea);
    groupsGrid.appendChild(row);
  }
}

setupTabs();
renderOptions();
renderGroups();
updatePatternCode();

async function initializeDemo(): Promise<void> {
  await generateUrl();
  execPattern();
}

void initializeDemo();

document.body.addEventListener('click', handleCopy);
execButton.addEventListener('click', execPattern);
generateButton.addEventListener('click', () => {
  void generateUrl();
});
