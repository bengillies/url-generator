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

export type ParamKeys = (typeof PARAM_KEYS)[number];
export type ParamValues = Record<string | number, unknown>;
export type Params = Record<ParamKeys, ParamValues>;

export type StringifyFunction = (value: unknown) => string;
export interface GenerateOptions {
  stringifier?: StringifyFunction;
  hierarchicalSchemes?: string[];
}

type HandlerFunction = (
  pattern: string,
  params: ParamValues,
  stringifier?: StringifyFunction,
  encoder?: EncodeFunction,
) => string;
type Handlers = Record<ParamKeys, HandlerFunction>;

const identifierRegExp = /[\p{ID_Start}\p{ID_Continue}$_0-9]+/u;

type ParamModifier = '' | '?' | '*' | '+';
interface ParamToken {
  type: 'param';
  name: string | number;
  modifier: ParamModifier;
  prefix: string;
  allowSlash?: boolean;
}
interface GroupToken {
  type: 'group';
  tokens: PatternToken[];
  modifier: ParamModifier;
}
type PatternToken = string | ParamToken | GroupToken;
type EncodeFunction = (value: string, token?: ParamToken) => string;

function defaultStringify(value: unknown): string {
  return String(value);
}

function stringifyValue(
  value: unknown,
  stringifier: StringifyFunction = defaultStringify,
): string {
  return typeof value === 'string' ? value : stringifier(value);
}

function isModifier(char?: string): char is ParamModifier {
  return char === '?' || char === '*' || char === '+';
}

function findClosing(
  pattern: string,
  startIndex: number,
  closingChar: string,
): number {
  let closingIndex = pattern.length;
  for (let i = startIndex; i < pattern.length; i += 1) {
    const current = pattern[i];
    if (current === '\\') {
      i += 1;
      continue;
    }

    if (current === closingChar) {
      closingIndex = i;
      break;
    }
  }

  return closingIndex;
}

function findClosingGroup(pattern: string, startIndex: number): number {
  let depth = 0;
  let inClass = false;
  let i = startIndex;

  // URLPattern requires balanced groups; no fallback path needed here.
  while (true) {
    i += 1;
    const current = pattern[i];
    if (current === '\\') {
      i += 1;
      continue;
    }

    if (current === '[') {
      inClass = true;
      continue;
    }

    if (current === ']' && inClass) {
      inClass = false;
      continue;
    }

    if (inClass) {
      continue;
    }

    if (current === '(') {
      depth += 1;
      continue;
    }

    if (current === ')') {
      if (depth === 0) {
        return i;
      }

      depth -= 1;
    }
  }
}

function takeOptionalPrefix(literal: string): { prefix: string; rest: string } {
  if (!literal.endsWith('/')) {
    return { prefix: '', rest: literal };
  }

  return { prefix: '/', rest: literal.slice(0, -1) };
}

