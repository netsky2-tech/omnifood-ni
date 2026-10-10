import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevokeDeviceCredentialDto } from './revoke-device-credential.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const transform = async (body: Record<string, unknown>) =>
  (await pipe.transform(body, {
    type: 'body',
    metatype: RevokeDeviceCredentialDto,
  })) as RevokeDeviceCredentialDto;

describe('RevokeDeviceCredentialDto validation (B17-02)', () => {
  it('accepts a valid human revocation reason', async () => {
    const dto = await transform({ reason: 'Caja averiada por derrame' });

    expect(dto).toBeInstanceOf(RevokeDeviceCredentialDto);
    expect(dto.reason).toBe('Caja averiada por derrame');

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects an empty reason with the IsNotEmpty constraint', async () => {
    const dto = plainToInstance(RevokeDeviceCredentialDto, { reason: '' });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('reason');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');

    await expect(transform({ reason: '' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing reason', async () => {
    const dto = plainToInstance(RevokeDeviceCredentialDto, {});

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('reason');
    expect(errors[0].constraints).toHaveProperty('isNotEmpty');

    await expect(transform({})).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-string reason with the IsString constraint', async () => {
    const dto = plainToInstance(RevokeDeviceCredentialDto, { reason: 12345 });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('reason');
    expect(errors[0].constraints).toHaveProperty('isString');

    await expect(transform({ reason: 12345 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a reason longer than 255 characters with the MaxLength constraint', async () => {
    const tooLong = 'a'.repeat(256);
    const dto = plainToInstance(RevokeDeviceCredentialDto, { reason: tooLong });

    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].property).toBe('reason');
    expect(errors[0].constraints).toHaveProperty('maxLength');

    await expect(transform({ reason: tooLong })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a reason of exactly 255 characters (boundary)', async () => {
    const boundary = 'a'.repeat(255);
    const dto = plainToInstance(RevokeDeviceCredentialDto, {
      reason: boundary,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.reason).toHaveLength(255);
  });
});
