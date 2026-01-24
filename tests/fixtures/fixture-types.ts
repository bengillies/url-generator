import type { URLPatternInit, URLPatternOptions } from 'node:url';
import type { ParamKeys } from '../src/index';

export type UrlPatternArgs =
  | [string | URLPatternInit, string, URLPatternOptions?]
  | [string | URLPatternInit, URLPatternOptions?];

export interface FixtureEntry {
  caseIndex: number;
  urlPatternArgs: UrlPatternArgs;
  params: Record<ParamKeys, Record<string, string | null>>;
  expectedUrl: string;
}
