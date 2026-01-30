import { describe, expect, it } from 'vitest';
import { generate, MissingParamError, type Params } from '../src/index';

function emptyParams(): Required<Params> {
  return {
    pathname: { groups: {} },
    search: { groups: {} },
    hash: { groups: {} },
    username: { groups: {} },
    password: { groups: {} },
    protocol: { groups: {} },
    hostname: { groups: {} },
    port: { groups: {} },
  };
}

describe('generate manual cases', () => {
  it('uses wildcard search params when provided', () => {
    const pattern = new URLPattern({
      search: '*',
      baseURL: 'https://example.com',
    });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.search.groups = { 0: 'q=1' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/?q=1');
  });

  it('allows providing protocol and hostname via params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo');
  });

  it('adds pathname and query when specified in params', () => {
    const pattern = new URLPattern('http://example.com/foo/:bar\\?q=:q');
    const params = emptyParams();
    params.pathname.groups = { bar: 'baz' };
    params.search.groups = { q: '1' };

    const result = generate(pattern, params);
    expect(result.href).toBe('http://example.com/foo/baz?q=1');
  });

  it('adds search params when the pattern has no search component', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.search.groups = { 0: 'q=1' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=1');
  });

  it('adds hash params when the pattern has no hash component', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.hash.groups = { 0: 'frag' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo#frag');
  });

  it('adds search and hash when the pattern has neither', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.search.groups = { 0: 'q=1' };
    params.hash.groups = { 0: 'frag' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=1#frag');
  });

  it('clears empty search/hash values', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const baseParams = emptyParams();
    baseParams.protocol.groups = { 0: 'https' };
    baseParams.hostname.groups = { 0: 'example.com' };

    const searchCases: [string, unknown][] = [
      ['empty string', ''],
      ['null', null],
      ['undefined', undefined],
    ];
    for (const [, value] of searchCases) {
      const params: Required<Params> = { ...baseParams, search: { groups: {} } };
      if (value !== undefined) {
        params.search.groups = { 0: value };
      }

      const result = generate(pattern, params);
      expect(result.href).toBe('https://example.com/foo');
    }

    const hashCases: [string, unknown][] = [
      ['empty string', ''],
      ['null', null],
      ['undefined', undefined],
    ];
    for (const [, value] of hashCases) {
      const params: Required<Params> = { ...baseParams, hash: { groups: {} } };
      if (value !== undefined) {
        params.hash.groups = { 0: value };
      }

      const result = generate(pattern, params);
      expect(result.href).toBe('https://example.com/foo');
    }
  });

  it('does not double-prefix search strings that already start with ?', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.search.groups = { 0: '?q=1' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=1');
  });

  it('does not double-prefix hash strings that already start with #', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.hash.groups = { 0: '#frag' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo#%23frag');
  });

  it('supports protocol-only URLs with a pathname', () => {
    const pattern = new URLPattern({ protocol: 'myapp', pathname: ':addr' });
    const params = emptyParams();
    params.pathname.groups = { addr: 'foo/bar' };

    const result = generate(pattern, params);
    expect(result.href).toBe('myapp:foo%2Fbar');
  });

  it('fails with a hostname but no protocol', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.hostname.groups = { 0: 'example.com' };

    expect(() => generate(pattern, params)).toThrow('Invalid URL');
  });

  it('fails with credentials and host but no protocol', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.hostname.groups = { 0: 'example.com' };
    params.username.groups = { 0: 'user' };
    params.password.groups = { 0: 'pass' };

    expect(() => generate(pattern, params)).toThrow('Invalid URL');
  });

  it('renders credentials with protocol and host', () => {
    const pattern = new URLPattern({ pathname: '/foo' });

    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.username.groups = { 0: 'user name' };
    params.password.groups = { 0: 'p@ss' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://user%20name:p%40ss@example.com/foo');

    const emptyUser = emptyParams();
    emptyUser.protocol.groups = { 0: 'https' };
    emptyUser.hostname.groups = { 0: 'example.com' };
    emptyUser.username.groups = { 0: '' };
    emptyUser.password.groups = { 0: 'pass' };

    const emptyResult = generate(pattern, emptyUser);
    expect(emptyResult.href).toBe('https://:pass@example.com/foo');
  });

  it('treats hostname and port as a scheme when no protocol is provided', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.hostname.groups = { 0: 'example.com' };
    params.port.groups = { 0: '8080' };

    const result = generate(pattern, params);
    expect(result.href).toBe('example.com:8080/foo');
  });

  it('supports IPv6 hosts with credentials and port', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: '[::1]' };
    params.port.groups = { 0: '8080' };
    params.username.groups = { 0: 'user' };
    params.password.groups = { 0: 'pass' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://user:pass@[::1]:8080/foo');
  });

  it('accepts protocol params that already include a colon', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https:' };
    params.hostname.groups = { 0: 'example.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo');
  });

  it('accepts protocol params with colon plus hostname and port', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https:' };
    params.hostname.groups = { 0: 'example.com' };
    params.port.groups = { 0: '8080' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com:8080/foo');
  });

  it('treats absolute URLs in pathname params as literal paths', () => {
    const pattern = new URLPattern({ pathname: ':path' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.pathname.groups = { path: 'https://evil.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/https%3A%2F%2Fevil.com');
  });

  it('keeps required pathname segments when param is empty string', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.pathname.groups = { bar: '' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('uses prefix-only insertion when stringifier returns empty string', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo/:bar?',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 5 };
    params.pathname.stringify = () => '';

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('preserves special characters from stringifier in pathname, search, and hash', () => {
    const pattern = new URLPattern({ pathname: ':path' });
    const stringifier = () => 'a/b?c#d';

    const pathnameParams = emptyParams();
    pathnameParams.protocol.groups = { 0: 'https' };
    pathnameParams.hostname.groups = { 0: 'example.com' };
    pathnameParams.pathname.groups = { path: 1 };
    pathnameParams.pathname.stringify = stringifier;
    const pathnameResult = generate(pattern, pathnameParams);
    expect(pathnameResult.href).toBe('https://example.com/a%2Fb%3Fc%23d');

    const searchPattern = new URLPattern({ pathname: '/foo' });
    const searchParams = emptyParams();
    searchParams.protocol.groups = { 0: 'https' };
    searchParams.hostname.groups = { 0: 'example.com' };
    searchParams.search.groups = { 0: 2 };
    searchParams.search.stringify = stringifier;
    const searchResult = generate(searchPattern, searchParams);
    expect(searchResult.href).toBe('https://example.com/foo?a/b?c%23d');

    const hashPattern = new URLPattern({ pathname: '/foo' });
    const hashParams = emptyParams();
    hashParams.protocol.groups = { 0: 'https' };
    hashParams.hostname.groups = { 0: 'example.com' };
    hashParams.hash.groups = { 0: 3 };
    hashParams.hash.stringify = stringifier;
    const hashResult = generate(hashPattern, hashParams);
    expect(hashResult.href).toBe('https://example.com/foo#a%2Fb%3Fc%23d');
  });

  it('handles wildcard params with multiple segments and empty strings', () => {
    const pattern = new URLPattern({ pathname: '/foo/*' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };

    params.pathname.groups = { 0: 'a/b' };
    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo/a/b');

    params.pathname.groups = { 0: '' };
    const emptyResult = generate(pattern, params);
    expect(emptyResult.href).toBe('https://example.com/foo/');
  });

  it('uses positional params for regex groups in order', () => {
    const pattern = new URLPattern({ pathname: '/(foo)(bar)' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.pathname.groups = { 0: 'foo', 1: 'bar' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foobar');
  });

  it('supports mixed named and positional regex groups', () => {
    const pattern = new URLPattern({ pathname: '/:id(\\d+)(foo)' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.pathname.groups = { id: '123', 0: 'foo' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/123foo');
  });

  it('handles nested regex groups with optional modifiers', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: '(sub(?:.))?example.com',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.hostname.groups = { 0: 'sub.' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://sub.example.com/foo');
  });

  it('omits optional params when value is null or undefined', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar?' });
    const baseParams = emptyParams();
    baseParams.protocol.groups = { 0: 'https' };
    baseParams.hostname.groups = { 0: 'example.com' };

    const nullParams = {
      ...baseParams,
      pathname: { groups: { bar: null } },
    } as Params;
    const nullResult = generate(pattern, nullParams);
    expect(nullResult.href).toBe('https://example.com/foo');

    const undefinedParams = {
      ...baseParams,
      pathname: { groups: { bar: undefined } },
    } as Params;
    const undefinedResult = generate(pattern, undefinedParams);
    expect(undefinedResult.href).toBe('https://example.com/foo');
  });

  it('preserves prefix for optional params when value is empty string', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar?' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.pathname.groups = { bar: '' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('uses scalar values for repeated modifiers', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar+' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.pathname.groups = { bar: 'a/b' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo/a/b');
  });

  it('preserves adjacent literals when optional params are omitted', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar?-baz' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo-baz');
  });

  it('allows optional params to be omitted across components', () => {
    const pattern = new URLPattern({
      protocol: 'http{:proto}?',
      username: 'user{:user}?',
      password: 'pass{:pass}?',
      hostname: 'example.com{:host}?',
      port: '{:port}?',
      pathname: '/base{:path}?',
      search: '{q=:q}?',
      hash: '{section-:section}?',
    });

    const params = emptyParams();

    const result = generate(pattern, params);
    expect(result.href).toBe('http://user:pass@example.com/base');
  });

  it('throws when required params are missing across components', () => {
    const pattern = new URLPattern({
      protocol: ':proto',
      username: ':user',
      password: ':pass',
      hostname: ':host',
      port: ':port',
      pathname: '/:path',
      search: 'q=:q',
      hash: 'section-:section',
    });
    const baseParams = emptyParams();
    baseParams.protocol.groups = { proto: 'https' };
    baseParams.username.groups = { user: 'alice' };
    baseParams.password.groups = { pass: 'secret' };
    baseParams.hostname.groups = { host: 'example.com' };
    baseParams.port.groups = { port: '443' };
    baseParams.pathname.groups = { path: 'docs' };
    baseParams.search.groups = { q: '1' };
    baseParams.hash.groups = { section: 'intro' };

    const cases: [string, Params][] = [
      ['protocol', { ...baseParams, protocol: { groups: {} } }],
      ['username', { ...baseParams, username: { groups: {} } }],
      ['password', { ...baseParams, password: { groups: {} } }],
      ['hostname', { ...baseParams, hostname: { groups: {} } }],
      ['port', { ...baseParams, port: { groups: {} } }],
      ['pathname', { ...baseParams, pathname: { groups: {} } }],
      ['search', { ...baseParams, search: { groups: {} } }],
      ['hash', { ...baseParams, hash: { groups: {} } }],
    ];

    for (const [, params] of cases) {
      expect(() => generate(pattern, params)).toThrow('Missing required param');
    }
  });

  it('allows missing params for * wildcard modifiers', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar*' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo');
  });

  it('throws on missing params for + wildcard modifiers', () => {
    const pattern = new URLPattern({ pathname: '/foo/:bar+' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };

    expect(() => generate(pattern, params)).toThrow(MissingParamError);
  });

  it('preserves ? and & in search params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.search.groups = { 0: 'q=1&x=2?y=3' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=1&x=2?y=3');
  });

  it('preserves # and ? in hash params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.hash.groups = { 0: 'frag?x=1#y=2' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo#frag%3Fx%3D1%23y%3D2');
  });

  it('preserves leading ? and # in search and hash params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.search.groups = { 0: '?q=1' };
    params.hash.groups = { 0: '#frag' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=1#%23frag');
  });

  it('fails with an invalid protocol and no host', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: '1http' };

    expect(() => generate(pattern, params)).toThrow('Invalid URL');
  });

  it('handles partial params for non-path components', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
    });
    const params = { search: { groups: { 0: 'q=1' } } };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=1');
  });

  it('normalizes hostname casing and preserves trailing dot', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'Example.COM.' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com./foo');
  });

  it('normalizes numeric ports and rejects non-numeric ports', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };
    params.port.groups = { 0: '080' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com:80/foo');

    const badParams = emptyParams();
    badParams.protocol.groups = { 0: 'https' };
    badParams.hostname.groups = { 0: 'example.com' };
    badParams.port.groups = { 0: 'abc' };
    expect(() => generate(pattern, badParams)).toThrow('Invalid URL');
  });

  it('tolerates missing per-key params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = {
      pathname: { groups: { 0: '/foo' } },
      protocol: { groups: { 0: 'https' } },
      hostname: { groups: { 0: 'example.com' } },
    } as Params;

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo');
  });

  it('treats missing groups as empty for component configs', () => {
    const pattern = new URLPattern({ pathname: '/foo', search: '*' });
    const params = {
      protocol: { groups: { 0: 'https' } },
      hostname: { groups: { 0: 'example.com' } },
      pathname: {} as Params['pathname'],
      search: {} as Params['search'],
    } as Params;

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo');
  });

  it('omits optional groups when no params are provided', () => {
    const pattern = new URLPattern({ pathname: '/foo{/bar}?' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'https' };
    params.hostname.groups = { 0: 'example.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo');
  });

  it('fails without protocol and hostname when URL construction is invalid', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();

    expect(() => generate(pattern, params)).toThrow('Invalid URL');
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
    params.pathname.groups = { bar: 'a b' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a%20b');
  });

  it('should skip encoding for components when disableEncoding is true', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 'a/b?c#d' };
    params.pathname.disableEncoding = true;

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a/b%3Fc%23d');
  });

  it('should preserve slashes for pathname params with + modifier', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar+',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 'a/b' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a/b');
  });

  it('should preserve slashes for pathname params with * modifier', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar*',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 'a/b' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a/b');
  });

  it('should preserve slashes for wildcard pathname params', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo/*',
    });
    const params = emptyParams();
    params.pathname.groups = { 0: 'a/b' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo/a/b');
  });

  it('should preserve slashes for pathname params with explicit regex groups', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar(.*)',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 'a/b' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a/b');
  });

  it('should still encode ? and # within slash-preserving pathname params', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar+',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 'a/b?c#d' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a/b%3Fc%23d');
  });

  it('should encode pathname params when stringifier returns non-string values', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 5 };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    params.pathname.stringify = stringifier;
    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/num%205');
  });

  it('should not double-encode pathname params that already contain percent sequences', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 'a%2Fb' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/a%2Fb');
  });

  it('should default-stringify non-string params when no stringifier is provided', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/:bar',
    });
    const params = emptyParams();
    params.pathname.groups = { bar: 5 };

    const result = generate(pattern, params);
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
    params.search.groups = { q: 'bar baz' };

    const result = generate(pattern, params);
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
    params.search.groups = { q: 'x&y' };

    const result = generate(pattern, params);
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
    params.search.groups = { q: 'bar baz', limit: 5 };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    params.search.stringify = stringifier;
    const result = generate(pattern, params);
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
    params.search.groups = { 0: 'q=bar+baz' };

    const result = generate(pattern, params);
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
    params.search.groups = { 0: new URLSearchParams([['q', 'bar baz']]) };

    const result = generate(pattern, params);
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
    params.search.groups = {
      0: [
        ['q', 'bar baz'],
        ['limit', 1],
      ],
    };

    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    params.search.stringify = stringifier;
    const result = generate(pattern, params);
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
    params.search.groups = { 0: [['q', 'bar baz'], 'skip'] };

    const result = generate(pattern, params);
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
    params.search.groups = { 0: { q: 'bar baz', limit: 10 } };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    params.search.stringify = stringifier;
    const result = generate(pattern, params);
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
    params.search.groups = { 0: { q: 2 } };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    params.search.stringify = stringifier;
    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=num+2');
  });

  it('should allow URLSearchParams-based stringifier for non-string values', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search.groups = { 0: { q: { a: 1 } } };
    const stringifier = (value: unknown) =>
      typeof value === 'string'
        ? value
        : new URLSearchParams(value as Record<string, string>).toString();

    params.search.stringify = stringifier;
    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo?q=a%3D1');
  });

  it('should stringify nested objects/arrays in search=* inputs via stringifier (no expansion)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
      search: '*',
    });
    const params = emptyParams();
    params.search.groups = { 0: { filter: { a: 1 } } };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : JSON.stringify(value);

    params.search.stringify = stringifier;
    const result = generate(pattern, params);
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
    params.hash.groups = { frag: 'a b' };

    const result = generate(pattern, params);
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
    params.hash.groups = { frag: 5 };
    const stringifier = (value: unknown) =>
      typeof value === 'string' ? value : `num ${String(value)}`;

    params.hash.stringify = stringifier;
    const result = generate(pattern, params);
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

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com/foo#frag');
  });

  it('should not pre-encode username and password values (URL setter handles encoding)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      hostname: 'example.com',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.username.groups = { 0: 'user%20name' };
    params.password.groups = { 0: 'p%40ss' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://user%20name:p%40ss@example.com/foo');
  });

  it('should not pre-encode hostname and should allow URL normalization (lowercase)', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.hostname.groups = { 0: 'Example.COM.' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://example.com./foo');
  });

  it('should allow punycode normalization for unicode hostnames', () => {
    const pattern = new URLPattern({
      protocol: 'https',
      pathname: '/foo',
    });
    const params = emptyParams();
    params.hostname.groups = { 0: 'm\u00fcnich.com' };

    const result = generate(pattern, params);
    expect(result.href).toBe('https://xn--mnich-kva.com/foo');
  });

  it('should not pre-encode protocol and port values (URL parsing validates)', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol.groups = { 0: 'git+ssh' };
    params.hostname.groups = { 0: 'example.com' };
    params.port.groups = { 0: '8080' };

    const result = generate(pattern, params);
    expect(result.href).toBe('git+ssh://example.com:8080/foo');
  });
});
