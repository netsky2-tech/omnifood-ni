import { IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LoyaltyTicketSnapshotDto } from './loyalty-ticket.dto';

export class CreateRedemptionIntentDto {
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @IsNotEmpty()
  @IsString()
  ticketId: string;

  @IsNotEmpty()
  @IsString()
  loyaltyProgramId: string;

  @IsNotEmpty()
  @IsString()
  rewardId: string;
}

export class ConsolidateRedemptionDto {
  @IsNotEmpty()
  @IsString()
  intentId: string;

  @ValidateNested()
  @Type(() => LoyaltyTicketSnapshotDto)
  snapshot: LoyaltyTicketSnapshotDto;
}

export class ReverseTicketLoyaltyDto {
  @IsNotEmpty()
  @IsString()
  ticketId: string;

  @IsNotEmpty()
  @IsString()
  customerId: string;
}

export class ManualLoyaltyAdjustmentDto {
  @IsNotEmpty()
  @IsString()
  loyaltyProgramId: string;

  @IsNotEmpty()
  @IsNumber()
  units: number;

  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  ticketId?: string;
}
