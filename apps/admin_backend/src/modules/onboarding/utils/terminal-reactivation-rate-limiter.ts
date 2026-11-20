import { Inject, Injectable, Optional } from '@nestjs/common';

export interface TerminalReactivationRateLimitOptions {
  /** Maximum accepted requests per IP per window. Default: 15. */
  ipLimit?: number;
  /** Maximum accepted requests per hardware fingerprint per window. Default: 5. */
  fingerprintLimit?: number;
  /** Window length in milliseconds. Default: 60_000 (1 minute). */
  windowMs?: number;
}

export const TERMINAL_REACTIVATION_RATE_LIMIT_OPTIONS =
  'TERMINAL_REACTIVATION_RATE_LIMIT_OPTIONS';

export interface TerminalReactivationRateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  readonly limitedBy?: 'ip' | 'fingerprint';
}

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * In-memory fixed-window dual-key rate limiter for pre-auth terminal
 * reactivation lookup (`POST /onboarding/activation/device-lookup`, issue #566).
 * Enforces both per-IP (15/min) and per-fingerprint (5/min) caps to prevent
 * enumeration or challenge spam.
 */
@Injectable()
export class TerminalReactivationRateLimiter {
  private static readonly DEFAULT_IP_LIMIT = 15;
  private static readonly DEFAULT_FINGERPRINT_LIMIT = 5;
  private static readonly DEFAULT_WINDOW_MS = 60_000;
  private static readonly MAX_TRACKED_KEYS = 10_000;

  private readonly ipLimit: number;
  private readonly fingerprintLimit: number;
  private readonly windowMs: number;
  private readonly ipWindows = new Map<string, WindowState>();
  private readonly fingerprintWindows = new Map<string, WindowState>();

  constructor(
    @Optional()
    @Inject(TERMINAL_REACTIVATION_RATE_LIMIT_OPTIONS)
    options: TerminalReactivationRateLimitOptions = {},
  ) {
    this.ipLimit =
      options.ipLimit ?? TerminalReactivationRateLimiter.DEFAULT_IP_LIMIT;
    this.fingerprintLimit =
      options.fingerprintLimit ??
      TerminalReactivationRateLimiter.DEFAULT_FINGERPRINT_LIMIT;
    this.windowMs =
      options.windowMs ?? TerminalReactivationRateLimiter.DEFAULT_WINDOW_MS;

    if (this.ipLimit < 1 || this.fingerprintLimit < 1) {
      throw new Error(
        'TerminalReactivationRateLimiter limits must be >= 1',
      );
    }
  }

  consume(
    ip: string,
    fingerprintHash: string,
  ): TerminalReactivationRateLimitDecision {
    const now = Date.now();
    const ipKey = ip?.trim() || 'unknown';
    const fpKey = fingerprintHash?.trim().toLowerCase() || 'unknown';

    const ipCheck = this.checkOnly(this.ipWindows, ipKey, this.ipLimit, now);
    if (!ipCheck.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: ipCheck.retryAfterSeconds,
        limitedBy: 'ip',
      };
    }

    const fpCheck = this.checkOnly(
      this.fingerprintWindows,
      fpKey,
      this.fingerprintLimit,
      now,
    );
    if (!fpCheck.allowed) {
      return {
        allowed: false,
        retryAfterSeconds: fpCheck.retryAfterSeconds,
        limitedBy: 'fingerprint',
      };
    }

    this.increment(this.ipWindows, ipKey, now);
    this.increment(this.fingerprintWindows, fpKey, now);

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private checkOnly(
    map: Map<string, WindowState>,
    key: string,
    limit: number,
    now: number,
  ): { allowed: boolean; retryAfterSeconds: number } {
    if (map.size > TerminalReactivationRateLimiter.MAX_TRACKED_KEYS) {
      this.sweep(map, now);
    }

    const state = map.get(key);
    if (!state || now - state.windowStart >= this.windowMs) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (state.count >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.windowStart + this.windowMs - now) / 1000),
      );
      return { allowed: false, retryAfterSeconds };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  private increment(
    map: Map<string, WindowState>,
    key: string,
    now: number,
  ): void {
    const state = map.get(key);
    if (!state || now - state.windowStart >= this.windowMs) {
      map.set(key, { count: 1, windowStart: now });
      return;
    }
    state.count += 1;
  }

  private sweep(map: Map<string, WindowState>, now: number): void {
    for (const [key, state] of map) {
      if (now - state.windowStart >= this.windowMs) {
        map.delete(key);
      }
    }
  }
}
