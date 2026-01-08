import fs from 'node:fs';
import {
  fileURLToPath,
  type URLPatternOptions,
  type URLPatternInit,
} from 'node:url';
import type { FixtureEntry, UrlPatternArgs } from './fixture-types';

interface PatternEntry {
  pattern?: unknown[];
  inputs?: unknown[];
  expected_match?: Record<
    string,
    { input: string; groups: Record<string, string | null> }
  > | null;
}

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
  Record<string, string | null>
>;

type Fixture = FixtureEntry;

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

function isJavascriptPathname(pathname: string): boolean {
  return /var\s+x\s*=\s*1;?/.test(pathname);
}

function buildOpaqueUrl(
  protocol: string,
  inputObject: InputObject,
): URL | null {
  const pathname = inputObject.pathname ?? '';
  const search = inputObject.search ? normalizeSearch(inputObject.search) : '';
  const hash = inputObject.hash ? normalizeHash(inputObject.hash) : '';
  try {
    return new URL(`${protocol}:${pathname}${search}${hash}`);
  } catch {
    return null;
  }
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
  if (inputObject.protocol && !inputObject.hostname) {
    if (inputObject.protocol === 'javascript') {
      return buildOpaqueUrl(inputObject.protocol, inputObject);
    }

    const opaque = buildOpaqueUrl(inputObject.protocol, inputObject);
    if (opaque) {
      return opaque;
    }
  }

  if (!inputObject.protocol && !inputObject.hostname && inputObject.pathname) {
    if (isJavascriptPathname(inputObject.pathname)) {
      return buildOpaqueUrl('javascript', inputObject);
    }
  }

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
    const pathname = inputObject.pathname || '';
    if (pathname.startsWith('/') || pathname === '') {
      url.pathname = pathname;
    } else {
      const resolved = new URL(pathname, url);
      url.pathname = resolved.pathname;
    }
  }

  if (inputObject.search !== undefined) {
    url.search = normalizeSearch(inputObject.search);
  }

  if (inputObject.hash !== undefined) {
    url.hash = normalizeHash(inputObject.hash);
  }

  return url;
}

const DEFAULT_PATTERN_BASE_URL = 'http://example.com';

function buildUrlPatternArgs(
  entryPattern: unknown[],
): UrlPatternArgs | null {
  if (!entryPattern.length) {
    return null;
  }

  const input = entryPattern[0] as URLPatternInit | string;
  const maybeBaseURL = entryPattern[1];
  const maybeOptions = entryPattern[2];

  const hasScheme =
    typeof input === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);
  const baseURL =
    typeof maybeBaseURL === 'string'
      ? maybeBaseURL
      : !hasScheme && typeof input === 'string'
        ? DEFAULT_PATTERN_BASE_URL
        : undefined;
  const options =
    maybeOptions && typeof maybeOptions === 'object'
      ? (maybeOptions as URLPatternOptions)
      : typeof maybeBaseURL === 'object'
        ? (maybeBaseURL as URLPatternOptions)
        : undefined;

  const args: UrlPatternArgs = [input];
  if (baseURL !== undefined) {
    args.push(baseURL);
  }

  if (options !== undefined) {
    if (baseURL === undefined) {
      args.push(options);
    } else {
      args.push(options);
    }
  }

  return args;
}

function buildParams(
  expectedMatch: NonNullable<PatternEntry['expected_match']>,
  inputObject?: InputObject,
): Params {
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
    if (!match) {
      params[key] = {};
      continue;
    }

    if (match.groups && Object.keys(match.groups).length > 0) {
      params[key] = match.groups;
      continue;
    }

    const inputValue = inputObject?.[key];
    if (
      typeof inputValue === 'string' &&
      match.input.includes('%') &&
      !inputValue.includes('%')
    ) {
      params[key] = { 0: inputValue };
      continue;
    }

    params[key] = match.input ? { 0: match.input } : {};
  }

  return params;
}

function parseInput(
  entryInputs: unknown[],
): { input: unknown; baseURL?: string } | null {
  if (!entryInputs.length) {
    return null;
  }

  const input = entryInputs[0];
  const baseURL =
    typeof entryInputs[1] === 'string' ? entryInputs[1] : undefined;

  return baseURL !== undefined ? { input, baseURL } : { input };
}

export function transformTestData(entries: PatternEntry[]): Fixture[] {
  const fixtures: Fixture[] = [];

  entries.forEach((entry, caseIndex) => {
    if (!entry.pattern || !entry.inputs || !entry.expected_match) {
      return;
    }

    const urlPatternArgs = buildUrlPatternArgs(entry.pattern);
    if (!urlPatternArgs) {
      return;
    }

    let pattern: URLPattern;
    try {
      pattern = new URLPattern(...urlPatternArgs);
    } catch {
      return;
    }

    if (pattern.hasRegExpGroups) {
      return;
    }

    const parsedInput = parseInput(entry.inputs);
    if (!parsedInput) {
      return;
    }

    const expectedUrl = buildUrlFromInput(
      parsedInput.input,
      parsedInput.baseURL,
    );
    if (!expectedUrl) {
      return;
    }

    if (
      expectedUrl.protocol !== 'http:' &&
      expectedUrl.protocol !== 'https:' &&
      expectedUrl.protocol !== 'javascript:'
    ) {
      return;
    }

    const params = buildParams(
      entry.expected_match,
      parsedInput.input && typeof parsedInput.input === 'object'
        ? (parsedInput.input as InputObject)
        : undefined,
    );
    const url = new URL(expectedUrl.href);
    const fallbackValues = {
      protocol: url.protocol.replace(/:$/, ''),
      hostname: url.hostname,
      port: url.port,
      username: url.username,
      password: url.password,
      pathname: url.pathname,
      search: url.search.replace(/^\?/, ''),
      hash: url.hash.replace(/^#/, ''),
    };

    for (const key of PARAM_KEYS) {
      if (Object.keys(params[key]).length === 0 && fallbackValues[key]) {
        params[key] = { 0: fallbackValues[key] };
      }
    }

    fixtures.push({
      caseIndex,
      urlPatternArgs,
      params,
      expectedUrl: expectedUrl.href,
    });
  });

  return fixtures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataUrl = new URL(
    './raw-fixtures/urlpatterntestdata.json',
    import.meta.url,
  );
  const outputUrl = new URL('./fixture-data.ts', import.meta.url);

  const raw = fs.readFileSync(dataUrl, 'utf8');
  const entries = JSON.parse(raw) as PatternEntry[];

  const fixtures = transformTestData(entries);
  const output =
    `// Generated by tests/transform-testdata.ts\n` +
    `import type { FixtureEntry } from './fixture-types';\n` +
    `export const fixtureData: FixtureEntry[] = ${JSON.stringify(
      fixtures,
      null,
      2,
    )};\n`;
  fs.writeFileSync(outputUrl, output, 'utf8');

  console.log(`Wrote ${fixtures.length} fixtures to ${outputUrl.pathname}`);
}
