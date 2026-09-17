import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import {
  DEVICE_SYNC_JWT_CONFIG,
  type DeviceSyncJwtConfig,
} from '../config/device-sync-jwt.config';
import {
  DEVICE_SYNC_V1_SCOPES,
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
  type DeviceSyncScope,
} from '../entities/device-sync-credential.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import {
  createDeviceSyncPrincipal,
  type DeviceSyncPrincipal,
} from '../security/device-sync-principal';
import { isDeviceSyncAccessTokenPayload } from '../security/jwt-token.types';
import { SYNC_SCOPES_KEY } from '../decorators/sync-scopes.decorator';

export interface RequestWithDevicePrincipal extends Request {
  devicePrincipal?: DeviceSyncPrincipal;
}

interface BatchRecordOriginCandidate {
  sourceDeviceId?: unknown;
  terminalId?: unknown;
  tenantId?: unknown;
}

interface BatchEnvelopeCandidate {
  tenantId?: unknown;
  records?: unknown;
}

@Injectable()
export class SyncTransportGuard implements CanActivate {
  private readonly logger = new Logger(SyncTransportGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(DEVICE_SYNC_JWT_CONFIG)
    private readonly jwtConfig: DeviceSyncJwtConfig,
    private readonly dataSource: DataSource,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithDevicePrincipal>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Missing or invalid device authorization header',
      );
    }

    let payload: unknown;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.jwtConfig.secret,
        algorithms: [this.jwtConfig.algorithm],
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        clockTolerance: this.jwtConfig.clockToleranceSeconds,
      });
    } catch {
      throw new UnauthorizedException('Invalid device access token');
    }

    if (
      !isDeviceSyncAccessTokenPayload(
        payload,
        this.jwtConfig.issuer,
        this.jwtConfig.audience,
      )
    ) {
      throw new UnauthorizedException(
        'Device token does not satisfy strict claims contract',
      );
    }

    const deviceClaims = payload;

    const principal = await this.dataSource.transaction(async (manager) => {
      // 1. Enforce PostgreSQL RLS tenant context inside transaction before repository queries
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        deviceClaims.tenant_id,
      ]);

      const credentialRepo = manager.getRepository(DeviceSyncCredential);
      const tenantRepo = manager.getRepository(Tenant);

      const credential = await credentialRepo.findOne({
        where: { id: deviceClaims.sub },
        relations: ['activationAttempt'],
      });

      if (!credential) {
        throw new UnauthorizedException('Device credential not found');
      }

      if (credential.status !== DeviceSyncCredentialStatus.ACTIVE) {
        throw new UnauthorizedException(
          `Device credential is ${credential.status.toLowerCase()}`,
        );
      }

      if (
        credential.expiresAt &&
        credential.expiresAt.getTime() <= Date.now()
      ) {
        throw new UnauthorizedException('Device credential has expired');
      }

      if (credential.version !== deviceClaims.credential_version) {
        throw new UnauthorizedException('Device credential version mismatch');
      }

      if (credential.tenantId !== deviceClaims.tenant_id) {
        throw new UnauthorizedException('Device credential tenant mismatch');
      }

      const canonicalDeviceId =
        credential.activationAttempt?.trustedTerminalId?.trim();
      if (!canonicalDeviceId || canonicalDeviceId !== deviceClaims.device_id) {
        throw new UnauthorizedException('Device identity binding mismatch');
      }

      const tenant = await tenantRepo.findOne({
        where: { id: credential.tenantId },
      });

      if (!tenant || tenant.is_active !== true) {
        throw new UnauthorizedException('Tenant is inactive or disabled');
      }

      // 2. Harden scopes against DB corruption:
      // Both credential scopes and token scopes must contain only the fixed V1 allowlist,
      // and token scopes must be authorized by credential state.
      const allowedV1Scopes = new Set<string>(DEVICE_SYNC_V1_SCOPES);

      const hasValidCredentialScopes =
        Array.isArray(credential.scopes) &&
        credential.scopes.length > 0 &&
        credential.scopes.every(
          (s) => typeof s === 'string' && allowedV1Scopes.has(s),
        );

      const hasValidTokenScopes =
        Array.isArray(deviceClaims.scopes) &&
        deviceClaims.scopes.length > 0 &&
        deviceClaims.scopes.every(
          (s) => typeof s === 'string' && allowedV1Scopes.has(s),
        );

      if (!hasValidCredentialScopes || !hasValidTokenScopes) {
        throw new UnauthorizedException('Malformed device scopes');
      }

      const tokenAuthorizedByCredential = deviceClaims.scopes.every((s) =>
        credential.scopes.includes(s),
      );

      if (!tokenAuthorizedByCredential) {
        throw new UnauthorizedException('Malformed device scopes');
      }

      // 3. Principal scopes must not widen beyond token authorization
      const normalizedScopes = Array.from(new Set(deviceClaims.scopes));

      return createDeviceSyncPrincipal({
        credentialId: credential.id,
        tenantId: credential.tenantId,
        deviceId: canonicalDeviceId,
        scopes: normalizedScopes,
        credentialVersion: credential.version,
      });
    });

    const requiredScopes = this.reflector.getAllAndOverride<
      DeviceSyncScope[] | undefined
    >(SYNC_SCOPES_KEY, [context.getHandler(), context.getClass()]);

    if (requiredScopes && requiredScopes.length > 0) {
      const hasRequiredScopes = requiredScopes.every((scope) =>
        principal.scopes.includes(scope),
      );
      if (!hasRequiredScopes) {
        throw new ForbiddenException(
          `Insufficient device sync scopes (required: ${requiredScopes.join(', ')})`,
        );
      }
    }

    this.validateRequestQueryAuthoritativeOrigin(request.query, principal);
    this.validateBatchEnvelopeAuthoritativeOrigin(request.body, principal);

    // Attach principal only after all authoritative row, scope, and binding checks pass
    request.devicePrincipal = principal;

    this.logger.log('SYNC_AUTH_MODE=DEVICE');

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return undefined;
    }
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token || token.trim().length === 0) {
      return undefined;
    }
    return token.trim();
  }

  private validateRequestQueryAuthoritativeOrigin(
    query: unknown,
    principal: DeviceSyncPrincipal,
  ): void {
    if (typeof query !== 'object' || query === null) {
      return;
    }

    const candidate = query as Record<string, unknown>;

    if (candidate.terminalId !== undefined && candidate.terminalId !== null) {
      if (
        typeof candidate.terminalId !== 'string' ||
        candidate.terminalId.trim().length === 0 ||
        candidate.terminalId.trim() !== principal.deviceId
      ) {
        throw new ForbiddenException(
          `Query terminalId does not match authenticated device '${principal.deviceId}'`,
        );
      }
    }

    if (candidate.tenantId !== undefined && candidate.tenantId !== null) {
      if (
        typeof candidate.tenantId !== 'string' ||
        candidate.tenantId.trim().length === 0 ||
        candidate.tenantId.trim() !== principal.tenantId
      ) {
        throw new ForbiddenException(
          'Query tenantId does not match authenticated device tenant',
        );
      }
    }
  }

  private validateBatchEnvelopeAuthoritativeOrigin(
    body: unknown,
    principal: DeviceSyncPrincipal,
  ): void {
    if (typeof body !== 'object' || body === null) {
      return;
    }

    const candidate = body as BatchEnvelopeCandidate;

    if (
      candidate.tenantId !== undefined &&
      candidate.tenantId !== null &&
      candidate.tenantId !== principal.tenantId
    ) {
      throw new ForbiddenException(
        'Payload tenantId does not match authenticated device tenant',
      );
    }

    if (Array.isArray(candidate.records)) {
      for (const recordItem of candidate.records) {
        if (typeof recordItem === 'object' && recordItem !== null) {
          const record = recordItem as BatchRecordOriginCandidate;

          if (
            record.tenantId !== undefined &&
            record.tenantId !== null &&
            record.tenantId !== principal.tenantId
          ) {
            throw new ForbiddenException(
              'Record tenantId does not match authenticated device tenant',
            );
          }

          if (record.sourceDeviceId !== principal.deviceId) {
            const displaySource =
              typeof record.sourceDeviceId === 'string'
                ? record.sourceDeviceId
                : typeof record.sourceDeviceId === 'number'
                  ? String(record.sourceDeviceId)
                  : 'invalid';
            throw new ForbiddenException(
              `Record sourceDeviceId '${displaySource}' does not match authenticated device '${principal.deviceId}'`,
            );
          }

          if (
            typeof record.terminalId === 'string' &&
            record.terminalId.trim().length > 0 &&
            record.terminalId.trim() !== principal.deviceId
          ) {
            throw new ForbiddenException(
              `Record terminalId '${record.terminalId}' does not match authenticated device '${principal.deviceId}'`,
            );
          }
        }
      }
    }
  }
}
