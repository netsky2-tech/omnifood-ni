import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalizeNumberFreeJson } from './canonicalizer';
import { buildAuditV3Frame, type AuditV3FrameFields, type FieldState } from './frame';
import { sha256LowerHex } from './sha256';

type Json = Record<string, unknown>;
export interface RuntimeRow { readonly id: string; readonly output: string }
export interface Receipt {
  readonly schema: 1;
  readonly authority: Readonly<Record<string, string>>;
  readonly implementations: Readonly<Record<string, string>>;
  readonly groups: { readonly canonical: number; readonly rejections: number; readonly frames: number };
  readonly total: number;
  readonly aggregate: string;
}

const FILES = ['canonical-valid.jsonl', 'rejections.jsonl', 'frames.jsonl'] as const;
const AUTHORITY = {
  'canonical-valid.jsonl': 'f0e32ecd332c36e49061383c8e424d00ecbbdd58c2d18d258f2063679abc7fac',
  'rejections.jsonl': 'c84c85146e03029a405aa7aa1dadd0a6d7211c05e4446a0a918a32e7a497e5d1',
  'frames.jsonl': '94e71dd3237d28f23fc1978cc55ab3a9d86101d321e8d494a515987c0a569372',
} as const;
const object = (value: unknown): Json => value as Json;
const integer = (value: unknown): number => value as number;
const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const rows = (path: string): Json[] => readFileSync(path, 'utf8').trim().split('\n').map((line) => object(JSON.parse(line) as unknown));
const bytes = (recipeValue: unknown): Buffer => {
  const recipe = object(recipeValue);
  if (typeof recipe.hex === 'string') return Buffer.from(recipe.hex, 'hex');
  if (recipe.repeat) { const value = object(recipe.repeat); return Buffer.alloc(integer(value.count), integer(value.byte)); }
  const key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].find((candidate) => candidate in recipe)!;
  const count = integer(recipe[key]);
  return Buffer.from(key === 'nested_array' ? '['.repeat(count) + 'null' + ']'.repeat(count)
    : key === 'array_count' ? '[' + Array(count).fill('null').join(',') + ']'
    : key === 'object_count' ? '{' + Array.from({ length: count }, (_, index) => `"k${String(index).padStart(5, '0')}":null`).join(',') + '}'
    : '"' + 'a'.repeat(count - 2) + '"');
};
const text = (value: unknown): string => typeof value === 'object' && value !== null ? 'a'.repeat(integer(object(value).$repeat_text)) : value as string;
const frame = (row: Json): ReturnType<typeof buildAuditV3Frame> => {
  const source = object(row.fields);
  const value = (key: string, fallback: string): string => key in source ? text(source[key]) : fallback;
  const fields: AuditV3FrameFields = {
    user_id: value('user_id', 'u'), resolved_action: value('resolved_action', 'LOGOUT'),
    device_id: value('device_id', 'd'), timestamp: value('timestamp', '2026-07-21T00:00:00Z'),
    sequence_no: value('sequence_no', '0'), prev_hash: value('prev_hash', 'h'),
    metodo_autorizacion: 'metodo_autorizacion' in source ? object(source.metodo_autorizacion) as FieldState : { state: 'absent' },
    usuario_autorizador_id: 'usuario_autorizador_id' in source ? object(source.usuario_autorizador_id) as FieldState : { state: 'absent' },
  };
  return buildAuditV3Frame(fields, row.metadata === null ? null as unknown as Buffer : bytes(row.metadata));
};
const output = (id: string, result: ReturnType<typeof canonicalizeNumberFreeJson>): RuntimeRow => {
  if (result.ok) return { id, output: `bytes:${result.value.toString('base64')}` };
  const failure = result as Extract<typeof result, { ok: false }>;
  return { id, output: `error:${failure.error.code}@${failure.error.offset}` };
};

export function runConformance(root: string, receiptPath: string, tamper?: (rows: RuntimeRow[]) => RuntimeRow[]): Receipt {
  const fixtureRoot = resolve(root, 'fixtures/audit/v3');
  const authority = Object.fromEntries(FILES.map((name) => {
    const digest = hash(readFileSync(resolve(fixtureRoot, name), 'utf8').replace(/\r\n/g, '\n'));
    if (digest !== AUTHORITY[name]) throw new Error(`${name}: fixture authority checksum mismatch`);
    return [name, digest];
  }));
  const groups = FILES.map((name) => rows(resolve(fixtureRoot, name)));
  if (groups[0].length !== 12 || groups[1].length !== 28 || groups[2].length !== 24) throw new Error('fixture groups must be 12/28/24');
  const nodeRows = [
    ...groups[0].map((row) => output(row.id as string, canonicalizeNumberFreeJson(bytes(row.raw)))),
    ...groups[1].map((row) => output(row.id as string, canonicalizeNumberFreeJson(bytes(row.raw)))),
    ...groups[2].map((row) => {
      const result = frame(row);
      if (result.ok) return { id: row.id as string, output: `bytes:${result.value.toString('base64')};sha256:${sha256LowerHex(result.value)}` };
      const failure = result as Extract<typeof result, { ok: false }>;
      return { id: row.id as string, output: `error:${failure.error.code}@${failure.error.offset}` };
    }),
  ];
  const dart = spawnSync('dart', ['--packages=.dart_tool/package_config.json', 'test/core/audit/v3/conformance_runner.dart', root], {
    cwd: resolve(root, 'apps/pos_app'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (dart.status !== 0) throw new Error(`dart runtime failed (${dart.status}): ${dart.stderr.trim()}`);
  const dartRows = tamper ? tamper(JSON.parse(dart.stdout) as RuntimeRow[]) : JSON.parse(dart.stdout) as RuntimeRow[];
  nodeRows.forEach((row, index) => {
    if (JSON.stringify(row) !== JSON.stringify(dartRows[index])) throw new Error(`${row.id}: node/dart mismatch`);
  });
  const paths = ['apps/admin_backend/src/core/audit/v3/canonicalizer.ts', 'apps/admin_backend/src/core/audit/v3/frame.ts', 'apps/admin_backend/src/core/audit/v3/sha256.ts', 'apps/pos_app/lib/core/audit/v3/canonicalizer.dart', 'apps/pos_app/lib/core/audit/v3/frame.dart', 'apps/pos_app/lib/core/audit/v3/sha256.dart'];
  const implementations = Object.fromEntries(paths.map((name) => [name, hash(readFileSync(resolve(root, name)))]));
  const receipt: Receipt = { schema: 1, authority, implementations, groups: { canonical: 12, rejections: 28, frames: 24 }, total: 64, aggregate: hash(JSON.stringify(nodeRows)) };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
