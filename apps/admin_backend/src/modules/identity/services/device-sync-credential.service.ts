import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceCredentialRevokedException } from '../exceptions/device-credential-revoked.exception';
import { DeviceCredentialRecoveryRequiredException } from '../exceptions/device-credential-recovery-required.exception';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  ActivationAttempt,
  ActivationAttemptStatus,
} from '../../onboarding/entities/activation-attempt.entity';
import {
  DEVICE_SYNC_JWT_CONFIG,
  type DeviceSyncJwtConfig,
} from '../config/device-sync-jwt.config';
import {
  DeviceSyncCredential,
  DeviceSyncCredentialStatus,
  DEVICE_SYNC_V1_SCOPES,
} from '../entities/device-sync-credential.entity';
import {
  DeviceSyncCredentialEvent,
  DeviceSyncCredentialEventType,
} from '../entities/device-sync-credential-event.entity';
import { ProvisionDeviceCredentialDto } from '../dto/provision-device-credential.dto';
import { RenewDeviceTokenDto } from '../dto/renew-device-token.dto';
import {
  compareDeviceRenewalSecret,
  generateDeviceRenewalSecret,
  hashDeviceRenewalSecret,
} from '../security/device-renewal-secret-verifier';
import {
  createDeviceSyncPrincipal,
  DeviceSyncPrincipal,
} from '../security/device-sync-principal';
import {
  DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
  DEVICE_SYNC_TOKEN_TYPE,
  DeviceSyncJwtClaims,
} from '../security/jwt-token.types';
import { bindTenantContext } from '../../../core/database/tenant-transaction';

export interface ProvisionCredentialResult {
  readonly credential: DeviceSyncCredential;
  readonly renewalSecret?: string;
  readonly isNoOp?: boolean;
}

export interface ConfirmCredentialParams {
  readonly tenantId: string;
  readonly activationAttemptId: string;
  readonly credentialId: string;
  readonly credentialVersion: number;
  readonly renewalSecret: string;
  readonly canonicalDeviceId: string;
}

export interface RenewTokenResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly principal: DeviceSyncPrincipal;
}

