import 'reflect-metadata';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { UserRole } from '../security/user-role.enum';
import { CreateUserDto, UpdateUserDto } from './user-management.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const validate = async (
  input: Record<string, unknown>,
  metatype: new () => unknown,
): Promise<unknown> =>
  pipe.transform(input, {
    type: 'body',
    metatype: metatype as never,
  });

const validCreate = {
  email: 'cashier@omnifood.ni',
  name: 'Cashier',
  role: UserRole.CASHIER,
};

// UpdateUserDto is whitelist-forbidden on email (email is immutable).
const validUpdate = {
  name: 'Cashier',
  role: UserRole.CASHIER,
};

describe('user password policy (security-hardening-batch2 S3)', () => {
  it.each([
    [CreateUserDto, validCreate],
    [UpdateUserDto, validUpdate],
  ] as const)(
    'accepts an 8-character password (%p)',
    async (metatype, base) => {
      const dto = (await validate(
        { ...base, password: 'Abcdefg1' },
        metatype,
      )) as { password?: string };
      expect(dto.password).toBe('Abcdefg1');
    },
  );

  it.each([
    [CreateUserDto, validCreate],
    [UpdateUserDto, validUpdate],
  ] as const)(
    'rejects a 7-character password with 400 (%p)',
    async (metatype, base) => {
      await expect(
        validate({ ...base, password: 'Abcdefg' }, metatype),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each([
    [CreateUserDto, validCreate],
    [UpdateUserDto, validUpdate],
  ] as const)('rejects an empty password (%p)', async (metatype, base) => {
    await expect(validate({ ...base, password: '' }, metatype)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('keeps the offline PIN minimum at 4 (separate terminal factor)', async () => {
    const dto = (await validate(
      { ...validCreate, pin: '1234' },
      CreateUserDto,
    )) as { pin?: string };
    expect(dto.pin).toBe('1234');
  });
});

describe('UpdateUserDto still passes a valid full payload (S3 regression guard)', () => {
  it('accepts role change without password', async () => {
    const dto = await validate({ role: UserRole.MANAGER }, UpdateUserDto);
    expect(dto).toMatchObject({ role: UserRole.MANAGER });
  });

  it('preserves the plain instance shape', () => {
    const dto = plainToInstance(CreateUserDto, validCreate);
    expect(dto.email).toBe('cashier@omnifood.ni');
  });
});
