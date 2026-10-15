import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { inflateSync } from 'zlib';
import { DataSource, EntityManager } from 'typeorm';
import { TenantBrandAsset } from '../entities/tenant-brand-asset.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';

/**
 * Company identity parity P3, slice 1 (odd/tasks/identidad-empresa-paridad.md,
 * S5 / S5-bis) — the storage owner of the company logo's ORIGINAL bytes.
 *
 * The upload arrives as JSON with base64 (there is no multer and no
 * server-side staging in this repo) and is validated COMPLETELY before any
 * write: a rejected upload must leave the previous logo untouched, and the
 * only safe place to guarantee that is before the transaction that replaces
 * the row.
 *
 * PNG only, on purpose (S5: ONE original, every consumer must be able to use
 * it). The PDF embeds the original as-is and the terminal derives its 1-bit
 * Q80 raster from the PNG original with the code it already has — a JPEG
 * would be STORED and then silently unusable by the terminal. The allowlist
 * is therefore narrowed to what every consumer accepts.
 */

export const ACCEPTED_LOGO_CONTENT_TYPES = ['image/png'] as const;
export type LogoContentType = (typeof ACCEPTED_LOGO_CONTENT_TYPES)[number];

/**
 * Decoded-size ceiling. The PDF embeds the ORIGINAL bytes (pdfkit accepts a
 * Buffer), so an oversized upload would bloat every printed document; the
 * terminal's 1-bit raster is a derived artifact and never travels here.
 * 2 MiB decoded is generous for a print logo while keeping the PDF and the
 * snapshot reference cheap.
 */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** The validated, decoded upload — the only shape that ever reaches storage. */
export interface ValidatedLogoUpload {
  readonly contentType: LogoContentType;
  readonly bytes: Buffer;
  readonly sha256: string;
}

/**
 * The upload validation result. Shaped so consumers narrow by the TRUTHINESS
 * of `upload`: this repo's tsconfig runs `strictNullChecks: false`, under
 * which boolean-literal discriminants do not narrow the negative branch — a
 * `ok: true | ok: false` union would hand the consumer an un-narrowed type
 * exactly where the refusal must be read. `upload` is non-null exactly when
 * `ok` is true; `reason` is non-null exactly when it is false.
 */
export type LogoUploadValidation = {
  readonly ok: boolean;
  /** The decoded, validated upload — null on any rejection. */
  readonly upload: ValidatedLogoUpload | null;
  /** The declared, human-readable refusal — null on success. */
  readonly reason: string | null;
};

/**
 * S15's discipline applied to the logo read: a consumer is handed a shape
 * that DECLARES absence instead of a null/empty buffer it could print.
 */
export type TenantBrandLogo =
  | {
      readonly present: true;
      readonly bytes: Buffer;
      readonly contentType: LogoContentType;
      readonly sha256: string;
    }
  | { readonly present: false };

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** CRC-32 (ISO 3309, zlib's polynomial) — validates each PNG chunk. */
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

const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** Channels per pixel for each PNG color type (IHDR byte 9). */
const PNG_CHANNELS_BY_COLOR_TYPE: Record<number, number> = {
  0: 1, // grayscale
  2: 3, // truecolor
  3: 1, // indexed
  4: 2, // grayscale + alpha
  6: 4, // truecolor + alpha
};

/**
 * Full structural decode of a PNG: signature, every chunk's length/CRC in
 * bounds, exactly one IHDR, the IDAT stream actually inflating to the exact
 * filtered size IHDR declares. A buffer that passes this cannot be a
 * truncated, corrupt or mislabeled PNG. The JPEG marker walk was removed
 * with the JPEG allowlist: this PNG walk IS the structural validation the
 * upload gate depends on.
 */
const validatePngBytes = (b: Buffer): string | null => {
  if (
    b.length < PNG_SIGNATURE.length + 12 ||
    !b.subarray(0, 8).equals(PNG_SIGNATURE)
  ) {
    return 'not a PNG image (bad signature)';
  }
  let width = 0;
  let height = 0;
  let bitsPerPixel = 0;
  let seenIhdr = false;
  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset < b.length) {
    if (offset + 8 > b.length) return 'truncated PNG chunk header';
    const length = b.readUInt32BE(offset);
    const type = b.toString('latin1', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > b.length) return `truncated PNG chunk ${type}`;
    if (crc32(b.subarray(offset + 4, dataEnd)) !== b.readUInt32BE(dataEnd)) {
      return `corrupt PNG chunk ${type} (CRC mismatch)`;
    }
    const data = b.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (seenIhdr) return 'duplicate PNG IHDR';
      if (length !== 13) return 'invalid PNG IHDR length';
      seenIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const channels = PNG_CHANNELS_BY_COLOR_TYPE[data[9]];
      if (width === 0 || height === 0) return 'PNG with empty dimensions';
      if (!channels) return `unsupported PNG color type ${data[9]}`;
      bitsPerPixel = channels * bitDepth;
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      if (dataEnd + 4 !== b.length) return 'PNG data after IEND';
    }
    offset = dataEnd + 4;
  }
  if (!seenIhdr) return 'PNG without IHDR';
  if (idatChunks.length === 0) return 'PNG without image data';
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idatChunks));
  } catch {
    return 'corrupt PNG image data (does not inflate)';
  }
  const scanlineBytes = ((width * bitsPerPixel + 7) >> 3) + 1;
  if (raw.length !== scanlineBytes * height) {
    return 'PNG image data does not match its declared dimensions';
  }
  return null;
};

