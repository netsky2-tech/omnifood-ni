import { crc32, inflateSync } from "node:zlib";
import { encode as encodeQr } from "uqr";
import { describe, expect, it } from "vitest";
import {
  generateMenuQrDataUrl,
  MAX_MENU_URL_PAYLOAD_BYTES,
  MenuQrValidationError,
  validateMenuUrl,
} from "@/features/menu-qr/qr-encode";

const SAMPLE_URL = "https://example.com/menu";

interface PngChunk {
  type: string;
  data: Uint8Array;
  crc: number;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function parseChunks(bytes: Uint8Array): PngChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    expect(bytes[i]).toBe(signature[i]);
  }
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    const data = bytes.slice(offset + 8, offset + 8 + length);
    const crc = view.getUint32(offset + 8 + length);
    chunks.push({ type, data, crc });
    offset += 12 + length;
  }
  return chunks;
}

function expectedChunkCrc(chunkData: PngChunk): number {
  const crcInput = Buffer.concat([
    Buffer.from(chunkData.type, "ascii"),
    Buffer.from(chunkData.data),
  ]);
  return crc32(crcInput);
}

function readIhdr(chunks: PngChunk[]): { width: number; height: number } {
  const ihdr = chunks.find((c) => c.type === "IHDR");
  expect(ihdr).toBeDefined();
  const view = new DataView(ihdr!.data.buffer, ihdr!.data.byteOffset, ihdr!.data.byteLength);
  expect(ihdr!.data).toHaveLength(13);
  expect(ihdr!.data[8]).toBe(8); // bit depth
  expect(ihdr!.data[9]).toBe(0); // color type: grayscale
  expect(ihdr!.data[10]).toBe(0); // deflate
  expect(ihdr!.data[11]).toBe(0); // adaptive filtering
  expect(ihdr!.data[12]).toBe(0); // no interlace
  return { width: view.getUint32(0), height: view.getUint32(4) };
}

