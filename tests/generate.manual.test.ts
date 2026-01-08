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
    expect(result.href).toBe('https://example.com/foo#frag');
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
    expect(result.href).toBe('https://example.com/https://evil.com');
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
    params.pathname = { bar: 'value' };

    const result = generate(pattern, params, { stringifier: () => '' });
    expect(result.href).toBe('https://example.com/foo/');
  });

  it('preserves special characters from stringifier in pathname, search, and hash', () => {
    const pattern = new URLPattern({ pathname: ':path' });
    const baseParams = emptyParams();
    baseParams.protocol = { 0: 'https' };
    baseParams.hostname = { 0: 'example.com' };
    const stringifier = (value: unknown) => String(value);

    const pathnameParams = { ...baseParams };
    pathnameParams.pathname = { path: 'a/b?c#d' };
    const pathnameResult = generate(pattern, pathnameParams as Params, {
      stringifier,
    });
    expect(pathnameResult.href).toBe('https://example.com/a/b%3Fc%23d');

    const searchPattern = new URLPattern({ pathname: '/foo' });
    const searchParams = { ...baseParams };
    searchParams.search = { 0: 'a/b?c#d' };
    const searchResult = generate(searchPattern, searchParams as Params, {
      stringifier,
    });
    expect(searchResult.href).toBe('https://example.com/foo?a/b?c%23d');

    const hashPattern = new URLPattern({ pathname: '/foo' });
    const hashParams = { ...baseParams };
    hashParams.hash = { 0: 'a/b?c#d' };
    const hashResult = generate(hashPattern, hashParams as Params, {
      stringifier,
    });
    expect(hashResult.href).toBe('https://example.com/foo#a/b?c#d');
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
    expect(result.href).toBe('https://example.com/foo#frag?x=1#y=2');
  });

  it('preserves leading ? and # in search and hash params', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https' };
    params.hostname = { 0: 'example.com' };
    params.search = { 0: '?q=1' };
    params.hash = { 0: '#frag' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo?q=1#frag');
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
