import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuQrPage } from "./menu-qr-page";
import { MENU_QR_DOWNLOAD_FILENAME, MENU_QR_STORAGE_KEY } from "./use-menu-qr";

const validUrl = "https://example.com/menu";

describe("MenuQrPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Spanish heading and a labeled URL input", () => {
    render(<MenuQrPage />);

    expect(screen.getByRole("heading", { level: 1, name: "QR del menú" })).toBeInTheDocument();
    expect(screen.getByLabelText("URL del menú")).toBeInTheDocument();
  });

  it("shows the mapped inline validation error and generates nothing for an empty URL", async () => {
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá la URL del menú.");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("rejects an unsupported scheme with the mapped Spanish message", async () => {
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.type(screen.getByLabelText("URL del menú"), "ftp://example.com/menu");
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Solo se admiten enlaces http: o https:.",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("generates a preview for a valid URL with a descriptive alt text and enables download", async () => {
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.type(screen.getByLabelText("URL del menú"), `  ${validUrl}  `);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));

    const preview = screen.getByRole("img", {
      name: `Código QR que abre ${validUrl}`,
    });
    expect(preview).toHaveAttribute("src", expect.stringMatching(/^data:image\/png;base64,/));

    const downloadButton = screen.getByRole("button", { name: /Descargar PNG/i });
    expect(downloadButton).toBeEnabled();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Código QR generado correctamente.",
    );
  });

  it("disables the download action until a QR exists", () => {
    render(<MenuQrPage />);

    expect(screen.getByRole("button", { name: /Descargar PNG/i })).toBeDisabled();
  });

  it("downloads the preview as a PNG with a stable filename", async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.type(screen.getByLabelText("URL del menú"), validUrl);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));
    await user.click(screen.getByRole("button", { name: /Descargar PNG/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe(MENU_QR_DOWNLOAD_FILENAME);
    expect(anchor.href).toMatch(/^data:image\/png;base64,/);
  });

  it("clears the preview, status, and download after the URL is edited post-generation", async () => {
    const user = userEvent.setup();
    render(<MenuQrPage />);

    await user.type(screen.getByLabelText("URL del menú"), validUrl);
    await user.click(screen.getByRole("button", { name: /Generar código QR/i }));
    expect(screen.getByRole("img", { name: new RegExp(validUrl) })).toBeInTheDocument();

    await user.type(screen.getByLabelText("URL del menú"), "/otra");

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: /Descargar PNG/i })).toBeDisabled();
  });

  it("restores the last generated URL from localStorage into the input", () => {
    window.localStorage.setItem(MENU_QR_STORAGE_KEY, validUrl);

    render(<MenuQrPage />);

    expect(screen.getByLabelText("URL del menú")).toHaveValue(validUrl);
  });
});
