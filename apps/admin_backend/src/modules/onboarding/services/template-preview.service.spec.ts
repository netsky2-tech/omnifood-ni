import { DataSource, EntityManager, Repository } from 'typeorm';
import { TemplatePreviewService } from './template-preview.service';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from '../../../core/database/tenant-transaction';
import { IndustryTemplate } from '../entities/industry-template.entity';
import {
  TemplateSeedLink,
  TemplateSourceItemType,
  TemplateTargetEntityType,
} from '../entities/template-seed-link.entity';
import { Insumo } from '../../inventory/entities/insumo.entity';
import { Product } from '../../inventory/entities/product.entity';

describe('TemplatePreviewService (TDD / ONB1.3A-B)', () => {
  let service: TemplatePreviewService;
  let templateRepo: jest.Mocked<Partial<Repository<IndustryTemplate>>>;
  let seedLinkRepo: jest.Mocked<Partial<Repository<TemplateSeedLink>>>;
  let insumoRepo: jest.Mocked<Partial<Repository<Insumo>>>;
  let productRepo: jest.Mocked<Partial<Repository<Product>>>;
  let dataSource: jest.Mocked<Partial<DataSource>>;
  let mockManager: jest.Mocked<Partial<EntityManager>>;

  const sampleTemplate: IndustryTemplate = {
    id: 'CAFETERIA',
    code: 'CAFETERIA',
    name: 'Cafetería & Coffee Shop',
    description: 'Plantilla especializada',
    icon: 'coffee',
    is_active: true,
    version: 1,
    source_fingerprint: 'fp-cafeteria-v1',
    templateInsumos: [
      {
        id: 'ins-1',
        template_id: 'CAFETERIA',
        name: 'Granos de Café Especial',
        purchase_uom: 'KG',
        consumption_uom: 'G',
        conversion_factor: 1000,
        par_level: 10000,
        min_stock: 2000,
        is_perishable: false,
        negative_stock_policy: 'RESTRICT',
        created_at: new Date(),
        updated_at: new Date(),
        template: null,
      },
      {
        id: 'ins-2',
        template_id: 'CAFETERIA',
        name: 'Leche Entera',
        purchase_uom: 'L',
        consumption_uom: 'ML',
        conversion_factor: 1000,
        par_level: 20000,
        min_stock: 5000,
        is_perishable: true,
        negative_stock_policy: 'RESTRICT',
        created_at: new Date(),
        updated_at: new Date(),
        template: null,
      },
    ],
    templateProducts: [
      {
        id: 'prod-1',
        template_id: 'CAFETERIA',
        name: 'Espresso Simple',
        category: 'Bebidas Calientes',
        uom: 'UN',
        suggested_price: 60,
        is_perishable: false,
        recipeItems: [
          {
            id: 'rec-1',
            template_product_id: 'prod-1',
            template_insumo_name: 'Granos de Café Especial',
            gross_quantity: 9,
            technical_shrink_pct: 0,
            component_uom: 'G',
            created_at: new Date(),
            updated_at: new Date(),
            templateProduct: null,
          },
        ],
        created_at: new Date(),
        updated_at: new Date(),
        template: null,
      },
    ],
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    templateRepo = {
      findOne: jest.fn().mockResolvedValue(sampleTemplate),
    };
    seedLinkRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    insumoRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    productRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    // The tenant-bound transaction hands back a manager whose repositories
    // serve every protected read; the pooled repositories are never used.
    mockManager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(((entity: unknown) => {
        if (entity === TemplateSeedLink)
          return seedLinkRepo as unknown as Repository<TemplateSeedLink>;
        if (entity === Insumo)
          return insumoRepo as unknown as Repository<Insumo>;
        if (entity === Product)
          return productRepo as unknown as Repository<Product>;
        throw new Error(`Unexpected repository request: ${String(entity)}`);
      }) as any) as any,
    };

    dataSource = {
      transaction: jest.fn((cb: any) => cb(mockManager)) as any,
    };

    service = new TemplatePreviewService(
      templateRepo as Repository<IndustryTemplate>,
      seedLinkRepo as Repository<TemplateSeedLink>,
      insumoRepo as Repository<Insumo>,
      productRepo as Repository<Product>,
      dataSource as unknown as DataSource,
    );
  });

  it('builds a side-effect free preview marking all items as NEW when tenant is empty', async () => {
    const preview = await service.buildPreview('tenant-1', 'CAFETERIA');

    expect(preview.templateCode).toBe('CAFETERIA');
    expect(preview.templateVersion).toBe(1);
    expect(preview.items).toHaveLength(3); // 2 insumos + 1 product

    const ins1 = preview.items.find((i) => i.itemId === 'ins-1');
    expect(ins1).toBeDefined();
    expect(ins1.diffStatus).toBe('NEW');
    expect(ins1.itemType).toBe('INGREDIENT');
    expect(ins1.proposedEffect).toBe('CREATE_INSUMO');
    expect(ins1.sourceFingerprint).toBeDefined();
    expect(ins1.selected).toBe(true);

    const prod1 = preview.items.find((i) => i.itemId === 'prod-1');
    expect(prod1).toBeDefined();
    expect(prod1.diffStatus).toBe('NEW');
    expect(prod1.itemType).toBe('PRODUCT');
    expect(prod1.proposedEffect).toBe('CREATE_PRODUCT');

    expect(preview.summary.newCount).toBe(3);
    expect(preview.summary.existingLinkedCount).toBe(0);
  });

  it('binds the tenant context inside the transaction before the first protected read', async () => {
    await service.buildPreview('tenant-1', 'CAFETERIA');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mockManager.query).toHaveBeenCalledWith(
      TENANT_CONTEXT_SET_CONFIG_SQL,
      ['tenant-1'],
    );
    const queryOrder =
      (mockManager.query as jest.Mock).mock.invocationCallOrder[0];
    const firstProtected = Math.min(
      ...(seedLinkRepo.find as jest.Mock).mock.invocationCallOrder,
      ...(insumoRepo.find as jest.Mock).mock.invocationCallOrder,
      ...(productRepo.find as jest.Mock).mock.invocationCallOrder,
    );
    expect(queryOrder).toBeLessThan(firstProtected);
  });

  it('reads tenant-bearing data only through manager-scoped repositories, never the pooled ones', async () => {
    await service.buildPreview('tenant-1', 'CAFETERIA');

    // The injected pooled seed-link repository must stay untouched inside
    // the bound path: manager.getRepository is the only access route.
    expect(mockManager.getRepository).toHaveBeenCalledWith(TemplateSeedLink);
    expect(mockManager.getRepository).toHaveBeenCalledWith(Insumo);
    expect(mockManager.getRepository).toHaveBeenCalledWith(Product);
  });

  it('fails fast with TenantContextRequiredError on a blank tenant and issues no set_config SQL', async () => {
    await expect(service.buildPreview('   ', 'CAFETERIA')).rejects.toThrow(
      TenantContextRequiredError,
    );

    // The transaction itself must never be opened for a blank tenant.
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(mockManager.query).not.toHaveBeenCalled();
  });

  it('propagates a binding failure from inside the transaction', async () => {
    (mockManager.query as jest.Mock).mockRejectedValueOnce(
      new Error('binding failed'),
    );

    await expect(service.buildPreview('tenant-1', 'CAFETERIA')).rejects.toThrow(
      'binding failed',
    );
    expect(seedLinkRepo.find).not.toHaveBeenCalled();
  });

  it('identifies EXISTING_LINKED when a TemplateSeedLink exists', async () => {
    const existingLink: TemplateSeedLink = {
      id: 'link-1',
      tenant_id: 'tenant-1',
      template_code: 'CAFETERIA',
      source_item_id: 'ins-1',
      source_item_type: TemplateSourceItemType.INGREDIENT,
      target_entity_type: TemplateTargetEntityType.INSUMO,
      target_entity_id: 'insumo-real-1',
      first_applied_version: 1,
      last_seen_version: 1,
      last_applied_version: 1,
      last_source_fingerprint: 'fp-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    seedLinkRepo.find = jest.fn().mockResolvedValue([existingLink]);

    const preview = await service.buildPreview('tenant-1', 'CAFETERIA');

    const ins1 = preview.items.find((i) => i.itemId === 'ins-1');
    expect(ins1.diffStatus).toBe('EXISTING_LINKED');
    expect(ins1.proposedEffect).toBe('NO_OP');
    expect(ins1.existingEntityId).toBe('insumo-real-1');
    expect(preview.summary.existingLinkedCount).toBe(1);
    expect(preview.summary.newCount).toBe(2);
  });

  it('identifies EXISTING_UNLINKED when an entity with same name exists without SeedLink', async () => {
    insumoRepo.find = jest.fn().mockResolvedValue([
      {
        id: 'ins-manual-1',
        name: 'Granos de Café Especial',
        tenant_id: 'tenant-1',
      } as Insumo,
    ]);

    const preview = await service.buildPreview('tenant-1', 'CAFETERIA');

    const ins1 = preview.items.find((i) => i.itemId === 'ins-1');
    expect(ins1.diffStatus).toBe('EXISTING_UNLINKED');
    expect(ins1.proposedEffect).toBe('LINK_EXISTING');
    expect(ins1.existingEntityId).toBe('ins-manual-1');
    expect(preview.summary.existingUnlinkedCount).toBe(1);
  });

  it('supports partial selection filtering by selectedItemIds', async () => {
    const preview = await service.buildPreview('tenant-1', 'CAFETERIA', {
      selectedItemIds: ['prod-1'],
    });

    const prod1 = preview.items.find((i) => i.itemId === 'prod-1');
    const ins1 = preview.items.find((i) => i.itemId === 'ins-1');

    expect(prod1.selected).toBe(true);
    expect(ins1.selected).toBe(false);
  });

  it('throws NotFoundException when template does not exist', async () => {
    templateRepo.findOne = jest.fn().mockResolvedValue(null);

    await expect(
      service.buildPreview('tenant-1', 'UNKNOWN_TEMPLATE'),
    ).rejects.toThrow("Industry template 'UNKNOWN_TEMPLATE' not found");
  });

  it('throws BadRequestException when templateCode is empty', async () => {
    await expect(service.buildPreview('tenant-1', '  ')).rejects.toThrow(
      'Template code must not be empty',
    );
  });
});
