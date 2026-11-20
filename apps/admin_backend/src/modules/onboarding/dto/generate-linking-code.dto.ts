import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
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

  /**
   * Optional existing terminalId being replaced after a factory reset (#566).
   * When set, claiming this code preserves `replacesTerminalId` as the
   * terminal's canonical deviceId and opens an approved reactivation challenge.
   */
  @IsOptional()
  @IsString()
  @Length(1, 128)
  replacesTerminalId?: string;
}
