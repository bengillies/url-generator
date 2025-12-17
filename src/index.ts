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

export type ParamKeys = typeof PARAM_KEYS[number];
export type ParamValues = Record<string | number, unknown>;
export type Params = Record<ParamKeys, ParamValues>;

export type StringifyFunction = (value: unknown) => string;
export type GenerateOptions = {
  stringifier?: StringifyFunction;
};

type HandlerFunction = (pattern: string, params: ParamValues, stringifier?: StringifyFunction) => string;
type Handlers = Record<ParamKeys, HandlerFunction>;

type ParamGetter = (params: ParamValues) => string;

type PatternState =
  | 'TEXT'
  | 'NAMED_PARAM'
  | 'NON_CAPTURE_GROUP'
  | 'CAPTURE_GROUP';

const identifierRegExp = /[\$_0-9\p{L}]+/u;
const captureEndRegExp = /(?<!\\)\)/;

function defaultStringify(value: unknown): string {
  return String(value);
}

function get(paramName: string | number, stringifier: StringifyFunction = defaultStringify): ParamGetter {
  return function paramGetter(params: ParamValues): string {
    const value = params[paramName];

    if (value === undefined || value === null) {
      return '';
    }

    return stringifier(value);
  }
}

function splitPattern(pattern: string): Array<string | ParamGetter> {
  const parts: Array<string | ParamGetter> = [];

  let part;
  let state: PatternState = 'TEXT';
  let char;
  let codePoint;
  let whole = pattern;
  let next = pattern;
  let paramName = '';
  let paramNumber = 0;

  while (codePoint = next.codePointAt(0)) {
    char = String.fromCodePoint(codePoint);
    whole = next;
    next = whole.slice(char.length);

    switch (char) {
      case '?': // follow through and skip character as custom handling only affecting matching urls, not building them
      case '+': // same as above
      case '{': // same as above
      case '}': // same as above
        continue;
      case '\\': // Skip escaped character
        next = next.slice(1);
        continue;
      case '(':
        state = 'CAPTURE_GROUP';
        break;
      case ':':
        state = 'NAMED_PARAM';
        paramName = '';
        break;
      case '*':
        parts.push(get(paramNumber++));
        continue;
      default:
        state = 'TEXT';
        part ??= '';
        part += char;
    }

    if (state !== 'TEXT' && typeof part === 'string' && part.length > 0) {
      parts.push(part);
      part = undefined;
    }

    if (state === 'CAPTURE_GROUP') { // Inside capture group, so skip ahead to the end and consume the param
      const match = captureEndRegExp.exec(next);
      if (match) {
        state = 'TEXT';
        next = next.slice(match.index);
        parts.push(paramName ? get(paramName) : get(paramNumber++));
        part = undefined;
        continue;
      } else {
        throw new Error('Unterminated capture group in pattern');
      }
    }

    if (state === 'NAMED_PARAM') { // Inside named param, so consume the identifier
      const match = identifierRegExp.exec(next);
      if (match) {
        paramName = match[0];
        next = next.slice(paramName.length);
        state = 'TEXT';
        parts.push(get(paramName));
        part = undefined;
        continue;
      } else {
        throw new Error('Invalid or missing identifier for named parameter in pattern');
      }
    }
  }

  if (!parts.length && typeof part === 'string' && part.length) {
    parts.push(part);
  }

  if (pattern === '*') {
    return [get(0)];
  }

  return parts;
}

function defaultHandler(pattern: string, params: ParamValues, stringifier?: StringifyFunction): string {
  return splitPattern(pattern).map(part => {
    if (typeof part === 'string') {
      return part;
    }

    return part(params);
  }).join('');

}

const handlers: Handlers = {
  pathname: defaultHandler,
  search : defaultHandler,
  hash: defaultHandler,
  username: defaultHandler,
  password: defaultHandler,
  protocol: defaultHandler,
  hostname: defaultHandler,
  port: defaultHandler,
};


export function generate(pattern: URLPattern, params: Params, { stringifier }: GenerateOptions): URL {
  if (pattern.hasRegExpGroups) {
    throw new Error('Cannot generate URL for patterns with RegExp groups');
  }

  const built: Partial<Record<ParamKeys, string>> = {};

  for (const key of PARAM_KEYS) {
    built[key] = handlers[key](pattern[key], params[key] || {}, stringifier);
  }

  let url = '';

  url += built.protocol + '://';

  if (built.username) {
    url += built.username;

  }

  if (built.password) {
    url += ':' + built.password + '@';
  }

  url += built.hostname;

  if (built.port) {
    url += ':' + built.port;
  }

  url += built.pathname;
  if (built.search) {
    url += '?' + built.search;
  }

  if (built.hash) {
    url += '#' + built.hash;
  }

  return new URL(url);
}
