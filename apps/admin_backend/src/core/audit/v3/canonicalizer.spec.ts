import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalizeNumberFreeJson } from './canonicalizer';

type Json = Record<string, unknown>;
const ROOT = resolve(process.cwd(), '../../fixtures/audit/v3');
const object = (value: unknown): Json => value as Json;
const integer = (value: unknown): number => value as number;
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const load = (name: string): Json[] => readFileSync(resolve(ROOT, name), 'utf8').trim().split('\n').map((line) => object(JSON.parse(line) as unknown));
const materialize = (input: unknown): Buffer => {
  const recipe = object(input);
  if (typeof recipe.hex === 'string') return Buffer.from(recipe.hex, 'hex');
  if (recipe.repeat) {
    const repeated = object(recipe.repeat);
    return Buffer.alloc(integer(repeated.count), integer(repeated.byte));
  }
  const key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].find((candidate) => candidate in recipe)!;
  const count = integer(recipe[key]);
  return Buffer.from(key === 'nested_array' ? '['.repeat(count) + 'null' + ']'.repeat(count)
    : key === 'array_count' ? '[' + Array(count).fill('null').join(',') + ']'
    : key === 'object_count' ? '{' + Array.from({ length: count }, (_, index) => `"k${String(index).padStart(5, '0')}":null`).join(',') + '}'
    : '"' + 'a'.repeat(count - 2) + '"');
};
const expectProof = (bytes: Buffer, proofValue: unknown): void => {
  const proof = object(proofValue);
  if (typeof proof.exact_hex === 'string') expect(bytes.toString('hex')).toBe(proof.exact_hex);
  else {
    expect(bytes.length).toBe(proof.length);
    expect(sha(bytes)).toBe(proof.sha256);
    expect(bytes.subarray(0, 16).toString('hex')).toBe(proof.prefix_hex);
    expect(bytes.subarray(-16).toString('hex')).toBe(proof.suffix_hex);
  }
};
const success = (raw: string): Buffer => {
  const result = canonicalizeNumberFreeJson(Buffer.from(raw));
  expect(result.ok).toBe(true);
  if (result.ok === false) throw new Error(result.error.code);
  return result.value;
};

describe('canonicalizeNumberFreeJson', () => {
  it.each(load('canonical-valid.jsonl'))('emits canonical authority $id exactly', (row) => {
    const first = canonicalizeNumberFreeJson(materialize(row.raw));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expectProof(first.value, row.canonical_proof);
    expect(canonicalizeNumberFreeJson(materialize(row.raw))).toEqual(first);
  });

  it.each(load('rejections.jsonl'))('preserves scanner rejection $id', (row) => {
    expect(canonicalizeNumberFreeJson(materialize(row.raw))).toEqual({ ok: false, error: { code: row.code, offset: row.offset } });
  });

  it('sorts keys by unsigned UTF-16 units with shorter prefixes first', () => {
    expect(success('{"":"2","𐀀":"1","aa":"4","a":"3"}').toString()).toBe('{"a":"3","aa":"4","𐀀":"1","":"2"}');
  });

  it('uses exact escaping without normalization and preserves array order', () => {
    expect(success('["é","é","😀","\\u0000\\b\\f\\n\\r\\t\\"\\\\"]').toString())
      .toBe('["é","é","😀","\\u0000\\b\\f\\n\\r\\t\\"\\\\"]');
  });

  it('returns no partial output on failure', () => {
    const result = canonicalizeNumberFreeJson(Buffer.from('[true,1,false]'));
    expect(result).toEqual({ ok: false, error: { code: 'AUDIT_V3_NUMBER_FORBIDDEN', offset: 6 } });
    expect(result).not.toHaveProperty('value');
  });
});
