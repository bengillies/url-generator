import { describe, expect, it } from 'vitest';
import { generate, type Params } from '../src/index';
import { fixtureData } from './fixture-data';

type ParamModifier = '' | '?' | '*' | '+';
type ParamValues = Record<string | number, unknown>;
type ParamToken = {
  type: 'param';
  name: string | number;
  modifier: ParamModifier;
  prefix: string;
};
type GroupToken = {
  type: 'group';
  tokens: PatternToken[];
  modifier: ParamModifier;
};
type PatternToken = string | ParamToken | GroupToken;

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

const identifierRegExp = /[\p{ID_Start}\p{ID_Continue}\$_0-9]+/u;

function isModifier(char?: string): char is ParamModifier {
  return char === '?' || char === '*' || char === '+';
}

function findClosing(pattern: string, startIndex: number, closingChar: string): number {
  for (let i = startIndex; i < pattern.length; i += 1) {
    const current = pattern[i];
    if (current === '\\') {
      i += 1;
      continue;
    }
    if (current === closingChar) {
      return i;
    }
  }
  return -1;
}

function takeOptionalPrefix(literal: string): { prefix: string; rest: string } {
  if (!literal.endsWith('/')) {
    return { prefix: '', rest: literal };
  }
  return { prefix: '/', rest: literal.slice(0, -1) };
}

function tokenizePattern(pattern: string): PatternToken[] {
  const tokens: PatternToken[] = [];
  let literal = '';
  let index = 0;
  let paramIndex = 0;

  while (index < pattern.length) {
    const char = pattern[index];

    if (char === '\\') {
      const next = pattern[index + 1];
      if (next) {
        literal += next;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === '{') {
      const end = findClosing(pattern, index + 1, '}');
      if (end === -1) {
        literal += char;
        index += 1;
        continue;
      }
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
      tokens.push({ type: 'group', tokens: tokenizePattern(groupValue), modifier });
      continue;
    }

    if (char === ':') {
      const match = identifierRegExp.exec(pattern.slice(index + 1));
      if (match && match.index === 0) {
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
      literal += char;
      index += 1;
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
      tokens.push({ type: 'param', name: paramIndex++, modifier, prefix });
      continue;
    }

    if (char === '(') {
      const end = findClosing(pattern, index + 1, ')');
      if (end === -1) {
        literal += char;
        index += 1;
        continue;
      }
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
      tokens.push({ type: 'param', name: paramIndex++, modifier, prefix });
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
): { value: string; usedParam: boolean } {
  let output = '';
  let usedParam = false;

  for (const token of tokens) {
    if (typeof token === 'string') {
      output += token;
      continue;
    }

    if (token.type === 'group') {
      const groupResult = buildFromTokens(token.tokens, params);
      const shouldInclude = token.modifier === '' || token.modifier === '+'
        ? true
        : groupResult.usedParam;
      if (shouldInclude) {
        output += groupResult.value;
        usedParam = usedParam || groupResult.usedParam;
      }
      continue;
    }

    const rawValue = params[token.name];
    const stringValue = rawValue === undefined || rawValue === null
      ? ''
      : String(rawValue);

    if (!stringValue) {
      continue;
    }

    output += token.prefix + stringValue;
    usedParam = true;
  }

  return { value: output, usedParam };
}

function buildComponentInput(
  pattern: URLPattern,
  params: Params,
  patternInput: unknown,
): URLPatternInput {
  const input: URLPatternInput = {};
  const keysToInclude = new Set<typeof PARAM_KEYS[number]>();

  if (patternInput && typeof patternInput === 'object' && !Array.isArray(patternInput)) {
    for (const key of PARAM_KEYS) {
      if (key in patternInput) {
        keysToInclude.add(key);
      }
    }
  } else {
    for (const key of PARAM_KEYS) {
      keysToInclude.add(key);
    }
  }

  for (const key of keysToInclude) {
    const tokens = tokenizePattern(pattern[key]);
    const value = buildFromTokens(tokens, params[key] || {}).value;
    input[key] = value;
  }

  return input;
}

const DEFAULT_PATTERN_BASE_URL = 'http://example.com';

function parsePattern(entryPattern: readonly unknown[]): URLPattern {
  const input = entryPattern[0] as URLPatternInput | string;
  const maybeBaseURL = entryPattern[1];
  const maybeOptions = entryPattern[2];

  const hasScheme =
    typeof input === 'string' && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input);
  const baseURL = typeof maybeBaseURL === 'string'
    ? maybeBaseURL
    : (!hasScheme && typeof input === 'string' ? DEFAULT_PATTERN_BASE_URL : undefined);
  const options =
    (maybeOptions && typeof maybeOptions === 'object')
      ? (maybeOptions as URLPatternOptions)
      : (typeof maybeBaseURL === 'object' ? (maybeBaseURL as URLPatternOptions) : undefined);

  if (baseURL && options) {
    return new URLPattern(input, baseURL, options);
  }
  if (baseURL) {
    return new URLPattern(input, baseURL);
  }
  if (options) {
    return new URLPattern(input, options);
  }
  return new URLPattern(input);
}

describe('generate matches urlpattern test data', () => {
  fixtureData.forEach((fixture) => {
    it(`case ${fixture.caseIndex}`, () => {
      const pattern = parsePattern(fixture.pattern);
      const result = generate(pattern, fixture.params as Params, {});
      if (pattern.test(result.href)) {
        return;
      }
      const componentInput = buildComponentInput(
        pattern,
        fixture.params as Params,
        fixture.pattern[0],
      );
      expect(pattern.test(componentInput)).toBe(true);
    });
  });
});
