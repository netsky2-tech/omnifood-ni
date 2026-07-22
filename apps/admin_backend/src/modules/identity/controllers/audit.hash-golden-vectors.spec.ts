import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface HashResult {
  canonical_metadata?: string;
  metadata_segment?: string;
  payload_utf8_hex: string;
  sha256: string;
}

interface VectorInput {
  id: string;
  metadata_input: string | null;
  metadata_raw?: string;
  user_id?: string;
  action?: string;
  tipo_accion?: string;
  timestamp?: string;
  metodo_autorizacion?: string | null;
  usuario_autorizador_id?: string | null;
}

interface AuthorityVector {
  input: VectorInput;
  node_canonical: HashResult;
  node_legacy: HashResult;
}

interface CommonInput {
  user_id: string;
  action: string;
  device_id: string;
  timestamp: string;
  sequence_no: number;
  prev_hash: string;
  metodo_autorizacion: string | null;
  usuario_autorizador_id: string | null;
}

interface Fixture {
  schema_version: number;
  authority: {
    commit: string;
    tree: string;
    sources: Record<string, string>;
  };
  runtime: { dart: string; node: string };
  comparison: {
    total: number;
    parity: number;
    mismatches: string[];
    exit_code: number;
  };
  common: CommonInput;
  vectors: AuthorityVector[];
}

type MaterializedInput = CommonInput &
  VectorInput & { metadata: Record<string, unknown> };

