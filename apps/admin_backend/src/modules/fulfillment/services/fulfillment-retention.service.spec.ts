import { DataSource, Repository } from 'typeorm';
import { FulfillmentRetentionService } from './fulfillment-retention.service';
import { TenantFulfillmentRecord } from '../entities/tenant-fulfillment-record.entity';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from '../../../core/database/tenant-transaction';

/**
 * Unit tests for the tenant-binding guard routing in
 * FulfillmentRetentionService (Unit 0b-2).
 *
 * Path chosen: `findFulfillmentRecord`. It is the least invasive bind path to
 * reach with plain mocks: it opens a single-argument `dataSource.transaction`
 * whose callback binds the tenant context before the first repository access,
 * so a DataSource stub plus a manager stub with `query` and `getRepository` is
 * enough. No Nest testing module and no injected repository behaviour are
 * needed because the constructor-injected fulfillment repository is unused on
 * this path.
 */
describe('FulfillmentRetentionService tenant binding (Unit 0b-2)', () => {
  let managerQuery: jest.Mock;
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let service: FulfillmentRetentionService;

  beforeEach(() => {
    managerQuery = jest.fn().mockResolvedValue([]);
    manager = {
      query: managerQuery,
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
      }),
    };
    dataSource = {
      transaction: jest.fn(
        (
          isolationOrCallback: unknown,
          maybeCallback?: (m: unknown) => Promise<unknown>,
        ) => {
          const callback =
            typeof isolationOrCallback === 'function'
              ? isolationOrCallback
              : maybeCallback;
          if (!callback) throw new Error('Callback required');
          return callback(manager);
        },
      ),
    };
    service = new FulfillmentRetentionService(
      dataSource as unknown as DataSource,
      {} as unknown as Repository<TenantFulfillmentRecord>,
    );
  });

  it('rejects a blank tenant id with TenantContextRequiredError and issues no set_config SQL', async () => {
    await expect(service.findFulfillmentRecord('   ', 'ful-1')).rejects.toThrow(
      TenantContextRequiredError,
    );
    expect(managerQuery).not.toHaveBeenCalled();
  });

  it('binds a valid tenant id via parameterised set_config before any repository access', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    manager.getRepository.mockReturnValue({ findOne });

    await service.findFulfillmentRecord('tenant-1', 'ful-1');

    expect(managerQuery).toHaveBeenCalledTimes(1);
    expect(managerQuery).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-1',
    ]);
    expect(managerQuery.mock.invocationCallOrder[0]).toBeLessThan(
      findOne.mock.invocationCallOrder[0],
    );
  });
});
