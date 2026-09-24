import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  ActivateCapabilityDto,
  CreateAuditLogDto,
  LoginDto,
  PushAuditLogsDto,
  RefreshTokenDto,
} from './identity.dto';

const validAuditLog = {
  id: 'd6df2e11-9a37-4fc9-a512-2b89a43a9a42',
  device_id: 'device-1',
  sequence_no: 1,
  prev_hash: 'GENESIS',
  entry_hash: 'hash',
  timestamp: '2026-07-22T00:00:00.000Z',
};

const transformAuditLog = async (
  input: Record<string, unknown>,
): Promise<CreateAuditLogDto> => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const result = (await pipe.transform(
    { logs: [{ ...validAuditLog, ...input }] },
    { type: 'body', metatype: PushAuditLogsDto },
  )) as PushAuditLogsDto;

  return result.logs[0];
};

describe('CreateAuditLogDto raw version state', () => {
  it('preserves a missing hash_version as undefined', () => {
    const dto = plainToInstance(CreateAuditLogDto, {});

    expect(dto.hash_version).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(dto, 'hash_version')).toBe(
      false,
    );
  });

  it('preserves an explicitly undefined hash_version as an own property', async () => {
    const dto = await transformAuditLog({ hash_version: undefined });

    expect(dto.hash_version).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(dto, 'hash_version')).toBe(
      true,
    );
  });

  it('preserves explicit nullable audit fields without coercion', () => {
    const rawFields: Pick<
      CreateAuditLogDto,
      'hash_version' | 'metodo_autorizacion' | 'usuario_autorizador_id'
    > = {
      hash_version: null,
      metodo_autorizacion: null,
      usuario_autorizador_id: null,
    };

    const dto = plainToInstance(CreateAuditLogDto, rawFields);

    expect(dto.hash_version).toBeNull();
    expect(dto.metodo_autorizacion).toBeNull();
    expect(dto.usuario_autorizador_id).toBeNull();
  });

  it('preserves an explicit empty hash_version instead of treating it as absent', () => {
    const dto = plainToInstance(CreateAuditLogDto, { hash_version: '' });

    expect(dto.hash_version).toBe('');
  });

  it('keeps every raw hash_version state visible through the global ValidationPipe', async () => {
    const absent = await transformAuditLog({});
    const explicitNull = await transformAuditLog({ hash_version: null });
    const empty = await transformAuditLog({ hash_version: '' });
    const whitespace = await transformAuditLog({ hash_version: '  ' });
    const numeric = await transformAuditLog({ hash_version: 3 });
    const object = { version: 'v3-jcs-rfc8785' };
    const structured = await transformAuditLog({ hash_version: object });
    const v2 = await transformAuditLog({
      hash_version: 'v2-canonical-json',
    });
    const v3 = await transformAuditLog({
      hash_version: 'v3-jcs-rfc8785',
      metadata_raw: '{}',
    });

    expect(absent.hash_version).toBeUndefined();
    expect(explicitNull.hash_version).toBeNull();
    expect(empty.hash_version).toBe('');
    expect(whitespace.hash_version).toBe('  ');
    expect(numeric.hash_version).toBe(3);
    expect(structured.hash_version).toEqual(object);
    expect(v2.hash_version).toBe('v2-canonical-json');
    expect(v3.hash_version).toBe('v3-jcs-rfc8785');
  });

  it.each([
    ['array', [true, null, 'text']],
    ['string', 'text'],
    ['boolean', false],
    ['null', null],
  ])(
    'admits protocol-valid number-free v3 %s metadata',
    async (_, metadata) => {
      const dto = await transformAuditLog({
        hash_version: 'v3-jcs-rfc8785',
        metadata,
        metadata_raw: JSON.stringify(metadata),
      });

      expect(dto.metadata).toEqual(metadata);
    },
  );

  it.each([
    ['legacy', undefined],
    ['v2', 'v2-canonical-json'],
  ])('keeps %s metadata object-only compatibility', async (_, hashVersion) => {
    await expect(
      transformAuditLog({
        ...(hashVersion === undefined ? {} : { hash_version: hashVersion }),
        metadata: ['not', 'legacy', 'metadata'],
      }),
    ).rejects.toThrow();
  });

  it('rejects numbers recursively from v3 metadata', async () => {
    await expect(
      transformAuditLog({
        hash_version: 'v3-jcs-rfc8785',
        metadata: { nested: [true, 1] },
        metadata_raw: '{"nested":[true,1]}',
      }),
    ).rejects.toThrow();
  });
});

