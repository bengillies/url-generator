import { describe, expect, it } from 'vitest';
import { generate, type Params } from '../src/index';
import { fixtureData } from './fixture-data';

function parsePattern(entryPattern: readonly unknown[]): URLPattern {
  const patternInit = entryPattern[0] as URLPatternInput | string;
  const second = entryPattern[1];
  const third = entryPattern[2];

  const baseURL = typeof second === 'string' ? second : undefined;
  const options =
    (third && typeof third === 'object')
      ? (third as URLPatternOptions)
      : (typeof second === 'object' ? (second as URLPatternOptions) : undefined);

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
}

describe('generate matches urlpattern test data', () => {
  fixtureData.forEach((fixture) => {
    it(`case ${fixture.caseIndex}`, () => {
      const pattern = parsePattern(fixture.pattern);
      const result = generate(pattern, fixture.params as Params, {});
      expect(result.href).toBe(fixture.expectedUrl);
    });
  });
});
