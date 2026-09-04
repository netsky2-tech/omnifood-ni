import { Repository } from 'typeorm';
import { LegacyTemplateRecipeScanService } from './legacy-template-recipe-scan.service';
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

    service = new LegacyTemplateRecipeScanService(
      recipeVersionRepo as any,
      receiptRepo as any,
      sessionRepo as any,
      invoiceItemRepo as any,
      templateRepo as any,
    );
  });

  it('safely migrates unused template recipe on non-operational tenant to DRAFT with MOVE_TO_DRAFT receipt', async () => {
    const activeRv: RecipeVersion = {
      id: 'legacy-rv-1',
      tenant_id: 'tenant-1',
      product_id: 'prod-1',
      product_name: 'Capuchino 8oz',
      version_number: 1,
      is_active: true,
      origin: RecipeOrigin.INDUSTRY_TEMPLATE,
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
    };

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
    const activeRv: RecipeVersion = {
      id: 'legacy-rv-2',
      tenant_id: 'tenant-operational',
      product_id: 'prod-1',
      product_name: 'Capuchino 8oz',
      version_number: 1,
      is_active: true,
      origin: RecipeOrigin.INDUSTRY_TEMPLATE,
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
    };

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
    const customRv: RecipeVersion = {
      id: 'custom-rv-3',
      tenant_id: 'tenant-1',
      product_id: 'prod-custom',
      product_name: 'Plato Personalizado Secreto',
      version_number: 1,
      is_active: true,
      origin: RecipeOrigin.MANUAL,
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
    };

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
    const activeRv: RecipeVersion = {
      id: 'legacy-rv-op',
      tenant_id: 'tenant-1',
      product_id: 'prod-1',
      product_name: 'Capuchino 8oz',
      version_number: 1,
      is_active: true,
      origin: RecipeOrigin.INDUSTRY_TEMPLATE,
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
    };

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

  it('throws BadRequestException if tenantId is empty', async () => {
    await expect(service.scanAndRemediate('   ')).rejects.toThrow(
      'Tenant ID is required',
    );
  });
});
