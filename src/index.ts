/** URLPattern component keys supported by generate. */
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

/** Union of supported URLPattern component keys. */
export type ParamKeys = (typeof PARAM_KEYS)[number];
/** Map of parameter names/positions to values for a single component. */
export type ParamGroups = Record<string | number, unknown>;
/** Parameter configuration for a single component. */
export interface ParamValues {
  /** Custom stringifier for non-string values in this component. */
  stringify?: StringifyFunction;
  /** When true, skips encoding for inserted params in this component. */
  disableEncoding?: boolean;
  /** Parameter values keyed by name or position. */
  groups: ParamGroups;
}
/** Parameter map keyed by URLPattern component, with optional component entries. */
export type Params = Partial<Record<ParamKeys, ParamValues>>;

/** Error thrown when a required parameter is missing during generation. */
export class MissingParamError extends Error {
  constructor(paramName: string | number) {
    super(`Missing required param "${String(paramName)}"`);
    this.name = 'MissingParamError';
  }
}

/** Converts a value to a string when building components. */
export type StringifyFunction = (value: unknown) => string;

/** Component handler signature for building a component from a pattern. */
type HandlerFunction = (
  pattern: string,
  group: ParamValues,
  encoder?: EncodeFunction,
) => string;

const identifierRegExp = /[\p{ID_Start}\p{ID_Continue}$_0-9]+/u;

/** URLPattern param modifiers. */
type ParamModifier = '' | '?' | '*' | '+';
/** Token describing a parameter within a pattern. */
interface ParamToken {
  type: 'param';
  name: string | number;
  modifier: ParamModifier;
  prefix: string;
  allowSlash?: boolean;
}
/** Token describing a grouped pattern. */
interface GroupToken {
  type: 'group';
  tokens: PatternToken[];
  modifier: ParamModifier;
}
/** Union of pattern tokens. */
type PatternToken = string | ParamToken | GroupToken;
/** Encoder used when inserting param values into a component. */
type EncodeFunction = (value: string, token?: ParamToken) => string;

/**
 * Result of building a component from tokens */
interface BuiltToken {
  /** Built component string. */
  value: string;
  /** Whether any param was used in building the component.
   * Used for internal to buildFromToken purposes only
   * */
  usedParam: boolean;
}

/** Result of splitting a trailing '/' literal for optional param handling. */
interface OptionalPrefixSplit {
  prefix: string;
  rest: string;
}

/**
 * Coerces any value into a string using JavaScript's default string conversion.
 * @param value - Value to coerce.
 * @returns String representation of the value.
 */
function defaultStringify(value: unknown): string {
  return String(value);
}

/**
 * Returns a string for a value, deferring to the provided stringifier for non-strings.
 * @param value - Value to stringify.
 * @param stringifier - Stringifier for non-string values.
 * @returns String representation of the value.
 */
function stringifyValue(
  value: unknown,
  stringifier: StringifyFunction = defaultStringify,
): string {
  return typeof value === 'string' ? value : stringifier(value);
}

/**
 * Checks whether a pattern character represents a parameter modifier.
 * @param char - Character to test.
 * @returns True when the character is a modifier.
 */
function isModifier(char?: string): char is ParamModifier {
  return char === '?' || char === '*' || char === '+';
}

/**
 * Finds the index of the next closing character, skipping escaped characters.
 * @param pattern - Pattern string being scanned.
 * @param startIndex - Index to start scanning from.
 * @param closingChar - Closing character to find.
 * @returns Index of the closing character or the pattern length.
 */
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

/**
 * Finds the closing parenthesis for a group, respecting character classes and escapes.
 * @param pattern - Pattern string being scanned.
 * @param startIndex - Index to start scanning from.
 * @returns Index of the closing parenthesis.
 */
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

/**
 * Splits a literal that ends with '/' into a prefix and remainder for optional params.
 * @param literal - Literal to split.
 * @returns Prefix and remainder for the literal.
 */
function takeOptionalPrefix(literal: string): OptionalPrefixSplit {
  if (!literal.endsWith('/')) {
    return { prefix: '', rest: literal };
  }

  return { prefix: '/', rest: literal.slice(0, -1) };
}

/**
 * Tokenizes a URLPattern component string into literals, params, and groups.
 * @param pattern - Pattern string to tokenize.
 * @param counter - Counter for positional params.
 * @returns Array of tokens.
 */
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
      const next = pattern[index + 1]!;
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
      const match = identifierRegExp.exec(pattern.slice(index + 1))!;
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

/**
 * Builds a component string from tokens and params, applying encoding rules.
 *
 * @param tokens - Tokens describing the component pattern.
 * @param params - Param values to insert.
 * @param stringifier - Stringifier for non-string values.
 * @param encoder - Encoder to apply to inserted values.
 * @returns Built component string and whether a param was used.
 */
