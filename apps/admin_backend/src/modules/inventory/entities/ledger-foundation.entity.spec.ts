import { RecipeVersion } from './recipe-version.entity';
import { RecipeDetail } from './recipe-detail.entity';
import { ProductionOrder } from './production-order.entity';
import { ProductionOrderLine } from './production-order-line.entity';
import { Shrinkage } from './shrinkage.entity';
import { ShrinkageDetail } from './shrinkage-detail.entity';
import { InventorySyncOutbox } from './inventory-sync-outbox.entity';
import { InventorySyncReceipt } from './inventory-sync-receipt.entity';

describe('Ledger foundation entities', () => {
  it('should define foundational entities for PR1', () => {
    expect(new RecipeVersion()).toBeDefined();
    expect(new RecipeDetail()).toBeDefined();
    expect(new ProductionOrder()).toBeDefined();
    expect(new ProductionOrderLine()).toBeDefined();
    expect(new Shrinkage()).toBeDefined();
    expect(new ShrinkageDetail()).toBeDefined();
    expect(new InventorySyncOutbox()).toBeDefined();
    expect(new InventorySyncReceipt()).toBeDefined();
  });

  it('exposes deterministic sync metadata fields on receipt and outbox entities', () => {
    const receipt = Object.assign(new InventorySyncReceipt(), {
      flow_type: 'inventory',
      payload_hash: 'hash-1',
      result_status: 'ACCEPTED',
      result_code: 'APPLIED',
    });
    const outbox = Object.assign(new InventorySyncOutbox(), {
      flow_type: 'inventory',
      payload_hash: 'hash-2',
      status: 'STAGED_FUTURE',
      result_code: 'WAITING_FOR_SEQUENCE_2',
    });

    expect(receipt).toMatchObject({
      flow_type: 'inventory',
      payload_hash: 'hash-1',
      result_status: 'ACCEPTED',
      result_code: 'APPLIED',
    });
    expect(outbox).toMatchObject({
      flow_type: 'inventory',
      payload_hash: 'hash-2',
      status: 'STAGED_FUTURE',
      result_code: 'WAITING_FOR_SEQUENCE_2',
    });
  });
});
