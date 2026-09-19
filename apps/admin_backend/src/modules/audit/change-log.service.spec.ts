import { ChangeLog } from './entities/change-log.entity';
import {
  AuditActorRequiredError,
  AuditActor,
  ChangeLogService,
} from './change-log.service';

describe('ChangeLogService.log', () => {
  let service: ChangeLogService;
  let create: jest.Mock;
  let save: jest.Mock;

  beforeEach(() => {
    create = jest.fn((data: unknown) => data as ChangeLog);
    save = jest.fn().mockResolvedValue(undefined);
    service = new ChangeLogService({
      create,
      save,
    } as unknown as never);
  });

  const baseParams = (actor: AuditActor) => ({
    tenantId: 'tenant-1',
    actor,
    action: 'UPDATE',
    targetType: 'product',
    targetId: 'target-1',
  });

  it('writes user_id, and never actor_ref, for a human actor', async () => {
    await service.log(baseParams({ userId: ' user-uuid ' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-uuid',
        actor_ref: null,
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes actor_ref, and never user_id, for a logical actor', async () => {
    await service.log(baseParams({ ref: ' SYSTEM_RECONCILER ' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null,
        actor_ref: 'SYSTEM_RECONCILER',
      }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('trims the actor value but only at the edges', async () => {
    await service.log(baseParams({ userId: '  user-uuid  ' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-uuid' }),
    );
  });

  it.each([
    ['blank userId', { userId: '   ' }],
    ['blank ref', { ref: '' }],
    ['missing actor', undefined as unknown as AuditActor],
    ['null actor', null],
  ])('rejects a %s before any SQL', async (_name, actor) => {
    await expect(service.log(baseParams(actor))).rejects.toThrowError(
      AuditActorRequiredError,
    );

    expect(create).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
