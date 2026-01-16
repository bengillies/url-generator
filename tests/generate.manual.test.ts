import { describe, expect, it } from 'vitest';
import { generate, type Params } from '../src/index';

function emptyParams(): Params {
  return {
    pathname: {},
    search: {},
    hash: {},
    username: {},
    password: {},
    protocol: {},
    hostname: {},
    port: {},
  };
}

describe('generate manual cases', () => {
  it('uses wildcard search params when provided', () => {
    const pattern = new URLPattern({
      search: '*',
      baseURL: 'https://example.com',
    });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: 'q=1' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/?q=1');
  });

  it('allows providing protocol and hostname via params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo');
  });

  it('adds search params when the pattern has no search component', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: 'q=1' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1');
  });

  it('adds hash params when the pattern has no hash component', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.hash = { 0: 'frag' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo#frag');
  });

  it('adds search and hash when the pattern has neither', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: 'q=1' };
    params.hash = { 0: 'frag' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1#frag');
  });

  it('clears empty search/hash values', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const baseParams = emptyParams();
    baseParams.protocol = { 0: 'https' };
    baseParams.hostname = { 0: 'example.com' };

    const searchCases: Array<[string, unknown]> = [
      ['empty string', ''],
      ['null', null],
      ['undefined', undefined],
    ];
    for (const [, value] of searchCases) {
      const params = { ...baseParams, search: {} } as Params;
      if (value !== undefined) {
        params.search = { 0: value };
      }
      const result = generate(pattern, params, {});
      expect(result.href).toBe('https://example.com/foo');
    }

    const hashCases: Array<[string, unknown]> = [
      ['empty string', ''],
      ['null', null],
      ['undefined', undefined],
    ];
    for (const [, value] of hashCases) {
      const params = { ...baseParams, hash: {} } as Params;
      if (value !== undefined) {
        params.hash = { 0: value };
      }
      const result = generate(pattern, params, {});
      expect(result.href).toBe('https://example.com/foo');
    }
  });

  it('does not double-prefix search strings that already start with ?', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: '?q=1' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1');
  });

  it('does not double-prefix hash strings that already start with #', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.hash = { 0: '#frag' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo#%23frag');
  });

  it('supports protocol-only URLs with a pathname', () => {
    const pattern = new URLPattern({ protocol: 'mailto', pathname: ':addr' });
    const params = emptyParams();
    params.pathname = { addr: 'foo@example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('mailto:foo@example.com');
  });

  it('fails with a hostname but no protocol', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.hostname = { 0: 'example.com' };

    expect(() => generate(pattern, params, {})).toThrow('Invalid URL');
  });

  it('fails with credentials and host but no protocol', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.hostname = { 0: 'example.com' };
    params.username = { 0: 'user' };
    params.password = { 0: 'pass' };

    expect(() => generate(pattern, params, {})).toThrow('Invalid URL');
  });

  it('renders credentials with protocol and host', () => {
    const pattern = new URLPattern({ pathname: '/foo' });

    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.username = { 0: 'user name' };
    params.password = { 0: 'p@ss' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://user%20name:p%40ss@example.com/foo');

    const emptyUser = emptyParams();
    emptyUser.protocol = { 0: 'https' };
    emptyUser.hostname = { 0: 'example.com' };
    emptyUser.username = { 0: '' };
    emptyUser.password = { 0: 'pass' };

    const emptyResult = generate(pattern, emptyUser, {});
    expect(emptyResult.href).toBe('https://:pass@example.com/foo');
  });

  it('treats hostname and port as a scheme when no protocol is provided', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.hostname = { 0: 'example.com' };
    params.port = { 0: '8080' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('example.com:8080/foo');
  });

  it('supports IPv6 hosts with credentials and port', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: '[::1]' };
    params.port = { 0: '8080' };
    params.username = { 0: 'user' };
    params.password = { 0: 'pass' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://user:pass@[::1]:8080/foo');
  });

  it('accepts protocol params that already include a colon', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https:' };
    params.hostname = { 0: 'example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo');
  });

  it('accepts protocol params with colon plus hostname and port', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https:' };
    params.hostname = { 0: 'example.com' };
    params.port = { 0: '8080' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com:8080/foo');
  });

  it('treats absolute URLs in pathname params as literal paths', () => {
    const pattern = new URLPattern({ pathname: ':path' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.pathname = { path: 'https://evil.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/https%3A%2F%2Fevil.com');
  });

  it('keeps required pathname segments when param is empty string', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.pathname = { bar: '' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('uses prefix-only insertion when stringifier returns empty string', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo/:bar?',
    });
    const params = emptyParams();
    params.pathname = { bar: 5 };

    const result = generate(pattern, params, { stringifier: () => '' });
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('preserves special characters from stringifier in pathname, search, and hash', () => {
    const pattern = new URLPattern({ pathname: ':path' });
    const baseParams = emptyParams();
    baseParams.protocol = { 0: 'https' };
    baseParams.hostname = { 0: 'example.com' };
    const stringifier = () => 'a/b?c#d';

    const pathnameParams = { ...baseParams };
    pathnameParams.pathname = { path: 1 };
    const pathnameResult = generate(pattern, pathnameParams as Params, {
      stringifier,
    });
    expect(pathnameResult.href).toBe('https://example.com/a%2Fb%3Fc%23d');

    const searchPattern = new URLPattern({ pathname: '/foo' });
    const searchParams = { ...baseParams };
    searchParams.search = { 0: 2 };
    const searchResult = generate(searchPattern, searchParams as Params, {
      stringifier,
    });
    expect(searchResult.href).toBe('https://example.com/foo?a/b?c%23d');

    const hashPattern = new URLPattern({ pathname: '/foo' });
    const hashParams = { ...baseParams };
    hashParams.hash = { 0: 3 };
    const hashResult = generate(hashPattern, hashParams as Params, {
      stringifier,
    });
    expect(hashResult.href).toBe('https://example.com/foo#a%2Fb%3Fc%23d');
  });

  it('handles wildcard params with multiple segments and empty strings', () => {
    const pattern = new URLPattern({ pathname: '/foo/*' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };

    params.pathname = { 0: 'a/b' };
    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo/a/b');

    params.pathname = { 0: '' };
    const emptyResult = generate(pattern, params, {});
    expect(emptyResult.href).toBe('https://example.com/foo/');
  });

  it('uses positional params for regex groups in order', () => {
    const pattern = new URLPattern({ pathname: '/(foo)(bar)' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.pathname = { 0: 'foo', 1: 'bar' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foobar');
  });

  it('supports mixed named and positional regex groups', () => {
    const pattern = new URLPattern({ pathname: '/:id(\\d+)(foo)' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.pathname = { id: '123', 0: 'foo' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/123foo');
  });

  it('handles nested regex groups with optional modifiers', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: '(sub(?:.))?example.com',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.hostname = { 0: 'sub.' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://sub.example.com/foo');
  });

  it('omits optional params when value is null or undefined', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar?' });
    const baseParams = emptyParams();
    baseParams.protocol = { 0: 'https' };
    baseParams.hostname = { 0: 'example.com' };

    const nullParams = { ...baseParams, pathname: { bar: null } } as Params;
    const nullResult = generate(pattern, nullParams, {});
    expect(nullResult.href).toBe('https://example.com/foo');

    const undefinedParams = { ...baseParams, pathname: { bar: undefined } } as Params;
    const undefinedResult = generate(pattern, undefinedParams, {});
    expect(undefinedResult.href).toBe('https://example.com/foo');
  });

  it('preserves prefix for optional params when value is empty string', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar?' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.pathname = { bar: '' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('uses scalar values for repeated modifiers', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar+' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.pathname = { bar: 'a/b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo/a/b');
  });

  it('preserves adjacent literals when optional params are omitted', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar?-baz' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo-baz');
  });

  it('renders escaped special characters literally in the pathname', () => {
    const pattern = new URLPattern({ pathname: '/foo\\?bar\\#baz\\(' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo%3Fbar%23baz(');
  });

  it('preserves ? and & in search params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: 'q=1&x=2?y=3' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1&x=2?y=3');
  });

  it('preserves # and ? in hash params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.hash = { 0: 'frag?x=1#y=2' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo#frag%3Fx%3D1%23y%3D2');
  });

  it('preserves leading ? and # in search and hash params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: '?q=1' };
    params.hash = { 0: '#frag' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1#%23frag');
  });

  it('fails with an invalid protocol and no host', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: '1http' };

    expect(() => generate(pattern, params, {})).toThrow('Invalid URL');
  });

  it('handles partial params for non-path components', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
    });
    const params = { search: { 0: 'q=1' } } as Params;

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1');
  });

  it('normalizes hostname casing and preserves trailing dot', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'Example.COM.' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com./foo');
  });

  it('normalizes numeric ports and rejects non-numeric ports', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.port = { 0: '080' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com:80/foo');

    const badParams = emptyParams();
    badParams.protocol = { 0: 'https' };
    badParams.hostname = { 0: 'example.com' };
    badParams.port = { 0: 'abc' };
    expect(() => generate(pattern, badParams, {})).toThrow('Invalid URL');
  });

  it('tolerates missing per-key params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = {
      pathname: { 0: '/foo' },
      protocol: { 0: 'https' },
      hostname: { 0: 'example.com' },
    } as Params;

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo');
  });

  it('omits optional groups when no params are provided', () => {
    const pattern = new URLPattern({ pathname: '/foo{/bar}?' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo');
  });

  it('fails without protocol and hostname when URL construction is invalid', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();

    expect(() => generate(pattern, params, {})).toThrow('Invalid URL');
  });
});

