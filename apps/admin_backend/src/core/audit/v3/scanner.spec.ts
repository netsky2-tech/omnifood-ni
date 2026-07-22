import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanNumberFreeJson } from './scanner';
import type { AuditV3Value } from './types';

type Json = Record<string, unknown>;
const ROOT = resolve(process.cwd(), '../../fixtures/audit/v3');
const MAX_RECIPE_BYTES = 1_048_577;
const object = (value: unknown): Json => value as Json;
const integer = (value: unknown): number => value as number;
const materialize = (input: unknown): Buffer => {
  const recipe = object(input);
  if (typeof recipe.hex === 'string') return Buffer.from(recipe.hex, 'hex');
  if (recipe.repeat) {
    const repeated = object(recipe.repeat);
    const count = integer(repeated.count); const byte = integer(repeated.byte);
    if (count > MAX_RECIPE_BYTES || byte > 255) throw new Error('repeat exceeds bounds');
    return Buffer.alloc(count, byte);
  }
  const key = ['nested_array', 'array_count', 'object_count', 'string_bytes'].find((candidate) => candidate in recipe)!;
  const count = integer(recipe[key]);
  if (count > MAX_RECIPE_BYTES) throw new Error('recipe exceeds bounds');
  const text = key === 'nested_array' ? '['.repeat(count) + 'null' + ']'.repeat(count)
    : key === 'array_count' ? '[' + Array(count).fill('null').join(',') + ']'
    : key === 'object_count' ? '{' + Array.from({ length: count }, (_, index) => `"k${String(index).padStart(5, '0')}":null`).join(',') + '}'
    : '"' + 'a'.repeat(count - 2) + '"';
  const bytes = Buffer.from(text);
  if (bytes.length > MAX_RECIPE_BYTES) throw new Error('materialization exceeds bounds');
  return bytes;
};
const load = (name: string): Json[] => readFileSync(resolve(ROOT, name), 'utf8').trim().split('\n').map((line) => object(JSON.parse(line) as unknown));
const containsNumber = (value: AuditV3Value): boolean => value.kind === 'array'
  ? value.values.some(containsNumber)
  : value.kind === 'object' ? value.entries.some((entry) => containsNumber(entry.value)) : false;

describe('scanNumberFreeJson', () => {
  it.each(load('rejections.jsonl'))('rejects $id at its exact phase and byte', (row) => {
    expect(scanNumberFreeJson(materialize(row.raw))).toEqual({ ok: false, error: { code: row.code, offset: row.offset } });
  });

  it.each(load('canonical-valid.jsonl'))('accepts $id with a number-free AST', (row) => {
    const result = scanNumberFreeJson(materialize(row.raw));
    expect(result.ok).toBe(true);
    if (result.ok) expect(containsNumber(result.value)).toBe(false);
  });

  it('preserves decoded object entry order and supplementary keys', () => {
    const ordered = scanNumberFreeJson(Buffer.from('{"b":"b","a":"a"}'));
    expect(ordered.ok && ordered.value.kind === 'object' && ordered.value.entries.map(({ key }) => key)).toEqual(['b', 'a']);
    const scalar = scanNumberFreeJson(Buffer.from('{"\\ue400":"b","𐀀":"a"}'));
    expect(scalar.ok && scalar.value.kind === 'object' && scalar.value.entries.map(({ key }) => key)).toEqual(['\ue400', '𐀀']);
  });

  it('applies phase precedence and never returns a partial AST', () => {
    expect(scanNumberFreeJson(Buffer.from('{"a":1,"\\u0061":2}'))).toEqual({ ok: false, error: { code: 'AUDIT_V3_DUPLICATE_KEY', offset: 7 } });
    expect(scanNumberFreeJson(Buffer.from('[1,2]'))).toEqual({ ok: false, error: { code: 'AUDIT_V3_NUMBER_FORBIDDEN', offset: 1 } });
  });

  it('rejects a large numeric array without spreading numeric offsets', () => {
    const raw = Buffer.from(`[${'0,'.repeat(199_999)}0]`);
    expect(() => scanNumberFreeJson(raw)).not.toThrow();
    expect(scanNumberFreeJson(raw)).toEqual({ ok: false, error: { code: 'AUDIT_V3_NUMBER_FORBIDDEN', offset: 1 } });
  });
});