const fixturePath = resolve(
  __dirname,
  '../../../../test/fixtures/identity/logout_audit_backend_golden_vectors.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;
const HASH_MODE = { CANONICAL: 'canonical', LEGACY: 'legacy' } as const;
type HashMode = (typeof HASH_MODE)[keyof typeof HASH_MODE];
const VECTOR_IDS = [
  'baseline-ascii',
  'null-metadata',
  'trim-empty-metadata',
  'malformed-metadata',
  'json-scalar-wrapper',
  'json-array-wrapper',
  'object-order-ab',
  'object-order-ba',
  'unicode-nonascii-surrogate-pair',
  'literal-pipes',
  'null-authorization',
  'empty-authorization',
  'timestamp-string-dto-edge',
  'numeric-metadata',
] as const;

const materialize = (
  common: CommonInput,
  input: VectorInput,
): MaterializedInput => {
  let metadata: Record<string, unknown>;
  if (input.metadata_input === null || input.metadata_input.trim() === '') {
    metadata = {};
  } else {
    try {
      const decoded = JSON.parse(input.metadata_input) as unknown;
      metadata =
        decoded !== null && !Array.isArray(decoded) && typeof decoded === 'object'
          ? (decoded as Record<string, unknown>)
          : { value: decoded };
    } catch {
      metadata = { raw_text: input.metadata_input };
    }
  }
  return { ...common, ...input, metadata };
};

const calculate = (
  vector: MaterializedInput,
  mode: HashMode,
): HashResult => {
  const action = vector.action ?? vector.tipo_accion;
  const metadataRaw =
    vector.metadata_raw ??
    (typeof vector.metadata.raw_text === 'string'
      ? vector.metadata.raw_text
      : null);
  const metadataSegment =
    mode === HASH_MODE.CANONICAL
      ? JSON.stringify(vector.metadata ?? {})
      : metadataRaw === null
        ? 'null'
        : metadataRaw;
  const payload = `${vector.user_id}|${action}|${vector.device_id}|${vector.timestamp}|${vector.sequence_no}|${vector.prev_hash}|${vector.metodo_autorizacion || 'null'}|${vector.usuario_autorizador_id || 'null'}|${metadataSegment}`;
  return {
    canonical_metadata:
      mode === HASH_MODE.CANONICAL ? metadataSegment : undefined,
    metadata_segment: mode === HASH_MODE.LEGACY ? metadataSegment : undefined,
    payload_utf8_hex: Buffer.from(payload, 'utf8').toString('hex'),
    sha256: createHash('sha256').update(payload).digest('hex'),
  };
};

const mismatchMessage = (
  id: string,
  mode: string,
  expected: HashResult,
  actual: HashResult,
): string => {
  const expectedBytes = Buffer.from(expected.payload_utf8_hex, 'hex');
  const actualBytes = Buffer.from(actual.payload_utf8_hex, 'hex');
  const length = Math.max(expectedBytes.length, actualBytes.length);
  let offset = 0;
  while (offset < length && expectedBytes[offset] === actualBytes[offset]) offset++;
  return `${id} ${mode}: first differing byte offset=${offset}; expected bytes=${expected.payload_utf8_hex}; actual bytes=${actual.payload_utf8_hex}; expected digest=${expected.sha256}; actual digest=${actual.sha256}`;
};

describe('backend logout audit golden vectors', () => {
  it('locks authority identity, source checksums, runtime, and vector order', () => {
    expect(fixture.schema_version).toBe(1);
    expect(fixture.authority).toEqual({
      commit: '624bde818594ad3636db60ef7b73233227accb22',
      tree: '752b9732fe10396f5ea64c7875ea5e07ede85f93',
      sources: {
        'fixture-manifest.json':
          '46b742f59739e23a0305722eb0d3296f143ac45b3465b7456bd46139206ac5bc',
        'vector-results.json':
          '17ad2d11ac5c53aea343bb4e0d8daa3cc27f6f0f14ff88493cd202cf0223fb3d',
      },
    });
    expect(fixture.runtime).toEqual({
      dart:
        '3.11.5 (stable) (Wed Apr 15 00:36:32 2026 -0700) on "windows_x64"',
      node: 'v24.0.2',
    });
    expect(fixture.comparison).toEqual({
      total: 14,
      parity: 12,
      mismatches: ['empty-authorization', 'numeric-metadata'],
      exit_code: 0,
    });
    expect(fixture.vectors.map(({ input }) => input.id)).toEqual(VECTOR_IDS);
  });

  it('matches every canonical and legacy authority payload and digest', () => {
    for (const authority of fixture.vectors) {
      const vector = materialize(fixture.common, authority.input);
      for (const mode of Object.values(HASH_MODE)) {
        const expected =
          mode === HASH_MODE.CANONICAL
            ? authority.node_canonical
            : authority.node_legacy;
        const actual = calculate(vector, mode);
        if (
          actual.payload_utf8_hex !== expected.payload_utf8_hex ||
          actual.sha256 !== expected.sha256 ||
          actual.canonical_metadata !== expected.canonical_metadata ||
          actual.metadata_segment !== expected.metadata_segment
        ) {
          throw new Error(
            mismatchMessage(authority.input.id, mode, expected, actual),
          );
        }
      }
    }
  });

  it('uses tipo_accion only when action is nullish', () => {
    const vector = materialize(fixture.common, {
      id: 'action-fallback',
      action: undefined,
      tipo_accion: 'LEGACY_LOGOUT',
      metadata_input: '{}',
    });
    const payload = Buffer.from(
      calculate(vector, HASH_MODE.CANONICAL).payload_utf8_hex,
      'hex',
    ).toString('utf8');
    expect(payload.split('|')[1]).toBe('LEGACY_LOGOUT');
  });

  it('selects metadata_raw, raw_text, then literal null for legacy', () => {
    const legacySegment = (input: VectorInput): string | undefined =>
      calculate(materialize(fixture.common, input), HASH_MODE.LEGACY)
        .metadata_segment;
    expect(
      legacySegment({
        id: 'metadata-raw',
        metadata_input: '{broken',
        metadata_raw: 'preserved-raw',
      }),
    ).toBe('preserved-raw');
    expect(
      legacySegment({ id: 'raw-text', metadata_input: '{broken' }),
    ).toBe('{broken');
    expect(legacySegment({ id: 'literal-null', metadata_input: '{}' })).toBe(
      'null',
    );
  });
});
