import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user.entity';
import { AuthenticatedUserDto, StaffSyncUserDto } from '../dto/identity.dto';
import { resolveInventoryBohPermissions } from '../guards/roles.guard';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../config/identity-jwt.config';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  AuthAuditService,
  LoginAuditReason,
} from './auth-audit.service';
import {
  JWT_TOKEN_TYPES,
  isRefreshTokenPayloadForSubject,
  type JwtRefreshPayload,
  type JwtSignPayload,
} from '../security/jwt-token.types';
import * as refreshTokenVerifier from '../security/refresh-token-verifier';

const SYNC_SCOPE = {
  POS_AUTH_CONTINUITY: 'pos-auth-continuity',
} as const;

type SyncScope = (typeof SYNC_SCOPE)[keyof typeof SYNC_SCOPE];

type StaffSyncItem = {} & StaffSyncUserDto;

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));

const isUserRole = (value?: string): value is UserRole =>
  typeof value === 'string' && USER_ROLE_VALUES.has(value);

/**
 * Constant bcrypt digest used to equalize failure timing on the tenant-slug
 * login path: an unknown/inactive slug must burn the same password-compare
 * cost as the wrong-password path, so slug probing cannot be distinguished
 * from credential probing by timing alone (issue #556, generic-failure rule).
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$10$kSsyBHKukSJaWaZM7Q0tBeZQ13hT9NzWEJxbETy0pENCsyfe1ROBO';

interface TenantQueryResult {
  id: string;
  name: string;
  slug: string;
  ruc?: string | null;
  is_active: boolean;
}

const isUnknownArray = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value);

const isTenantQueryResult = (value: unknown): value is TenantQueryResult => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.slug === 'string' &&
    (candidate.ruc === undefined ||
      candidate.ruc === null ||
      typeof candidate.ruc === 'string') &&
    typeof candidate.is_active === 'boolean'
  );
};

const isSyncScope = (value?: string): value is SyncScope =>
  value === SYNC_SCOPE.POS_AUTH_CONTINUITY;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private dataSource: DataSource,
    @Inject(IDENTITY_JWT_CONFIG) private readonly jwtConfig: IdentityJwtConfig,
    private readonly authAudit: AuthAuditService,
  ) {}

  async login(email: string, pass: string, tenantSlug?: string) {
    // Issue #556 stage 12d (founder design): the migration window is CLOSED.
    // tenantSlug is REQUIRED pre-auth CONTEXT, never authority: the server
    // resolves slug -> tenant, binds the transaction context (SET LOCAL
    // app.tenant_id) and only then queries the user by email through the
    // bound manager. Post-login authority stays the JWT tenant_id. The
    // legacy no-slug pooled path is removed; old POS builds fail login by
    // design (backend+POS deploy in sync). Missing slug fails generically
    // with equalized timing so its absence cannot be probed.
    if (!tenantSlug?.trim()) {
      await this.burnDummyPasswordCompare(pass);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const resolvedTenantId = await this.resolveTenantIdBySlugForLogin(
      tenantSlug,
      pass,
    ).catch(async (error: unknown) => {
      // Unknown/inactive slug: no tenant anchor, so this stays an app-log
      // event (the client response stays generic, see issue #556).
      await this.authAudit.recordAuthFailure({
        action: 'LOGIN_FAILURE',
        tenantId: null,
        userId: null,
        email,
        reason: LoginAuditReason.UNKNOWN_TENANT,
      });
      throw error;
    });

    return runInTenantTransaction(
      this.dataSource,
      resolvedTenantId,
      async (manager) =>
        this.authenticateAndIssueTokens(
          manager,
          manager.getRepository(User),
          email ? email.trim().toLowerCase() : '',
          email,
          pass,
          resolvedTenantId,
        ),
    );
  }

  /**
   * Burns exactly one bcrypt compare against the dummy digest so a generic
   * failure costs the same as the wrong-password path: response timing must
   * never distinguish unknown slug / inactive tenant / unknown user /
   * inactive user / cross-tenant user from a plain wrong password (issue
   * #556 F1, verification remediation).
   */
  private async burnDummyPasswordCompare(pass: string): Promise<void> {
    await bcrypt.compare(pass, DUMMY_PASSWORD_HASH);
  }

  private async resolveTenantIdBySlugForLogin(
    tenantSlug: string,
    pass: string,
  ): Promise<string> {
    const rows: unknown = await this.dataSource.query(
      'SELECT id, slug, is_active FROM tenants WHERE slug = $1',
      [tenantSlug?.trim() ?? ''],
    );
    const firstRow = isUnknownArray(rows) ? rows[0] : undefined;
    const tenant =
      firstRow &&
      typeof (firstRow as Record<string, unknown>).id === 'string' &&
      typeof (firstRow as Record<string, unknown>).is_active === 'boolean'
        ? (firstRow as { id: string; is_active: boolean })
        : null;

    if (!tenant || !tenant.is_active) {
      // Generic failure with equalized timing: no tenant enumeration.
      await this.burnDummyPasswordCompare(pass);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return tenant.id;
  }

  /**
   * Shared login flow: email lookup, generic-failure checks, password verify,
   * token issue, refresh persistence. Always runs through the bound
   * transaction manager with the resolved tenant id: a user whose tenant
   * does not match is a generic invalid-credentials failure, and EVERY
   * failure burns exactly one bcrypt compare (dummy digest or the real
   * wrong-password compare) so response timing never distinguishes unknown
   * slug / inactive tenant / unknown user / inactive user / cross-tenant
   * user from a plain wrong password.
   */
  private async authenticateAndIssueTokens(
    manager: EntityManager,
    repository: Pick<Repository<User>, 'findOne' | 'update'>,
    cleanEmail: string,
    rawEmail: string,
    pass: string,
    expectedTenantId: string,
  ) {
    let user: Pick<
      User,
      | 'id'
      | 'name'
      | 'email'
      | 'password_hash'
      | 'role'
      | 'tenant_id'
      | 'is_active'
      | 'security_version'
    > | null = null;

    try {
      user = await repository.findOne({
        where: [
          { email: cleanEmail },
          { email: rawEmail ? rawEmail.trim() : '' },
        ],
        select: [
          'id',
          'name',
          'email',
          'password_hash',
          'role',
          'tenant_id',
          'is_active',
          'security_version',
        ],
      });
    } catch {
      user = null;
    }

    if (user && user.tenant_id !== expectedTenantId) {
      // Generic failure with equalized timing: the email exists but belongs
      // to another tenant; never reveal that through a distinct error.
      await this.burnDummyPasswordCompare(pass);
      await this.authAudit.recordAuthFailure({
        action: 'LOGIN_FAILURE',
        tenantId: expectedTenantId,
        userId: user.id,
        email: rawEmail,
        reason: LoginAuditReason.CROSS_TENANT_USER,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user) {
      // A valid slug with an unknown email costs the same one bcrypt compare
      // as an unknown slug or a wrong password, or response timing
      // enumerates slugs.
      await this.burnDummyPasswordCompare(pass);
      await this.authAudit.recordAuthFailure({
        action: 'LOGIN_FAILURE',
        tenantId: expectedTenantId,
        userId: null,
        email: rawEmail,
        reason: LoginAuditReason.UNKNOWN_USER,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!user.is_active) {
      await this.burnDummyPasswordCompare(pass);
      await this.authAudit.recordAuthFailure({
        action: 'LOGIN_FAILURE',
        tenantId: expectedTenantId,
        userId: user.id,
        email: rawEmail,
        reason: LoginAuditReason.INACTIVE_USER,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!(await bcrypt.compare(pass, user.password_hash))) {
      // The wrong-password exit already burns exactly one compare.
      await this.authAudit.recordAuthFailure({
        action: 'LOGIN_FAILURE',
        tenantId: expectedTenantId,
        userId: user.id,
        email: rawEmail,
        reason: LoginAuditReason.WRONG_PASSWORD,
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const refreshTokenFamilyId = randomUUID();
    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.tenant_id,
      user.role,
      user.is_active,
      user.security_version ?? 1,
      refreshTokenFamilyId,
    );
    await this.updateRefreshToken(
      user.id,
      tokens.refresh_token,
      refreshTokenFamilyId,
      repository,
    );

    // Security audit remediation S4: successful logins join the hash-chained
    // audit log, atomically with the token issuance.
    await this.authAudit.recordLoginSuccess(expectedTenantId, user.id, manager);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        tenant_id: user.tenant_id,
        permissions: resolveInventoryBohPermissions(user.role),
      } satisfies AuthenticatedUserDto,
    };
  }

  async getMe(userId: string, tenantId: string) {
    // Issue #556 stage 12d: the users row is RLS-FORCE-protected, so the
    // self read runs inside the tenant-bound transaction (the tenant id
    // arrives from the JWT via the controller). The user is additionally
    // filtered by tenant_id: post-login authority stays the JWT tenant_id.
    const user = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) =>
        manager.getRepository(User).findOne({
          where: { id: userId, tenant_id: tenantId },
          select: ['id', 'name', 'email', 'role', 'tenant_id', 'is_active'],
        }),
    );

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const rawTenants: unknown = await this.dataSource.query(
      'SELECT id, name, slug, ruc, is_active FROM tenants WHERE id = $1',
      [user.tenant_id],
    );

    const firstTenant = isUnknownArray(rawTenants) ? rawTenants[0] : undefined;
    const tenant = isTenantQueryResult(firstTenant) ? firstTenant : null;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        active: user.is_active,
        permissions: resolveInventoryBohPermissions(user.role),
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            // Issue #556 slice 11: the PERSISTED provisioning slug (stable
            // even when the display name changes), not a recomputation.
            slug: tenant.slug,
            ruc: tenant.ruc ?? null,
            active: tenant.is_active,
          }
        : null,
    };
  }

  async refreshTokens(
    userId: string,
    refreshToken: string,
    tenantSlug?: string,
  ) {
    let refreshPayload: JwtRefreshPayload;
    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(refreshToken, {
        secret: this.jwtConfig.secret,
        algorithms: ['HS256'],
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        clockTolerance: this.jwtConfig.clockToleranceSeconds,
      });

      if (!isRefreshTokenPayloadForSubject(payload, userId)) {
        throw new UnauthorizedException('Acceso denegado');
      }
      refreshPayload = payload;
    } catch {
      // The JWT claim is unverified here: no reliable user/tenant anchor,
      // so this stays an app-log event (generic response unchanged).
      await this.authAudit.recordAuthFailure({
        action: 'REFRESH_FAILURE',
        tenantId: null,
        userId: null,
        reason: LoginAuditReason.INVALID_REFRESH,
      });
      throw new UnauthorizedException('Acceso denegado');
    }

    // Issue #556 stage 12d: the migration window is CLOSED. tenantSlug is
    // REQUIRED: the tenant is resolved and the transaction bound BEFORE the
    // user row is read (with the resolved tenant id in the WHERE clause).
    // The legacy unbound branch is removed; missing/unknown/inactive slug
    // fails with the same generic refresh rejection (no tenant enumeration).
    if (!tenantSlug?.trim()) {
      await this.authAudit.recordAuthFailure({
        action: 'REFRESH_FAILURE',
        tenantId: null,
        userId: null,
        reason: LoginAuditReason.UNKNOWN_TENANT,
      });
      throw new UnauthorizedException('Acceso denegado');
    }
    const outcome = await this.refreshWithTenantSlug(
      userId,
      refreshPayload,
      refreshToken,
      tenantSlug,
    ).catch(async (error: unknown) => {
      // Slug resolution or the transaction itself failed: no tenant anchor
      // survived, so this stays an app-log event.
      await this.authAudit.recordAuthFailure({
        action: 'REFRESH_FAILURE',
        tenantId: null,
        userId: null,
        reason: LoginAuditReason.INVALID_REFRESH,
      });
      throw error;
    });

    if (!outcome.tokens) {
      // Security audit remediation S4 (verification finding 4-1): anchored
      // REFRESH_FAILURE rows are written AFTER the transaction closed, so
      // the audit insert never waits on the pessimistic user-row lock.
      // Unknown users (deleted rows) fail the FK and drop to the app log.
      await this.authAudit.recordAuthFailure({
        action: 'REFRESH_FAILURE',
        tenantId: outcome.tenantId,
        userId,
        reason: outcome.failureReason ?? LoginAuditReason.INVALID_REFRESH,
      });
      throw new UnauthorizedException('Acceso denegado');
    }
    // Security audit remediation S4: successful refresh exchanges join the
    // hash-chained audit log (best-effort write, see AuthAuditService).
    await this.authAudit.recordRefreshSuccess(outcome.tenantId, userId);
    return outcome.tokens;
  }

  private async refreshWithTenantSlug(
    userId: string,
    refreshPayload: JwtRefreshPayload,
    refreshToken: string,
    tenantSlug: string,
  ): Promise<
    | { tenantId: string; tokens: Awaited<ReturnType<AuthService['getTokens']>>; failureReason?: undefined }
    | { tenantId: string; tokens: null; failureReason: string }
  > {
    const resolvedTenantId =
      await this.resolveTenantIdBySlugForRefresh(tenantSlug);
    const outcome = await runInTenantTransaction(
      this.dataSource,
      resolvedTenantId,
      (manager) =>
        this.rotateRefreshSession(
          manager,
          userId,
          refreshPayload,
          refreshToken,
          resolvedTenantId,
        ),
    );
    return { tenantId: resolvedTenantId, ...outcome };
  }

  private async resolveTenantIdBySlugForRefresh(
    tenantSlug: string,
  ): Promise<string> {
    const rows: unknown = await this.dataSource.query(
      'SELECT id, slug, is_active FROM tenants WHERE slug = $1',
      [tenantSlug?.trim() ?? ''],
    );
    const firstRow = isUnknownArray(rows) ? rows[0] : undefined;
    const tenant =
      firstRow &&
      typeof (firstRow as Record<string, unknown>).id === 'string' &&
      typeof (firstRow as Record<string, unknown>).is_active === 'boolean'
        ? (firstRow as { id: string; is_active: boolean })
        : null;

    if (!tenant || !tenant.is_active) {
      // Same generic refresh rejection as an invalid token: no tenant enumeration.
      throw new UnauthorizedException('Acceso denegado');
    }
    return tenant.id;
  }

  /**
   * Shared refresh-rotation body. The user read is filtered by the resolved
   * tenant inside the bound transaction; the unbound read-then-continue
   * behavior was removed with the legacy refresh branch (issue #556 stage
   * 12d).
   */
  private async rotateRefreshSession(
    manager: EntityManager,
    userId: string,
    refreshPayload: JwtRefreshPayload,
    refreshToken: string,
    expectedTenantId: string,
  ): Promise<
    | { tokens: Awaited<ReturnType<AuthService['getTokens']>>; failureReason?: undefined }
    | { tokens: null; failureReason: string }
  > {
    const repository = manager.getRepository(User);
    const user = await repository.findOne({
      where: { id: userId, tenant_id: expectedTenantId },
      lock: { mode: 'pessimistic_write' },
      select: [
        'id',
        'email',
        'tenant_id',
        'role',
        'is_active',
        'security_version',
        'hashed_refresh_token',
        'refresh_token_family_id',
        'refresh_token_revoked_at',
      ],
    });

    if (
      !user ||
      !user.is_active ||
      !user.hashed_refresh_token ||
      user.refresh_token_revoked_at
    ) {
      const failureReason = !user
        ? LoginAuditReason.UNKNOWN_USER
        : !user.is_active
          ? LoginAuditReason.INACTIVE_USER
          : LoginAuditReason.INVALID_REFRESH;
      return { tokens: null, failureReason };
    }

    const isCurrentFamily =
      (typeof user.refresh_token_family_id === 'string' &&
        refreshPayload.refresh_token_family_id ===
          user.refresh_token_family_id) ||
      (refreshPayload.refresh_token_family_id === undefined &&
        user.refresh_token_family_id == null);
    const refreshTokenMatches =
      await refreshTokenVerifier.compareRefreshTokenVerifier(
        refreshToken,
        user.hashed_refresh_token,
      );

    if (isCurrentFamily && refreshTokenMatches) {
      const familyId = user.refresh_token_family_id ?? randomUUID();
      const tokens = await this.getTokens(
        user.id,
        user.email,
        user.tenant_id,
        user.role,
        user.is_active,
        user.security_version,
        familyId,
      );
      await this.updateRefreshToken(
        user.id,
        tokens.refresh_token,
        familyId,
        repository,
      );
      return { tokens };
    }

    if (
      typeof user.refresh_token_family_id === 'string' &&
      refreshPayload.refresh_token_family_id === user.refresh_token_family_id
    ) {
      // Reuse detection: same family, different verifier. The family is
      // revoked below and the attempt is audited by the caller (outside this
      // transaction, so the audit write never waits on the row lock held
      // here).
      await this.revokeRefreshSessionForUser(manager, user.id, new Date());
      return { tokens: null, failureReason: LoginAuditReason.REUSED_REFRESH };
    }
    return { tokens: null, failureReason: LoginAuditReason.INVALID_REFRESH };
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string,
    familyId: string | undefined,
    repository: Pick<Repository<User>, 'update'>,
  ) {
    const hashedRefreshToken =
      await refreshTokenVerifier.hashRefreshTokenVerifier(refreshToken);
    await repository.update(userId, {
      hashed_refresh_token: hashedRefreshToken,
      ...(familyId === undefined ? {} : { refresh_token_family_id: familyId }),
      ...(familyId === undefined ? {} : { refresh_token_revoked_at: null }),
    });
  }

  async revokeRefreshSessionForUser(
    manager: EntityManager,
    userId: string,
    now: Date,
  ) {
    await manager.getRepository(User).update(userId, {
      hashed_refresh_token: null,
      refresh_token_family_id: null,
      refresh_token_revoked_at: now,
    });
  }

  async getTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
    isActive: boolean,
    securityVersion: number,
    refreshTokenFamilyId?: string,
  ) {
    const identity = {
      sub: userId,
      email,
      tenant_id: tenantId,
      role,
      is_active: isActive,
    };
    const accessPayload: JwtSignPayload = {
      ...identity,
      token_type: JWT_TOKEN_TYPES.ACCESS,
      security_version: securityVersion,
    };
    const refreshPayload: JwtSignPayload = {
      ...identity,
      token_type: JWT_TOKEN_TYPES.REFRESH,
      ...(refreshTokenFamilyId === undefined
        ? {}
        : { refresh_token_family_id: refreshTokenFamilyId }),
    };
    const [at, rt] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: this.jwtConfig.accessTokenTtlSeconds,
        algorithm: this.jwtConfig.algorithm,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
      }),
      this.jwtService.signAsync(refreshPayload, {
        expiresIn: this.jwtConfig.refreshTokenTtlSeconds,
        algorithm: this.jwtConfig.algorithm,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        jwtid: randomUUID(),
      }),
    ]);

    return {
      access_token: at,
      refresh_token: rt,
    };
  }

  async getStaffForSync(
    tenantId: string,
    requesterRole?: string,
    requesterId?: string,
    syncScope?: string,
  ) {
    const resolvedRequesterRole = isUserRole(requesterRole)
      ? requesterRole
      : undefined;
    const resolvedScope = isSyncScope(syncScope) ? syncScope : undefined;

    const canReadSensitiveProfile =
      resolvedRequesterRole === UserRole.OWNER ||
      resolvedRequesterRole === UserRole.MANAGER;
    const continuityScopeRequested =
      resolvedScope === SYNC_SCOPE.POS_AUTH_CONTINUITY;
    const scopedContinuityAllowed =
      continuityScopeRequested &&
      (resolvedRequesterRole === UserRole.CASHIER ||
        resolvedRequesterRole === UserRole.WAITER);

    // Issue #512 T3 slice 9 rework: the users LEFT JOIN security_profiles
    // query must run inside the tenant-bound transaction manager — on a
    // pooled connection the FORCE RLS policy silently masks the joined
    // security_profiles side, dropping pin_hash/totp_secret_seed from the
    // offline-auth sync payload. The tenant id comes from the JWT via the
    // controller (@GetTenantId()). Wrapping the whole JOIN (not just the
    // mapping) is what keeps the joined side visible.
    const users = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      (manager) => {
        const qb = manager
          .getRepository(User)
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.security_profile', 'security_profile')
          .select([
            'user.id',
            'user.name',
            'user.role',
            'user.is_active',
            'user.email',
            'user.tenant_id',
            'security_profile.user_id',
            'security_profile.is_totp_enabled',
            'security_profile.is_pin_enabled',
          ])
          .where('user.tenant_id = :tenantId', { tenantId })
          .andWhere('user.is_active = :isActive', { isActive: true });

        if (canReadSensitiveProfile || scopedContinuityAllowed) {
          qb.addSelect('security_profile.pin_hash').addSelect(
            'security_profile.totp_secret_seed',
          );
        }

        return qb.getMany();
      },
    );

    const staff = users.map(
      (user): StaffSyncItem => ({
        id: user.id,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
        email: user.email,
        tenant_id: user.tenant_id,
        permissions: resolveInventoryBohPermissions(user.role),
        security_profile: user.security_profile
          ? (() => {
              const isSelf = scopedContinuityAllowed && user.id === requesterId;
              const isAuthorizerRole =
                user.role === UserRole.OWNER || user.role === UserRole.MANAGER;
              const canReadScopedPin =
                canReadSensitiveProfile || isSelf || isAuthorizerRole;
              const canReadScopedTotp =
                canReadSensitiveProfile ||
                (scopedContinuityAllowed && isAuthorizerRole);
              const scope = scopedContinuityAllowed
                ? isSelf
                  ? 'self'
                  : isAuthorizerRole
                    ? 'authorizer'
                    : 'masked'
                : canReadSensitiveProfile
                  ? 'full'
                  : 'masked';

              return {
                user_id: user.security_profile.user_id,
                pin_hash: canReadScopedPin
                  ? user.security_profile.pin_hash
                  : null,
                totp_secret_seed: canReadScopedTotp
                  ? user.security_profile.totp_secret_seed
                  : null,
                is_totp_enabled: user.security_profile.is_totp_enabled,
                is_pin_enabled: user.security_profile.is_pin_enabled,
                scope,
              };
            })()
          : null,
      }),
    );

    if (continuityScopeRequested) {
      return {
        staff,
        metadata: {
          snapshot_timestamp: new Date().toISOString(),
        },
      };
    }

    return staff;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, 10);
  }
}
