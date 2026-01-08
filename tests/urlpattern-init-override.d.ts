import 'node:url';

declare module 'node:url' {
  interface URLPatternInit {
    ignoreCase?: boolean;
  }
}

export {};
