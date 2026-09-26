import { Inject, Injectable, Optional } from '@nestjs/common';

export interface LinkingRateLimitOptions {
  /** Maximum accepted requests per key per window. */
  limit?: number;
  /** Window length in milliseconds. */
  windowMs?: number;
}

/**
 * Optional DI token for the limiter's tuning options. Unregistered by
 * default (the production wiring uses the built-in 10/minute limit);
 * tests construct the limiter directly with explicit options.
 */
export const LINKING_RATE_LIMIT_OPTIONS = 'LINKING_RATE_LIMIT_OPTIONS';

export interface LinkingRateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the current window resets (0 when allowed). */
  readonly retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * In-memory fixed-window per-IP rate limiter for the PRE-AUTH
 * `POST onboarding/activation/link` endpoint (issue #556 stage 3): lightly
 * bounded at 10 claims per minute per IP, documented as the founder-approved
 * light rate limit for the single pre-auth seam.
 *
 * Deliberately in-memory and per-instance: it is an abuse damper for a
 * bcrypt-backed code claim (codes are 31^6 and live at most expiryMinutes),
 * not a distributed quota. Windows reset lazily; a periodic sweep bounds the
 * map size so unbounded IPs cannot grow memory.
 */
@Injectable()
export class DeviceLinkingRateLimiter {
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly DEFAULT_WINDOW_MS = 60_000;
  private static readonly MAX_TRACKED_KEYS = 10_000;

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, WindowState>();

  constructor(
    @Optional()
    @Inject(LINKING_RATE_LIMIT_OPTIONS)
    private readonly options: LinkingRateLimitOptions = {},
  ) {
    this.limit = options.limit ?? DeviceLinkingRateLimiter.DEFAULT_LIMIT;
    this.windowMs =
      options.windowMs ?? DeviceLinkingRateLimiter.DEFAULT_WINDOW_MS;
    if (this.limit < 1) {
      throw new Error('DeviceLinkingRateLimiter limit must be >= 1');
    }
  }

  consume(key: string): LinkingRateLimitDecision {
    const trimmedKey = key?.trim() || 'unknown';
    const now = Date.now();

    if (this.windows.size > DeviceLinkingRateLimiter.MAX_TRACKED_KEYS) {
      this.sweep(now);
    }

    const state = this.windows.get(trimmedKey);
    if (!state || now - state.windowStart >= this.windowMs) {
      this.windows.set(trimmedKey, { count: 1, windowStart: now });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (state.count >= this.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.windowStart + this.windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }

    state.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweep(now: number): void {
    for (const [key, state] of this.windows) {
      if (now - state.windowStart >= this.windowMs) {
        this.windows.delete(key);
      }
    }
  }
}
