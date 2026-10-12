import { IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export const ALLOWED_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'] as const;
export type AllowedAbi = (typeof ALLOWED_ABIS)[number];

export class LatestReleaseQueryDto {
  @IsOptional()
  @IsString()
  channel?: string = 'pilot';

  @IsNotEmpty()
  @IsString()
  @IsIn(ALLOWED_ABIS, {
    message: 'abi must be one of: arm64-v8a, armeabi-v7a, x86_64, x86',
  })
  abi: AllowedAbi;

  @IsOptional()
  @Type(() => Number)
  currentVersionCode?: number;
}
