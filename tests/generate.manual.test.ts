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

  it('accepts protocol params that already include a colon', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();
    params.protocol = { 0: 'https:' };
    params.hostname = { 0: 'example.com' };

    const result = generate(pattern, params, {});
    expect(result.href).toBe('https://example.com/foo');
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
