import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CreateAuditLogDto, PushAuditLogsDto } from './identity.dto';

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
});
