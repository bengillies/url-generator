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
}

type HandlerFunction = (
  pattern: string,
  params: ParamValues,
  stringifier?: StringifyFunction,
) => string;
type Handlers = Record<ParamKeys, HandlerFunction>;

const identifierRegExp = /[\p{ID_Start}\p{ID_Continue}$_0-9]+/u;

type ParamModifier = '' | '?' | '*' | '+';
interface ParamToken {
  type: 'param';
  name: string | number;
  modifier: ParamModifier;
  prefix: string;
}
interface GroupToken {
  type: 'group';
  tokens: PatternToken[];
  modifier: ParamModifier;
}
type PatternToken = string | ParamToken | GroupToken;

function defaultStringify(value: unknown): string {
  return String(value);
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

      tokens.push({ type: 'param', name, modifier, prefix });
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

      tokens.push({ type: 'param', name: counter.value++, modifier, prefix });
      continue;
    }

    if (char === '(') {
      const end = findClosing(pattern, index + 1, ')');
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

      tokens.push({ type: 'param', name: counter.value++, modifier, prefix });
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
): { value: string; usedParam: boolean } {
  let output = '';
  let usedParam = false;

  for (const token of tokens) {
    if (typeof token === 'string') {
      output += token;
      continue;
    }

    if (token.type === 'group') {
      const groupResult = buildFromTokens(token.tokens, params, stringifier);
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

    const stringValue = stringifier(rawValue);
    if (stringValue === '') {
      output += token.prefix;
      usedParam = true;
      continue;
    }

    output += token.prefix + stringValue;
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
): string {
  const tokens = tokenizePattern(pattern);
  if (!tokensHaveParams(tokens)) {
    const fallback = params[0];
    if (fallback !== undefined && fallback !== null && fallback !== '') {
      return (stringifier ?? defaultStringify)(fallback);
    }
  }

  return buildFromTokens(tokens, params, stringifier).value;
}

const handlers: Handlers = {
  pathname: defaultHandler,
  search: defaultHandler,
  hash: defaultHandler,
  username: defaultHandler,
  password: defaultHandler,
  protocol: defaultHandler,
  hostname: defaultHandler,
  port: defaultHandler,
};

export function generate(
  pattern: URLPattern,
  params: Params,
  { stringifier }: GenerateOptions,
): URL {
  if (pattern.hasRegExpGroups) {
    throw new Error('Cannot generate URL for patterns with RegExp groups');
  }

  const built: Partial<Record<ParamKeys, string>> = {};

  for (const key of PARAM_KEYS) {
    built[key] = handlers[key](pattern[key], params[key] || {}, stringifier);
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
        ? new URL(`${protocol}${built.pathname ?? ''}`)
        : new URL(`${host}${built.pathname ?? ''}`);

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

  if (built.pathname !== undefined) {
    url.pathname = built.pathname;
  }

  if (built.search) {
    url.search = built.search.startsWith('?')
      ? built.search
      : `?${built.search}`;
  } else {
    url.search = '';
  }

  if (built.hash) {
    url.hash = built.hash.startsWith('#') ? built.hash : `#${built.hash}`;
  } else {
    url.hash = '';
  }

  return url;
}
