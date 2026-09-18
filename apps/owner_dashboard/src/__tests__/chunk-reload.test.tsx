import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { isChunkLoadError, triggerSafeChunkReload, initVitePreloadErrorHandler } from "@/lib/chunk-reload";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { ErrorBoundary } from "@/app/error-boundary";
import { Suspense } from "react";

describe("Chunk reload resilience & stale module recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe("isChunkLoadError", () => {
    it("identifies dynamic import fetch failures correctly", () => {
      const err1 = new Error("Failed to fetch dynamically imported module: https://soho.nhilospos.com/assets/catalog-page-BG21gFqb.js");
      const err2 = new Error("Importing a module script failed");
      const err3 = new Error("error loading dynamically imported module");
      const err4 = new Error("Loading chunk 42 failed");
      const err5 = new Error("Standard runtime error");

      expect(isChunkLoadError(err1)).toBe(true);
      expect(isChunkLoadError(err2)).toBe(true);
      expect(isChunkLoadError(err3)).toBe(true);
      expect(isChunkLoadError(err4)).toBe(true);
      expect(isChunkLoadError(err5)).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
    });
  });

  describe("triggerSafeChunkReload", () => {
    it("triggers window.location.reload on first occurrence and sets session timestamp", () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });

      const reloaded = triggerSafeChunkReload();
      expect(reloaded).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem("nhilos_chunk_reload_timestamp")).toBeTruthy();
    });

    it("respects cooldown threshold to avoid infinite reload loop", () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });

      // First reload succeeds
      expect(triggerSafeChunkReload()).toBe(true);

      // Second reload within cooldown is suppressed
      expect(triggerSafeChunkReload()).toBe(false);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("initVitePreloadErrorHandler", () => {
    it("listens to vite:preloadError event and triggers reload", () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });

      initVitePreloadErrorHandler();

      const event = new Event("vite:preloadError", { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("lazyWithRetry", () => {
    it("resolves normally when factory succeeds immediately", async () => {
      const GoodComponent = () => <div>Componente Cargado Exitosamente</div>;
      const LazyComp = lazyWithRetry(async () => ({ default: GoodComponent }));

      render(
        <Suspense fallback={<div>Cargando...</div>}>
          <LazyComp />
        </Suspense>
      );

      expect(await screen.findByText("Componente Cargado Exitosamente")).toBeInTheDocument();
    });

    it("retries failed imports before resolving", async () => {
      let attempts = 0;
      const GoodComponent = () => <div>Recuperado tras reintento</div>;
      const LazyComp = lazyWithRetry(
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error("Temporary network glitch");
          }
          return { default: GoodComponent };
        },
        2,
        50,
      );

      render(
        <Suspense fallback={<div>Cargando...</div>}>
          <LazyComp />
        </Suspense>
      );

      expect(await screen.findByText("Recuperado tras reintento")).toBeInTheDocument();
      expect(attempts).toBe(2);
    });
  });

  describe("ErrorBoundary with chunk load error", () => {
    it("displays user-friendly update message and attempts safe reload", () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const FaultyChunkComponent = () => {
        throw new Error("Failed to fetch dynamically imported module: https://soho.nhilospos.com/assets/catalog-page-BG21gFqb.js");
      };

      render(
        <ErrorBoundary>
          <FaultyChunkComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText("Error al cargar esta sección")).toBeInTheDocument();
      expect(
        screen.getByText(/Se detectó una actualización en el sistema o una interrupción temporal de descarga/i)
      ).toBeInTheDocument();
      expect(reloadMock).toHaveBeenCalledTimes(1);

      consoleSpy.mockRestore();
    });
  });
});
