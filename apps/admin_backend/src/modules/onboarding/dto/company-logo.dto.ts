import { IsIn, IsString, Length } from 'class-validator';

/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5) — the logo upload arrives as JSON with base64, like the rest of this
 * API: there is no multer and no server-side staging in this repo.
 *
 * The DTO only carries the envelope; the AUTHORITATIVE validation lives in
 * TenantBrandAssetService.validateLogoUpload (content-type allowlist, strict
 * base64 decode, size ceiling, structural image decode). A rejected upload
 * leaves the previous logo untouched.
 */
export class UploadCompanyLogoDto {
  @IsIn(['image/png'], {
    message: 'content_type must be image/png',
  })
  content_type!: string;

  /**
   * Base64 of the ORIGINAL image bytes (never the terminal's 1-bit raster —
   * that is a derived artifact the POS generates locally). Length-bounded so
   * a grossly oversized body is refused by the pipe before decoding:
   * 3,000,000 chars covers the 2 MiB decoded ceiling plus base64 inflation.
   */
  @IsString()
  @Length(8, 3_000_000, { message: 'data must be a non-empty base64 payload' })
  data!: string;
}
