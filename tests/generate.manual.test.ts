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
    const pattern = new URLPattern({ search: '*', baseURL: 'https://example.com' });
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

  it('fails without protocol and hostname when URL construction is invalid', () => {
    const pattern = new URLPattern({ pathname: '/foo' });
    const params = emptyParams();

    expect(() => generate(pattern, params, {})).toThrow('Invalid URL');
  });
});
