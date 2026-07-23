import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { buildAuditV3Frame } from '../../../core/audit/v3/frame';
import { canonicalizeNumberFreeJson } from '../../../core/audit/v3/canonicalizer';
import { sha256LowerHex } from '../../../core/audit/v3/sha256';
import { AuditHashVersionInvalidException } from '../exceptions/audit-hash-version-invalid.exception';
import { AuditMetricsService } from './audit-metrics.service';
import { AuditVerificationService } from './audit-verification.service';
import { CreateAuditLogDto } from '../dto/identity.dto';

const baseLog = (): CreateAuditLogDto =>
  Object.assign(new CreateAuditLogDto(), {
    id: 'audit-id',
    action: 'DRAWER_OPEN',
    timestamp: '2026-07-22T00:00:00.000Z',
    device_id: 'device-1',
    sequence_no: 1,
    prev_hash: 'GENESIS',
    metadata: {},
  });

const legacyHash = (log: CreateAuditLogDto): string =>
  createHash('sha256')
    .update(
      `requester|${log.action}|${log.device_id}|${log.timestamp}|${log.sequence_no}|${log.prev_hash}|null|null|{}`,
    )
    .digest('hex');

describe('AuditVerificationService', () => {
  let metrics: AuditMetricsService;
  let service: AuditVerificationService;

  beforeEach(() => {
    metrics = new AuditMetricsService();
    service = new AuditVerificationService(metrics);
  });

  it('rejects an explicit invalid version without falling back to legacy', () => {
    const log = baseLog();
    log.hash_version = null;
    log.entry_hash = legacyHash(log);

    expect(() => service.verifyBatch([log], 'requester')).toThrow(
      AuditHashVersionInvalidException,
    );
  });

  it.each(['', ' ', 'unknown', 1, { version: 'v3-jcs-rfc8785' }])(
    'rejects explicit invalid version state %p',
    (hashVersion) => {
      const log = baseLog();
      log.hash_version = hashVersion;
      log.entry_hash = legacyHash(log);

      expect(() => service.verifyBatch([log], 'requester')).toThrow(
        AuditHashVersionInvalidException,
      );
    },
  );

  it('preserves canonical-first then legacy fallback only for absence', () => {
    const log = baseLog();
    log.metadata = { raw_text: 'legacy-metadata' };
    log.metadata_raw = 'legacy-metadata';
    log.entry_hash = createHash('sha256')
      .update(
        'requester|DRAWER_OPEN|device-1|2026-07-22T00:00:00.000Z|1|GENESIS|null|null|legacy-metadata',
      )
      .digest('hex');

    expect(() => service.verifyBatch([log], 'requester')).not.toThrow();
  });

  it('rejects an own hash_version property explicitly set to undefined', () => {
    const log = baseLog();
    Object.assign(log, { hash_version: undefined });
    log.entry_hash = legacyHash(log);

    expect(Object.prototype.hasOwnProperty.call(log, 'hash_version')).toBe(
      true,
    );
    expect(() => service.verifyBatch([log], 'requester')).toThrow(
      AuditHashVersionInvalidException,
    );
  });

  it('accepts only canonical bytes for explicit v2 evidence', () => {
    const log = baseLog();
    log.hash_version = 'v2-canonical-json';
    log.metadata = { raw_text: 'legacy-metadata' };
    log.metadata_raw = 'legacy-metadata';
    log.entry_hash = createHash('sha256')
      .update(
        'requester|DRAWER_OPEN|device-1|2026-07-22T00:00:00.000Z|1|GENESIS|null|null|legacy-metadata',
      )
      .digest('hex');

    expect(() => service.verifyBatch([log], 'requester')).toThrow(
      BadRequestException,
    );
  });

  it('accepts explicit v2 evidence with empty authorization byte semantics', () => {
    const log = baseLog();
    log.hash_version = 'v2-canonical-json';
    log.metodo_autorizacion = '';
    log.usuario_autorizador_id = '';
    log.entry_hash = createHash('sha256')
      .update(
        'requester|DRAWER_OPEN|device-1|2026-07-22T00:00:00.000Z|1|GENESIS|null|null|{}',
      )
      .digest('hex');

    expect(() => service.verifyBatch([log], 'requester')).not.toThrow();
  });

  it('accepts valid explicit v3 evidence', () => {
    const log = baseLog();
    log.hash_version = 'v3-jcs-rfc8785';
    log.metadata_raw = '{"z":true,"a":"raw"}';
    const canonical = canonicalizeNumberFreeJson(Buffer.from(log.metadata_raw));
    if (!canonical.ok) throw new Error('fixture canonicalization failed');
    const frame = buildAuditV3Frame(
      {
        user_id: 'requester',
        resolved_action: 'DRAWER_OPEN',
        device_id: 'device-1',
        timestamp: '2026-07-22T00:00:00.000Z',
        sequence_no: '1',
        prev_hash: 'GENESIS',
        metodo_autorizacion: { state: 'absent' },
        usuario_autorizador_id: { state: 'absent' },
      },
      canonical.value,
    );
    if (!frame.ok) throw new Error('fixture frame failed');
    log.entry_hash = sha256LowerHex(frame.value);

    expect(() => service.verifyBatch([log], 'requester')).not.toThrow();
    expect(log.metadata).toEqual({ z: true, a: 'raw' });
  });

  it('preserves explicit null metadata in the v3 hash frame', () => {
    const log = baseLog();
    Object.assign(log, {
      metadata: null,
      metadata_raw: 'null',
      hash_version: 'v3-jcs-rfc8785',
    });
    const canonical = canonicalizeNumberFreeJson(Buffer.from('null'));
    if (!canonical.ok) throw new Error('fixture canonicalization failed');
    const frame = buildAuditV3Frame(
      {
        user_id: 'requester',
        resolved_action: 'DRAWER_OPEN',
        device_id: 'device-1',
        timestamp: '2026-07-22T00:00:00.000Z',
        sequence_no: '1',
        prev_hash: 'GENESIS',
        metodo_autorizacion: { state: 'absent' },
        usuario_autorizador_id: { state: 'absent' },
      },
      canonical.value,
    );
    if (!frame.ok) throw new Error('fixture frame failed');
    log.entry_hash = sha256LowerHex(frame.value);

    expect(() => service.verifyBatch([log], 'requester')).not.toThrow();
  });

  it('does not accept an object-framed hash for explicit null v3 metadata', () => {
    const log = baseLog();
    Object.assign(log, {
      metadata: null,
      metadata_raw: 'null',
      hash_version: 'v3-jcs-rfc8785',
    });
    const canonical = canonicalizeNumberFreeJson(Buffer.from('{}'));
    if (!canonical.ok) throw new Error('fixture canonicalization failed');
    const frame = buildAuditV3Frame(
      {
        user_id: 'requester',
        resolved_action: 'DRAWER_OPEN',
        device_id: 'device-1',
        timestamp: '2026-07-22T00:00:00.000Z',
        sequence_no: '1',
        prev_hash: 'GENESIS',
        metodo_autorizacion: { state: 'absent' },
        usuario_autorizador_id: { state: 'absent' },
      },
      canonical.value,
    );
    if (!frame.ok) throw new Error('fixture frame failed');
    log.entry_hash = sha256LowerHex(frame.value);

    expect(() => service.verifyBatch([log], 'requester')).toThrow(
      BadRequestException,
    );
  });

  it.each([undefined, null, '{"key":1,"key":2}'])(
    'rejects v3 metadata_raw %p before accepting a forged frame',
    (metadataRaw) => {
      const log = baseLog();
      Object.assign(log, {
        hash_version: 'v3-jcs-rfc8785',
        metadata_raw: metadataRaw,
        entry_hash: 'forged',
      });

      expect(() => service.verifyBatch([log], 'requester')).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([
    [
      'AUDIT_V3_INVALID_JSON',
      1,
      () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        return circular;
      },
    ],
    ['AUDIT_V3_FRAME_INVALID', 3, () => ({})],
    ['AUDIT_V3_FRAME_TOO_LARGE', 2, () => ({})],
  ])(
    'returns exact %s transport and the correct metric reason',
    (code, offset, metadataFactory) => {
      const log = baseLog();
      log.hash_version = 'v3-jcs-rfc8785';
      log.metadata_raw = code === 'AUDIT_V3_INVALID_JSON' ? '{' : '{}';
      if (code === 'AUDIT_V3_INVALID_JSON') {
        log.metadata = metadataFactory();
      } else if (code === 'AUDIT_V3_FRAME_INVALID') {
        log.timestamp = '';
      } else {
        log.device_id = 'x'.repeat(1_048_577);
      }
      log.entry_hash = 'invalid';

      try {
        service.verifyBatch([log], 'requester');
        throw new Error('expected v3 verification to fail');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({
          code,
          offset,
        });
      }
      expect(
        (metrics.readCounters().keys().next().value as string).split(':')[1],
      ).toBe(
        code === 'AUDIT_V3_INVALID_JSON'
          ? 'canonicalization_failed'
          : code === 'AUDIT_V3_FRAME_TOO_LARGE'
            ? 'frame_too_large'
            : 'frame_invalid',
      );
    },
  );

  it('stops at the first invalid batch item and records one safe failure', () => {
    const increment = jest.spyOn(metrics, 'increment');
    const first = baseLog();
    first.hash_version = null;
    first.entry_hash = legacyHash(first);
    const second = baseLog();
    second.hash_version = 'unknown';
    second.entry_hash = legacyHash(second);

    expect(() => service.verifyBatch([first, second], 'requester')).toThrow(
      AuditHashVersionInvalidException,
    );
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith('invalid', 'version_invalid');
  });
});
