import { SystemParametersConfig } from './system-parameters-config.entity';

describe('SystemParametersConfig Entity', () => {
  it('instantiates correctly with typed parameters and defaults', () => {
    const config = new SystemParametersConfig();
    config.id = '1';
    config.tenant_id = 'tenant-123';
    config.paramKey = 'inventory.negative_stock.auto_approve_threshold';
    config.paramValue = { thresholdNio: 1500.0, currency: 'NIO' };
    config.version = 1;
    config.isActive = true;
    config.createdBy = 'user-admin';

    expect(config.id).toBe('1');
    expect(config.tenant_id).toBe('tenant-123');
    expect(config.paramKey).toBe('inventory.negative_stock.auto_approve_threshold');
    expect(config.paramValue).toEqual({ thresholdNio: 1500.0, currency: 'NIO' });
    expect(config.version).toBe(1);
    expect(config.isActive).toBe(true);
    expect(config.createdBy).toBe('user-admin');
  });
});
