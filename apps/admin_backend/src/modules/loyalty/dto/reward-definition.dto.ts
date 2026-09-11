import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsDateString,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RewardType } from '../entities/reward-definition.entity';

class BenefitConfigDto {
  @IsOptional()
  amountNio?: number;

  @IsOptional()
  productId?: string;

  @IsOptional()
  variantId?: string;

  @IsOptional()
  quantity?: number;
}

export class CreateRewardDefinitionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RewardType)
  reward_type: RewardType;

  @IsInt()
  @Min(1)
  cost_units: number;

  @IsObject()
  @ValidateNested()
  @Type(() => BenefitConfigDto)
  benefit_config: BenefitConfigDto;

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsOptional()
  @IsInt()
  presentation_order?: number;
}

export class UpdateRewardDefinitionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cost_units?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BenefitConfigDto)
  benefit_config?: BenefitConfigDto;

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsOptional()
  @IsInt()
  presentation_order?: number;
}
