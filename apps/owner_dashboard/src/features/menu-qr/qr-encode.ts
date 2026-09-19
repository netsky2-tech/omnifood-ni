import { encode } from "uqr";
import type {
  MenuQrEncodeOptions,
  MenuQrImage,
  MenuUrlValidation,
} from "./types";
import type { MenuUrlErrorCode } from "./types";

/**
 * Maximum accepted menu URL payload size in UTF-8 bytes.
 *
 * uqr measures capacity in UTF-8 bytes, and Version 40 / ECC "Q" allows up to
 * 1663 bytes. A 1024-byte bound keeps every accepted payload encodable with
 * headroom while staying printable and scannable on a typical Food Park sign.
 * Checking bytes (not UTF-16 code units) is what makes the bound honest for
 * multibyte URLs.
 */
export const MAX_MENU_URL_PAYLOAD_BYTES = 1024;

/** Default output pixels per QR module (8 px keeps printed signs crisp). */
export const DEFAULT_QR_SCALE = 8;

/** Default quiet zone in modules (spec recommendation is 4). */
export const DEFAULT_QR_QUIET_ZONE_MODULES = 4;

/**
 * Error correction level for printed QR codes: "Q" recovers up to 25% damage,
 * which suits laminated, high-rotation retail signage.
 */
export const MENU_QR_ECC = "Q" as const;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Typed error thrown when the encoder receives an invalid menu URL. */
export class MenuQrValidationError extends Error {
  readonly code: MenuUrlErrorCode;

  constructor(code: MenuUrlErrorCode, message: string) {
    super(message);
    this.name = "MenuQrValidationError";
    this.code = code;
  }
}

const VALIDATION_MESSAGES: Record<MenuUrlErrorCode, string> = {
  empty: "Enter a menu URL.",
  invalid_url: "Enter a complete URL, including the domain.",
  unsupported_scheme: "Only http: and https: URLs are supported.",
  credentials: "Remove the embedded user or password from the URL.",
  oversized: "The URL is too long to encode in a scannable QR code.",
};

/**
 * Validate a trimmed candidate menu URL for QR generation.
 *
 * Rejects empty values, embedded credentials, unsupported schemes, and
 * payloads beyond the UTF-8 byte bound. The returned URL is the canonical
 * parsed URL (`URL.href`): the scheme is lowercased and embedded control
 * whitespace is removed or percent-encoded, so the QR payload never contains
 * raw tabs, newlines, or spaces and always matches the documented normalized
 * payload behavior. Ordering is parse first, then byte bound: an unparseable
 * value reports `invalid_url`, not `oversized`.
 */
export function validateMenuUrl(input: string): MenuUrlValidation {
  const url = input.trim();

  if (url.length === 0) {
    return { ok: false, code: "empty", message: VALIDATION_MESSAGES.empty };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, code: "invalid_url", message: VALIDATION_MESSAGES.invalid_url };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      ok: false,
      code: "unsupported_scheme",
      message: VALIDATION_MESSAGES.unsupported_scheme,
    };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, code: "credentials", message: VALIDATION_MESSAGES.credentials };
  }

  // The QR payload is the canonical URL, so the encoder-compatible UTF-8 byte
  // bound applies to parsed.href, not to the raw input.
  const payload = parsed.href;
  if (new TextEncoder().encode(payload).length > MAX_MENU_URL_PAYLOAD_BYTES) {
    return { ok: false, code: "oversized", message: VALIDATION_MESSAGES.oversized };
  }

  return { ok: true, url: payload };
}

/**
 * Generate a QR code for a menu URL as a PNG data URL, fully offline.
 *
 * The encoder is bundled (uqr) and the PNG rasterization is pure TypeScript,
 * so no canvas, remote API, CDN, or blob URL is involved.
 */
export function generateMenuQrDataUrl(
  input: string,
  options: MenuQrEncodeOptions = {},
): MenuQrImage {
  const validation = validateMenuUrl(input);
  if (!validation.ok) {
    throw new MenuQrValidationError(validation.code, validation.message);
  }
  return encodeMenuQrDataUrl(validation.url, options);
}

function encodeMenuQrDataUrl(
  payloadUrl: string,
  options: MenuQrEncodeOptions,
): MenuQrImage {
  const scale = options.scale ?? DEFAULT_QR_SCALE;
  const quietZoneModules = options.quietZoneModules ?? DEFAULT_QR_QUIET_ZONE_MODULES;
  assertPositiveInteger("scale", scale);
  assertNonNegativeInteger("quietZoneModules", quietZoneModules);

  // border: 0 keeps the matrix raw; the quiet zone is added by the rasterizer.
  // Defensive typed boundary: the validation byte bound keeps every accepted
  // payload inside uqr's Version 40 / ECC "Q" capacity, so any residual
  // encoder failure surfaces as a typed validation error, never as an untyped
  // RangeError leaking from the bundled encoder.
  let qr: ReturnType<typeof encode>;
  try {
    qr = encode(payloadUrl, { ecc: MENU_QR_ECC, border: 0 });
  } catch {
    throw new MenuQrValidationError("oversized", VALIDATION_MESSAGES.oversized);
  }
  const matrix = qr.data;
  const moduleCount = matrix.length;
  const pixelSize = (moduleCount + 2 * quietZoneModules) * scale;

  const pngBytes = renderPngGrayscale(matrix, scale, quietZoneModules);
  return {
    dataUrl: `data:image/png;base64,${toBase64(pngBytes)}`,
    payloadUrl,
    moduleCount,
    pixelSize,
  };
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer, received ${value}`);
  }
}

function assertNonNegativeInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer, received ${value}`);
  }
}

