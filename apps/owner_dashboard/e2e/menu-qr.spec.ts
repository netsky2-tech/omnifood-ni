import { test, expect } from "@playwright/test";
import { performLogin } from "./helpers/mock-session";

/**
 * End-to-end coverage for the menu QR feature: an OWNER logs in through the
 * shared mock session helpers, reaches the page through the `Gestión` sidebar
 * entry, and generates + downloads a QR for a Google Drive-style menu URL.
 *
 * The scenario must never depend on a remote QR service: generation and
 * download are bundled in the app, so every request observed after the page
 * load must stay on the dashboard's own origin, and the preview must be a
 * CSP-safe `data:image/png` URL (never `blob:`).
 */

const DRIVE_MENU_URL =
  "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567/view?usp=sharing";

test.describe("NHILOS POS — Menu QR E2E", () => {
  test("owner navigates from the sidebar, generates a QR, and downloads the PNG offline", async ({
    page,
  }) => {
    await performLogin(page);

    const externalRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(page.url()).origin) {
        externalRequests.push(request.url());
      }
    });

    // Navigate through the sidebar instead of deep-linking so the nav entry
    // itself is verified. On mobile viewports the drawer must be opened first.
    const sidebarLink = page.getByRole("link", { name: "QR del menú" });
    const mobileTrigger = page.getByRole("button", { name: "Abrir menú" });
    await expect(sidebarLink.or(mobileTrigger).first()).toBeVisible({
      timeout: 10_000,
    });
    if (await mobileTrigger.isVisible()) {
      await mobileTrigger.click();
    }
    await sidebarLink.first().click();

    await page.waitForURL("**/menu-qr");
    await expect(
      page.getByRole("heading", { name: "QR del menú" }),
    ).toBeVisible();

    await page.fill('input[id="menu-qr-url"]', DRIVE_MENU_URL);
    await page.getByRole("button", { name: /Generar código QR/i }).click();

    // The preview is a data-url PNG whose accessible name carries the payload.
    const preview = page.getByRole("img", {
      name: `Código QR que abre ${DRIVE_MENU_URL}`,
    });
    await expect(preview).toBeVisible();
    const src = await preview.getAttribute("src");
    expect(src).toMatch(/^data:image\/png;base64,/);
    expect(src).not.toMatch(/^blob:/);

    // Download must be enabled after generation and produce a local PNG file
    // with the stable filename, without any network request.
    const downloadButton = page.getByRole("button", {
      name: /Descargar PNG/i,
    });
    await expect(downloadButton).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toBe("codigo-qr-menu.png");
    expect(await download.path()).toBeTruthy();

    // No external/remote QR service may have been contacted at any point.
    expect(externalRequests).toEqual([]);
  });
});
