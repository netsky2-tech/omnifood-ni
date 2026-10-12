import { DataSource, EntityManager, Repository } from 'typeorm';
import { LegacyTemplateRecipeScanService } from './legacy-template-recipe-scan.service';
import {
  TENANT_CONTEXT_SET_CONFIG_SQL,
  TenantContextRequiredError,
} from '../../../core/database/tenant-transaction';
import {
  RecipeVersion,
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
} from '../../inventory/entities/recipe-version.entity';
import {
  LegacyOnboardingMigrationReceipt,
  LegacyMigrationDecision,
} from '../entities/legacy-migration-receipt.entity';
import { OnboardingSession } from '../entities/onboarding-session.entity';
import { InvoiceItem } from '../../sales/entities/invoice-item.entity';
import { IndustryTemplate } from '../entities/industry-template.entity';

describe('LegacyTemplateRecipeScanService (TDD / ONB1.3G)', () => {
  let service: LegacyTemplateRecipeScanService;
  let recipeVersionRepo: jest.Mocked<Partial<Repository<RecipeVersion>>>;
  let receiptRepo: jest.Mocked<
    Partial<Repository<LegacyOnboardingMigrationReceipt>>
  >;
  let sessionRepo: jest.Mocked<Partial<Repository<OnboardingSession>>>;
  let invoiceItemRepo: jest.Mocked<Partial<Repository<InvoiceItem>>>;
  let templateRepo: jest.Mocked<Partial<Repository<IndustryTemplate>>>;
  let manager: { query: jest.Mock; getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  function makeRecipeVersion(
    id: string,
    productName: string,
    origin: RecipeOrigin,
    tenantId = 'tenant-1',
  ): RecipeVersion {
    return {
      id,
      tenant_id: tenantId,
      product_id: 'prod-1',
      product_name: productName,
      version_number: 1,
      is_active: true,
      origin,
      publication_state: RecipePublicationState.PUBLISHED,
      suggestion_state: RecipeSuggestionState.CONFIRMED,
      product: null,
      tenant: null,
      yield_quantity: 1,
      technical_shrink_pct: 0,
      version_note: null,
      published_at: new Date(),
      pos_created_at: null,
      fecha_inicio_vigencia: new Date(),
      fecha_fin_vigencia: null,
      pos_document_id: null,
      created_at: new Date(),
    } as unknown as RecipeVersion;
  }

  beforeEach(() => {
    recipeVersionRepo = {
      find: jest.fn(),
      save: jest.fn((e: any) => Promise.resolve(e)) as any,
    };
    receiptRepo = {
      create: jest.fn((e: any) => e) as any,
      save: jest.fn((e: any) =>
        Promise.resolve({ ...e, id: 'receipt-1' }),
      ) as any,
    };
    sessionRepo = {
      findOne: jest.fn(),
    };
    invoiceItemRepo = {
      count: jest.fn(),
    };
    templateRepo = {
      find: jest.fn().mockResolvedValue([
        {
          code: 'CAFETERIA',
          templateProducts: [
            {
              name: 'Capuchino 8oz',
            },
          ],
        } as any,
      ]),
    };

    // The service must resolve every protected repository from the
    // transaction manager of ONE tenant-bound transaction.
    manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: any) => {
        switch (entity) {
          case RecipeVersion:
            return recipeVersionRepo;
          case LegacyOnboardingMigrationReceipt:
            return receiptRepo;
          case OnboardingSession:
            return sessionRepo;
          case InvoiceItem:
            return invoiceItemRepo;
          case IndustryTemplate:
            return templateRepo;
          default:
            throw new Error(`Unexpected repository request: ${String(entity)}`);
        }
      }),
    };
    dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };

    service = new LegacyTemplateRecipeScanService(
      recipeVersionRepo as any,
      receiptRepo as any,
      sessionRepo as any,
      invoiceItemRepo as any,
      templateRepo as any,
      dataSource as unknown as DataSource,
    );
  });

  it('throws TenantContextRequiredError for a blank tenant before opening any transaction or SQL', async () => {
    await expect(service.scanAndRemediate('   ')).rejects.toThrow(
      TenantContextRequiredError,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalled();
    expect(recipeVersionRepo.find).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  it('runs the scan inside ONE tenant-bound transaction, binds app.tenant_id before the first protected read, and resolves protected repositories from the manager', async () => {
    const activeRv = makeRecipeVersion('legacy-rv-1', 'Capuchino 8oz',
      RecipeOrigin.INDUSTRY_TEMPLATE);
    recipeVersionRepo.find = jest.fn().mockResolvedValue([activeRv]);
    sessionRepo.findOne = jest.fn().mockResolvedValue(null);
    invoiceItemRepo.count = jest.fn().mockResolvedValue(0);

    const callOrder: string[] = [];
    manager.query.mockImplementation(async () => {
      callOrder.push('bind');
      return [];
    });
    (recipeVersionRepo.find as jest.Mock).mockImplementation(async () => {
      callOrder.push('find-recipe-versions');
      return [activeRv];
    });

    const report = await service.scanAndRemediate('tenant-1');

    // Exactly ONE transaction, bound once with the trimmed tenant id.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(TENANT_CONTEXT_SET_CONFIG_SQL, [
      'tenant-1',
    ]);

    // Binding happened before the first protected read (recipe versions).
    expect(callOrder[0]).toBe('bind');
    expect(callOrder[1]).toBe('find-recipe-versions');

    // Every protected repository came from the transaction manager.
    expect(manager.getRepository).toHaveBeenCalledWith(RecipeVersion);
    expect(manager.getRepository).toHaveBeenCalledWith(
      LegacyOnboardingMigrationReceipt,
    );
    expect(manager.getRepository).toHaveBeenCalledWith(OnboardingSession);
    expect(manager.getRepository).toHaveBeenCalledWith(InvoiceItem);

    expect(report.scannedCount).toBe(1);
  });

  it('propagates a tenant-context binding failure without any writes', async () => {
    const activeRv = makeRecipeVersion('legacy-rv-1', 'Capuchino 8oz',
      RecipeOrigin.INDUSTRY_TEMPLATE);
    recipeVersionRepo.find = jest.fn().mockResolvedValue([activeRv]);
    manager.query.mockRejectedValue(new Error('set_config failed'));

    await expect(service.scanAndRemediate('tenant-1')).rejects.toThrow(
      'set_config failed',
    );
    expect(recipeVersionRepo.save).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  it('propagates a transaction-open failure without any writes', async () => {
    dataSource.transaction.mockRejectedValue(
      new Error('cannot open transaction'),
    );

    await expect(service.scanAndRemediate('tenant-1')).rejects.toThrow(
      'cannot open transaction',
    );
    expect(recipeVersionRepo.find).not.toHaveBeenCalled();
    expect(recipeVersionRepo.save).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  it('safely migrates unused template recipe on non-operational tenant to DRAFT with MOVE_TO_DRAFT receipt', async () => {
    const activeRv = makeRecipeVersion('legacy-rv-1', 'Capuchino 8oz',
      RecipeOrigin.INDUSTRY_TEMPLATE);

    recipeVersionRepo.find = jest.fn().mockResolvedValue([activeRv]);
    sessionRepo.findOne = jest.fn().mockResolvedValue({
      activatedAt: null,
      firstSuccessfulSaleAt: null,
    } as any);
    invoiceItemRepo.count = jest.fn().mockResolvedValue(0);

    const report = await service.scanAndRemediate('tenant-1');

    expect(report.scannedCount).toBe(1);
    expect(report.receipts).toHaveLength(1);
    expect(report.receipts[0].decision).toBe(
      LegacyMigrationDecision.MOVE_TO_DRAFT,
    );

    expect(activeRv.is_active).toBe(false);
    expect(activeRv.publication_state).toBe(RecipePublicationState.DRAFT);
    expect(activeRv.suggestion_state).toBe(RecipeSuggestionState.SUGGESTED);
    expect(recipeVersionRepo.save).toHaveBeenCalledWith(activeRv);
  });

  it('never silently mutates an active recipe on an operational tenant, issuing KEEP_PUBLISHED receipt', async () => {
    const activeRv = makeRecipeVersion('legacy-rv-2', 'Capuchino 8oz',
      RecipeOrigin.INDUSTRY_TEMPLATE, 'tenant-operational');

    recipeVersionRepo.find = jest.fn().mockResolvedValue([activeRv]);
    sessionRepo.findOne = jest.fn().mockResolvedValue({
      activatedAt: new Date(),
      firstSuccessfulSaleAt: new Date(),
    } as any);
    invoiceItemRepo.count = jest.fn().mockResolvedValue(15); // Has historical sales

    const report = await service.scanAndRemediate('tenant-operational');

    expect(report.scannedCount).toBe(1);
    expect(report.receipts[0].decision).toBe(
      LegacyMigrationDecision.KEEP_PUBLISHED,
    );
    expect(activeRv.is_active).toBe(true); // NOT MUTATED!
    expect(activeRv.publication_state).toBe(RecipePublicationState.PUBLISHED);
    expect(recipeVersionRepo.save).not.toHaveBeenCalled();
  });

  it('marks unknown provenance as UNKNOWN_PROVENANCE without mutating', async () => {
    const customRv = makeRecipeVersion('custom-rv-3', 'Plato Personalizado Secreto',
      RecipeOrigin.MANUAL);

    recipeVersionRepo.find = jest.fn().mockResolvedValue([customRv]);
    sessionRepo.findOne = jest.fn().mockResolvedValue(null);
    invoiceItemRepo.count = jest.fn().mockResolvedValue(0);

    const report = await service.scanAndRemediate('tenant-1');

    expect(report.receipts[0].decision).toBe(
      LegacyMigrationDecision.UNKNOWN_PROVENANCE,
    );
    expect(customRv.is_active).toBe(true);
    expect(recipeVersionRepo.save).not.toHaveBeenCalled();
  });

  it('honors explicit user decision to MOVE_TO_DRAFT even on operational tenant', async () => {
    const activeRv = makeRecipeVersion('legacy-rv-op', 'Capuchino 8oz',
      RecipeOrigin.INDUSTRY_TEMPLATE);

    recipeVersionRepo.find = jest.fn().mockResolvedValue([activeRv]);
    sessionRepo.findOne = jest.fn().mockResolvedValue({
      activatedAt: new Date(),
      firstSuccessfulSaleAt: new Date(),
    } as any);
    invoiceItemRepo.count = jest.fn().mockResolvedValue(5);

    const report = await service.scanAndRemediate('tenant-1', {
      userDecision: {
        recipeVersionId: 'legacy-rv-op',
        decision: LegacyMigrationDecision.MOVE_TO_DRAFT,
        reason: 'Owner requested recipe redesign',
        userId: 'user-owner-1',
      },
    });

    expect(report.receipts[0].decision).toBe(
      LegacyMigrationDecision.MOVE_TO_DRAFT,
    );
    expect(activeRv.is_active).toBe(false);
    expect(activeRv.publication_state).toBe(RecipePublicationState.DRAFT);
    expect(receiptRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        executed_by: 'user-owner-1',
      }),
    );
  });
});
