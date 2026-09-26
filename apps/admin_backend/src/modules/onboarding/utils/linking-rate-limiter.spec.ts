import { DeviceLinkingRateLimiter } from './linking-rate-limiter';

/**
 * Unit contract for the in-memory per-IP rate limiter guarding the pre-auth
 * `POST onboarding/activation/link` endpoint (issue #556 stage 3): lightly
 * bounded at 10 claims per minute per IP, per-key isolation, and a window
 * that eventually admits the caller again.
 */
describe('DeviceLinkingRateLimiter', () => {
  it('allows up to the configured limit within one window', () => {
    const limiter = new DeviceLinkingRateLimiter({
      limit: 3,
      windowMs: 60_000,
    });

    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(true);

    const fourth = limiter.consume('ip-1');
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('isolates keys from each other', () => {
    const limiter = new DeviceLinkingRateLimiter({
      limit: 1,
      windowMs: 60_000,
    });

    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-2').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(false);
  });

  it('admits the caller again after the window elapses', async () => {
    const limiter = new DeviceLinkingRateLimiter({ limit: 1, windowMs: 30 });

    expect(limiter.consume('ip-1').allowed).toBe(true);
    expect(limiter.consume('ip-1').allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(limiter.consume('ip-1').allowed).toBe(true);
  });
});
