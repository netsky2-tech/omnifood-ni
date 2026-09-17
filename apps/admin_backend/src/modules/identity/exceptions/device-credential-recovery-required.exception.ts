import { HttpStatus, ConflictException } from '@nestjs/common';

export const DEVICE_RECOVERY_REQUIRED_CODE = 'DEVICE_RECOVERY_REQUIRED';

export class DeviceCredentialRecoveryRequiredException extends ConflictException {
  readonly code = DEVICE_RECOVERY_REQUIRED_CODE;

  constructor(
    message = 'Device credential requires explicit recovery; auto-bootstrap is blocked',
  ) {
    super({
      statusCode: HttpStatus.CONFLICT,
      error: DEVICE_RECOVERY_REQUIRED_CODE,
      code: DEVICE_RECOVERY_REQUIRED_CODE,
      message,
    });
  }
}
