import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user.entity';
import { AuthenticatedUserDto, StaffSyncUserDto } from '../dto/identity.dto';
import { resolveInventoryBohPermissions } from '../guards/roles.guard';
import {
  IDENTITY_JWT_CONFIG,
  type IdentityJwtConfig,
} from '../config/identity-jwt.config';
import {
  JWT_TOKEN_TYPES,
  type JwtSignPayload,
} from '../security/jwt-token.types';

const SYNC_SCOPE = {
  POS_AUTH_CONTINUITY: 'pos-auth-continuity',
} as const;

type SyncScope = (typeof SYNC_SCOPE)[keyof typeof SYNC_SCOPE];

type StaffSyncItem = {} & StaffSyncUserDto;

const USER_ROLE_VALUES = new Set<string>(Object.values(UserRole));

const isUserRole = (value?: string): value is UserRole =>
  typeof value === 'string' && USER_ROLE_VALUES.has(value);

const isSyncScope = (value?: string): value is SyncScope =>
  value === SYNC_SCOPE.POS_AUTH_CONTINUITY;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    @Inject(IDENTITY_JWT_CONFIG) private readonly jwtConfig: IdentityJwtConfig,
  ) {}

  async login(email: string, pass: string) {
    let user: Pick<
      User,
      | 'id'
      | 'name'
      | 'email'
      | 'password_hash'
      | 'role'
      | 'tenant_id'
      | 'is_active'
    > | null = null;

    try {
      user = await this.userRepository.findOne({
        where: { email },
        select: [
          'id',
          'name',
          'email',
          'password_hash',
          'role',
          'tenant_id',
          'is_active',
        ],
      });
    } catch {
      user = null;
    }

    if (
      !user ||
      !user.is_active ||
      !(await bcrypt.compare(pass, user.password_hash))
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.tenant_id,
      user.role,
      user.is_active,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);

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

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id',
        'email',
        'tenant_id',
        'role',
        'is_active',
        'hashed_refresh_token',
      ],
    });

    if (!user || !user.is_active || !user.hashed_refresh_token) {
      throw new UnauthorizedException('Acceso denegado');
    }

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.hashed_refresh_token,
    );
    if (!refreshTokenMatches) {
      throw new UnauthorizedException('Token inválido');
    }

    const tokens = await this.getTokens(
      user.id,
      user.email,
      user.tenant_id,
      user.role,
      user.is_active,
    );
    await this.updateRefreshToken(user.id, tokens.refresh_token);
    return tokens;
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.update(userId, {
      hashed_refresh_token: hashedRefreshToken,
    });
  }

  async getTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
    isActive: boolean,
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
      security_version: 1,
    };
    const refreshPayload: JwtSignPayload = {
      ...identity,
      token_type: JWT_TOKEN_TYPES.REFRESH,
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

    const qb = this.userRepository
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

    const users = await qb.getMany();

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
