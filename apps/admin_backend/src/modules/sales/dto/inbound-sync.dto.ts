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

export interface InboundSyncDeltasDto {
  products: InboundSyncProductDto[];
  catalogValues: InboundSyncCatalogValueDto[];
  insumos: InboundSyncInsumoDto[];
  recipes: InboundSyncRecipeDto[];
  recipeVersions: InboundSyncRecipeVersionDto[];
  users: InboundSyncUserDto[];
  fiscalConfig?: FiscalConfigSnapshot | null;
}

export interface InboundSyncResponseDto {
  status: 'success';
  serverTime: string;
  currentVersion: number;
  deltas: InboundSyncDeltasDto;
  fiscalConfig?: FiscalConfigSnapshot | null;
}
