import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, IsDateString, IsArray, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MovementType } from '../entities/inventory-movement.entity';

export class CreateInventoryMovementDto {
  @IsUUID()
  id: string;

  @IsString()
  insumoId: string;

  @IsEnum(MovementType)
  type: MovementType;

  @IsNumber()
  quantity: number;

  @IsNumber()
  previousStock: number;

  @IsNumber()
  newStock: number;

  @IsDateString()
  timestamp: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class SyncMovementsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateInventoryMovementDto)
  movements: CreateInventoryMovementDto[];
}
