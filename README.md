# url-generator

A minimal, URLPattern-first URL generator. It intentionally does the least possible beyond URLPattern itself so patterns can work in both directions: matching and generation. In other words, this is a small “reverse URLPattern” helper.

## Requirements

- Runtime support for `URLPattern` and `URL`.
- Node: `>= 24.2.0`.
- Works in modern browsers and Node.

## Install

```sh
npm install url-generator
```

## Quick start

```ts
import { generate } from 'url-generator';

const decode = (match) => {
  if (!match) throw new Error('No match');

  for (const param in match) {
      for (const key in match[param].groups) {
          const value = match[param].groups[key];

          match[param].groups[key] = param === 'search' ?
            decodeURIComponent(value.replace(/\+/g, '%20')) :
            decodeURIComponent(value);
      }
  }

  return match;
};

const pattern = new URLPattern(
  'https://example.com/users/:id\\?tag=:tag#section-:section',
);
const input = 'https://example.com/users/alice?tag=urls+are+cool#section-1';

const url = generate(pattern, decode(pattern.exec(input)));

console.log(url.href);
// https://example.com/users/alice?tag=urls+are+cool#section-1
```

## API

### `generate(pattern, params) => URL`

Builds a URL from a `URLPattern` and a parameter map. Returns a `URL` instance.

```ts
import { generate, type Params } from 'url-generator';

const pattern = new URLPattern({ pathname: '/posts/:slug' });
const params: Params = {
  protocol: { groups: { 0: 'https' } },
  hostname: { groups: { 0: 'example.com' } },
  pathname: { groups: { slug: 'hello-world' } },
};

const url = generate(pattern, params);
// https://example.com/posts/hello-world
```

### Params shape

`Params` is a partial record keyed by URLPattern components. Each component can supply:

- `groups`: parameter values by name or position.
- `stringify` (optional): for non-string values.
- `disableEncoding` (optional): skip per-component encoding for inserted params.

```ts
export type ParamKeys =
  | 'pathname'
  | 'search'
  | 'hash'
  | 'username'
  | 'password'
  | 'protocol'
  | 'hostname'
  | 'port';

export interface ParamValues {
  stringify?: (value: unknown) => string;
  disableEncoding?: boolean;
  groups: Record<string | number, unknown>;
}

export type Params = Partial<Record<ParamKeys, ParamValues>>;
```

## How params map to patterns

- Named params (e.g. `:id`) use `groups.id`.
- Unnamed params (`*`, `(...)`) use numeric groups: `groups[0]`, `groups[1]`, etc.
- If a component has no params, `groups[0]` can override the entire component.

Example with positional groups:

```ts
const pattern = new URLPattern({ pathname: '/files/*' });
const url = generate(pattern, {
  protocol: { groups: { 0: 'https' } },
  hostname: { groups: { 0: 'example.com' } },
  pathname: { groups: { 0: 'docs/readme.md' } },
});
// https://example.com/files/docs/readme.md
```

Example with named groups:

```ts
const pattern = new URLPattern('https://example.com/users/:id');
const url = generate(pattern, {
  pathname: { groups: { id: 'alice' } },
});
// https://example.com/users/alice
```

## Encoding behavior

Encoding is applied when values are inserted into the pattern, before the final `URL` object is built.

- `pathname`: `encodeURIComponent`, preserving slashes for `+`, `*`, `(...)`, or `*` params. Existing percent-escapes are preserved.
- `search`: URLSearchParams-style encoding (spaces become `+`).
- `hash`: `encodeURIComponent`.
- `protocol`, `hostname`, `port`, `username`, `password`: inserted verbatim, then normalized by the `URL` object.

`disableEncoding` can be set per component to skip this pre-encoding. Note that the `URL` constructor and setters still normalize some characters (e.g. `?` and `#` in a pathname), so `disableEncoding` is not a bypass for URL parsing rules.

Example: keep slashes in a path param while still encoding unsafe characters:

```ts
const pattern = new URLPattern('https://example.com/:path+');
const url = generate(pattern, {
  pathname: { groups: { path: 'foo/bar?baz' } },
});
// https://example.com/foo/bar%3Fbaz
```

