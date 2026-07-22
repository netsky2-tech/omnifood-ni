import { AUDIT_V3_ERROR_CODE as CODE, type AuditV3ErrorCode, type Result } from './types';

const MAX = 1_048_576;
const FIELD_STATE = { ABSENT: 'absent', NULL: 'null', TEXT: 'text' } as const;
export type FieldState =
  | { readonly state: typeof FIELD_STATE.ABSENT }
  | { readonly state: typeof FIELD_STATE.NULL }
  | { readonly state: typeof FIELD_STATE.TEXT; readonly value: string };
export interface AuditV3FrameFields {
  readonly user_id: string;
  readonly resolved_action: string;
  readonly device_id: string;
  readonly timestamp: string;
  readonly sequence_no: string;
  readonly prev_hash: string;
  readonly metodo_autorizacion: FieldState;
  readonly usuario_autorizador_id: FieldState;
}

class Failure extends Error {
  constructor(readonly code: AuditV3ErrorCode, readonly offset: number) { super(code) }
}
const fail = (code: AuditV3ErrorCode, offset: number): never => { throw new Failure(code, offset) };
const scalar = (value: string): boolean => !/[\ud800-\udfff]/.test(value);

export function buildAuditV3Frame(fields: AuditV3FrameFields, canonicalMetadata: Buffer): Result<Buffer> {
  try {
    const parts: Buffer[] = [Buffer.from('OFA3', 'ascii')];
    const required = [fields.user_id, fields.resolved_action, fields.device_id, fields.timestamp, fields.sequence_no, fields.prev_hash];
    const add = (tag: number, bytes: Buffer, index: number): void => {
      if (bytes.length > MAX) fail(CODE.FRAME_TOO_LARGE, index);
      const header = Buffer.alloc(5); header[0] = tag; header.writeUInt32BE(bytes.length, 1); parts.push(header, bytes);
    };
    required.forEach((value, index) => {
      if (typeof value !== 'string' || !scalar(value)) fail(CODE.FRAME_INVALID, index);
      if ((index === 1 || index === 3) && value.length === 0) fail(CODE.FRAME_INVALID, index);
      if (index === 4 && (!/^(?:0|[1-9][0-9]*)$/.test(value) || BigInt(value) > 4_294_967_295n)) fail(CODE.FRAME_INVALID, index);
      add(0x01, Buffer.from(value, 'utf8'), index);
    });
    [fields.metodo_autorizacion, fields.usuario_autorizador_id].forEach((field, offset) => {
      const index = offset + 6;
      if (!field || typeof field !== 'object') fail(CODE.FRAME_INVALID, index);
      if (field.state === FIELD_STATE.ABSENT) add(0x00, Buffer.alloc(0), index);
      else if (field.state === FIELD_STATE.NULL) add(0x03, Buffer.alloc(0), index);
      else if (field.state === FIELD_STATE.TEXT && typeof field.value === 'string' && scalar(field.value)) add(0x01, Buffer.from(field.value, 'utf8'), index);
      else fail(CODE.FRAME_INVALID, index);
    });
    if (!Buffer.isBuffer(canonicalMetadata)) fail(CODE.FRAME_INVALID, 8);
    add(0x02, canonicalMetadata, 8);
    const frame = Buffer.concat(parts);
    if (frame.length > MAX) fail(CODE.FRAME_TOO_LARGE, 9);
    return { ok: true, value: frame };
  } catch (error: unknown) {
    if (error instanceof Failure) return { ok: false, error: { code: error.code, offset: error.offset } };
    throw error;
  }
}