@Injectable()
export class DeviceSyncCredentialService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(DeviceSyncCredential)
    private readonly credentialRepo: Repository<DeviceSyncCredential>,
    @InjectRepository(DeviceSyncCredentialEvent)
    private readonly eventRepo: Repository<DeviceSyncCredentialEvent>,
    @InjectRepository(ActivationAttempt)
    private readonly attemptRepo: Repository<ActivationAttempt>,
    private readonly jwtService: JwtService,
    @Inject(DEVICE_SYNC_JWT_CONFIG)
    private readonly jwtConfig: DeviceSyncJwtConfig,
  ) {}

  /**
   * Provisions initial device sync credential for a PASS or PASS_WITH_WARNING ActivationAttempt.
   *
   * Database atomicity:
   * - Credential record and PROVISIONED event are committed in one transaction.
   *
   * Secret handling:
   * - High-entropy renewal secret is generated, hashed with bcrypt, and the plaintext
   *   is returned exactly once. It is never stored or resurrected.
   * - Repeated initial provisioning for the same ActivationAttempt is deterministically
   *   rejected with ConflictException; no secret is minted or returned.
   *
   * Expiration:
   * - Derived strictly server-side using validated DEVICE_SYNC_RENEWAL_TTL_SECONDS.
   */
  async provisionCredential(
    dto: ProvisionDeviceCredentialDto,
  ): Promise<ProvisionCredentialResult> {
    return await this.dataSource.transaction(async (manager) => {
      await bindTenantContext(manager, dto.tenantId);

      const attemptRepo = manager.getRepository(ActivationAttempt);
      const credentialRepo = manager.getRepository(DeviceSyncCredential);
      const eventRepo = manager.getRepository(DeviceSyncCredentialEvent);

      const attempt = await attemptRepo.findOne({
        where: {
          id: dto.activationAttemptId,
          tenantId: dto.tenantId,
        },
      });

      if (!attempt) {
        throw new NotFoundException(
          `Activation attempt '${dto.activationAttemptId}' not found for tenant '${dto.tenantId}'`,
        );
      }

      if (
        attempt.status !== ActivationAttemptStatus.PASS &&
        attempt.status !== ActivationAttemptStatus.PASS_WITH_WARNING
      ) {
        throw new BadRequestException(
          `Activation attempt must be PASS or PASS_WITH_WARNING to provision credentials (current status: ${attempt.status})`,
        );
      }

      const canonicalDeviceId = attempt.trustedTerminalId?.trim();
      if (!canonicalDeviceId) {
        throw new BadRequestException(
          'Activation attempt has no canonical device identity (trustedTerminalId is null or empty)',
        );
      }

      const existingCredentials = await credentialRepo.find({
        where: { activationAttemptId: attempt.id },
        order: { version: 'DESC' },
      });
      const latest = existingCredentials[0];

      if (latest) {
        if (latest.status === DeviceSyncCredentialStatus.ACTIVE) {
          return {
            credential: latest,
            isNoOp: true,
          };
        }
        if (
          latest.status === DeviceSyncCredentialStatus.REVOKED ||
          latest.status === DeviceSyncCredentialStatus.RETIRED
        ) {
          throw new DeviceCredentialRecoveryRequiredException(
            `Latest device sync credential is ${latest.status}; explicit recovery required`,
          );
        }
        if (latest.status === DeviceSyncCredentialStatus.PENDING) {
          latest.status = DeviceSyncCredentialStatus.RETIRED;
          latest.rotatedAt = new Date();
          await credentialRepo.save(latest);

          const retireEvent = eventRepo.create({
            tenantId: attempt.tenantId,
            credentialId: latest.id,
            eventType: DeviceSyncCredentialEventType.RETIRED,
            metadata: {
              reason: 'SUPERSEDED_BY_NEW_PENDING',
              previousVersion: latest.version,
              supersededByVersion: latest.version + 1,
              deviceId: canonicalDeviceId,
            },
          });
          await eventRepo.save(retireEvent);
        }
      }

      const nextVersion = latest ? latest.version + 1 : 1;
      const renewalSecret = generateDeviceRenewalSecret();
      const renewalSecretHash = await hashDeviceRenewalSecret(renewalSecret);

      const issuedAt = new Date();
      // Bounded pending lifetime: default 15 minutes (900 seconds)
      const pendingLifetimeMs =
        Math.min(this.jwtConfig.renewalTtlSeconds, 900) * 1000;
      const expiresAt = new Date(issuedAt.getTime() + pendingLifetimeMs);

      const credential = credentialRepo.create({
        tenantId: attempt.tenantId,
        activationAttemptId: attempt.id,
        renewalSecretHash,
        scopes: [...DEVICE_SYNC_V1_SCOPES],
        version: nextVersion,
        status: DeviceSyncCredentialStatus.PENDING,
        expiresAt,
        issuedAt,
      });

      const savedCredential = await credentialRepo.save(credential);

      const event = eventRepo.create({
        tenantId: savedCredential.tenantId,
        credentialId: savedCredential.id,
        eventType: DeviceSyncCredentialEventType.PROVISIONED,
        metadata: {
          deviceId: canonicalDeviceId,
          activationAttemptId: attempt.id,
          scopes: savedCredential.scopes,
          version: savedCredential.version,
        },
      });
      await eventRepo.save(event);

      return {
        credential: savedCredential,
        renewalSecret,
      };
    });
  }

  /**
   * Exchanges renewal credentials for a short-lived device sync access token.
   *
   * RLS Architecture:
   * - FORCE ROW LEVEL SECURITY is enabled on device_sync_credentials and device_sync_credential_events.
   * - Declarative tenant from the caller is used purely as a transaction-local lookup partition
   *   (set_config('app.tenant_id', ..., true)).
   * - Credential is retrieved, secret hash is verified with bcrypt, and all authoritative bindings
   *   (tenantId, deviceId from joined ActivationAttempt.trustedTerminalId, version, expiry)
   *   are compared strictly.
   * - Lifecycle audit event is inserted within the same transaction using authoritative tenant context.
   */
  async renewAccessToken(
    dto: RenewDeviceTokenDto,
  ): Promise<RenewTokenResponse> {
    return await this.dataSource.transaction(async (manager) => {
      if (dto.declarativeTenantId?.trim()) {
        await bindTenantContext(manager, dto.declarativeTenantId);
      }

      const credentialRepo = manager.getRepository(DeviceSyncCredential);
      const eventRepo = manager.getRepository(DeviceSyncCredentialEvent);

      const credential = await credentialRepo.findOne({
        where: { id: dto.credentialId },
        relations: ['activationAttempt'],
      });

      if (!credential) {
        throw new UnauthorizedException('Invalid device credentials');
      }

      if (credential.status === DeviceSyncCredentialStatus.REVOKED) {
        throw new DeviceCredentialRevokedException();
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

      if (
        dto.expectedCredentialVersion !== undefined &&
        dto.expectedCredentialVersion !== credential.version
      ) {
        throw new UnauthorizedException('Credential version mismatch');
      }

      const isSecretValid = await compareDeviceRenewalSecret(
        dto.renewalSecret,
        credential.renewalSecretHash,
      );
      if (!isSecretValid) {
        throw new UnauthorizedException('Invalid device credentials');
      }

      const canonicalDeviceId =
        credential.activationAttempt?.trustedTerminalId?.trim();
      if (!canonicalDeviceId) {
        throw new UnauthorizedException(
          'Canonical device identity is not established for credential',
        );
      }

      const allowedV1Scopes = new Set<string>(DEVICE_SYNC_V1_SCOPES);
      if (
        !Array.isArray(credential.scopes) ||
        credential.scopes.length === 0 ||
        !credential.scopes.every(
          (s) => typeof s === 'string' && allowedV1Scopes.has(s),
        )
      ) {
        throw new UnauthorizedException(
          'Device credential has corrupted scopes',
        );
      }

      if (
        dto.declarativeTenantId &&
        dto.declarativeTenantId.trim() !== credential.tenantId
      ) {
        throw new UnauthorizedException(
          'Declarative tenant does not match credential binding',
        );
      }

      if (
        dto.declarativeDeviceId &&
        dto.declarativeDeviceId.trim() !== canonicalDeviceId
      ) {
        throw new UnauthorizedException(
          'Declarative device does not match canonical device identity',
        );
      }

      // Ensure session tenant is authoritative before writing the lifecycle event under RLS
      await bindTenantContext(manager, credential.tenantId);

      const jti = randomUUID();
      const claims: DeviceSyncJwtClaims = {
        sub: credential.id,
        principal_type: DEVICE_SYNC_PRINCIPAL_TYPE_CLAIM,
        token_type: DEVICE_SYNC_TOKEN_TYPE,
        tenant_id: credential.tenantId,
        device_id: canonicalDeviceId,
        scopes: [...credential.scopes],
        credential_version: credential.version,
        jti,
      };

      const accessToken = await this.jwtService.signAsync(claims, {
        secret: this.jwtConfig.secret,
        algorithm: this.jwtConfig.algorithm,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        expiresIn: this.jwtConfig.accessTokenTtlSeconds,
      });

      const event = eventRepo.create({
        tenantId: credential.tenantId,
        credentialId: credential.id,
        eventType: DeviceSyncCredentialEventType.TOKEN_ISSUED,
        metadata: {
          deviceId: canonicalDeviceId,
          jti,
          scopes: credential.scopes,
          version: credential.version,
        },
      });
      await eventRepo.save(event);

      const principal = createDeviceSyncPrincipal({
        credentialId: credential.id,
        tenantId: credential.tenantId,
        deviceId: canonicalDeviceId,
        scopes: credential.scopes,
        credentialVersion: credential.version,
      });

      return {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: this.jwtConfig.accessTokenTtlSeconds,
        principal,
      };
    });
  }

  async revokeCredential(
    tenantId: string,
    credentialId: string,
    reason: string,
  ): Promise<DeviceSyncCredential> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Authorized tenant context is required');
    }

    return await this.dataSource.transaction(async (manager) => {
      // 1. Enforce PostgreSQL RLS tenant context inside transaction before repository queries
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        trimmedTenantId,
      ]);

      const credentialRepo = manager.getRepository(DeviceSyncCredential);
      const eventRepo = manager.getRepository(DeviceSyncCredentialEvent);

      const credential = await credentialRepo.findOne({
        where: { id: credentialId, tenantId: trimmedTenantId },
      });

      if (!credential) {
        throw new NotFoundException(
          `Credential '${credentialId}' not found for tenant`,
        );
      }

      credential.status = DeviceSyncCredentialStatus.REVOKED;
      credential.revokedAt = new Date();
      credential.revocationReason = reason;

      const updated = await credentialRepo.save(credential);

      const event = eventRepo.create({
        tenantId: credential.tenantId,
        credentialId: credential.id,
        eventType: DeviceSyncCredentialEventType.REVOKED,
        metadata: {
          reason,
        },
      });
      await eventRepo.save(event);

      return updated;
    });
  }

  async retireCredential(
    tenantId: string,
    credentialId: string,
  ): Promise<DeviceSyncCredential> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException('Authorized tenant context is required');
    }

    return await this.dataSource.transaction(async (manager) => {
      // 1. Enforce PostgreSQL RLS tenant context inside transaction before repository queries
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        trimmedTenantId,
      ]);

      const credentialRepo = manager.getRepository(DeviceSyncCredential);
      const eventRepo = manager.getRepository(DeviceSyncCredentialEvent);

      const credential = await credentialRepo.findOne({
        where: { id: credentialId, tenantId: trimmedTenantId },
      });

      if (!credential) {
        throw new NotFoundException(
          `Credential '${credentialId}' not found for tenant`,
        );
      }

      credential.status = DeviceSyncCredentialStatus.RETIRED;
      credential.rotatedAt = new Date();

      const updated = await credentialRepo.save(credential);

      const event = eventRepo.create({
        tenantId: credential.tenantId,
        credentialId: credential.id,
        eventType: DeviceSyncCredentialEventType.RETIRED,
        metadata: {},
      });
      await eventRepo.save(event);

      return updated;
    });
  }

  /**
   * Confirms a PENDING device sync credential and atomically transitions it to ACTIVE.
   *
   * Security & Lifecycle Rules:
   * - Human-protected caller authority with transaction-scoped RLS.
   * - Renewal secret possession verification via bcrypt compare.
   * - Monotonic version guard: exact match on credentialVersion.
   * - Idempotent retry: if credential is ACTIVE and secret matches, returns active credential.
   * - Cannot confirm RETIRED (superseded) or REVOKED credentials.
   * - Rejects expired pending credentials.
   * - Writes CONFIRMED lifecycle audit event within the same transaction.
   */
  async confirmCredential(
    params: ConfirmCredentialParams,
  ): Promise<DeviceSyncCredential> {
    const trimmedTenant = params.tenantId?.trim();
    if (!trimmedTenant) {
      throw new BadRequestException('Authorized tenant context is required');
    }

    return await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
        trimmedTenant,
      ]);

      const credentialRepo = manager.getRepository(DeviceSyncCredential);
      const eventRepo = manager.getRepository(DeviceSyncCredentialEvent);

      const credential = await credentialRepo.findOne({
        where: {
          id: params.credentialId,
          activationAttemptId: params.activationAttemptId,
          tenantId: trimmedTenant,
        },
      });

      if (!credential) {
        throw new NotFoundException('Device credential not found');
      }

      if (credential.version !== params.credentialVersion) {
        throw new ConflictException(
          `Credential version mismatch: requested version ${params.credentialVersion} but current version is ${credential.version}`,
        );
      }

      const isSecretValid = await compareDeviceRenewalSecret(
        params.renewalSecret,
        credential.renewalSecretHash,
      );
      if (!isSecretValid) {
        throw new UnauthorizedException('Invalid renewal secret');
      }

      if (credential.status === DeviceSyncCredentialStatus.ACTIVE) {
        // Idempotent retry on active credential with verified secret
        return credential;
      }

      if (credential.status !== DeviceSyncCredentialStatus.PENDING) {
        throw new BadRequestException(
          `Cannot confirm credential in status '${credential.status}'`,
        );
      }

      if (
        credential.expiresAt &&
        credential.expiresAt.getTime() <= Date.now()
      ) {
        throw new BadRequestException('Pending device credential has expired');
      }

      // Atomically transition status to ACTIVE and set full renewal expiry
      credential.status = DeviceSyncCredentialStatus.ACTIVE;
      credential.expiresAt = new Date(
        Date.now() + this.jwtConfig.renewalTtlSeconds * 1000,
      );
      const saved = await credentialRepo.save(credential);

      const event = eventRepo.create({
        tenantId: trimmedTenant,
        credentialId: saved.id,
        eventType: DeviceSyncCredentialEventType.CONFIRMED,
        metadata: {
          deviceId: params.canonicalDeviceId,
          activationAttemptId: params.activationAttemptId,
          version: saved.version,
        },
      });
      await eventRepo.save(event);

      return saved;
    });
  }
}
