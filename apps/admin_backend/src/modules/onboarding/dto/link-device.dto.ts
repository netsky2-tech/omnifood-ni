import { IsString, Length } from 'class-validator';

export class LinkDeviceDto {
  /** The plaintext code as entered on the POS; normalized server-side. */
  @IsString()
  @Length(1, 64)
  code!: string;

  /** The claiming device's identity; stored on the code row at claim time. */
  @IsString()
  @Length(1, 128)
  deviceId!: string;
}
