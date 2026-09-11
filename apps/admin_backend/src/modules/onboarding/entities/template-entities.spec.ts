import {
  TemplateApplication,
  TemplateApplicationStatus,
} from './template-application.entity';
import {
  TemplateSeedLink,
  TemplateSourceItemType,
  TemplateTargetEntityType,
} from './template-seed-link.entity';
import {
  LegacyOnboardingMigrationReceipt,
  LegacyMigrationDecision,
} from './legacy-migration-receipt.entity';
import {
  RecipeVersion,
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
} from '../../inventory/entities/recipe-version.entity';
import { IndustryTemplate } from './industry-template.entity';

describe('Template Safe Cutover Entities', () => {
  it('instantiates TemplateApplication with defaults', () => {
    const app = new TemplateApplication();
    app.tenant_id = 'tenant-1';
    app.template_code = 'CAFETERIA';
    app.template_version = 1;
    app.selection_hash = 'hash-123';
    app.idempotency_key = 'idemp-123';
    app.status = TemplateApplicationStatus.APPLIED;

    expect(app.tenant_id).toBe('tenant-1');
    expect(app.template_code).toBe('CAFETERIA');
    expect(app.status).toBe(TemplateApplicationStatus.APPLIED);
  });

  it('instantiates TemplateSeedLink with provenance fields', () => {
    const link = new TemplateSeedLink();
    link.tenant_id = 'tenant-1';
    link.template_code = 'CAFETERIA';
    link.source_item_id = 'prod-1';
    link.source_item_type = TemplateSourceItemType.PRODUCT;
    link.target_entity_type = TemplateTargetEntityType.PRODUCT;
    link.target_entity_id = 'uuid-prod-1';
    link.first_applied_version = 1;
    link.last_seen_version = 1;
    link.last_applied_version = 1;
    link.last_source_fingerprint = 'fp-123';

    expect(link.source_item_id).toBe('prod-1');
    expect(link.last_source_fingerprint).toBe('fp-123');
  });

  it('instantiates LegacyOnboardingMigrationReceipt', () => {
    const receipt = new LegacyOnboardingMigrationReceipt();
    receipt.tenant_id = 'tenant-1';
    receipt.receipt_type = 'LEGACY_TEMPLATE_RECIPE_SCAN';
    receipt.target_entity_type = 'RECIPE_VERSION';
    receipt.target_entity_id = 'rv-uuid';
    receipt.decision = LegacyMigrationDecision.KEEP_PUBLISHED;
    receipt.reason = 'Active in production sales';

    expect(receipt.decision).toBe(LegacyMigrationDecision.KEEP_PUBLISHED);
  });

  it('verifies RecipeVersion has origin, publication_state, and suggestion_state enums/values', () => {
    const rv = new RecipeVersion();
    rv.origin = RecipeOrigin.INDUSTRY_TEMPLATE;
    rv.publication_state = RecipePublicationState.DRAFT;
    rv.suggestion_state = RecipeSuggestionState.SUGGESTED;
    rv.is_active = false;

    expect(rv.origin).toBe('INDUSTRY_TEMPLATE');
    expect(rv.publication_state).toBe('DRAFT');
    expect(rv.suggestion_state).toBe('SUGGESTED');
    expect(rv.is_active).toBe(false);
  });

  it('verifies IndustryTemplate has version and source_fingerprint', () => {
    const it = new IndustryTemplate();
    it.code = 'CAFETERIA';
    it.version = 1;
    it.source_fingerprint = 'fp-template-1';

    expect(it.version).toBe(1);
    expect(it.source_fingerprint).toBe('fp-template-1');
  });
});
