import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = Record<string, unknown>;
const ROOT = resolve(process.cwd(), '../../fixtures/audit/v3');
const MAX_BYTES = 1_048_577;
const hex = (bytes: Buffer) => bytes.toString('hex');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const object = (value: unknown, label: string): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Json;
};
const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`);
  return value as number;
};
const materialize = (value: unknown): Buffer => {
  const recipe = object(value, 'recipe');
  if (typeof recipe.hex === 'string' && /^(?:[0-9a-f]{2})*$/.test(recipe.hex)) return Buffer.from(recipe.hex, 'hex');
  if (recipe.repeat) {
    const repeat = object(recipe.repeat, 'repeat');
    const count = integer(repeat.count, 'repeat.count');
    const byte = integer(repeat.byte, 'repeat.byte');
    if (count > MAX_BYTES || byte > 255) throw new Error('repeat exceeds bounds');
    return Buffer.alloc(count, byte);
  }
  const key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].find((name) => name in recipe);
  if (!key) throw new Error('unknown recipe');
  const count = integer(recipe[key], key);
  if (count > MAX_BYTES) throw new Error(`${key} exceeds bounds`);
  const text = key === 'nested_array' ? '['.repeat(count) + 'null' + ']'.repeat(count)
    : key === 'array_count' ? '[' + Array(count).fill('null').join(',') + ']'
    : key === 'object_count' ? '{' + Array.from({ length: count }, (_, index) => `"k${String(index).padStart(5, '0')}":null`).join(',') + '}'
    : '"' + 'a'.repeat(count - 2) + '"';
  const bytes = Buffer.from(text);
  if (bytes.length > MAX_BYTES) throw new Error(`${key} materialization exceeds bounds`);
  return bytes;
};
const prove = (bytes: Buffer, value: unknown): void => {
  const proof = object(value, 'proof');
  if (typeof proof.exact_hex === 'string') return expect(hex(bytes)).toBe(proof.exact_hex);
  expect(bytes.length).toBe(integer(proof.length, 'proof.length'));
  expect(sha(bytes)).toBe(proof.sha256);
  expect(hex(bytes.subarray(0, 16))).toBe(proof.prefix_hex);
  expect(hex(bytes.subarray(-16))).toBe(proof.suffix_hex);
};
const load = (name: string): Json[] => readFileSync(resolve(ROOT, name), 'utf8').trim().split('\n').map((line) => object(JSON.parse(line) as unknown, name));

it('loads the compact final v3 fixture authority', () => {
  const schemaBytes = readFileSync(resolve(ROOT, 'schema.json'));
  expect(sha(schemaBytes)).toBe('74c3f4900d00fe3f0642a973beed5ac1235230552136b6095294467fc1ca3e84');
  const schema = object(JSON.parse(schemaBytes.toString('utf8')) as unknown, 'schema');
  expect(schema.version).toBe(1);
  const authority = object(schema['x-authority'], 'x-authority');
  expect(authority.commit).toBe('af5bd6e009b9f6be83a39a289cd539a2457abf7e');
  expect(authority.tree).toBe('db9c02ce16a29e2eb439d34190084b83d0a1b5a3');
  expect(object(authority.source, 'source').results).toBe('d2808ae2218d3c4090794fe67ec91883b16027c33ec6023a6f850ee66b6988ba');
  const names = ['canonical-valid.jsonl', 'rejections.jsonl', 'frames.jsonl'];
  const compact = object(authority.compact, 'compact');
  names.forEach((name, index) => expect(sha(readFileSync(resolve(ROOT, name)))).toBe(compact[['canonical', 'rejections', 'frames'][index]]));
  const shards = names.map((name) => load(name));
  expect(shards.map((rows) => rows.length)).toEqual([12, 28, 24]);
  const rows = shards.flat();
  expect(rows).toHaveLength(64);
  expect(rows.map((row) => row.id)).toEqual([...Array.from({ length: 12 }, (_, i) => `V${String(i + 1).padStart(3, '0')}`), ...Array.from({ length: 28 }, (_, i) => `R${String(i + 1).padStart(3, '0')}`), ...Array.from({ length: 24 }, (_, i) => `F${String(i + 1).padStart(3, '0')}`)]);
  for (const row of rows) {
    expect(row.id).toMatch(/^[VRF][0-9]{3}$/);
    if (row.raw) prove(materialize(row.raw), row.raw_proof);
    if (row.canonical_proof && object(row.canonical_proof, 'canonical_proof').length) expect(row.canonical_proof).toEqual(row.raw_proof);
    const fields = row.fields && object(row.fields, 'fields');
    const user = fields && fields.user_id;
    if (typeof user === 'object' && user !== null && '$repeat_text' in user) prove(Buffer.alloc(integer((user as Json).$repeat_text, '$repeat_text'), 97), object(row.field_proofs, 'field_proofs').user_id);
    if (row.metadata && object(row.metadata, 'metadata').repeat) prove(materialize(row.metadata), row.metadata_proof);
    if (typeof row.frame_hex === 'string') expect(sha(Buffer.from(row.frame_hex, 'hex'))).toBe(row.sha256);
  }
});
