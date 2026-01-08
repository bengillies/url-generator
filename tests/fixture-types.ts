import type { URLPatternInit, URLPatternOptions } from 'node:url';
import type { Params } from '../src/index';

export type UrlPatternArgs = [
  string | URLPatternInit,
  string,
  URLPatternOptions?,
] | [string | URLPatternInit, URLPatternOptions?];

export type FixtureEntry = {
  caseIndex: number;
  urlPatternArgs: UrlPatternArgs;
  params: Params;
  expectedUrl: string;
};
