import { helmetOptions } from './helmet.config';

describe('helmetOptions', () => {
  it('keeps local development relaxed (no CSP, no HSTS)', () => {
    const options = helmetOptions('development');
    expect(options.contentSecurityPolicy).toBe(false);
    expect(options.hsts).toBe(false);
  });

  it('treats an unset NODE_ENV as non-production', () => {
    const options = helmetOptions(undefined);
    expect(options.contentSecurityPolicy).toBe(false);
    expect(options.hsts).toBe(false);
  });

  it('enables HSTS with subdomains and preload in production', () => {
    const options = helmetOptions('production');
    expect(options.hsts).toMatchObject({
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    });
  });

  it('enables a deny-by-default CSP in production', () => {
    const options = helmetOptions('production');
    const csp = options.contentSecurityPolicy as {
      directives: Record<string, unknown>;
    };
    expect(csp).toBeTruthy();
    expect(csp.directives.defaultSrc).toEqual(["'none'"]);
    expect(csp.directives.frameAncestors).toEqual(["'none'"]);
    expect(csp.directives.objectSrc).toEqual(["'none'"]);
  });

  it('does not silently change staging behavior away from production defaults', () => {
    // Only NODE_ENV=production is hardened; anything else keeps dev relaxed.
    const options = helmetOptions('staging');
    expect(options.hsts).toBe(false);
  });
});
