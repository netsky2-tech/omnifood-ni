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

  @IsObject()
  @IsNotEmptyObject()
  topology: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  hash: string;
}
