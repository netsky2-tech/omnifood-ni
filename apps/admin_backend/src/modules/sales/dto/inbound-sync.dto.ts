import { IsOptional, IsString } from 'class-validator';
import { FiscalConfigSnapshot } from '../../onboarding/dto/fiscal-config-version.dto';

export class InboundSyncQueryDto {
  @IsOptional()
  @IsString()
  sinceVersion?: string;

  @IsOptional()
  @IsString()
  since?: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsString()
  types?: string;

  /**
   * OHAC delivery negotiation (design §11.4 decision 25). All four are
   * optional, and a client that sends none of them keeps exactly its previous
   * behaviour: the authorization member is simply absent from the response.
   * An absent build means the client did not opt in; a present but empty one
   * means it opted in and cannot be served, which is answered explicitly.
   */
  @IsOptional()
  @IsString()
  ohacPosBuild?: string;

  @IsOptional()
  @IsString()
  ohacPolicySchemas?: string;

  @IsOptional()
  @IsString()
  ohacAssertionSchemas?: string;

  @IsOptional()
  @IsString()
  ohacFloorSequence?: string;
}

export interface InboundSyncSecurityProfileDto {
  isPinEnabled: boolean;
  isTotpEnabled: boolean;
  pinHash?: string | null;
}

export interface InboundSyncUserDto {
  id: string;
  name: string;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  securityProfile?: InboundSyncSecurityProfileDto | null;
}

export interface InboundSyncProductDto {
  id: string;
  name: string;
  uom: string;
  stock: number;
  averageCost: number;
  sellPrice: number;
  isActive: boolean;
  isPerishable: boolean;
  warehouseId?: string | null;
  productType?: string;
  mappingVersionId?: string | null;
  insumoId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  tenantId?: string;
}

export interface InboundSyncCatalogValueDto {
  id: string;
  catalogType: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundSyncInsumoDto {
  id: string;
  tenantId: string;
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  conversionFactor: number;
  stock: number;
  averageCost: number;
  isActive: boolean;
  isPerishable: boolean;
  negativeStockPolicy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundSyncRecipeDto {
  id: string;
  tenantId: string;
  productId: string;
  ingredientId: string;
  ingredientType: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundSyncRecipeVersionComponentDto {
  id: string;
  tenantId: string;
  /** Immutable parent link; consumers must not resolve through mutable recipes. */
  recipeVersionId: string;
  componentOrdinal: number;
  insumoId: string;
  quantityPerSaleUnit: number;
  grossQuantity: number;
  technicalShrinkPct: number;
  ingredientName: string | null;
  ingredientType: string;
  /** Null means the published component did not declare a UOM. */
  componentUom: string | null;
  referenceVersionId: string | null;
}

export interface InboundSyncRecipeVersionDto {
  /** The immutable version identity, repeated explicitly for safe linkage. */
  id: string;
  recipeVersionId: string;
  tenantId: string;
  productId: string;
  /** Immutable POS document identity when the version originated from POS. */
  recipeDocumentId: string | null;
  productName: string | null;
  versionNumber: number;
  isActive: boolean;
  publicationState: 'PUBLISHED';
  effectiveAt: Date;
  effectiveUntil: Date | null;
  yieldQuantity: number;
  technicalShrinkPct: number;
  versionNote: string | null;
  publishedAt: Date | null;
  posCreatedAt: Date | null;
  origin: string;
  suggestionState: string;
  createdAt: Date;
  components: InboundSyncRecipeVersionComponentDto[];
}

/**
 * One-way cloud-to-POS projection of one backend `forensic_alerts` row
 * (ST-05). The terminal derives lifecycle state from `resolvedAt`; the
 * backend deliberately does not fabricate acknowledged/note metadata it
 * does not have. The table carries no `updated_at`, so `createdAt` is the
 * only cursor field.
 */
export interface InboundSyncForensicAlertDto {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  actorRole: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface InboundSyncDeltasDto {
  products: InboundSyncProductDto[];
  catalogValues: InboundSyncCatalogValueDto[];
  insumos: InboundSyncInsumoDto[];
  recipes: InboundSyncRecipeDto[];
  recipeVersions: InboundSyncRecipeVersionDto[];
  users: InboundSyncUserDto[];
  /**
   * One-way cloud-to-POS forensic alert projection (ST-05). Optional in the
   * type like `fiscalConfig` — older envelope literals and consumers predate
   * it — but the service always populates it (empty when not requested).
   */
  alerts?: InboundSyncForensicAlertDto[];
  fiscalConfig?: FiscalConfigSnapshot | null;
}

/** Statuses the negotiation answers an opted-in client with (design §12). */
export type HumanAuthorizationDeliveryStatus =
  | 'DISABLED'
  | 'UPGRADE_REQUIRED'
  | 'RECOVERY_REQUIRED';

export interface HumanAuthorizationDeliveryDto {
  /**
   * `DELIVER` carries the next epoch this terminal is missing. The three
   * status values carry no epoch, because none of them is a policy to apply.
   */
  status: 'DELIVER' | HumanAuthorizationDeliveryStatus;
  epoch?: Record<string, unknown>;
  sequence?: string;
  digest?: string;
}

export interface InboundSyncResponseDto {
  status: 'success';
  serverTime: string;
  currentVersion: number;
  deltas: InboundSyncDeltasDto;
  fiscalConfig?: FiscalConfigSnapshot | null;
  /**
   * Present only when the terminal negotiated OHAC delivery and there is
   * something to answer: an epoch to apply, or an explicit non-delivery
   * status. Absent for a client that never opted in — and absent while the
   * terminal is already current, so absence never means `DISABLED`.
   */
  humanAuthorization?: HumanAuthorizationDeliveryDto;
}
