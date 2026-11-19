import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import { ReleasesService } from '../../releases/services/releases.service';
import { InstallToken } from '../entities/install-token.entity';
import { asQueryRows } from './device-linking.service';

export const ALLOWED_ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'] as const;
export type AllowedAbi = (typeof ALLOWED_ABIS)[number];

export const DEFAULT_INSTALL_ABI: AllowedAbi = 'arm64-v8a';
export const DEFAULT_INSTALL_CHANNEL = 'pilot';

/**
 * Transaction-local RLS lookup flag for pre-auth install token resolution
 * (migration 1810800000000). Never accepted from client input and never
 * session-scoped; PostgreSQL discards it at commit/rollback.
 */
export const INSTALL_TOKEN_LOOKUP_FLAG_SQL =
  "SELECT set_config('app.install_token_lookup', $1, true)";

export const LOOKUP_INSTALL_TOKEN_BY_HASH_SQL =
  'SELECT id, revoked_at FROM install_tokens WHERE token_hash = $1 LIMIT 1';

export const RECORD_INSTALL_TOKEN_USE_SQL =
  'UPDATE install_tokens SET last_used_at = now(), use_count = use_count + 1 WHERE id = $1 AND revoked_at IS NULL';

export interface CreateInstallTokenOptions {
  label?: string;
  revokePrevious?: boolean;
}

export interface CreateInstallTokenResult {
  readonly id: string;
  /** Plaintext token returned exactly once on creation. Never persisted. */
  readonly token: string;
  readonly tokenPrefix: string;
  readonly label: string | null;
  readonly createdAt: Date;
}

export interface InstallTokenListItem {
  readonly id: string;
  readonly tokenPrefix: string;
  readonly label: string | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly useCount: number;
  readonly active: boolean;
}

export interface ResolveInstallTokenOptions {
  abi?: string;
  channel?: string;
}

