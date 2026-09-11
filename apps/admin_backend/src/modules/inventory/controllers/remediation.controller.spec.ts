import { Test, TestingModule } from '@nestjs/testing';
import { RemediationController } from './remediation.controller';
import { SaleInventoryRemediationService } from '../services/sale-inventory-remediation.service';
import { BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';

describe('RemediationController (Slice 10)', () => {
  let controller: RemediationController;
  let service: any;

  beforeEach(async () => {
    service = {
      remediateSaleInventory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemediationController],
      providers: [
        { provide: SaleInventoryRemediationService, useValue: service },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({ intercept: (context: any, next: any) => next.handle() })
      .compile();

    controller = module.get<RemediationController>(RemediationController);
  });

  it('rejects request if actor fields are passed in the request body', async () => {
    const dto: any = {
      idempotencyKey: 'idemp-1',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'test',
      role: 'owner', // spoof attempt
    };

    const req: any = {
      user: { id: 'real-user', role: 'waiter' },
    };

    await expect(
      controller.remediateSaleInventory('tenant-1', dto, req),
    ).rejects.toThrow(BadRequestException);
    expect(service.remediateSaleInventory).not.toHaveBeenCalled();
  });

  it('extracts actor exclusively from request.user and forwards to service', async () => {
    const dto = {
      idempotencyKey: 'idemp-valid',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'valid remediation',
    };

    const req: any = {
      user: { sub: 'jwt-sub-id', role: 'manager' },
    };

    service.remediateSaleInventory.mockResolvedValueOnce({
      id: 'receipt-1',
      status: 'APPLIED',
    });

    const res = await controller.remediateSaleInventory('tenant-1', dto, req);
    expect(res.status).toBe('APPLIED');
    expect(service.remediateSaleInventory).toHaveBeenCalledWith(
      'tenant-1',
      dto,
      {
        userId: 'jwt-sub-id',
        role: 'manager',
      },
    );
  });

  it('throws BadRequestException if authenticated user principal is missing', async () => {
    const dto = {
      idempotencyKey: 'idemp-valid',
      invoiceId: '11111111-1111-4111-8111-111111111111',
      recipeVersionId: '22222222-2222-4222-8222-222222222222',
      reason: 'valid remediation',
    };

    const req: any = {}; // No user in request

    await expect(
      controller.remediateSaleInventory('tenant-1', dto, req),
    ).rejects.toThrow(BadRequestException);
  });
});
