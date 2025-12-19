import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

type PatternEntry = {
  pattern?: unknown[];
  inputs?: unknown[];
  expected_match?: Record<string, { input: string; groups: Record<string, string> }> | null;
};

type InputObject = Record<string, unknown> & {
  baseURL?: string;
  protocol?: string;
  hostname?: string;
  port?: string;
  username?: string;
  password?: string;
  pathname?: string;
  search?: string;
  hash?: string;
};

type Params = Record<
  | 'pathname'
  | 'search'
  | 'hash'
  | 'username'
  | 'password'
  | 'protocol'
  | 'hostname'
  | 'port',
  Record<string, string>
>;

export type Fixture = {
  caseIndex: number;
  pattern: unknown[];
  input: unknown;
  baseURL?: string;
  params: Params;
  expectedUrl: string;
};

const PARAM_KEYS = [
  'pathname',
  'search',
  'hash',
  'username',
  'password',
  'protocol',
  'hostname',
  'port',
] as const;

function normalizeSearch(value?: string): string {
  if (!value) {
    return '';
  }
  return value.startsWith('?') ? value : `?${value}`;
}

function normalizeHash(value?: string): string {
  if (!value) {
    return '';
  }
  return value.startsWith('#') ? value : `#${value}`;
}

const DEFAULT_BASE_URL = 'http://example.com';

function buildBaseUrl(input: InputObject, fallback?: string): string {
  if (fallback) {
    return fallback;
  }
  if (input.baseURL) {
    return input.baseURL;
  }
  if (input.protocol && input.hostname) {
    const port = input.port ? `:${input.port}` : '';
    return `${input.protocol}://${input.hostname}${port}`;
  }
  return DEFAULT_BASE_URL;
}

function buildUrlFromInput(input: unknown, baseURL?: string): URL | null {
  if (typeof input === 'string') {
    try {
      return baseURL ? new URL(input, baseURL) : new URL(input);
    } catch {
      return null;
    }
  }

  if (!input || typeof input !== 'object') {
    return null;
  }

  const inputObject = input as InputObject;
  const resolvedBase = buildBaseUrl(inputObject, baseURL);

  const url = new URL(resolvedBase);

  if (inputObject.protocol) {
    url.protocol = `${inputObject.protocol}:`;
  }
  if (inputObject.username) {
    url.username = inputObject.username;
  }
  if (inputObject.password) {
    url.password = inputObject.password;
  }
  if (inputObject.hostname) {
    url.hostname = inputObject.hostname;
  }
  if (inputObject.port) {
    url.port = inputObject.port;
  }
  if (inputObject.pathname !== undefined) {
    url.pathname = inputObject.pathname || '';
  }
  if (inputObject.search !== undefined) {
    url.search = normalizeSearch(inputObject.search);
  }
  if (inputObject.hash !== undefined) {
    url.hash = normalizeHash(inputObject.hash);
  }

  return url;
}

function parsePattern(entryPattern: unknown[]): URLPattern | null {
  if (!entryPattern.length) {
    return null;
  }

  const patternInit = entryPattern[0] as URLPatternInput | string;
  const second = entryPattern[1];
  const third = entryPattern[2];

  const baseURL = typeof second === 'string' ? second : undefined;
  const options =
    (third && typeof third === 'object')
      ? (third as URLPatternOptions)
      : (typeof second === 'object' ? (second as URLPatternOptions) : undefined);

  try {
    if (baseURL && options) {
      return new URLPattern(patternInit, baseURL, options);
    }
    if (baseURL) {
      return new URLPattern(patternInit, baseURL);
    }
    if (options) {
      return new URLPattern(patternInit, options);
    }
    return new URLPattern(patternInit);
  } catch {
    return null;
  }
}

function buildParams(expectedMatch: NonNullable<PatternEntry['expected_match']>): Params {
  const params: Params = {
    pathname: {},
    search: {},
    hash: {},
    username: {},
    password: {},
    protocol: {},
    hostname: {},
    port: {},
  };

  for (const key of PARAM_KEYS) {
    const match = expectedMatch[key];
    params[key] = match?.groups ?? {};
  }

  return params;
}

function parseInput(entryInputs: unknown[]): { input: unknown; baseURL?: string } | null {
  if (!entryInputs.length) {
    return null;
  }

  const input = entryInputs[0];
  const baseURL = typeof entryInputs[1] === 'string' ? entryInputs[1] : undefined;

  return { input, baseURL };
}

export function transformTestData(entries: PatternEntry[]): Fixture[] {
  const fixtures: Fixture[] = [];

  entries.forEach((entry, caseIndex) => {
    if (!entry.pattern || !entry.inputs || !entry.expected_match) {
      return;
    }

    const pattern = parsePattern(entry.pattern);
    if (!pattern || pattern.hasRegExpGroups) {
      return;
    }

    const parsedInput = parseInput(entry.inputs);
    if (!parsedInput) {
      return;
    }

    const expectedUrl = buildUrlFromInput(parsedInput.input, parsedInput.baseURL);
    if (!expectedUrl) {
      return;
    }

    fixtures.push({
      caseIndex,
      pattern: entry.pattern,
      input: parsedInput.input,
      baseURL: parsedInput.baseURL,
      params: buildParams(entry.expected_match),
      expectedUrl: expectedUrl.href,
    });
  });

  return fixtures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataUrl = new URL('./raw-fixtures/urlpatterntestdata.json', import.meta.url);
  const outputUrl = new URL('./fixture-data.ts', import.meta.url);

  const raw = fs.readFileSync(dataUrl, 'utf8');
  const entries = JSON.parse(raw) as PatternEntry[];

  const fixtures = transformTestData(entries);
  const output =
    `// Generated by tests/transform-testdata.ts\n` +
    `export const fixtureData = ${JSON.stringify(fixtures, null, 2)} as const;\n`;
  fs.writeFileSync(outputUrl, output, 'utf8');

  console.log(`Wrote ${fixtures.length} fixtures to ${outputUrl.pathname}`);
}