function buildFromTokens(
  tokens: PatternToken[],
  params: ParamGroups,
  stringifier: StringifyFunction = defaultStringify,
  encoder?: EncodeFunction,
  optionalContext = false,
): BuiltToken {
  let output = '';
  let usedParam = false;

  for (const token of tokens) {
    if (typeof token === 'string') {
      output += token;
      continue;
    }

    if (token.type === 'group') {
      const groupOptional =
        optionalContext || token.modifier === '?' || token.modifier === '*';

      const groupResult = buildFromTokens(
        token.tokens,
        params,
        stringifier,
        encoder,
        groupOptional,
      );

      const shouldInclude =
        token.modifier === '' || token.modifier === '+' ?
          true
        : groupResult.usedParam;

      if (shouldInclude) {
        output += groupResult.value;
        usedParam = usedParam || groupResult.usedParam;
      }

      continue;
    }

    // Enforce required params; skip optional/missing values.
    const rawValue = params[token.name];
    if (rawValue === undefined || rawValue === null) {
      if (
        !optionalContext &&
        (token.modifier === '' || token.modifier === '+')
      ) {
        throw new MissingParamError(token.name);
      }

      continue;
    }

    const stringValue = stringifyValue(rawValue, stringifier);
    if (stringValue === '') {
      output += token.prefix;
      usedParam = true;
      continue;
    }

    const encoded = encoder ? encoder(stringValue, token) : stringValue;
    output += token.prefix + encoded;
    usedParam = true;
  }

  return { value: output, usedParam };
}

/**
 * Returns true if any token in the pattern is a param token.
 *
 * @param tokens - Tokens describing the pattern.
 * @returns True when params are present.
 */
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

/**
 * Builds a component string by tokenizing the pattern and inserting params.
 *
 * @param pattern - Pattern string for the component.
 * @param group - Param configuration for the component.
 * @param encoder - Encoder for inserted values.
 * @returns Built component string.
 */
function defaultHandler(
  pattern: string,
  group: ParamValues,
  encoder?: EncodeFunction,
): string {
  const stringifier = group.stringify ?? defaultStringify;
  const groups = group.groups ?? {};
  if (pattern === '*') {
    const fallback = groups[0];
    if (fallback === undefined || fallback === null || fallback === '') {
      return '';
    }

    const token: ParamToken = {
      type: 'param',
      name: 0,
      modifier: '',
      prefix: '',
      allowSlash: true,
    };

    const value = stringifyValue(fallback, stringifier);

    return encoder ? encoder(value, token) : value;
  }

  const tokens = tokenizePattern(pattern);
  if (!tokensHaveParams(tokens)) {
    const fallback = groups[0];
    if (fallback !== undefined && fallback !== null && fallback !== '') {
      return stringifyValue(fallback, stringifier);
    }
  }

  return buildFromTokens(tokens, groups, stringifier, encoder).value;
}

/**
 * Returns the component handler for a given URLPattern key.
 */
function getHandler(key: ParamKeys): HandlerFunction {
  if (key === 'search') {
    return searchHandler;
  }

  return defaultHandler;
}

/**
 * Encodes a value while leaving existing percent-encodings intact.
 * @param value - Value to encode.
 * @param encoder - Encoder applied to non-percent segments.
 * @returns Encoded value preserving existing percent-escapes.
 */
function encodePreservingPercents(
  value: string,
  encoder: (segment: string) => string,
): string {
  const parts = value.split(/(%[0-9A-Fa-f]{2})/g);

  return parts
    .map((part) => (/%[0-9A-Fa-f]{2}/.test(part) ? part : encoder(part)))
    .join('');
}

/**
 * Encodes a pathname param, optionally preserving slashes for multi-segment params.
 * @param value - Value to encode.
 * @param token - Param token describing modifier behavior.
 * @returns Encoded pathname segment.
 */
function encodePathname(value: string, token?: ParamToken): string {
  const encoded = encodePreservingPercents(value, encodeURIComponent);
  if (token?.allowSlash) {
    return encoded.replace(/%2F/gi, '/');
  }

  return encoded;
}

/**
 * Encodes a search param value using URLSearchParams-style rules (spaces to '+').
 * @param value - Value to encode.
 * @returns Encoded search component value.
 */
function encodeSearchComponent(value: string): string {
  return encodePreservingPercents(value, (segment) =>
    encodeURIComponent(segment).replace(/%20/g, '+'),
  );
}

/**
 * Encodes a hash param value while leaving existing percent-encodings intact.
 * @param value - Value to encode.
 * @returns Encoded hash component value.
 */
function encodeHashComponent(value: string): string {
  return encodePreservingPercents(value, encodeURIComponent);
}

/**
 * Encodes a set of entries using URLSearchParams-style rules in a way that works across
 * both browsers and node without having to import URLSearchParams directly just
 * for node
 * @param entries - Entries to encode.
 * @returns Encoded search string.
 */
function encodeUsingURLSearchParamsStyle(entries: [string, string][]): string {
  const encoded: string[] = [];

  for (const [key, value] of entries) {
    encoded.push(
      `${encodeSearchComponent(key)}=${encodeSearchComponent(value)}`,
    );
  }

  return encoded.join('&');
}