describe('ActivateCapabilityDto', () => {
  const transformActivateCapability = async (
    input: Record<string, unknown>,
  ): Promise<ActivateCapabilityDto> => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    return (await pipe.transform(input, {
      type: 'body',
      metatype: ActivateCapabilityDto,
    })) as ActivateCapabilityDto;
  };

  it('trims the activation reason before forwarding it to the service boundary', async () => {
    await expect(
      transformActivateCapability({
        new_version: 'v3-jcs-rfc8785',
        reason: '  approved rollout  ',
      }),
    ).resolves.toMatchObject({ reason: 'approved rollout' });
  });

  it.each([
    ['missing', { new_version: 'v2' }],
    ['blank', { new_version: 'v2', reason: '' }],
    ['whitespace-only', { new_version: 'v2', reason: '   ' }],
    ['oversized', { new_version: 'v2', reason: 'a'.repeat(501) }],
    [
      'unknown field',
      { new_version: 'v2', reason: 'rollback', unexpected: true },
    ],
  ])('rejects a %s activation reason payload', async (_, input) => {
    await expect(transformActivateCapability(input)).rejects.toThrow();
  });
});

describe('LoginDto / RefreshTokenDto optional tenantSlug', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  const transformLogin = async (input: Record<string, unknown>) =>
    pipe.transform({ ...input }, { type: 'body', metatype: LoginDto });

  const transformRefresh = async (input: Record<string, unknown>) =>
    pipe.transform({ ...input }, { type: 'body', metatype: RefreshTokenDto });

  const validLogin = {
    email: 'cashier@omnifood.ni',
    pass: 'Password123!',
  };

  const validRefresh = {
    userId: 'd6df2e11-9a37-4fc9-a512-2b89a43a9a42',
    refreshToken: 'token',
  };

  it('accepts login without tenantSlug (legacy POS payload)', async () => {
    const dto = (await transformLogin(validLogin)) as LoginDto;
    expect(dto.tenantSlug).toBeUndefined();
  });

  it('accepts a tenantSlug up to 50 chars on login', async () => {
    const dto = (await transformLogin({
      ...validLogin,
      tenantSlug: 'm'.repeat(50),
    })) as LoginDto;
    expect(dto.tenantSlug).toBe('m'.repeat(50));
  });

  it('rejects a tenantSlug longer than 50 chars on login', async () => {
    await expect(
      transformLogin({ ...validLogin, tenantSlug: 'm'.repeat(51) }),
    ).rejects.toThrow();
  });

  it('rejects a non-string tenantSlug on login', async () => {
    await expect(
      transformLogin({ ...validLogin, tenantSlug: 42 }),
    ).rejects.toThrow();
  });

  it('accepts refresh without tenantSlug and with an optional tenantSlug', async () => {
    const legacy = (await transformRefresh(validRefresh)) as RefreshTokenDto;
    expect(legacy.tenantSlug).toBeUndefined();
    const dto = (await transformRefresh({
      ...validRefresh,
      tenantSlug: 'mi-negocio',
    })) as RefreshTokenDto;
    expect(dto.tenantSlug).toBe('mi-negocio');
  });

  it('rejects a tenantSlug longer than 50 chars on refresh', async () => {
    await expect(
      transformRefresh({ ...validRefresh, tenantSlug: 'm'.repeat(51) }),
    ).rejects.toThrow();
  });
});
