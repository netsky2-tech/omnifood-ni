import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { HARDWARE_FINGERPRINT_HEX_REGEX } from '../utils/terminal-recovery-code';

export class LinkDeviceDto {
  /** The plaintext code as entered on the POS; normalized server-side. */
  @IsString()
  @Length(1, 64)
  code!: string;

  /** The claiming device's identity; stored on the code row at claim time. */
  @IsString()
  @Length(1, 128)
  deviceId!: string;

  /** Optional SHA-256 hex hardware fingerprint (ANDROID_ID) for reinstall detection (#566). */
  @IsOptional()
  @IsString()
  @Matches(HARDWARE_FINGERPRINT_HEX_REGEX, {
    message: 'hardwareFingerprint must be a 64-character hex SHA-256 string',
  })
  hardwareFingerprint?: string;
}
