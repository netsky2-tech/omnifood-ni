import { ApiError } from "@/lib/api";

const TERMINAL_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError && TERMINAL_HTTP_STATUSES.has(error.status)) {
    return false;
  }
  return true;
}

export function computeRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 10000);
}