/**
 * Rasterize a QR matrix into a minimal 8-bit grayscale PNG:
 * signature + IHDR + IDAT (stored deflate) + IEND. Stored (uncompressed)
 * deflate keeps the encoder dependency-free while remaining a valid zlib
 * stream that every browser and OS image decoder accepts.
 */
function renderPngGrayscale(
  matrix: readonly (readonly boolean[])[],
  scale: number,
  quietZoneModules: number,
): Uint8Array {
  const moduleCount = matrix.length;
  const imageSize = (moduleCount + 2 * quietZoneModules) * scale;

  // Raw scanlines: one filter byte (0 = None) per row plus grayscale pixels.
  const raw = new Uint8Array(imageSize * (1 + imageSize));
  let offset = 0;
  for (let py = 0; py < imageSize; py += 1) {
    raw[offset] = 0; // filter type None
    offset += 1;
    const moduleY = Math.floor(py / scale) - quietZoneModules;
    const insideY = moduleY >= 0 && moduleY < moduleCount;
    for (let px = 0; px < imageSize; px += 1) {
      const moduleX = Math.floor(px / scale) - quietZoneModules;
      const isDark =
        insideY &&
        moduleX >= 0 &&
        moduleX < moduleCount &&
        matrix[moduleY]![moduleX] === true;
      raw[offset] = isDark ? 0 : 255;
      offset += 1;
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, imageSize);
  ihdrView.setUint32(4, imageSize);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  // compression (0), filter (0), interlace (0) are already zero-initialized.

  return concatPngChunks([
    { type: "IHDR", data: ihdr },
    { type: "IDAT", data: zlibStoredDeflate(raw) },
    { type: "IEND", data: new Uint8Array(0) },
  ]);
}

/** Minimal zlib stream made of stored (uncompressed) deflate blocks. */
function zlibStoredDeflate(data: Uint8Array): Uint8Array {
  const maxBlockSize = 65535;
  const blockCount = Math.max(1, Math.ceil(data.length / maxBlockSize));
  const out = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  let outOffset = 0;

  out[outOffset] = 0x78; // CMF: deflate, 32K window
  out[outOffset + 1] = 0x01; // FLG: fastest, valid header check
  outOffset += 2;

  let dataOffset = 0;
  do {
    const length = Math.min(maxBlockSize, data.length - dataOffset);
    const isFinalBlock = dataOffset + length >= data.length;
    out[outOffset] = isFinalBlock ? 1 : 0;
    out[outOffset + 1] = length & 0xff;
    out[outOffset + 2] = (length >>> 8) & 0xff;
    out[outOffset + 3] = ~length & 0xff;
    out[outOffset + 4] = (~length >>> 8) & 0xff;
    outOffset += 5;
    out.set(data.subarray(dataOffset, dataOffset + length), outOffset);
    outOffset += length;
    dataOffset += length;
  } while (dataOffset < data.length);

  const adlerView = new DataView(out.buffer, out.byteOffset + outOffset, 4);
  adlerView.setUint32(0, adler32(data));
  outOffset += 4;

  return out.subarray(0, outOffset);
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatPngChunks(
  chunks: ReadonlyArray<{ type: string; data: Uint8Array }>,
): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const totalLength =
    signature.length +
    chunks.reduce((sum, chunk) => sum + 12 + chunk.data.length, 0);
  const out = new Uint8Array(totalLength);
  out.set(signature, 0);

  let offset = signature.length;
  for (const chunk of chunks) {
    const typeBytes = new Uint8Array(4);
    for (let i = 0; i < 4; i += 1) {
      typeBytes[i] = chunk.type.charCodeAt(i);
    }
    const crcInput = new Uint8Array(4 + chunk.data.length);
    crcInput.set(typeBytes, 0);
    crcInput.set(chunk.data, 4);

    const view = new DataView(out.buffer, out.byteOffset + offset, 8 + chunk.data.length);
    view.setUint32(0, chunk.data.length);
    out.set(typeBytes, offset + 4);
    out.set(chunk.data, offset + 8);
    new DataView(out.buffer, out.byteOffset + offset + 8 + chunk.data.length, 4).setUint32(
      0,
      crc32(crcInput),
    );
    offset += 12 + chunk.data.length;
  }

  return out;
}

/** Browser-safe base64 (no Buffer dependency in the production bundle). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
