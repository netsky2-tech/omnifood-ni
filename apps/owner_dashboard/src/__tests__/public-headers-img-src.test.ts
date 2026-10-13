/**
 * CSP `img-src` contract for the shipped Cloudflare Pages `_headers` file.
 *
 * The product image uploader (`features/catalog/product-image-field.tsx`)
 * decodes the picked file through an object URL: `URL.createObjectURL(file)`
 * assigned to `img.src`. Object URLs use the `blob:` scheme, so a CSP that
 * omits `blob:` from `img-src` makes the browser BLOCK the image load in
 * production — every upload fails with the opaque "No se pudo leer el
 * archivo de imagen" even though the file is a perfectly valid JPEG/PNG.
 *
 * Local development and jsdom never enforce this header (Vite dev server
 * does not ship `public/_headers`), which is why the defect was invisible
 * until a real deployed upload was attempted.
 *
 * `data:` must stay allowed: the compressed 300x300 WebP result is stored
 * and previewed as a data URL (thumbnails in the table and the POS cards).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HEADERS_PATH = resolve(import.meta.dirname, "../../public/_headers");

function readHeadersFile(): string {
  return readFileSync(HEADERS_PATH, "utf8");
}

function imgSrcDirective(headers: string): string {
  const cspLine = headers
    .split("\n")
    .find((line) => line.includes("Content-Security-Policy:"));
  expect(cspLine, "_headers must declare a Content-Security-Policy").toBeDefined();
  const directive = cspLine!
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("img-src "));
  expect(directive, "CSP must declare an img-src directive").toBeDefined();
  return directive!;
}

describe("public/_headers CSP img-src", () => {
  it("allows blob: so the upload compressor can decode object URLs", () => {
    const sources = imgSrcDirective(readHeadersFile()).split(/\s+/);
    expect(sources).toContain("blob:");
  });

  it("keeps data: so compressed data-URL previews and thumbnails render", () => {
    const sources = imgSrcDirective(readHeadersFile()).split(/\s+/);
    expect(sources).toContain("data:");
  });

  it("does not loosen img-src to wildcard or unsafe sources", () => {
    const directive = imgSrcDirective(readHeadersFile());
    expect(directive).not.toMatch(/\*/);
    expect(directive).not.toContain("unsafe-inline");
    expect(directive).not.toContain("http:");
    expect(directive).not.toContain("https:");
  });
});