describe('generate encoding behavior', () => {
  it('should encode pathname params with encodeURIComponent by default', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/a%20b');
  });

  it('should preserve slashes for pathname params with + modifier', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar+',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a/b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/a/b');
  });

  it('should preserve slashes for pathname params with * modifier', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar*',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a/b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/a/b');
  });

  it('should preserve slashes for wildcard pathname params', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo/*',
    });
    const params = emptyParams();
    params.pathname = { 0: 'a/b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo/a/b');
  });

  it('should preserve slashes for pathname params with explicit regex groups', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar(.*)',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a/b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/a/b');
  });

  it('should still encode ? and # within slash-preserving pathname params', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar+',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a/b?c#d' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/a/b%3Fc%23d');
  });

  it('should encode pathname params when stringifier returns non-string values', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname = { bar: 5 };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe('https://example.com/num%205');
  });

  it('should not double-encode pathname params that already contain percent sequences', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a%2Fb' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/a%2Fb');
  });

  it('should default-stringify non-string params when no stringifier is provided', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname = { bar: 5 };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/5');
  });

  it('should encode search pattern params using URLSearchParams-style encoding (spaces to +)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: 'q=:q',
    });
    const params = emptyParams();
    params.search = { q: 'bar baz' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=bar+baz');
  });

  it('should keep literal & and = in search patterns while encoding param values', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: 'q=:q&literal=a=b',
    });
    const params = emptyParams();
    params.search = { q: 'x&y' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=x%26y&literal=a=b');
  });

  it('should apply stringifier to non-string search pattern params before encoding', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: 'q=:q&limit=:limit',
    });
    const params = emptyParams();
    params.search = { q: 'bar baz', limit: 5 };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe('https://example.com/foo?q=bar+baz&limit=num+5');
  });

  it('should treat search=* string input as a preformatted query string without re-encoding', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: 'q=bar+baz' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=bar+baz');
  });

  it('should serialize search=* URLSearchParams input as-is', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: new URLSearchParams([['q', 'bar baz']]) };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=bar+baz');
  });

  it('should serialize search=* tuple array input using URLSearchParams', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: [['q', 'bar baz'], ['limit', 1]] };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe('https://example.com/foo?q=bar+baz&limit=num+1');
  });

  it('should ignore non-tuple entries in search=* tuple arrays', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: [['q', 'bar baz'], 'skip'] };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=bar+baz');
  });

  it('should serialize search=* object input using URLSearchParams', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: { q: 'bar baz', limit: 10 } };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe('https://example.com/foo?q=bar+baz&limit=num+10');
  });

  it('should apply stringifier to non-string values in search=* inputs before serialization', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: { q: 2 } };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe('https://example.com/foo?q=num+2');
  });

  it('should stringify nested objects/arrays in search=* inputs via stringifier (no expansion)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search = { 0: { filter: { a: 1 } } };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : JSON.stringify(value);

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe(
      'https://example.com/foo?filter=%7B%22a%22%3A1%7D',
    );
  });

  it('should encode hash pattern params with encodeURIComponent', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      hash: ':frag',
    });
    const params = emptyParams();
    params.hash = { frag: 'a b' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo#a%20b');
  });

  it('should apply stringifier to non-string hash params before encoding', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      hash: ':frag',
    });
    const params = emptyParams();
    params.hash = { frag: 5 };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    const result = generate(pattern, params, { stringifier });
    expect(result.href).toBe('https://example.com/foo#num%205');
  });

  it('should keep hash patterns that include a leading # literal', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      hash: '#frag',
    });
    const params = emptyParams();

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo#frag');
  });

  it('should not pre-encode username and password values (URL setter handles encoding)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.username = { 0: 'user%20name' };
    params.password = { 0: 'p%40ss' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://user%20name:p%40ss@example.com/foo');
  });

  it('should not pre-encode hostname and should allow URL normalization (lowercase)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.hostname = { 0: 'Example.COM.' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com./foo');
  });

  it('should allow punycode normalization for unicode hostnames', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.hostname = { 0: 'm\u00fcnich.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://xn--mnich-kva.com/foo');
  });

  it('should not pre-encode protocol and port values (URL parsing validates)', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'git+ssh' };
    params.hostname = { 0: 'example.com' };
    params.port = { 0: '8080' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('git+ssh://example.com:8080/foo');
  });

  it('should allow configuring hierarchical schemes for custom protocols', () => {
    const pattern = new URLPattern({
      protocol: 'myapp',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname = { bar: 'a b' };

    const result = generate(pattern, params, {
      hierarchicalSchemes: ['myapp'],
    });
    expect(result.href).toBe('myapp://example.com/a%20b');
  });
});