describe("generateMenuQrDataUrl", () => {
  it("produces a deterministic PNG data URL", () => {
    const first = generateMenuQrDataUrl(SAMPLE_URL);
    const second = generateMenuQrDataUrl(SAMPLE_URL);
    expect(first.dataUrl).toBe(second.dataUrl);
    expect(first.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(first.payloadUrl).toBe(SAMPLE_URL);
  });

  it("encodes the canonical URL payload, not the raw input", () => {
    const result = generateMenuQrDataUrl("  HTTPS://Example.com/menú  ");
    expect(result.payloadUrl).toBe("https://example.com/men%C3%BA");
    expect(result.payloadUrl).not.toMatch(/[\t\n\r ]/);
  });

  it("encodes an ASCII URL at exactly the UTF-8 byte bound", () => {
    const url = `https://example.com/menu?d=${"a".repeat(MAX_MENU_URL_PAYLOAD_BYTES - "https://example.com/menu?d=".length)}`;
    const result = generateMenuQrDataUrl(url);
    expect(result.payloadUrl).toBe(url);
    expect(result.moduleCount).toBeGreaterThan(0);
  });

  it("renders grayscale pixels sized from the QR matrix, quiet zone, and scale", () => {
    const scale = 8;
    const quietZoneModules = 4;
    const result = generateMenuQrDataUrl(SAMPLE_URL);
    const bytes = decodeDataUrl(result.dataUrl);
    const chunks = parseChunks(bytes);
    const { width, height } = readIhdr(chunks);

    const moduleCount = encodeQr(SAMPLE_URL, { ecc: "Q", border: 0 }).size;
    const expected = (moduleCount + 2 * quietZoneModules) * scale;
    expect(result.moduleCount).toBe(moduleCount);
    expect(result.pixelSize).toBe(expected);
    expect(width).toBe(expected);
    expect(height).toBe(expected);
  });

  it("emits a decodable PNG whose IDAT inflates to one filtered grayscale row per pixel row", () => {
    const result = generateMenuQrDataUrl(SAMPLE_URL);
    const bytes = decodeDataUrl(result.dataUrl);
    const chunks = parseChunks(bytes);

    const types = chunks.map((c) => c.type);
    expect(types).toEqual(["IHDR", "IDAT", "IEND"]);
    for (const c of chunks) {
      expect(c.crc).toBe(expectedChunkCrc(c));
    }

    const { width, height } = readIhdr(chunks);
    const idat = chunks.find((c) => c.type === "IDAT")!;
    const raw = inflateSync(Buffer.from(idat.data));
    expect(raw).toHaveLength(height * (1 + width));

    // Every scanline uses filter type 0 (None).
    for (let row = 0; row < height; row += 1) {
      expect(raw[row * (1 + width)]).toBe(0);
    }

    // Quiet zone corners are white; the QR center is black.
    expect(raw[1]).toBe(255);
    const centerRow = Math.floor(height / 2) * (1 + width);
    expect(raw[centerRow + 1 + Math.floor(width / 2)]).toBeLessThan(128);
  });

  it("respects custom scale and quiet zone options", () => {
    const result = generateMenuQrDataUrl(SAMPLE_URL, { scale: 4, quietZoneModules: 2 });
    const moduleCount = encodeQr(SAMPLE_URL, { ecc: "Q", border: 0 }).size;
    expect(result.pixelSize).toBe((moduleCount + 4) * 4);
  });

  it("supports the minimal raster (scale 1, no quiet zone) without artifacts", () => {
    const result = generateMenuQrDataUrl(SAMPLE_URL, { scale: 1, quietZoneModules: 0 });
    const moduleCount = encodeQr(SAMPLE_URL, { ecc: "Q", border: 0 }).size;
    expect(result.pixelSize).toBe(moduleCount);
    const bytes = decodeDataUrl(result.dataUrl);
    const { width, height } = readIhdr(parseChunks(bytes));
    expect(width).toBe(moduleCount);
    expect(height).toBe(moduleCount);
  });

  it("rejects invalid input with a typed error instead of generating anything", () => {
    for (const [input, code] of [
      ["   ", "empty"],
      ["ftp://example.com/menu", "unsupported_scheme"],
      ["https://user:pass@example.com/menu", "credentials"],
      [`https://example.com/?d=${"a".repeat(1100)}`, "oversized"],
    ] as const) {
      expect(() => generateMenuQrDataUrl(input)).toThrow(MenuQrValidationError);
      try {
        generateMenuQrDataUrl(input);
      } catch (error) {
        expect(error).toBeInstanceOf(MenuQrValidationError);
        expect((error as MenuQrValidationError).code).toBe(code);
      }
    }
  });

  it("surfaces residual encoder capacity failures as typed validation errors, never untyped RangeError", () => {
    const url = `https://example.com/menú?d=${"ñ".repeat(600)}`;
    const validation = validateMenuUrl(url);
    expect(validation).toMatchObject({ ok: false, code: "oversized" });

    let thrown: unknown;
    try {
      generateMenuQrDataUrl(url);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MenuQrValidationError);
    expect((thrown as MenuQrValidationError).code).toBe("oversized");
  });

  it("validates through the shared contract", () => {
    expect(validateMenuUrl(SAMPLE_URL)).toEqual({ ok: true, url: SAMPLE_URL });
  });

  it("keeps a long Google Drive style URL within the printable QR capacity", () => {
    // A long Google Drive style URL must still encode at ECC Q.
    const longUrl = `https://drive.google.com/file/d/1AbC_dE1234567890QwErTyUiOpAsDfGhJkLzXcVbNm/view?usp=sharing&resourcekey=${"k".repeat(600)}`;
    const validation = validateMenuUrl(longUrl);
    expect(validation).toEqual({ ok: true, url: longUrl });
    const result = generateMenuQrDataUrl(longUrl);
    const bytes = decodeDataUrl(result.dataUrl);
    expect(bytes.length).toBeGreaterThan(0);
  });
});