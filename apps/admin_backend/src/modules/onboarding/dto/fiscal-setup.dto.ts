import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export enum FiscalRegime {
  CUOTA_FIJA = 'CUOTA_FIJA',
  REGIMEN_GENERAL = 'REGIMEN_GENERAL',
}

export class FiscalSetupDto {
  @IsEnum(FiscalRegime, {
    message: 'regime must be either CUOTA_FIJA or REGIMEN_GENERAL',
  })
  regime: FiscalRegime;

  @IsString()
  @MinLength(1, { message: 'businessName must not be empty' })
  businessName: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsNumber()
  @Min(0, { message: 'commercialFxSpread must be greater than or equal to 0' })
  commercialFxSpread: number;

  @IsBoolean()
  pricesIncludeTax: boolean;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export interface FiscalSetupResponse {
  tenantId: string;
  businessName: string;
  ruc: string | null;
  regime: FiscalRegime;
  taxRateIva: number;
  pricesIncludeTax: boolean;
  commercialFxSpread: number;
  configuredAt?: Date;
}
