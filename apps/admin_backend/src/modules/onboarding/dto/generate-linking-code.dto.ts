import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  MAX_LINKING_EXPIRY_MINUTES,
  MIN_LINKING_EXPIRY_MINUTES,
} from '../services/device-linking.service';

export class GenerateLinkingCodeDto {
  /** Short-lived by design; defaults to 15 minutes server-side. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LINKING_EXPIRY_MINUTES)
  @Max(MAX_LINKING_EXPIRY_MINUTES)
  expiryMinutes?: number;
}