/**
 * Test whether a value is a URLSearchParams instance in a way that works across
 * both browsers and node without having to import URLSearchParams directly just
 * for node
 * @param value - Value to test.
 * @returns True when the value is a URLSearchParams instance.
 */
function isURLSearchParams(value: unknown): value is URLSearchParams {
  return (
    !!value &&
    typeof value === 'object' &&
    (Object.getPrototypeOf(value) as object).constructor.name ===
      'URLSearchParams'
  );
}

/**
 * Serializes wildcard/no-pattern search input without re-encoding literal delimiters.
 *
 * Accepts strings, URLSearchParams, tuple arrays, or plain objects; values are stringified
 * as needed and encoded in a URLSearchParams-style format while preserving literal `&`/`=`
 * that already exist in string inputs.
 *
 * @param input - Search input data to serialize.
 * @param stringifier - Stringifier for non-string values.
 * @returns Serialized search string without leading '?'.
 */
function serializeSearchInput(
  input: unknown,
  stringifier: StringifyFunction = defaultStringify,
): string {
  if (typeof input === 'string') {
    return input;
  }

  if (isURLSearchParams(input)) {
    return input.toString();
  }

  if (Array.isArray(input)) {
    const entries: [string, string][] = [];
    for (const entry of input) {
      if (Array.isArray(entry)) {
        const [key, value] = entry as [unknown, unknown];
        entries.push([String(key), stringifyValue(value, stringifier)]);
      }
    }

    return encodeUsingURLSearchParamsStyle(entries);
  }

  if (input && typeof input === 'object') {
    const entries: [string, string][] = [];
    for (const [key, value] of Object.entries(input)) {
      entries.push([key, stringifyValue(value, stringifier)]);
    }

    return encodeUsingURLSearchParamsStyle(entries);
  }

  return stringifyValue(input, stringifier);
}

/**
 * Builds the search component with special handling for wildcard and param-free patterns.
 *
 * @param pattern - Search pattern string.
 * @param group - Param configuration for the search component.
 * @param encoder - Encoder for inserted values.
 * @returns Built search string without leading '?'.
 */
function searchHandler(
  pattern: string,
  group: ParamValues,
  encoder?: EncodeFunction,
): string {
  const tokens = tokenizePattern(pattern);
  const stringifier = group.stringify ?? defaultStringify;
  const groups = group.groups ?? {};
  const fallback = groups[0];
  const hasParams = tokensHaveParams(tokens);

  if (!hasParams || pattern === '*') {
    if (fallback === undefined || fallback === null || fallback === '') {
      return '';
    }

    return serializeSearchInput(fallback, stringifier);
  }

  return buildFromTokens(tokens, groups, stringifier, encoder).value;
}

/**
 * Handler table per URL component, with encoding handlers for components that require special handling.
 *
 * Encodes non-url safe characters. Any ParamKeys missing get encoded by default when adding to the URL object
 */
const encodersByKey: Partial<Record<ParamKeys, EncodeFunction>> = {
  pathname: encodePathname,
  search: encodeSearchComponent,
  hash: encodeHashComponent,
};

/**
 * Creates a fresh empty param group for components without provided params.
 */
function emptyGroup(): ParamValues {
  return { groups: {} };
}

/**
 * Generates a URL from a URLPattern and params, applying encoding rules per component.
 * @param pattern - URLPattern instance used for generation.
 * @param params - Param values for each URLPattern component.
 * @returns Generated URL instance.
 */
export function generate(pattern: URLPattern, params: Params): URL {
  // Generate url parts step

  const built: Partial<Record<ParamKeys, string>> = {};

  for (const key of PARAM_KEYS) {
    const group = params[key] ?? emptyGroup();

    const encoder = !group.disableEncoding ? encodersByKey[key] : undefined;

    built[key] = getHandler(key)(pattern[key], group, encoder);
  }

  const urlParts = built as Record<ParamKeys, string>;

  // Construct URL object step

  let protocol = '';
  if (urlParts.protocol) {
    protocol =
      urlParts.protocol.endsWith(':') ?
        urlParts.protocol
      : `${urlParts.protocol}:`;
  }

  let host = '';
  if (urlParts.hostname) {
    host =
      urlParts.port ?
        `${urlParts.hostname}:${urlParts.port}`
      : urlParts.hostname;
  }

  let urlStr = protocol;
  if (host) {
    urlStr += protocol ? `//${host}` : `${host}${urlParts.pathname}`;
  } else {
    urlStr += urlParts.pathname;
  }

  const url = new URL(urlStr);

  if (host) {
    if (urlParts.username) {
      url.username = urlParts.username;
    }

    if (urlParts.password) {
      url.password = urlParts.password;
    }
  }

  url.pathname = urlParts.pathname;

  if (urlParts.search) {
    url.search = urlParts.search.replace(/^\??/, '?');
  }

  if (urlParts.hash) {
    url.hash = `#${urlParts.hash}`;
  }

  return url;
}
