import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * G2a (issue #526 unit B5): optional inbound fiscal cursor on the priming
 * GET. Backwards compatible by design — the POS today sends no query params,
 * and an absent `proposedSequence` keeps byte-identical priming behavior.
 *
 * When present, the priming tripwire refuses the payload with
 * `FISCAL_SEQUENCE_RECOVERY_REQUIRED` if the cloud already holds an invoice
 * sequence greater than or equal to the proposal. The numeric coercion
 * follows the `GenerateLinkingCodeDto` query-param convention: query strings
 * arrive as strings and the global ValidationPipe (`transform: true`)
 * converts through `@Type(() => Number)`.
 */
export class TerminalPrimingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proposedSequence?: number;
}
