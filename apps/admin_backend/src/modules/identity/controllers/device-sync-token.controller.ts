import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeviceSyncCredentialService,
  RenewTokenResponse,
} from '../services/device-sync-credential.service';
import { RenewDeviceTokenDto } from '../dto/renew-device-token.dto';
import { DeviceCredentialRevokedException } from '../exceptions/device-credential-revoked.exception';

/**
 * Dedicated device sync token renewal controller.
 * Implements the server-side seam for POS DeviceSyncExchangePort.
 *
 * Security Guarantees:
 * - NO human AuthGuard, RolesGuard, or session dependency.
 * - Only exchanges valid renewal credential material for short-lived device sync access JWTs.
 * - Does not permit user, admin, report, or impersonation scopes.
 * - Sanitizes errors: errors do not leak credential verifiers, hash material, or internal tenant state.
 * - Maps revoked credentials via typed DeviceCredentialRevokedException to explicit stable code DEVICE_REVOKED for client revocation handling.
 */
@Controller('identity/device-sync')
export class DeviceSyncTokenController {
  constructor(
    private readonly deviceSyncCredentialService: DeviceSyncCredentialService,
  ) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  async renewToken(
    @Body() dto: RenewDeviceTokenDto,
  ): Promise<RenewTokenResponse> {
    try {
      return await this.deviceSyncCredentialService.renewAccessToken(dto);
    } catch (err) {
      if (err instanceof DeviceCredentialRevokedException) {
        throw new UnauthorizedException({
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'DEVICE_REVOKED',
          code: 'DEVICE_REVOKED',
          message: 'Device credential is revoked',
        });
      }
      throw err;
    }
  }
}
