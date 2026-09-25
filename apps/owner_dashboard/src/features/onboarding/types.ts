export const OnboardingLifecycleState = {
  PROVISIONED: "PROVISIONED",
  SETUP_IN_PROGRESS: "SETUP_IN_PROGRESS",
  SALE_READY: "SALE_READY",
  ACTIVATION_IN_PROGRESS: "ACTIVATION_IN_PROGRESS",
  ACTIVATED: "ACTIVATED",
} as const;

export type OnboardingLifecycleState =
  (typeof OnboardingLifecycleState)[keyof typeof OnboardingLifecycleState];

export interface OnboardingSession {
  id: string;
  tenantId: string;
  lifecycleState: OnboardingLifecycleState;
  onboardingStartedAt: string | null;
  saleReadyFirstAt: string | null;
  activationStartedAt: string | null;
  activatedAt: string | null;
  firstSuccessfulSaleAt: string | null;
  firstCustomerSaleAt: string | null;
  lastActivityAt: string | null;
  currentActivationAttemptId: string | null;
  measurementEligible: boolean;
  legacyBaseline: boolean;
  optimisticVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityReadinessResult {
  tenantExists: boolean;
  initialOwnerExists: boolean;
  ownerCanAuthenticate: boolean;
  tenantContextValid: boolean;
}

export interface FiscalReadinessResult {
  minimumConfigurationValid: boolean;
  businessName?: string;
  fiscalRegime?: string;
  taxRate?: number;
  pricesIncludeTax?: boolean;
}

export interface CatalogReadinessResult {
  sellableProductCount: number;
  hasSellableProduct: boolean;
}

export type CostStateKind = "KNOWN" | "COST_PENDING" | "NOT_APPLICABLE";

export interface ProductCostState {
  productId: string;
  productName: string;
  state: CostStateKind;
  value?: number;
  reason?: string;
  provenance?: string;
}

export interface InventoryReadinessResult {
  inventoryReady: boolean;
  scope: "NONE" | "BASIC" | "ADVANCED";
  warehouseCount: number;
  trackedProductCount: number;
  trackedInsumoCount: number;
  itemsWithStockCount: number;
  hasDefaultWarehouse: boolean;
  notes?: string[];
}

export interface CostingReadinessResult {
  costingReady: boolean;
  totalProducts: number;
  knownCostCount: number;
  pendingCostCount: number;
  notApplicableCount: number;
  items?: ProductCostState[];
}

export interface OperationsReadinessDetails {
  hasAdditionalStaff: boolean;
  hasPublishedRecipes: boolean;
  hasSuppliers: boolean;
  hasCategories: boolean;
}

export interface OperationsReadinessResult {
  operationsReady: boolean;
  staffCount: number;
  additionalStaffCount: number;
  publishedRecipeCount: number;
  supplierCount: number;
  categoryCount: number;
  details?: OperationsReadinessDetails;
  notes?: string[];
}

export interface OnboardingReadinessSnapshot {
  identity: IdentityReadinessResult;
  fiscal: FiscalReadinessResult;
  catalog: CatalogReadinessResult;
  inventory?: InventoryReadinessResult;
  costing?: CostingReadinessResult;
  operations?: OperationsReadinessResult;
  saleReady: boolean;
  inventoryReady: boolean;
  costingReady: boolean;
  operationsReady: boolean;
  blockers: string[];
  warnings: string[];
  evaluatedAt: string;
}

export interface OnboardingSessionResponse {
  session: OnboardingSession;
  readiness: OnboardingReadinessSnapshot;
}

export type OnboardingStepKey = "identity" | "fiscal" | "catalog" | "activation";

export type OnboardingStepStatus = "COMPLETED" | "IN_PROGRESS" | "BLOCKED" | "NOT_STARTED";

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  isRequired: boolean;
  blockers: string[];
  actionKey: OnboardingStepKey;
  actionLabel?: string;
}

export interface SetupCenterProgress {
  currentLifecycle: OnboardingLifecycleState;
  steps: OnboardingStep[];
  completedStepsCount: number;
  totalStepsCount: number;
  percentage: number;
  nextRecommendedAction: {
    actionKey: OnboardingStepKey;
    label: string;
    description: string;
  };
  isSaleReady: boolean;
  isLegacyBaseline: boolean;
  isMeasurementEligible: boolean;
  saleReadyFirstAt?: string | null;
  optimisticVersion: number;
  blockers: string[];
  warnings: string[];
}

export interface CreateManualProductDto {
  name: string;
  sellPrice: number;
  uom?: string;
  category_code?: string;
}

export type CostReadinessStatus = "COST_PENDING" | "CONFIGURED";

export interface OnboardingCatalogProductSummary {
  id: string;
  name: string;
  sellPrice: number;
  uom: string;
  category_code?: string | null;
  costStatus: CostReadinessStatus;
  is_active: boolean;
}

export interface OnboardingManualProductResponse {
  product: OnboardingCatalogProductSummary;
  session: OnboardingSession;
  readiness: OnboardingReadinessSnapshot;
}

export interface OnboardingCatalogSummaryResponse {
  sellableProductCount: number;
  hasSellableProduct: boolean;
  sampleProducts: OnboardingCatalogProductSummary[];
}

/**
 * Activation attempt status vocabulary, verified against the backend entity
 * `ActivationAttemptStatus` in
 * apps/admin_backend/src/modules/onboarding/entities/activation-attempt.entity.ts.
 */
export const ActivationAttemptStatus = {
  CREATED: "CREATED",
  IN_PROGRESS: "IN_PROGRESS",
  PASS: "PASS",
  PASS_WITH_WARNING: "PASS_WITH_WARNING",
  FAIL: "FAIL",
} as const;

export type ActivationAttemptStatus =
  (typeof ActivationAttemptStatus)[keyof typeof ActivationAttemptStatus];

/**
 * Activation attempt as consumed by the owner dashboard. The backend response
 * carries more fields (fiscal revision/fingerprint, verification product
 * metadata, evidence, timestamps); only the fields the dashboard actually
 * consumes are declared here.
 */
export interface ActivationAttempt {
  id: string;
  tenantId: string;
  onboardingSessionId: string;
  candidateTerminalId: string;
  trustedTerminalId: string | null;
  status: ActivationAttemptStatus;
  startedByUserId: string;
  startedAt: string;
  completedAt: string | null;
  posBuild: string | null;
  warningsCount: number;
  failureCode: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response of POST /onboarding/activation/linking-codes, matched against the
 * backend contract in apps/admin_backend/src/modules/onboarding/:
 * DeviceLinkingController.generateLinkingCode returns exactly
 * `{ code, expiresAt }` (GenerateLinkingCodeResult in
 * services/device-linking.service.ts). The plaintext code is returned exactly
 * ONCE — only its bcrypt hash is persisted server-side — and `expiresAt`
 * serializes as an ISO string over JSON. There is no `id` field.
 */
export interface GenerateLinkingCodeResponse {
  code: string;
  expiresAt: string;
}

/**
 * Body for POST /onboarding/activation/attempts. The backend accepts exactly
 * these whitelisted fields (global validation pipe: whitelist +
 * forbidNonWhitelisted). Tenant and actor identity come from the JWT and must
 * never be sent.
 */
export interface StartActivationDto {
  candidateTerminalId: string;
  verificationProductId?: string;
  idempotencyKey?: string;
  posBuild?: string;
}