Example: skip pre-encoding for one component:

```ts
const pattern = new URLPattern('https://example.com/:path');
const url = generate(pattern, {
  pathname: {
    groups: { path: 'a/b?c#d' },
    disableEncoding: true,
  },
});
// https://example.com/a/b%3Fc%23d
```

## Search (query string) handling

There are two modes:

1) Pattern-aware search (params in the search pattern)

```ts
const pattern = new URLPattern('https://example.com/search?q=:q&limit=:limit');
const url = generate(pattern, {
  search: { groups: { q: 'new shoes', limit: 20 } },
});
// https://example.com/search?q=new+shoes&limit=20
```

2) Wildcard or paramless search (search is `*` or contains no params)

`groups[0]` is treated as a full search payload and can be:

- a string (`"q=1"` or `"?q=1"`)
- a `URLSearchParams`
- an object (`{ q: 'new shoes', limit: 20 }`)
- an array of tuples (`[['tag', 'a'], ['tag', 'b']]`)

```ts
const pattern = new URLPattern({
  protocol: 'https',
  hostname: 'example.com',
  pathname: '/search',
  search: '*',
});

const url = generate(pattern, {
  search: { groups: { 0: { q: 'new shoes', limit: 20 } } },
});
// https://example.com/search?q=new+shoes&limit=20
```

Tuple arrays are the easiest way to preserve repeated keys:

```ts
const pattern = new URLPattern('https://example.com/search?*');
const url = generate(pattern, {
  search: {
    groups: { 0: [['tag', 'a'], ['tag', 'b']] },
  },
});
// https://example.com/search?tag=a&tag=b
```

### Stringify behavior

Non-string values are stringified with `String(value)` by default. Override per component with a `stringify` function:

```ts
const pattern = new URLPattern('https://example.com/items/:id');
const url = generate(pattern, {
  pathname: {
    groups: { id: { nested: true } },
    stringify: (value) => JSON.stringify(value),
  },
});
// https://example.com/items/%7B%22nested%22%3Atrue%7D
```

For `search: '*'` or paramless search, the stringifier is applied to each non-string value before passing into `URLSearchParams`.

## Credentials and host components

- When `protocol` and `hostname` are present, `username` and `password` are applied to the URL and encoded by the `URL` object.
- If you provide `hostname` without `protocol`, the URL construction fails (invalid URL).
- If you provide `protocol` without `hostname`, you get a scheme URL such as `myapp:foo`.

```ts
const pattern = new URLPattern({ pathname: '/private' });
const url = generate(pattern, {
  protocol: { groups: { 0: 'https' } },
  hostname: { groups: { 0: 'example.com' } },
  username: { groups: { 0: 'user name' } },
  password: { groups: { 0: 'p@ss' } },
});
// https://user%20name:p%40ss@example.com/private
```

## Optional params and empty strings

- `undefined`/`null` values are treated as missing.
- Empty strings are considered provided and will keep optional prefixes (e.g. a trailing `/`).

```ts
const pattern = new URLPattern('https://example.com/users/:id?');
const url = generate(pattern, {
  pathname: { groups: { id: '' } },
});
// https://example.com/users/
```

## Edge cases and gotchas

- Node's `URLPattern` can interpret certain escaped literals in patterns differently than browsers. Avoid relying on escapes for special characters in patterns unless you've verified behavior in your target environment.
- `URL` normalization still applies even with `disableEncoding`.
- Existing percent-escapes are preserved in pathname params; they are not preserved in search or hash params unless you disable encoding and provide the exact string you want.
- If you want a host/authority URL, provide a protocol. Without one, the `URL` constructor interprets `host:port` as a scheme.
- Relative URLs are not supported because `generate` always returns a `URL` object (absolute or scheme).

## Intended scope

This package is a barebones extension of `URLPattern` itself: it only adds what is needed to generate URLs from patterns. It does not try to become a router, a URL serializer, or a standards wrapper. The goal is to keep `URLPattern` at the center and make it work in both directions.

## Testing

Test coverage is 100%, and runs in both node and the browser.

There is also a manual test page at `index.html` that exercises the generator in the browser.
