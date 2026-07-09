import { IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CreateShrinkageDto {
  @IsUUID()
  insumoId: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsString()
  reason: string;

  @IsString()
  observation: string;
}
