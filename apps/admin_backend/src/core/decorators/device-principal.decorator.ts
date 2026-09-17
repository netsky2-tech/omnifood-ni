import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeviceSyncPrincipal,
  isDeviceSyncPrincipal,
} from '../../modules/identity/security/device-sync-principal';

interface RequestWithDevicePrincipal {
  readonly devicePrincipal?: unknown;
}

/**
 * Resolves the device sync principal that SyncTransportGuard validates and
 * sets on request.devicePrincipal, so the decorated handler runs on the
 * authenticated device transport.
 *
 * Fails closed: throws UnauthorizedException when the principal is absent or
 * is not a validated DEVICE_SYNC principal. It never returns undefined,
 * because a caller that forgets to check would then run without
 * authoritative identity.
 *
 * principal.deviceId is the canonical terminal identity per design §4.1
 * rule 2; consumers read it directly from the resolved principal.
 */
export const GetDevicePrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DeviceSyncPrincipal => {
    const request = ctx.switchToHttp().getRequest<RequestWithDevicePrincipal>();
    const candidate = request?.devicePrincipal;
    if (!isDeviceSyncPrincipal(candidate)) {
      throw new UnauthorizedException(
        'A validated DEVICE_SYNC principal from SyncTransportGuard is required',
      );
    }
    return candidate;
  },
);
