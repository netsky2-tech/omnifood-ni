import { Test, TestingModule } from '@nestjs/testing';
import { ActivationController } from './activation.controller';
import { ActivationService } from '../services/activation.service';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import {
  ActivationCheckCode,
  ActivationCheckStatus,
} from '../entities/activation-check-result.entity';
import { ActivationAttemptStatus } from '../entities/activation-attempt.entity';

describe('ActivationController', () => {
  let controller: ActivationController;
  let activationService: jest.Mocked<Partial<ActivationService>>;

  const tenantId = 'tenant-c1';
  const userId = 'user-u1';
  const terminalId = 'term-01';

  beforeEach(async () => {
    activationService = {
      startActivation: jest.fn().mockResolvedValue({
        id: 'att-1',
        status: ActivationAttemptStatus.CREATED,
      } as any),
      getAttempt: jest.fn().mockResolvedValue({ id: 'att-1' } as any),
      getActiveAttempt: jest.fn().mockResolvedValue({ id: 'att-1' } as any),
      ingestCheck: jest.fn().mockResolvedValue({
        id: 'chk-1',
        status: ActivationCheckStatus.PASS,
      } as any),
      finalizeActivation: jest.fn().mockResolvedValue({
        id: 'att-1',
        status: ActivationAttemptStatus.PASS,
      } as any),
      getFollowUps: jest.fn().mockResolvedValue([]),
      closeFollowUp: jest
        .fn()
        .mockResolvedValue({ id: 'fup-1', status: 'CLOSED' } as any),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActivationController],
      providers: [{ provide: ActivationService, useValue: activationService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ActivationController>(ActivationController);
  });

  it('delegates POST /onboarding/activation/attempts to startActivation', async () => {
    const req = { user: { id: userId, tenant_id: tenantId } } as any;
    const dto = { candidateTerminalId: terminalId };

    const result = await controller.startActivation(req, dto);

    expect(result).toBeDefined();
    expect(activationService.startActivation).toHaveBeenCalledWith(
      tenantId,
      dto,
      userId,
    );
  });

  it('delegates GET /onboarding/activation/attempts/:id to getAttempt', async () => {
    const req = { user: { tenant_id: tenantId } } as any;

    const result = await controller.getAttempt(req, 'att-1');

    expect(result).toBeDefined();
    expect(activationService.getAttempt).toHaveBeenCalledWith(
      tenantId,
      'att-1',
    );
  });

  it('delegates POST /onboarding/activation/attempts/:id/checks to ingestCheck with DevicePrincipal', async () => {
    const req = {
      user: {
        id: userId,
        tenant_id: tenantId,
        terminal_id: terminalId,
      },
    } as any;
    const dto = {
      checkCode: ActivationCheckCode.TERMINAL_LINKED,
      status: ActivationCheckStatus.PASS,
    };

    const result = await controller.ingestCheck(req, 'att-1', dto);

    expect(result).toBeDefined();
    expect(activationService.ingestCheck).toHaveBeenCalledWith(
      'att-1',
      dto,
      expect.objectContaining({
        tenantId,
        terminalId,
      }),
    );
  });

  it('delegates POST /onboarding/activation/attempts/:id/finalize to finalizeActivation without accepting client result', async () => {
    const req = { user: { id: userId, tenant_id: tenantId } } as any;

    const result = await controller.finalizeActivation(req, 'att-1');

    expect(result).toBeDefined();
    expect(activationService.finalizeActivation).toHaveBeenCalledWith(
      tenantId,
      'att-1',
      userId,
    );
  });

  it('delegates follow-up endpoints', async () => {
    const req = { user: { id: userId, tenant_id: tenantId } } as any;

    await controller.getFollowUps(req, 'att-1');
    expect(activationService.getFollowUps).toHaveBeenCalledWith(
      tenantId,
      'att-1',
    );

    await controller.closeFollowUp(req, 'fup-1', { closureNote: 'Verified' });
    expect(activationService.closeFollowUp).toHaveBeenCalledWith(
      tenantId,
      'fup-1',
      { closureNote: 'Verified' },
      userId,
    );
  });
});
