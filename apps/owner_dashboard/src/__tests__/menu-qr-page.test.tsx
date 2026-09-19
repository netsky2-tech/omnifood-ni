import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuQrPage } from "@/features/menu-qr/menu-qr-page";
import { MENU_QR_STORAGE_KEY } from "@/features/menu-qr/use-menu-qr";

/**
 * Page-level verification for the offline/CSP contract of the menu QR feature:
 * generation and download must never touch the network, and the preview must
 * stay a `data:` PNG URL (never a `blob:` URL, which the dashboard CSP blocks).
 */
const validUrl = "https://example.com/menu";

describe("MenuQrPage offline and CSP contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, "fetch").mockImplementation(() => {
      throw new Error("network access is forbidden in this flow");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates and downloads a QR without any network request", async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.type(screen.getByLabelText("URL del menú"), validUrl);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));
    await user.click(screen.getByRole("button", { name: /Descargar PNG/i }));

    expect(window.fetch).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toMatch(/^data:image\/png;base64,/);
    expect(anchor.href).not.toMatch(/^blob:/);
  });

  it("uses a data-url PNG preview, never a blob URL", async () => {
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.type(screen.getByLabelText("URL del menú"), validUrl);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));

    const preview = screen.getByRole("img", { name: new RegExp(validUrl) });
    expect(preview.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(preview.getAttribute("src")).not.toMatch(/^blob:/);
  });

  it("stays usable when localStorage access throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(<MenuQrPage />);

    expect(screen.getByLabelText("URL del menú")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Generar código QR/i })).toBeEnabled();
  });

  it("announces the success status through a live region after generation", async () => {
    const user = userEvent.setup();
    render(<MenuQrPage />);

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.type(screen.getByLabelText("URL del menú"), validUrl);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Código QR generado correctamente.",
    );
    expect(window.fetch).not.toHaveBeenCalled();
  });

  it("restores the persisted URL and regenerates the preview across mounts", async () => {
    const user = userEvent.setup();
    const first = render(<MenuQrPage />);
    await user.type(screen.getByLabelText("URL del menú"), validUrl);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));
    expect(window.localStorage.getItem(MENU_QR_STORAGE_KEY)).toBe(validUrl);
    first.unmount();

    render(<MenuQrPage />);

    // Restoration only prefills the input; the preview must come from an
    // explicit regeneration, which stays network-free.
    expect(screen.getByLabelText("URL del menú")).toHaveValue(validUrl);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));

    expect(
      screen.getByRole("img", { name: `Código QR que abre ${validUrl}` }),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));
    expect(window.fetch).not.toHaveBeenCalled();
  });
});
