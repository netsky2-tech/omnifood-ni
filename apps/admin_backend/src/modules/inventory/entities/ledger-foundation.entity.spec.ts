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
});
