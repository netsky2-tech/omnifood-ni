import { lazy, type LazyExoticComponent } from "react";
import { isChunkLoadError, triggerSafeChunkReload } from "./chunk-reload";

/**
 * Enhanced React.lazy that retries failed dynamic imports before rejecting.
 * If the error is an unrecoverable stale chunk load, it initiates a safe page reload.
 */
export function lazyWithRetry<
  T extends Parameters<typeof lazy>[0] extends () => Promise<{ default: infer U }> ? U : never,
>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
  intervalMs = 400,
): LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        factory()
          .then(resolve)
          .catch((error: unknown) => {
            if (remaining > 0) {
              setTimeout(() => {
                attempt(remaining - 1);
              }, intervalMs);
              return;
            }

            if (isChunkLoadError(error)) {
              const reloaded = triggerSafeChunkReload();
              if (reloaded) return;
            }

            reject(error);
          });
      };

      attempt(retries);
    }),
  );
}
