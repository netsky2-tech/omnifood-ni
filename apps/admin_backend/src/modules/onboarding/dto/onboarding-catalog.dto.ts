import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { OnboardingSession } from '../entities/onboarding-session.entity';
import { OnboardingReadinessSnapshot } from '../services/onboarding-readiness.evaluator';

export class CreateManualProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product name must not be empty' })
  @MaxLength(200)
  name: string;

  @IsNumber()
  @Min(0.01, { message: 'sellPrice must be greater than 0' })
  sellPrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  uom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category_code?: string;
}

export type CostReadinessStatus = 'COST_PENDING' | 'CONFIGURED';

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
