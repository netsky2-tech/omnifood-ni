import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
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
