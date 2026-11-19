import { Inject, Injectable, Optional } from '@nestjs/common';

export interface InstallKitRateLimitOptions {
  /** Maximum accepted requests per IP per window. */
  limit?: number;
  /** Window length in milliseconds. */
  windowMs?: number;
}

export const INSTALL_KIT_RATE_LIMIT_OPTIONS = 'INSTALL_KIT_RATE_LIMIT_OPTIONS';

export interface InstallKitRateLimitDecision {
  readonly allowed: boolean;
  /** Seconds until the current window resets (0 when allowed). */
  readonly retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * In-memory fixed-window per-IP rate limiter for the public install-kit
 * endpoint `GET /i/:token` (issue #958). Defaults to 20 requests/minute/IP.
 */
@Injectable()
export class InstallKitRateLimiter {
  private static readonly DEFAULT_LIMIT = 20;
  private static readonly DEFAULT_WINDOW_MS = 60_000;
  private static readonly MAX_TRACKED_KEYS = 10_000;

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly windows = new Map<string, WindowState>();

  constructor(
    @Optional()
    @Inject(INSTALL_KIT_RATE_LIMIT_OPTIONS)
    options: InstallKitRateLimitOptions = {},
  ) {
    this.limit = options.limit ?? InstallKitRateLimiter.DEFAULT_LIMIT;
    this.windowMs = options.windowMs ?? InstallKitRateLimiter.DEFAULT_WINDOW_MS;
    if (this.limit < 1) {
      throw new Error('InstallKitRateLimiter limit must be >= 1');
    }
  }

  consume(key: string): InstallKitRateLimitDecision {
    const trimmedKey = key?.trim() || 'unknown';
    const now = Date.now();

    if (this.windows.size > InstallKitRateLimiter.MAX_TRACKED_KEYS) {
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
