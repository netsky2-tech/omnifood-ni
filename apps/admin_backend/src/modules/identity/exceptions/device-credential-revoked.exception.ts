import { HttpStatus, UnauthorizedException } from '@nestjs/common';

export const DEVICE_REVOKED_CODE = 'DEVICE_REVOKED';

export class DeviceCredentialRevokedException extends UnauthorizedException {
  readonly code = DEVICE_REVOKED_CODE;

  constructor(message = 'Device credential is revoked') {
    super({
      statusCode: HttpStatus.UNAUTHORIZED,
      error: DEVICE_REVOKED_CODE,
      code: DEVICE_REVOKED_CODE,
      message,
    });
  }
}