export interface ResolvedInstallTokenRelease {
  readonly downloadUrl: string;
  readonly versionName: string;
  readonly versionCode: number;
  readonly abi: AllowedAbi;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface LookupTokenRow {
  id: string;
  revoked_at: Date | string | null;
}

export function hashInstallToken(plaintextToken: string): string {
  return createHash('sha256').update(plaintextToken, 'utf8').digest('hex');
}

export function validateInstallAbi(abi?: string): AllowedAbi {
  const trimmed = abi?.trim();
  if (!trimmed) {
    return DEFAULT_INSTALL_ABI;
  }
  if ((ALLOWED_ABIS as readonly string[]).includes(trimmed)) {
    return trimmed as AllowedAbi;
  }
  throw new BadRequestException(
    `Unsupported ABI "${trimmed}". Allowed ABIs: ${ALLOWED_ABIS.join(', ')}`,
  );
}

@Injectable()
export class InstallKitService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly releasesService: ReleasesService,
  ) {}

  async createToken(
    tenantId: string,
    actorUserId: string,
    options: CreateInstallTokenOptions = {},
  ): Promise<CreateInstallTokenResult> {
    const trimmedTenantId = tenantId?.trim();
    const trimmedActorUserId = actorUserId?.trim();
    if (!trimmedTenantId || !trimmedActorUserId) {
      throw new BadRequestException(
        'Tenant and actor context are required to create an install token',
      );
    }

    const rawLabel = options.label?.trim();
    if (rawLabel && rawLabel.length > 80) {
      throw new BadRequestException('label must not exceed 80 characters');
    }
    const label = rawLabel ? rawLabel : null;

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInstallToken(token);
    const tokenPrefix = token.slice(0, 8);

    const saved = await runInTenantTransaction(
      this.dataSource,
      trimmedTenantId,
      async (manager: EntityManager) => {
        const repo = manager.getRepository(InstallToken);

        if (options.revokePrevious) {
          await repo.update(
            { tenantId: trimmedTenantId, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
        }

        const entity = repo.create({
          tenantId: trimmedTenantId,
          tokenHash,
          tokenPrefix,
          label,
          createdByUserId: trimmedActorUserId,
          revokedAt: null,
          lastUsedAt: null,
          useCount: 0,
        });

        return await repo.save(entity);
      },
    );

    return {
      id: saved.id,
      token,
      tokenPrefix: saved.tokenPrefix,
      label: saved.label,
      createdAt: saved.createdAt,
    };
  }

  async listTokens(tenantId: string): Promise<InstallTokenListItem[]> {
    const trimmedTenantId = tenantId?.trim();
    if (!trimmedTenantId) {
      throw new BadRequestException(
        'Tenant context is required to list install tokens',
      );
    }

    return await runInTenantTransaction(
      this.dataSource,
      trimmedTenantId,
      async (manager: EntityManager) => {
        const rows = await manager.getRepository(InstallToken).find({
          where: { tenantId: trimmedTenantId },
          order: { createdAt: 'DESC' },
        });

        return rows.map((row) => ({
          id: row.id,
          tokenPrefix: row.tokenPrefix,
          label: row.label,
          createdAt: row.createdAt,
          revokedAt: row.revokedAt,
          lastUsedAt: row.lastUsedAt,
          useCount: row.useCount,
          active: row.revokedAt === null,
        }));
      },
    );
  }

  async revokeToken(tenantId: string, tokenId: string): Promise<void> {
    const trimmedTenantId = tenantId?.trim();
    const trimmedTokenId = tokenId?.trim();
    if (!trimmedTenantId || !trimmedTokenId) {
      throw new BadRequestException(
        'Tenant context and token id are required to revoke an install token',
      );
    }

    await runInTenantTransaction(
      this.dataSource,
      trimmedTenantId,
      async (manager: EntityManager) => {
        const repo = manager.getRepository(InstallToken);
        const existing = await repo.findOne({
          where: { id: trimmedTokenId, tenantId: trimmedTenantId },
        });
        if (!existing) {
          throw new NotFoundException('Install token not found');
        }
        if (existing.revokedAt === null) {
          existing.revokedAt = new Date();
          await repo.save(existing);
        }
      },
    );
  }

  /**
   * Validates that an opaque install token exists and has not been revoked.
   * Used by the HTML install landing page so it never leaks tenant data or
   * inflates download counts on page view.
   */
  async validateActiveToken(plaintextToken: string): Promise<{ id: string }> {
    const trimmed = plaintextToken?.trim();
    if (!trimmed) {
      throw new NotFoundException('Install link not found');
    }

    const tokenHash = hashInstallToken(trimmed);
    return await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(INSTALL_TOKEN_LOOKUP_FLAG_SQL, ['on']);
      const rows = asQueryRows<LookupTokenRow>(
        await manager.query(LOOKUP_INSTALL_TOKEN_BY_HASH_SQL, [tokenHash]),
      );

      if (rows.length === 0) {
        throw new NotFoundException('Install link not found');
      }
      if (rows[0].revoked_at !== null && rows[0].revoked_at !== undefined) {
        throw new GoneException('Install link has been revoked');
      }
      return { id: rows[0].id };
    });
  }

  /**
   * Resolves an opaque install token to a fresh short-lived R2 presigned APK
   * download URL for the requested ABI and channel, recording audit usage
   * (`last_used_at`, `use_count`).
   */
  async resolveInstallToken(
    plaintextToken: string,
    options: ResolveInstallTokenOptions = {},
  ): Promise<ResolvedInstallTokenRelease> {
    const validatedAbi = validateInstallAbi(options.abi);
    const trimmedToken = plaintextToken?.trim();
    if (!trimmedToken) {
      throw new NotFoundException('Install link not found');
    }

    const channel = options.channel?.trim() || DEFAULT_INSTALL_CHANNEL;
    const tokenHash = hashInstallToken(trimmedToken);

    return await this.dataSource.transaction(async (manager: EntityManager) => {
      await manager.query(INSTALL_TOKEN_LOOKUP_FLAG_SQL, ['on']);
      const rows = asQueryRows<LookupTokenRow>(
        await manager.query(LOOKUP_INSTALL_TOKEN_BY_HASH_SQL, [tokenHash]),
      );

      if (rows.length === 0) {
        throw new NotFoundException('Install link not found');
      }
      if (rows[0].revoked_at !== null && rows[0].revoked_at !== undefined) {
        throw new GoneException('Install link has been revoked');
      }

      const release = await this.releasesService.getLatestRelease(
        channel,
        validatedAbi,
      );
      if (!release) {
        throw new NotFoundException(
          `No published release available for channel "${channel}" and ABI "${validatedAbi}"`,
        );
      }

      await manager.query(RECORD_INSTALL_TOKEN_USE_SQL, [rows[0].id]);

      return {
        downloadUrl: release.downloadUrl,
        versionName: release.versionName,
        versionCode: release.versionCode,
        abi: validatedAbi,
        sizeBytes: release.sizeBytes,
        sha256: release.sha256,
      };
    });
  }
}
