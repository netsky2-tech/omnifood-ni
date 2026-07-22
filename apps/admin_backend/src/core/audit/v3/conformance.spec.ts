import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { hashSource, runConformance, type RuntimeRunner } from './conformance';

const ROOT = resolve(process.cwd(), '../..');
const receipt = resolve(ROOT, 'fixtures/audit/v3/conformance-receipt.json');
const injectedReceipt = resolve(tmpdir(), `audit-v3-conformance-${process.pid}.json`);
const injected: RuntimeRunner = (_root, expected) => ({
  status: 0, stdout: JSON.stringify(expected), stderr: '',
});

describe('audit v3 cross-runtime conformance', () => {
  afterAll(() => rmSync(injectedReceipt, { force: true }));

  it('hashes equivalent LF and CRLF implementation source identically', () => {
    expect(hashSource(Buffer.from('const a = 1;\nconst b = 2;\n')))
      .toBe(hashSource(Buffer.from('const a = 1;\r\nconst b = 2;\r\n')));
  });

  (process.env.AUDIT_V3_REAL_RUNTIME === '1' ? it : it.skip)('matches the real Dart runtime', () => {
    expect(runConformance(ROOT, receipt).total).toBe(64);
  }, 120_000);

  it('proves all authority groups and writes a deterministic receipt', () => {
    const trackedBytes = readFileSync(receipt);
    const first = runConformance(ROOT, injectedReceipt, injected);
    const bytes = readFileSync(injectedReceipt);
    const second = runConformance(ROOT, injectedReceipt, injected);

    expect(second).toEqual(first);
    expect(readFileSync(injectedReceipt)).toEqual(bytes);
    expect(readFileSync(receipt)).toEqual(trackedBytes);
    expect(first.groups).toEqual({ canonical: 12, rejections: 28, frames: 24 });
    expect(first.total).toBe(64);
    expect(first.aggregate).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(first.implementations)).toContain('apps/pos_app/test/core/audit/v3/conformance_runner.dart');
  }, 120_000);

  it('fails closed with a row diagnostic when runtime output is tampered', () => {
    expect(() => runConformance(ROOT, receipt, (_root, expected) => {
      const rows = expected.map((row) => ({ ...row }));
      rows[0].output = '00';
      return { status: 0, stdout: JSON.stringify(rows), stderr: '' };
    })).toThrow('V001: node/dart mismatch');
  }, 120_000);

  it.each([
    ['63 rows', (_root: string, expected: readonly unknown[]) => JSON.stringify(expected.slice(1))],
    ['65 rows', (_root: string, expected: readonly unknown[]) => JSON.stringify([...expected, expected[0]])],
  ])('rejects Dart output with %s', (_label, value) => {
    const runner: RuntimeRunner = (root, expected) => ({
      status: 0,
      stdout: typeof value === 'string' ? value : value(root, expected),
      stderr: '',
    });
    expect(() => runConformance(ROOT, receipt, runner)).toThrow('dart runtime must return exactly 64 rows');
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['malformed', '{'],
    ['non-array', '{}'],
  ])('rejects %s successful Dart stdout with bounded stderr', (_label, stdout) => {
    const stderr = `useful context ${'x'.repeat(600)} hidden tail`;
    expect(() => runConformance(ROOT, injectedReceipt, () => ({ status: 0, stdout, stderr })))
      .toThrow(/^dart runtime produced invalid JSON: .*stderr: useful context x{10}/);
    expect(() => runConformance(ROOT, injectedReceipt, () => ({ status: 0, stdout, stderr })))
      .not.toThrow('hidden tail');
  });

  it('preserves the original Dart launch diagnostic', () => {
    const runner: RuntimeRunner = () => ({ status: null, stdout: null, stderr: null, error: new Error('spawn dart ENOENT') });
    expect(() => runConformance(ROOT, receipt, runner)).toThrow('dart runtime launch failed: spawn dart ENOENT');
  });

  it.each([
    ['launch failed: spawn dart ENOENT', { status: null, stdout: null, error: new Error('spawn dart ENOENT') }],
    ['launch failed: no exit status', { status: null, stdout: null }],
    ['failed (7)', { status: 7, stdout: null }],
  ])('bounds Dart %s stderr diagnostics', (primary, result) => {
    const stderr = `useful context ${'x'.repeat(600)} hidden tail`;
    const invoke = () => runConformance(ROOT, injectedReceipt, () => ({ ...result, stderr }));
    expect(invoke).toThrow(`dart runtime ${primary}`);
    expect(invoke).toThrow(/stderr: useful context x{10}/);
    expect(invoke).not.toThrow('hidden tail');
  });

  it('reports a deterministic Dart timeout diagnostic', () => {
    const error = Object.assign(new Error('spawnSync dart ETIMEDOUT'), { code: 'ETIMEDOUT' });
    expect(() => runConformance(ROOT, receipt, () => ({ status: null, stdout: null, stderr: null, error }))).toThrow('dart runtime timed out after 90000ms');
  });
});
