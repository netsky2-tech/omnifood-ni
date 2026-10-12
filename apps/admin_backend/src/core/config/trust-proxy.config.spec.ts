import {
  TRUST_PROXY_HOPS_ENV,
  TrustProxyConfigError,
  resolveTrustProxyHops,
} from './trust-proxy.config';

describe('resolveTrustProxyHops', () => {
  it('defaults to one proxy hop when the env var is unset', () => {
    expect(resolveTrustProxyHops({ raw: undefined })).toBe(1);
  });

  it('defaults to one proxy hop when the env var is blank', () => {
    expect(resolveTrustProxyHops({ raw: '   ' })).toBe(1);
  });

  it('accepts a positive hop count', () => {
    expect(resolveTrustProxyHops({ raw: '2' })).toBe(2);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(resolveTrustProxyHops({ raw: ' 2 ' })).toBe(2);
  });

  it.each(['0', '-1', 'abc', '1.5', '1e2'])(
    'rejects non-positive or non-integer value %s',
    (raw) => {
      expect(() => resolveTrustProxyHops({ raw })).toThrow(
        TrustProxyConfigError,
      );
    },
  );

  it('rejects hop counts above the sane maximum', () => {
    expect(() => resolveTrustProxyHops({ raw: '6' })).toThrow(
      TrustProxyConfigError,
    );
  });

  it('error messages never echo the raw value', () => {
    const secretish = '1; rm -rf /tmp';
    let message = '';
    try {
      resolveTrustProxyHops({ raw: secretish });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain(secretish);
    expect(message).toContain(TRUST_PROXY_HOPS_ENV);
  });
});
