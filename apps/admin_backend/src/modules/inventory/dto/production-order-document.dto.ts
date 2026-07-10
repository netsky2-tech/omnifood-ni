import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const PRODUCTION_CLOSE_OUTCOME = {
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  INTERRUPTED: 'INTERRUPTED',
} as const;

export type ProductionCloseOutcome =
  (typeof PRODUCTION_CLOSE_OUTCOME)[keyof typeof PRODUCTION_CLOSE_OUTCOME];

export const PRODUCTION_FAILURE_REASON = {
  DESECHO_COCINA: 'DESECHO_COCINA',
} as const;

export type ProductionFailureReason =
  (typeof PRODUCTION_FAILURE_REASON)[keyof typeof PRODUCTION_FAILURE_REASON];

@ValidatorConstraint({ name: 'failedOrInterruptedHasZeroOutput' })
class FailedOrInterruptedHasZeroOutput implements ValidatorConstraintInterface {
  validate(actualQuantity: number, args: ValidationArguments): boolean {
    const document = args.object as ProductionOrderDocumentDto;
    const isFailedOutput =
      document.outcome === PRODUCTION_CLOSE_OUTCOME.FAILED ||
      document.outcome === PRODUCTION_CLOSE_OUTCOME.INTERRUPTED;

    return !isFailedOutput || actualQuantity === 0;
  }

  defaultMessage(): string {
    return 'failed or interrupted production close must have zero finished output';
  }
}

@ValidatorConstraint({ name: 'failureReasonMatchesOutcome' })
class FailureReasonMatchesOutcome implements ValidatorConstraintInterface {
  validate(
    failureReason: ProductionFailureReason | undefined,
    args: ValidationArguments,
  ): boolean {
    const document = args.object as ProductionOrderDocumentDto;

    if (document.outcome === PRODUCTION_CLOSE_OUTCOME.COMPLETED) {
      return failureReason === undefined;
    }

    return failureReason === PRODUCTION_FAILURE_REASON.DESECHO_COCINA;
  }

  defaultMessage(args: ValidationArguments): string {
    const document = args.object as ProductionOrderDocumentDto;

    if (document.outcome === PRODUCTION_CLOSE_OUTCOME.COMPLETED) {
      return 'failureReason is only valid for failed or interrupted production close';
    }

    return 'failureReason must be one of the following values: DESECHO_COCINA';
  }
}

export class ProductionOrderDocumentDto {
  @IsString()
  @IsNotEmpty({ message: 'id must not be empty' })
  @Matches(/\S/, { message: 'id must not be empty' })
  id: string;

  @IsString()
  @IsNotEmpty({ message: 'recipeVersionId must not be empty' })
  @Matches(/\S/, { message: 'recipeVersionId must not be empty' })
  recipeVersionId: string;

  @IsString()
  @IsNotEmpty({ message: 'producedInsumoId must not be empty' })
  @Matches(/\S/, { message: 'producedInsumoId must not be empty' })
  producedInsumoId: string;

  @IsString()
  @IsNotEmpty({ message: 'producedBatchNumber must not be empty' })
  @Matches(/\S/, { message: 'producedBatchNumber must not be empty' })
  producedBatchNumber: string;

  @IsDateString()
  producedExpirationDate: string;

  @IsNumber()
  @Min(0)
  plannedQuantity: number;

  @IsNumber()
  @Min(0)
  @Validate(FailedOrInterruptedHasZeroOutput)
  actualQuantity: number;

  @IsIn(Object.values(PRODUCTION_CLOSE_OUTCOME))
  outcome: ProductionCloseOutcome;

  @Transform(({ value }: { value: unknown }): unknown =>
    value === null ? undefined : value,
  )
  @Validate(FailureReasonMatchesOutcome)
  failureReason?: ProductionFailureReason;

  @IsString()
  @IsNotEmpty({ message: 'terminalId must not be empty' })
  @Matches(/\S/, { message: 'terminalId must not be empty' })
  terminalId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sourceSequence: number;

  @IsString()
  @IsNotEmpty({ message: 'idempotencyKey must not be empty' })
  @Matches(/\S/, { message: 'idempotencyKey must not be empty' })
  idempotencyKey: string;

  @IsString()
  @IsNotEmpty({ message: 'payloadHash must not be empty' })
  @Matches(/\S/, { message: 'payloadHash must not be empty' })
  payloadHash: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalConsumedCostNio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  producedUnitCostNio?: number;

  @IsOptional()
  @IsString()
  varianceReason?: string;

  @IsDateString()
  operationDate: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true, message: 'movementReferences must not be empty' })
  @Matches(/\S/, {
    each: true,
    message: 'movementReferences must not be empty',
  })
  movementReferences: string[];
}
