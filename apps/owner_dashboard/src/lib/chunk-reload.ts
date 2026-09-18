const CHUNK_RELOAD_STORAGE_KEY = "nhilos_chunk_reload_timestamp";
const RELOAD_COOLDOWN_MS = 20_000;

/**
 * Detects if an error is caused by a failed dynamic import / stale chunk load.
 * This occurs when a new release is deployed and old hashed JavaScript chunks
 * are removed from the CDN/server while a client SPA tab is still open.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    typeof error === "string"
      ? error
      : (error as Error).message || "";
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /unable to preload/i.test(msg)
  );
}

/**
 * Triggers a page reload to download the latest index.html and module manifest,
 * protected with a cooldown timer to prevent infinite reload loops.
 */
export function triggerSafeChunkReload(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const lastReloadStr = window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    const now = Date.now();

    if (!lastReloadStr || now - Number(lastReloadStr) > RELOAD_COOLDOWN_MS) {
      window.sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
      window.location.reload();
      return true;
    }
    console.warn("[NHILOS] Stale chunk reload cooldown active; skipping automatic reload.");
  } catch {
    window.location.reload();
    return true;
  }
  return false;
}

/**
 * Registers Vite's native preloadError listener on window.
 */
export function initVitePreloadErrorHandler(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    triggerSafeChunkReload();
  });
}