function tokenizePattern(
  pattern: string,
  counter: { value: number } = { value: 0 },
): PatternToken[] {
  const tokens: PatternToken[] = [];
  let literal = '';
  let index = 0;

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === '\\') {
      const next = pattern[index + 1] as string;
      literal += next;
      index += 2;
      continue;
    }

    if (char === '{') {
      const end = findClosing(pattern, index + 1, '}');
      const groupValue = pattern.slice(index + 1, end);
      index = end + 1;
      let modifier: ParamModifier = '';
      if (isModifier(pattern[index])) {
        modifier = pattern[index] as ParamModifier;
        index += 1;
      }

      if (literal) {
        tokens.push(literal);
        literal = '';
      }

      tokens.push({
        type: 'group',
        tokens: tokenizePattern(groupValue, counter),
        modifier,
      });

      continue;
    }

    if (char === ':') {
      const match = identifierRegExp.exec(
        pattern.slice(index + 1),
      ) as RegExpExecArray;
      const name = match[0];
      index += name.length + 1;
      let allowSlash = false;
      if (pattern[index] === '(') {
        const end = findClosingGroup(pattern, index + 1);
        allowSlash = true;
        index = end + 1;
      }
      let modifier: ParamModifier = '';
      if (isModifier(pattern[index])) {
        modifier = pattern[index] as ParamModifier;
        index += 1;
      }
      allowSlash = allowSlash || modifier === '*' || modifier === '+';

      let prefix = '';
      if (modifier === '?' || modifier === '*') {
        const prefixResult = takeOptionalPrefix(literal);
        prefix = prefixResult.prefix;
        literal = prefixResult.rest;
      }

      if (literal) {
        tokens.push(literal);
        literal = '';
      }

      tokens.push({ type: 'param', name, modifier, prefix, allowSlash });
      continue;
    }

    if (char === '*') {
      index += 1;
      let modifier: ParamModifier = '';
      if (isModifier(pattern[index])) {
        modifier = pattern[index] as ParamModifier;
        index += 1;
      }

      let prefix = '';
      if (modifier === '?' || modifier === '*') {
        const prefixResult = takeOptionalPrefix(literal);
        prefix = prefixResult.prefix;
        literal = prefixResult.rest;
      }

      if (literal) {
        tokens.push(literal);
        literal = '';
      }

      tokens.push({
        type: 'param',
        name: counter.value++,
        modifier,
        prefix,
        allowSlash: true,
      });
      continue;
    }

    if (char === '(') {
      const end = findClosingGroup(pattern, index + 1);
      index = end + 1;
      let modifier: ParamModifier = '';
      if (isModifier(pattern[index])) {
        modifier = pattern[index] as ParamModifier;
        index += 1;
      }

      let prefix = '';
      if (modifier === '?' || modifier === '*') {
        const prefixResult = takeOptionalPrefix(literal);
        prefix = prefixResult.prefix;
        literal = prefixResult.rest;
      }

      if (literal) {
        tokens.push(literal);
        literal = '';
      }

      tokens.push({
        type: 'param',
        name: counter.value++,
        modifier,
        prefix,
        allowSlash: true,
      });
      continue;
    }

    literal += char;
    index += 1;
  }

  if (literal) {
    tokens.push(literal);
  }

  return tokens;
}

function buildFromTokens(
  tokens: PatternToken[],
  params: ParamValues,
  stringifier: StringifyFunction = defaultStringify,
  encoder: EncodeFunction = encodeURIComponent,
): { value: string; usedParam: boolean } {
  let output = '';
  let usedParam = false;

  for (const token of tokens) {
    if (typeof token === 'string') {
      output += token;
      continue;
    }

    if (token.type === 'group') {
      const groupResult = buildFromTokens(
        token.tokens,
        params,
        stringifier,
        encoder,
      );
      const shouldInclude =
        token.modifier === '' || token.modifier === '+'
          ? true
          : groupResult.usedParam;
      if (shouldInclude) {
        output += groupResult.value;
        usedParam = usedParam || groupResult.usedParam;
      }

      continue;
    }

    const rawValue = params[token.name];
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    const stringValue = stringifyValue(rawValue, stringifier);
    if (stringValue === '') {
      output += token.prefix;
      usedParam = true;
      continue;
    }

    output += token.prefix + encoder(stringValue, token);
    usedParam = true;
  }

  return { value: output, usedParam };
}

function tokensHaveParams(tokens: PatternToken[]): boolean {
  return tokens.some((token) => {
    if (typeof token === 'string') {
      return false;
    }

    if (token.type === 'param') {
      return true;
    }

    return tokensHaveParams(token.tokens);
  });
}

function defaultHandler(
  pattern: string,
  params: ParamValues,
  stringifier?: StringifyFunction,
  encoder?: EncodeFunction,
): string {
  const tokens = tokenizePattern(pattern);
  if (!tokensHaveParams(tokens)) {
    const fallback = params[0];
    if (fallback !== undefined && fallback !== null && fallback !== '') {
      return stringifyValue(fallback, stringifier ?? defaultStringify);
    }
  }

  return buildFromTokens(tokens, params, stringifier, encoder).value;
}

const handlers: Handlers = {
  pathname: defaultHandler,
  search: searchHandler,
  hash: defaultHandler,
  username: defaultHandler,
  password: defaultHandler,
  protocol: defaultHandler,
  hostname: defaultHandler,
  port: defaultHandler,
};

function encodePreservingPercents(
  value: string,
  encoder: (segment: string) => string,
): string {
  const parts = value.split(/(%[0-9A-Fa-f]{2})/g);
  return parts
    .map((part) =>
      /%[0-9A-Fa-f]{2}/.test(part) ? part : encoder(part),
    )
    .join('');
}

