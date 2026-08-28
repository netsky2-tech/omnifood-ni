import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class AdjustPointsDto {
  @IsNotEmpty()
  @IsNumber()
  points_delta: number; // positive to add points, negative to deduct

  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  invoice_id?: string;
}
