import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SupervisorOverrideRequestDto } from './supervisor-override.dto';
import { AppPermission } from '../security/permissions.enum';

describe('SupervisorOverrideRequestDto validation (Slice 10.2)', () => {
  it('validates a valid PIN override request successfully', async () => {
    const dto = plainToInstance(SupervisorOverrideRequestDto, {
      supervisorId: '11111111-1111-1111-1111-111111111111',
      credential: '123456',
      method: 'PIN',
      permissionRequired: AppPermission.SALES_VOID_INVOICE,
      context: {
        invoiceId: 'inv-123',
        amount: 150.5,
        reason: 'Customer cancelled order before prep',
      },
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates a valid TOTP override request successfully', async () => {
    const dto = plainToInstance(SupervisorOverrideRequestDto, {
      supervisorId: '11111111-1111-1111-1111-111111111111',
      credential: '654321',
      method: 'TOTP',
      permissionRequired: AppPermission.CASH_MANUAL_DRAWER_OPEN,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects invalid authorization method', async () => {
    const dto = plainToInstance(SupervisorOverrideRequestDto, {
      supervisorId: '11111111-1111-1111-1111-111111111111',
      credential: '123456',
      method: 'BIOMETRIC_UNSUPPORTED',
      permissionRequired: AppPermission.SALES_VOID_INVOICE,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('method');
  });

  it('rejects invalid permission requirement', async () => {
    const dto = plainToInstance(SupervisorOverrideRequestDto, {
      supervisorId: '11111111-1111-1111-1111-111111111111',
      credential: '123456',
      method: 'PIN',
      permissionRequired: 'invalid:nonexistent:capability',
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('permissionRequired');
  });

  it('rejects empty credentials or empty supervisor ID', async () => {
    const dto = plainToInstance(SupervisorOverrideRequestDto, {
      supervisorId: '',
      credential: '',
      method: 'PIN',
      permissionRequired: AppPermission.SALES_VOID_INVOICE,
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});