function encodePathname(value: string, token?: ParamToken): string {
  const encoded = encodePreservingPercents(value, encodeURIComponent);
  if (token?.allowSlash) {
    return encoded.replace(/%2F/gi, '/');
  }
  return encoded;
}

function encodeSearchComponent(value: string): string {
  const params = new URLSearchParams();
  params.set('value', value);
  return params.toString().replace(/^value=/, '');
}

function serializeSearchInput(
  input: unknown,
  stringifier: StringifyFunction = defaultStringify,
): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URLSearchParams) {
    return input.toString();
  }

  const coerceValue = (value: unknown) => stringifyValue(value, stringifier);

  if (Array.isArray(input)) {
    const entries: Array<[string, string]> = [];
    for (const entry of input) {
      if (Array.isArray(entry)) {
        const [key, value] = entry as [unknown, unknown];
        entries.push([String(key), coerceValue(value)]);
      }
    }
    return new URLSearchParams(entries).toString();
  }

  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(
      ([key, value]) => [key, coerceValue(value)] as [string, string],
    );
    return new URLSearchParams(entries).toString();
  }

  return coerceValue(input);
}

function searchHandler(
  pattern: string,
  params: ParamValues,
  stringifier?: StringifyFunction,
  encoder?: EncodeFunction,
): string {
  const tokens = tokenizePattern(pattern);
  const fallback = params[0];
  const hasParams = tokensHaveParams(tokens);

  if (!hasParams || pattern === '*') {
    if (fallback === undefined || fallback === null || fallback === '') {
      return '';
    }
    return serializeSearchInput(fallback, stringifier ?? defaultStringify);
  }

  return buildFromTokens(tokens, params, stringifier, encoder).value;
}

const DEFAULT_HIERARCHICAL_SCHEMES = [
  'http',
  'https',
  'ws',
  'wss',
  'ftp',
  'file',
] as const;

export function generate(
  pattern: URLPattern,
  params: Params,
  { stringifier, hierarchicalSchemes }: GenerateOptions,
): URL {
  const schemeSet = new Set(
    (hierarchicalSchemes ?? DEFAULT_HIERARCHICAL_SCHEMES).map((scheme) =>
      scheme.replace(/:$/, '').toLowerCase(),
    ),
  );
  const protocolValue = handlers.protocol(
    pattern.protocol,
    params.protocol || {},
    stringifier,
    (value) => value,
  );
  const scheme = protocolValue
    ? protocolValue.replace(/:$/, '').toLowerCase()
    : '';
  const pathnameEncoder =
    !scheme || schemeSet.has(scheme) ? encodePathname : (value: string) => value;
  const built: Partial<Record<ParamKeys, string>> = {
    protocol: protocolValue,
  };
  const encodeByKey: Partial<Record<ParamKeys, EncodeFunction>> = {
    pathname: pathnameEncoder,
    search: encodeSearchComponent,
    hash: encodeURIComponent,
    username: (value) => value,
    password: (value) => value,
    hostname: (value) => value,
    port: (value) => value,
  };

  for (const key of PARAM_KEYS) {
    if (key === 'protocol') {
      continue;
    }
    built[key] = handlers[key](
      pattern[key],
      params[key] || {},
      stringifier,
      encodeByKey[key],
    );
  }

  const protocol = built.protocol
    ? built.protocol.endsWith(':')
      ? built.protocol
      : `${built.protocol}:`
    : '';
  const host = built.hostname
    ? built.port
      ? `${built.hostname}:${built.port}`
      : built.hostname
    : '';
  const url =
    protocol && host
      ? new URL(`${protocol}//${host}`)
      : protocol
        ? new URL(`${protocol}${built.pathname}`)
        : new URL(`${host}${built.pathname}`);

  if (host) {
    if (built.username) {
      url.username = built.username;
    } else {
      url.username = '';
    }

    if (built.password) {
      url.password = built.password;
    } else {
      url.password = '';
    }
  }

  url.pathname = built.pathname;

  if (built.search) {
    url.search = built.search.startsWith('?')
      ? built.search
      : `?${built.search}`;
  } else {
    url.search = '';
  }

  if (built.hash) {
    url.hash = `#${built.hash}`;
  } else {
    url.hash = '';
  }

  return url;
}
