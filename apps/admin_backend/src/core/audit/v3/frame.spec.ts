import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAuditV3Frame, type AuditV3FrameFields, type FieldState } from './frame';
import { sha256LowerHex } from './sha256';

interface Row { id: string; fields: Record<string, object | string | null | boolean>; metadata: { hex?: string; repeat?: { byte: number; count: number } } | null; canonical_metadata_hex?: string; frame_hex?: string; sha256?: string; frame_proof?: Proof; expected_error?: { code: string; offset: number } }
interface Proof { length: number; sha256: string; prefix_hex: string; suffix_hex: string }
const rows = readFileSync(resolve(process.cwd(), '../../fixtures/audit/v3/frames.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Row);
const absent = (): FieldState => ({ state: 'absent' });
const base = (): AuditV3FrameFields => ({ user_id: 'u', resolved_action: 'LOGOUT', device_id: 'd', timestamp: '2026-07-21T00:00:00Z', sequence_no: '0', prev_hash: 'h', metodo_autorizacion: absent(), usuario_autorizador_id: absent() });
const state = (value: object | string | null | boolean | undefined): FieldState => {
  if (typeof value !== 'object' || value === null) return value as FieldState;
  const candidate = value as { state?: string; value?: string | null };
  return candidate.state === 'text' ? { state: 'text', value: candidate.value as string } : { state: candidate.state } as FieldState;
};
const text = (value: object | string | null | boolean | undefined): string | null | object | boolean | undefined => {
  if (typeof value === 'object' && value !== null && '$repeat_text' in value) return 'a'.repeat((value as { $repeat_text: number }).$repeat_text);
  return value;
};
const materialize = (row: Row): { fields: AuditV3FrameFields; metadata: Buffer } => {
  const source = row.fields; const fields = { ...base() } as unknown as Record<string, object | string | null | boolean>;
  for (const [key, value] of Object.entries(source)) if (key !== '$base') fields[key] = text(value) as object | string | null | boolean;
  fields.metodo_autorizacion = state(fields.metodo_autorizacion); fields.usuario_autorizador_id = state(fields.usuario_autorizador_id);
  const metadata = row.metadata?.repeat ? Buffer.alloc(row.metadata.repeat.count, row.metadata.repeat.byte) : Buffer.from(row.metadata?.hex ?? '', 'hex');
  return { fields: fields as unknown as AuditV3FrameFields, metadata };
};

describe('OFA3 typed frame', () => {
  it.each(rows)('matches compact fixture $id', (row) => {
    const input = materialize(row); const result = buildAuditV3Frame(input.fields, row.metadata === null ? null as unknown as Buffer : input.metadata);
    if (row.expected_error) { expect(result).toEqual({ ok: false, error: row.expected_error }); return }
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(sha256LowerHex(result.value)).toBe(row.sha256);
    if (row.frame_hex) expect(result.value.toString('hex')).toBe(row.frame_hex);
    if (row.frame_proof) { expect(result.value.length).toBe(row.frame_proof.length); expect(result.value.subarray(0, 16).toString('hex')).toBe(row.frame_proof.prefix_hex); expect(result.value.subarray(-16).toString('hex')).toBe(row.frame_proof.suffix_hex) }
  });

  it('encodes tags, big-endian lengths, raw UTF-8, and deterministic SHA', () => {
    const fields: AuditV3FrameFields = { ...base(), metodo_autorizacion: { state: 'null' }, usuario_autorizador_id: { state: 'text', value: '' } };
    const first = buildAuditV3Frame(fields, Buffer.from('{}')); const second = buildAuditV3Frame(fields, Buffer.from('{}'));
    expect(first).toEqual(second); expect(first.ok).toBe(true); if (!first.ok) return;
    expect(first.value.subarray(0, 10).toString('hex')).toBe('4f464133010000000175');
    expect(first.value.includes(Buffer.from('03000000000100000000', 'hex'))).toBe(true);
    expect(first.value.subarray(-7).toString('hex')).toBe('02000000027b7d');
    expect(sha256LowerHex(first.value)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([[0, { user_id: null }], [1, { resolved_action: '' }], [2, { device_id: null }], [3, { timestamp: '' }], [4, { sequence_no: '00' }], [5, { prev_hash: null }], [6, { metodo_autorizacion: { state: 'bad' } }], [7, { usuario_autorizador_id: { state: 'text', value: '\ud800' } }]])('rejects malformed field %i without partial output', (offset, patch) => {
    const result = buildAuditV3Frame({ ...base(), ...patch } as unknown as AuditV3FrameFields, Buffer.from('{}'));
    expect(result).toEqual({ ok: false, error: { code: 'AUDIT_V3_FRAME_INVALID', offset } }); expect('value' in result).toBe(false);
  });

  it.each(['0', '4294967295'])('accepts sequence boundary %s', (sequence_no) => expect(buildAuditV3Frame({ ...base(), sequence_no }, Buffer.from('{}')).ok).toBe(true));
  it.each(['-1', '01', '4294967296'])('rejects sequence %s', (sequence_no) => expect(buildAuditV3Frame({ ...base(), sequence_no }, Buffer.from('{}')).ok).toBe(false));
  it('distinguishes absent, null, and empty optional text', () => {
    const frames = [absent(), { state: 'null' }, { state: 'text', value: '' }].map((metodo_autorizacion) => buildAuditV3Frame({ ...base(), metodo_autorizacion } as AuditV3FrameFields, Buffer.from('{}')));
    expect(frames.every((result) => result.ok)).toBe(true); expect(new Set(frames.map((result) => result.ok && result.value.toString('hex'))).size).toBe(3);
  });
});
