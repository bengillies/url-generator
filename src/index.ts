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

const namedParamStartRegExp = /:/;
const identifierRegExp = /[\$_0-9\p{L}]+/u;
const optionalRegExp = /\?/;
const multipleRegExp = /[\*\+]/;
const nonCaptureStartRegExp = /\{/;
const nonCaptureEndRegExp = /\}/;
const captureStartRegExp = /\(/;
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
  const parts: Array<string | ParamGetter> = [pattern];

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
  }).join();
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