/**
 * THE upload validation, in one place: the PNG-only allowlist, a strictly
 * decodable base64 payload, the size ceiling, and a structural decode of the
 * image bytes themselves (magic bytes alone would admit a truncated file
 * that only dies later, mid-document). The returned reason is a declared,
 * human-readable refusal — never an exception mid-write, and never stack or
 * base64 internals — so a rejected upload cannot have touched the stored
 * logo and a person can act on the message.
 */
export const validateLogoUpload = (
  contentType: string | null | undefined,
  base64: string | null | undefined,
): LogoUploadValidation => {
  const acceptedType = ACCEPTED_LOGO_CONTENT_TYPES.find(
    (candidate) => candidate === contentType,
  );
  if (!acceptedType) {
    return {
      ok: false,
      upload: null,
      reason: `Unsupported content type '${contentType ?? ''}'. Only a PNG image is accepted: the terminal derives its print raster from the PNG original.`,
    };
  }
  if (typeof base64 !== 'string' || base64.trim() === '') {
    return {
      ok: false,
      upload: null,
      reason: 'The logo payload is empty',
    };
  }
  const normalized = base64.replace(/\s+/g, '');
  let bytes: Buffer;
  try {
    bytes = Buffer.from(normalized, 'base64');
  } catch {
    return {
      ok: false,
      upload: null,
      reason: 'The logo payload is not valid base64',
    };
  }
  // `Buffer.from(..., 'base64')` silently ignores invalid characters and
  // lengths; the round trip is what makes the decode STRICT.
  if (bytes.length === 0 || bytes.toString('base64') !== normalized) {
    return {
      ok: false,
      upload: null,
      reason: 'The logo payload is not valid base64',
    };
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    return {
      ok: false,
      upload: null,
      reason: `The logo exceeds the ${MAX_LOGO_BYTES}-byte limit (${bytes.length} bytes)`,
    };
  }
  const structuralReason = validatePngBytes(bytes);
  if (structuralReason) {
    return { ok: false, upload: null, reason: structuralReason };
  }
  return {
    ok: true,
    upload: {
      contentType: acceptedType,
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    reason: null,
  };
};

/**
 * Storage seam for the logo original. Reads and writes are transaction-bound
 * (`EntityManager`) so a document's identity/logo reads and its data reads
 * see the same snapshot, and an upload lands inside the caller's
 * tenant-bound transaction (RLS applies exactly as everywhere else).
 */
@Injectable()
export class TenantBrandAssetService {
  constructor(private readonly dataSource: DataSource) {}

  /** The declared-presence logo read (S15 seam). */
  async resolveWithinManager(
    manager: EntityManager,
    tenantId: string,
  ): Promise<TenantBrandLogo> {
    const trimmed = tenantId?.trim();
    if (!trimmed) return { present: false };
    const row = await manager.getRepository(TenantBrandAsset).findOne({
      where: { tenant_id: trimmed },
    });
    if (!row) return { present: false };
    return {
      present: true,
      bytes: row.bytes,
      contentType: row.content_type as LogoContentType,
      sha256: row.sha256,
    };
  }

  /** The sha256 reference the fiscal snapshot carries — never the bytes. */
  async resolveShaWithinManager(
    manager: EntityManager,
    tenantId: string,
  ): Promise<string | null> {
    const trimmed = tenantId?.trim();
    if (!trimmed) return null;
    const row = await manager.getRepository(TenantBrandAsset).findOne({
      where: { tenant_id: trimmed },
      select: ['sha256'],
    });
    return row?.sha256 ?? null;
  }

  /** Dashboard-facing read: the current logo as base64 JSON, or null. */
  async resolveWithBase64(tenantId: string): Promise<{
    sha256: string;
    contentType: string;
    byteLength: number;
    base64: string;
  } | null> {
    return runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const row = await manager.getRepository(TenantBrandAsset).findOne({
          where: { tenant_id: tenantId.trim() },
        });
        if (!row) return null;
        return {
          sha256: row.sha256,
          contentType: row.content_type,
          byteLength: row.byte_length,
          base64: row.bytes.toString('base64'),
        };
      },
    );
  }

  /**
   * Replaces the tenant's logo within the caller's transaction. One row per
   * tenant: the first upload inserts, every later upload updates the SAME
   * row in place. Callers validate FIRST (validateLogoUpload) — by the time
   * this runs the bytes are known-decodable.
   */
  async replaceWithinManager(
    manager: EntityManager,
    tenantId: string,
    upload: ValidatedLogoUpload,
  ): Promise<TenantBrandAsset> {
    const trimmed = tenantId.trim();
    const repo = manager.getRepository(TenantBrandAsset);
    const existing = await repo.findOne({ where: { tenant_id: trimmed } });
    if (existing) {
      existing.content_type = upload.contentType;
      existing.byte_length = upload.bytes.length;
      existing.sha256 = upload.sha256;
      existing.bytes = upload.bytes;
      return repo.save(existing);
    }
    return repo.save(
      repo.create({
        tenant_id: trimmed,
        content_type: upload.contentType,
        byte_length: upload.bytes.length,
        sha256: upload.sha256,
        bytes: upload.bytes,
      }),
    );
  }
}
