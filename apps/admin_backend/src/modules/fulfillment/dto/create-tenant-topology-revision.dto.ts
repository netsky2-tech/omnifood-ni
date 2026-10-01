import {
  IsInt,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsString,
  Min,
} from 'class-validator';

export class CreateTenantTopologyRevisionDto {
  @IsInt()
  @Min(0)
  baseRevision: number;

  @IsInt()
  @Min(1)
  contractVersion: number;

  /**
   * Opaque topology document. Validated only as a non-empty object: its inner
   * shape belongs to the fulfillment domain, not to this DTO.
   *
   * In particular `topology.operationMode` is a free-form label here, and is
   * NOT the fiscal business-profile enum (`FOODPARK_QSR | RESTAURANT |
   * HYBRID`) that `fiscal-setup.dto.ts` validates and that rejects `FOOD_PARK`
   * as an unknown value. Nothing compares, converts, or derives one from the
   * other — the two channels never meet.
   *
   * Do not "unify" them by inferring this one from the fiscal channel: the
   * topology mode is explicitly owner-authored, and guessing it would
   * reintroduce the inferred defaults that were deliberately rejected (an
   * unprovisioned tenant is a compatibility state, not an assumed mode).
   */
  @IsObject()
  @IsNotEmptyObject()
  topology: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  hash: string;
}
