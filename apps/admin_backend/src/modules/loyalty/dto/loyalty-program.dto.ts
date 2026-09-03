import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  IsObject,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  LoyaltyProgramType,
  LoyaltyProgramStatus,
} from '../entities/loyalty-program.entity';

class EarningRuleDto {
  @IsOptional()
  spendBlockNio?: number;

  @IsOptional()
  pointsPerBlock?: number;

  @IsOptional()
  eligibleProductIds?: string[];

  @IsOptional()
  eligibleCategoryIds?: string[];

  @IsOptional()
  unitsPerPurchasedUnit?: number;

  @IsOptional()
  minimumSpendNio?: number;

  @IsOptional()
  unitsPerVisit?: number;
}

class EligibilityRuleDto {
  @IsOptional()
  minimumTicketTotal?: number;

  @IsOptional()
  requiresCustomer?: boolean;
}

export class CreateLoyaltyProgramDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(LoyaltyProgramType)
  program_type: LoyaltyProgramType;

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => EarningRuleDto)
  earning_rule: EarningRuleDto;

  @IsObject()
  @ValidateNested()
  @Type(() => EligibilityRuleDto)
  eligibility_rule: EligibilityRuleDto;
}

export class UpdateLoyaltyProgramDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsDateString()
  starts_at?: string;

  @IsOptional()
  @IsDateString()
  ends_at?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EarningRuleDto)
  earning_rule?: EarningRuleDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EligibilityRuleDto)
  eligibility_rule?: EligibilityRuleDto;
}
