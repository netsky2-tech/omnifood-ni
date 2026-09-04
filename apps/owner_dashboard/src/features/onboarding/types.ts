export enum OnboardingLifecycleState {
  PROVISIONED = "PROVISIONED",
  SETUP_IN_PROGRESS = "SETUP_IN_PROGRESS",
  SALE_READY = "SALE_READY",
  ACTIVATION_IN_PROGRESS = "ACTIVATION_IN_PROGRESS",
  ACTIVATED = "ACTIVATED",
}

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
