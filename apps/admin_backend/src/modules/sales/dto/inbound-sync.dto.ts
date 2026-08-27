import { IsOptional, IsString } from 'class-validator';

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
  createdAt: Date;
  updatedAt: Date;
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
  productId: string;
  ingredientId: string;
  ingredientType: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InboundSyncRecipeVersionDto {
  id: string;
  productId: string;
  versionNumber: number;
  isActive: boolean;
  yieldQuantity: number;
  technicalShrinkPct: number;
  versionNote?: string | null;
  publishedAt?: Date | null;
  createdAt: Date;
}

export interface InboundSyncDeltasDto {
  products: InboundSyncProductDto[];
  catalogValues: InboundSyncCatalogValueDto[];
  insumos: InboundSyncInsumoDto[];
  recipes: InboundSyncRecipeDto[];
  recipeVersions: InboundSyncRecipeVersionDto[];
  users: InboundSyncUserDto[];
}

export interface InboundSyncResponseDto {
  status: 'success';
  serverTime: string;
  currentVersion: number;
  deltas: InboundSyncDeltasDto;
}
