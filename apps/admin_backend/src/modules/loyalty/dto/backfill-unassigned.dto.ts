import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const BACKFILL_UNASSIGNED_DEFAULT_BATCH_SIZE = 200;

/**
 * B1b: batch size for the unassigned point-transactions backfill. The batch
 * bounds how many DISTINCT customers with `loyalty_program_id IS NULL` rows
 * are scanned (and, on commit, attributed) per invocation.
 */
export class BackfillUnassignedDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  batchSize: number = BACKFILL_UNASSIGNED_DEFAULT_BATCH_SIZE;
}
