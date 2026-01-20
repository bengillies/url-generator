# Encoding plan

## Current understanding
- Goal: make generated URLs safe by default by encoding params before inserting into URL components.
- The original idea was a new `disableEncoding` option; we now prefer to avoid a global option and instead encode by default with an allowance for path params that must keep `/` intact (e.g., patterns like `/:foo+` where param values can contain `foo/bar/baz`).
- `encodeURI` is not suitable for this use case because it also preserves `?` and `#`, which would allow those characters to leak into a pathname (breaking query/hash boundaries). So even when we need to preserve slashes in path params, `encodeURI` is too permissive.

## Proposed encoding strategy (draft)
- Default: encode with `encodeURIComponent` for params in all components.
- Pathname exception: for params that can legally include `/` (wildcards `*`, `+`, and param patterns like `:foo(.*)`), encode with `encodeURIComponent` and then replace `%2F` with `/`. This keeps only slashes while still encoding `?`, `#`, `&`, etc.
- No global `disableEncoding` option; behavior is determined by the pattern and component.

## Component-specific handling notes
- `pathname`: encode by default; allow slashes only when the token modifier/pattern indicates multi-segment.
- `search` and `hash`: encode with `encodeURIComponent`; note that assigning to `url.search`/`url.hash` will also apply URL normalization, so tests must reflect that.
- `username` and `password`: do **not** pre-encode. `URL` setters already percent-encode unsafe characters (including `:`), and pre-encoding risks double-encoding `%` sequences. Rely on the setter behavior instead.
- `protocol`, `hostname`, `port`: do **not** pre-encode. These should be passed through as-is and validated/normalized by the `URL` constructor and setters (e.g., hostname lowercasing and punycode). This is what “left to URL parsing/punycode rules” means in practice: we rely on `new URL(...)` and `url.hostname = ...` to normalize/validate rather than `encodeURIComponent`.

## Pattern/token detection idea
- Tokenization already exists in `src/index.ts` for pathname/other components.
- Extend tokens to carry whether a param allows slashes (`*`, `+`, or a parenthesized pattern like `:foo(.*)`), so the pathname encoder can selectively preserve `/`.

## Fixtures and tests (complications)
- There is a large generated fixture set in `tests/fixture-data.ts` built from `tests/transform-testdata.ts`. Many expected URLs assume current behavior (no param encoding), so changing default encoding will likely break fixtures and require regeneration or adjustments to test data.
- `transform-testdata.ts` uses `new URL(...)` to derive expected URLs; it does not encode params the same way as our generator will after changes, so fixture generation may need to be updated to incorporate the new encoding rules.
- Manual tests already cover some special characters in pathname/search/hash. These should be revisited to align with the new default encoding and the pathname slash exception.

## Open questions
- Exact scope of “allow slashes”: only for pathname params (never for search/hash)?
- Whether to change fixture generation logic vs. adding a new dedicated test suite for encoding semantics and leaving fixtures alone (or regenerating fixtures with the new rules).

## Query string + hash design notes (draft)
- Query strings are commonly treated as `application/x-www-form-urlencoded` when using `URLSearchParams` (spaces become `+`), while `encodeURIComponent` uses `%20`. Both are valid; which one is chosen should be consistent and predictable.
- Hash fragments do not have a universal structured encoding scheme; they are generally treated as opaque data with percent-encoding for unsafe characters. `encodeURIComponent` is the safest default for param substitution inside a hash pattern.
- The API needs to be pleasant for two scenarios:
  - `search` pattern contains params (e.g., `q=:q&limit=:limit`).
  - `search` pattern is `*` or contains no params, but the caller still wants to pass query data.

### Proposed search handling options
1) Pattern-aware encoding (no new options):
   - If the search pattern contains params, encode each param using `URLSearchParams`-style encoding (spaces become `+`) for consistency with the `*` case. This keeps `&` and `=` literals intact while applying form-style encoding to param values.
   - If the search pattern has no params or is `*`, treat `params.search[0]` as `URLSearchParams`-compatible data:
     - `string`: treat as a preformatted query string (no extra encoding).
     - `URLSearchParams`, array of tuples, or plain object: serialize using `URLSearchParams`, but apply the existing `stringifier` to any non-string values before serialization.
2) Add an explicit `searchSerializer` option:
   - Default to `URLSearchParams` for object-like values.
   - Allows users to opt into `%20` spaces or custom behavior without changing per-call data shapes.

### Open decisions for search/hash
- `stringifier` applies to non-strings only, for all components.
- Nested objects/arrays passed via `params.search[0]` should be handled by `stringifier` (no automatic expansion).

## API update (per-component options)
- Params are now per-component objects: `{ stringify?, disableEncoding?, groups }`.
- `stringify` applies per component; `disableEncoding` skips encoding for that component.


## Testing plan (test names)
- [x] it('should encode pathname params with encodeURIComponent by default')
- [x] it('should preserve slashes for pathname params with + modifier')
- [x] it('should preserve slashes for pathname params with * modifier')
- [x] it('should preserve slashes for wildcard pathname params')
- [x] it('should preserve slashes for pathname params with explicit regex groups')
- [x] it('should still encode ? and # within slash-preserving pathname params')
- [x] it('should encode pathname params when stringifier returns non-string values')
- [x] it('should not double-encode pathname params that already contain percent sequences')
- [x] it('should encode search pattern params using URLSearchParams-style encoding (spaces to +)')
- [x] it('should keep literal & and = in search patterns while encoding param values')
- [x] it('should apply stringifier to non-string search pattern params before encoding')
- [x] it('should treat search=* string input as a preformatted query string without re-encoding')
- [x] it('should serialize search=* URLSearchParams input as-is')
- [x] it('should serialize search=* tuple array input using URLSearchParams')
- [x] it('should serialize search=* object input using URLSearchParams')
- [x] it('should apply stringifier to non-string values in search=* inputs before serialization')
- [x] it('should stringify nested objects/arrays in search=* inputs via stringifier (no expansion)')
- [x] it('should encode hash pattern params with encodeURIComponent')
- [x] it('should apply stringifier to non-string hash params before encoding')
- [x] it('should not pre-encode username and password values (URL setter handles encoding)')
- [x] it('should not pre-encode hostname and should allow URL normalization (lowercase)')
- [x] it('should allow punycode normalization for unicode hostnames')
- [x] it('should not pre-encode protocol and port values (URL parsing validates)')

## Next steps (to decide)
- Confirm the encoding behavior per component and the pathname slash-allow rules.
- Decide on fixture strategy:
  - Update `transform-testdata.ts` to apply the same encoding rules and regenerate fixtures, or
  - Keep fixture tests as-is and add separate encoding-focused tests, adjusting expectations accordingly.
- Implement token metadata for slash-allowed pathname params and apply component-specific encoders.
- Add/adjust tests for hostname handling (ensure no `encodeURIComponent` is applied; rely on `URL` normalization such as lowercasing and punycode).
