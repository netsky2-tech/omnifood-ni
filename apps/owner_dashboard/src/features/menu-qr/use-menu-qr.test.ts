import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MENU_QR_DOWNLOAD_FILENAME,
  MENU_QR_STORAGE_KEY,
  useMenuQr,
} from "./use-menu-qr";
import { generateMenuQrDataUrl } from "./qr-encode";
import type * as qrEncode from "./qr-encode";

const actualQrEncode = await vi.importActual<typeof qrEncode>("./qr-encode");

vi.mock("./qr-encode", async (importOriginal) => ({
  ...(await importOriginal<typeof qrEncode>()),
  generateMenuQrDataUrl: vi.fn(),
}));

const validUrl = "https://example.com/menu";
const canonicalUrl = "https://example.com/menu";

describe("useMenuQr", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(generateMenuQrDataUrl).mockImplementation(
      actualQrEncode.generateMenuQrDataUrl,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with an empty URL and no generated image", () => {
    const { result } = renderHook(() => useMenuQr());

    expect(result.current.url).toBe("");
    expect(result.current.qrImage).toBeNull();
    expect(result.current.validationError).toBeNull();
    expect(result.current.actionError).toBeNull();
    expect(result.current.statusMessage).toBeNull();
  });

  it("restores the last successfully generated canonical URL from localStorage", () => {
    window.localStorage.setItem(MENU_QR_STORAGE_KEY, canonicalUrl);

    const { result } = renderHook(() => useMenuQr());

    expect(result.current.url).toBe(canonicalUrl);
  });

  it("ignores an invalid stored URL instead of restoring it", () => {
    window.localStorage.setItem(MENU_QR_STORAGE_KEY, "javascript:alert(1)");

    const { result } = renderHook(() => useMenuQr());

    expect(result.current.url).toBe("");
  });

  it("tolerates a broken localStorage read on mount", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    const { result } = renderHook(() => useMenuQr());

    expect(result.current.url).toBe("");
  });

  it("generates a PNG data-url QR for a valid URL and persists the canonical URL", () => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(`  ${validUrl}  `);
    });
    act(() => {
      result.current.generate();
    });

    expect(result.current.qrImage).not.toBeNull();
    expect(result.current.qrImage?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.current.qrImage?.payloadUrl).toBe(canonicalUrl);
    expect(result.current.validationError).toBeNull();
    expect(result.current.actionError).toBeNull();
    expect(result.current.statusMessage).toBe("Código QR generado correctamente.");
    expect(window.localStorage.getItem(MENU_QR_STORAGE_KEY)).toBe(canonicalUrl);
  });

  it("persists only after a successful generation", () => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(validUrl);
    });
    // Do not generate yet.
    expect(window.localStorage.getItem(MENU_QR_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["empty", "", "Ingresá la URL del menú."],
    ["invalid_url", "not a url", "Ingresá una URL completa, incluido el dominio."],
    ["unsupported_scheme", "ftp://example.com/menu", "Solo se admiten enlaces http: o https:."],
    [
      "credentials",
      "https://user:pass@example.com/menu",
      "El enlace no puede incluir usuario ni contraseña.",
    ],
    [
      "oversized",
      `https://example.com/menu?q=${"a".repeat(1100)}`,
      "La URL es demasiado larga para un código QR escaneable.",
    ],
  ])("maps the %s error code to an inline Spanish message and generates nothing", (_code, input, expectedMessage) => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(input);
    });
    act(() => {
      result.current.generate();
    });

    expect(result.current.validationError).toBe(expectedMessage);
    expect(result.current.qrImage).toBeNull();
    expect(window.localStorage.getItem(MENU_QR_STORAGE_KEY)).toBeNull();
  });

  it("handles an encoder failure with a graceful Spanish error and no image", () => {
    vi.mocked(generateMenuQrDataUrl).mockImplementation(() => {
      throw new Error("encoder exploded");
    });

    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(validUrl);
    });
    act(() => {
      result.current.generate();
    });

    expect(result.current.qrImage).toBeNull();
    expect(result.current.actionError).toBe(
      "No se pudo generar el código QR. Intentá nuevamente.",
    );
    expect(result.current.validationError).toBeNull();
    expect(window.localStorage.getItem(MENU_QR_STORAGE_KEY)).toBeNull();
  });

  it("tolerates a localStorage write failure and still reports success", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(validUrl);
    });
    act(() => {
      result.current.generate();
    });

    expect(result.current.qrImage).not.toBeNull();
    expect(result.current.statusMessage).toBe("Código QR generado correctamente.");
    expect(result.current.actionError).toBeNull();
  });

  it("clears a previous validation error when a valid generation succeeds", () => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.generate(); // empty URL -> validation error
    });
    expect(result.current.validationError).not.toBeNull();

    act(() => {
      result.current.setUrl(validUrl);
    });
    act(() => {
      result.current.generate();
    });

    expect(result.current.validationError).toBeNull();
    expect(result.current.qrImage).not.toBeNull();
  });

  it("clears the generated state when the URL is edited after generation", () => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(validUrl);
    });
    act(() => {
      result.current.generate();
    });
    expect(result.current.qrImage).not.toBeNull();
    expect(result.current.statusMessage).not.toBeNull();

    const downloadSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    act(() => {
      result.current.setUrl("https://example.com/other-menu");
    });

    expect(result.current.qrImage).toBeNull();
    expect(result.current.statusMessage).toBeNull();
    act(() => {
      result.current.download();
    });
    expect(downloadSpy).not.toHaveBeenCalled();

    // The workflow recovers: generating again restores a fresh preview.
    act(() => {
      result.current.generate();
    });
    expect(result.current.qrImage?.payloadUrl).toBe("https://example.com/other-menu");
  });

  it("keeps restored persisted input behavior intact while invalidating on edit", () => {
    window.localStorage.setItem(MENU_QR_STORAGE_KEY, canonicalUrl);

    const { result } = renderHook(() => useMenuQr());
    expect(result.current.url).toBe(canonicalUrl);

    act(() => {
      result.current.generate();
    });
    expect(result.current.qrImage).not.toBeNull();
    expect(window.localStorage.getItem(MENU_QR_STORAGE_KEY)).toBe(canonicalUrl);
  });

  it("reports a graceful Spanish error when the download itself fails", () => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(validUrl);
    });
    act(() => {
      result.current.generate();
    });
    expect(result.current.qrImage).not.toBeNull();

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("download blocked");
    });
    act(() => {
      result.current.download();
    });

    expect(result.current.actionError).toBe(
      "No se pudo descargar el archivo. Intentá nuevamente.",
    );
    expect(result.current.statusMessage).toBeNull();
  });

  it("clears a prior action error when a later generation succeeds", () => {
    const { result } = renderHook(() => useMenuQr());

    act(() => {
      result.current.setUrl(validUrl);
    });
    vi.mocked(generateMenuQrDataUrl).mockImplementation(() => {
      throw new Error("encoder exploded");
    });
    act(() => {
      result.current.generate();
    });
    expect(result.current.actionError).not.toBeNull();

    vi.mocked(generateMenuQrDataUrl).mockImplementation(
      actualQrEncode.generateMenuQrDataUrl,
    );
    act(() => {
      result.current.generate();
    });

    expect(result.current.actionError).toBeNull();
    expect(result.current.qrImage).not.toBeNull();
    expect(result.current.statusMessage).toBe("Código QR generado correctamente.");
  });

  describe("download", () => {
    function clickSpy() {
      return vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
    }

    it("downloads the generated PNG data URL with a stable filename", () => {
      const spy = clickSpy();
      const { result } = renderHook(() => useMenuQr());

      act(() => {
        result.current.setUrl(validUrl);
      });
      act(() => {
        result.current.generate();
      });
      act(() => {
        result.current.download();
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const anchor = spy.mock.instances[0] as HTMLAnchorElement;
      expect(anchor.download).toBe(MENU_QR_DOWNLOAD_FILENAME);
      expect(anchor.href).toMatch(/^data:image\/png;base64,/);
    });

    it("does not trigger any download without a generated image", () => {
      const spy = clickSpy();
      const { result } = renderHook(() => useMenuQr());

      act(() => {
        result.current.download();
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
