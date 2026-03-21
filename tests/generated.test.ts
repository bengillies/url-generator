import { describe, expect, it } from 'vitest';
import { generate, type GenerateParams } from '../src/index';
import { fixtureData } from './fixtures/fixture-data';

describe('generate matches urlpattern test data', () => {
  fixtureData.forEach((fixture) => {
    it(`case ${fixture.caseIndex}`, () => {
      const pattern = new URLPattern(...fixture.urlPatternArgs);
      const params = Object.fromEntries(
        Object.entries(fixture.params).map(([key, groups]) => [
          key,
          { groups },
        ]),
      ) as GenerateParams;
      const result = generate(pattern, params);
      expect(
        result.href,
        `case ${fixture.caseIndex} produced ${result.href}`,
      ).toBe(fixture.expectedUrl);
    });
  });
});
