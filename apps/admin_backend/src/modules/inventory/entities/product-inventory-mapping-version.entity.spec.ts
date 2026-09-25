import { getMetadataArgsStorage } from 'typeorm';
import { ProductInventoryMappingVersion } from './product-inventory-mapping-version.entity';

describe('ProductInventoryMappingVersion metadata', () => {
  it('stores a tenant-scoped immutable mapping identity rather than product/insumo equality', () => {
    const columns = getMetadataArgsStorage().columns.filter((column) => column.target === ProductInventoryMappingVersion).map((column) => column.propertyName);
    expect(columns).toEqual(expect.arrayContaining(['tenant_id', 'product_id', 'insumo_id', 'effective_at', 'superseded_at']));
    expect(columns).not.toContain('direct_insumo_id');
  });
});
