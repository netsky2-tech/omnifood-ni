import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runConformance } from './conformance';

const ROOT = resolve(process.cwd(), '../..');
const receipt = resolve(ROOT, 'fixtures/audit/v3/conformance-receipt.json');

describe('audit v3 cross-runtime conformance', () => {
  it('proves all authority groups and writes a deterministic receipt', () => {
    const first = runConformance(ROOT, receipt);
    const bytes = readFileSync(receipt);
    const second = runConformance(ROOT, receipt);

    expect(second).toEqual(first);
    expect(readFileSync(receipt)).toEqual(bytes);
    expect(first.groups).toEqual({ canonical: 12, rejections: 28, frames: 24 });
    expect(first.total).toBe(64);
    expect(first.aggregate).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  it('fails closed with a row diagnostic when runtime output is tampered', () => {
    expect(() => runConformance(ROOT, receipt, (rows) => {
      rows[0] = { ...rows[0], output: '00' };
      return rows;
    })).toThrow('V001: node/dart mismatch');
  }, 120_000);
});
