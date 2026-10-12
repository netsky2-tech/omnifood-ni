import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ACCOUNT_THROTTLER_NAME,
  DEVICE_SYNC_TOKEN_PER_IP_LIMIT,
  IP_THROTTLER_NAME,
  THROTTLE_TTL_MS,
} from '../security/auth-throttle.config';
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
  // Pre-auth credential seam: bound per IP so token renewal cannot be
  // hammered (see security audit remediation S1). No account bucket: the
  // body carries device credential material, not a user identity.
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [ACCOUNT_THROTTLER_NAME]: true })
  @Throttle({
    [IP_THROTTLER_NAME]: {
      limit: DEVICE_SYNC_TOKEN_PER_IP_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
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
