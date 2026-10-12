import {
  CorsConfigError,
  CORS_ORIGINS_ENV,
  LOCAL_DEFAULT_ORIGINS,
  resolveCorsOrigins,
} from './http-security.config';

describe('resolveCorsOrigins', () => {
  describe('production fail-closed contract', () => {
    it('accepts a valid https allowlist, trims entries, and dedupes preserving order', () => {
      const origins = resolveCorsOrigins({
        nodeEnv: 'production',
        raw: ' https://soho.nhilospos.com , https://soho.nhilospos.com ',
      });

      expect(origins).toEqual(['https://soho.nhilospos.com']);
    });

    it('rejects a missing allowlist', () => {
      expect(() => resolveCorsOrigins({ nodeEnv: 'production' })).toThrow(
        CorsConfigError,
      );
    });

    it('rejects a blank allowlist', () => {
      expect(() =>
        resolveCorsOrigins({ nodeEnv: 'production', raw: '   ' }),
      ).toThrow(CorsConfigError);
    });

    it('rejects a separator-only allowlist', () => {
      expect(() =>
        resolveCorsOrigins({ nodeEnv: 'production', raw: ' , , ' }),
      ).toThrow(CorsConfigError);
    });

    it.each([
      'not-a-url',
      '*',
      'https://*.example.com',
      'ftp://soho.nhilospos.com',
      'http://soho.nhilospos.com',
      'https://soho.nhilospos.com/app',
      'https://soho.nhilospos.com/?x=1',
      'https://user:pass@soho.nhilospos.com',
    ])('rejects malformed entry %s', (entry) => {
      expect(() =>
        resolveCorsOrigins({
          nodeEnv: 'production',
          raw: `https://api.example.com,${entry}`,
        }),
      ).toThrow(CorsConfigError);
    });
  });

  describe('malformed entry error contract', () => {
    it('reports the variable name and entry position without echoing the entry value', () => {
      let message = '';
      try {
        resolveCorsOrigins({
          nodeEnv: 'production',
          raw: 'https://api.example.com,https://user:secret-pass@soho.nhilospos.com',
        });
      } catch (error) {
        message = error instanceof CorsConfigError ? error.message : '';
      }

      expect(message).toContain(CORS_ORIGINS_ENV);
      expect(message).toMatch(/position 2\b/);
      expect(message).not.toContain('https://user:secret-pass@soho.nhilospos.com');
      expect(message).not.toContain('user:secret-pass');
      expect(message).not.toContain('soho.nhilospos.com');
    });

    it('counts blank segments when reporting the entry position', () => {
      let message = '';
      try {
        resolveCorsOrigins({
          nodeEnv: 'production',
          raw: ' , https://api.example.com , https://bad.example.com/app',
        });
      } catch (error) {
        message = error instanceof CorsConfigError ? error.message : '';
      }

      expect(message).toContain(CORS_ORIGINS_ENV);
      expect(message).toMatch(/position 3\b/);
      expect(message).not.toContain('bad.example.com');
      expect(message).not.toContain('api.example.com');
    });
  });

  describe('non-production defaults', () => {
    it('defaults to the local dashboard origins when the allowlist is unset', () => {
      expect(resolveCorsOrigins({ nodeEnv: 'development' })).toEqual([
        ...LOCAL_DEFAULT_ORIGINS,
      ]);
    });

    it('treats a missing NODE_ENV as non-production', () => {
      expect(resolveCorsOrigins({})).toEqual([...LOCAL_DEFAULT_ORIGINS]);
    });

    it('uses the configured allowlist when valid in development', () => {
      const origins = resolveCorsOrigins({
        nodeEnv: 'development',
        raw: 'http://localhost:4173',
      });

      expect(origins).toEqual(['http://localhost:4173']);
    });

    it('allows plain http origins in development', () => {
      const origins = resolveCorsOrigins({
        nodeEnv: 'development',
        raw: 'http://192.168.1.20:5173',
      });

      expect(origins).toEqual(['http://192.168.1.20:5173']);
    });

    it('rejects malformed entries instead of silently ignoring them', () => {
      expect(() =>
        resolveCorsOrigins({ nodeEnv: 'development', raw: 'not-a-url' }),
      ).toThrow(CorsConfigError);
    });
  });
});
