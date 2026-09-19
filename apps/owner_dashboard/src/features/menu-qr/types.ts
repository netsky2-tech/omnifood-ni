/**
 * Shared contract types for the owner dashboard local menu QR feature.
 *
 * The QR generation and download must work fully offline: a bundled encoder
 * produces a PNG data URL in the browser, with no remote QR service.
 */

/** Rejection reasons for a candidate menu URL. */
export type MenuUrlErrorCode =
  | "empty"
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials"
  | "oversized";

/** Discriminated result of validating a candidate menu URL. */
export type MenuUrlValidation =
  | { ok: true; url: string }
  | { ok: false; code: MenuUrlErrorCode; message: string };

/** Raster options for the generated QR image. */
export interface MenuQrEncodeOptions {
  /** Output pixels per QR module. Must be a positive integer. */
  scale?: number;
  /** Quiet zone in QR modules on every side. Must be a non-negative integer. */
  quietZoneModules?: number;
}

/** A generated, downloadable QR image. */
export interface MenuQrImage {
  /** PNG encoded as a `data:image/png;base64,...` URL (CSP-safe, no blob URL). */
  dataUrl: string;
  /** The canonical URL encoded into the QR payload. */
  payloadUrl: string;
  /** QR matrix size in modules (without the quiet zone). */
  moduleCount: number;
  /** Final image size in pixels, including the quiet zone. */
  pixelSize: number;
}
