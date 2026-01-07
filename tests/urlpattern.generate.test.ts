import { describe, expect, it } from 'vitest';
import { generate, type Params } from '../src/index';
import { fixtureData } from './fixture-data';

describe('generate matches urlpattern test data', () => {
  fixtureData.forEach((fixture) => {
    it(`case ${fixture.caseIndex}`, () => {
      const pattern = new URLPattern(...fixture.urlPatternArgs);
      const result = generate(pattern, fixture.params as Params, {});
      expect(
        result.href,
        `case ${fixture.caseIndex} produced ${result.href}`,
      ).toBe(fixture.expectedUrl);
    });
  });
});
