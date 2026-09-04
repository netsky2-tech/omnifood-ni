export enum OnboardingTelemetryEventName {
  ONBOARDING_STARTED = 'ONBOARDING_STARTED',
  SESSION_RESUMED = 'SESSION_RESUMED',
  STEP_VIEWED = 'STEP_VIEWED',
  STEP_COMPLETED_OBSERVED = 'STEP_COMPLETED_OBSERVED',
  STEP_SKIPPED = 'STEP_SKIPPED',
  TEMPLATE_PREVIEWED = 'TEMPLATE_PREVIEWED',
  TEMPLATE_APPLY_RESULT = 'TEMPLATE_APPLY_RESULT',
  IMPORT_STARTED = 'IMPORT_STARTED',
  IMPORT_VALIDATED = 'IMPORT_VALIDATED',
  IMPORT_COMMIT_RESULT = 'IMPORT_COMMIT_RESULT',
  IMPORT_FAILED = 'IMPORT_FAILED',
  SALE_READY_REACHED = 'SALE_READY_REACHED',
  ACTIVATION_STARTED = 'ACTIVATION_STARTED',
  ACTIVATION_CHECK_FAILED = 'ACTIVATION_CHECK_FAILED',
  ACTIVATION_WARNING = 'ACTIVATION_WARNING',
  ACTIVATION_RESULT = 'ACTIVATION_RESULT',
  FIRST_SUCCESSFUL_SALE = 'FIRST_SUCCESSFUL_SALE',
  FIRST_CUSTOMER_SALE = 'FIRST_CUSTOMER_SALE',
  BOH_READINESS_CHANGED = 'BOH_READINESS_CHANGED',
}

export enum OnboardingStepCategory {
  REQUIRED = 'REQUIRED',
  OPTIONAL = 'OPTIONAL',
}

export const ONBOARDING_STEP_DEFINITIONS: Record<
  string,
  { category: OnboardingStepCategory; description: string }
> = {
  // Required blocking steps: CANNOT BE SKIPPED
  FISCAL_SETUP: {
    category: OnboardingStepCategory.REQUIRED,
    description: 'Fiscal baseline configuration (DGI)',
  },
  PRODUCT_CATALOG: {
    category: OnboardingStepCategory.REQUIRED,
    description: 'Sellable product catalog creation (template/import/manual)',
  },
  ACTIVATION_VERIFICATION_SALE: {
    category: OnboardingStepCategory.REQUIRED,
    description: 'Controlled offline verification sale in POS',
  },

  // Optional / postponable steps: CAN BE SKIPPED
  BOH_INVENTORY: {
    category: OnboardingStepCategory.OPTIONAL,
    description: 'Progressive backoffice inventory warehouses & stock loading',
  },
  BOH_COSTING: {
    category: OnboardingStepCategory.OPTIONAL,
    description: 'Progressive costing & Kardex initialization',
  },
  BOH_OPERATIONS: {
    category: OnboardingStepCategory.OPTIONAL,
    description: 'Additional staff, recipes, and suppliers',
  },
  RECIPES: {
    category: OnboardingStepCategory.OPTIONAL,
    description: 'Detailed bill of materials and recipe versions',
  },
  STAFF_ENRICHMENT: {
    category: OnboardingStepCategory.OPTIONAL,
    description: 'Cashiers and managers user accounts',
  },
};

export interface IngestTelemetryEventDto {
  tenantId: string;
  eventName: OnboardingTelemetryEventName;
  sessionId?: string;
  stepId?: string;
  durationMs?: number;
  counts?: Record<string, number>;
  properties?: Record<string, any>;
  errorSanitizedCode?: string;
  occurredAt?: string;
}

export interface TelemetryIngestReceipt {
  eventId: string;
  eventName: OnboardingTelemetryEventName;
  tenantId: string;
  accepted: boolean;
  sanitized: boolean;
  occurredAt: string;
}
