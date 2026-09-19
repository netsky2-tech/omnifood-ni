import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { CreateUserDto, UpdateUserDto } from '../dto/user-management.dto';
import {
  AppPermission,
  ALL_APP_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  resolveEffectivePermissions,
} from '../security/permissions.enum';
import {
  PermissionMatrixResponseDto,
  UserEffectivePermissionsDto,
} from '../dto/permission-matrix.dto';
import { AuthService } from './auth.service';
import { bindRlsTenantContext } from '../human-authorization/rls/tenant-context';
import { markTenantPublicationDirty } from '../human-authorization/services/tenant-publication-marker';

/**
 * Publication marking (design §11.2 decision 16): every policy-affecting
 * staff/profile mutation (users.role, users.is_active,
 * users.attempt_reset_generation, security_profiles.pin_hash,
 * security_profiles.custom_permissions) marks the tenant's publication state
 * dirty inside its own transaction, unconditionally instead of diffing policy
 * fields. Unconditional marking is correct because a spurious dirty flag only
 * costs the publisher one replay-identical publication that clears the
 * marker, whereas a missed mark silently leaves the published policy stale.
 * Reads, audit writes, and refresh-token revocations are not policy mutations
 * and never mark; neither binding nor marking failures are ever swallowed, so
 * a mutation whose tenant scope or publication signal cannot be persisted
 * rolls back whole.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    @InjectRepository(SecurityProfile)
    private securityProfileRepository: Repository<SecurityProfile>,
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  async findByTenant(tenantId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { tenant_id: tenantId, is_active: true },
      select: ['id', 'email', 'name', 'role', 'created_at', 'is_active'],
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id, is_active: true } });
  }

  async create(
    dto: CreateUserDto,
    tenantId: string,
    adminId: string,
  ): Promise<User> {
    // Hashing is pure CPU work over secrets: keep it outside the transaction.
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : undefined;

    return this.dataSource.transaction(async (manager) => {
      await bindRlsTenantContext(manager, tenantId);

      const existing = await manager
        .getRepository(User)
        .findOne({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('El email ya está registrado');
      }

      const user = new User();
      user.email = dto.email;
      user.name = dto.name;
      user.role = dto.role;
      user.tenant_id = tenantId;
      user.is_active = true;
      if (passwordHash) user.password_hash = passwordHash;

      const savedUser = await manager.getRepository(User).save(user);

      if (pinHash) {
        const profiles = manager.getRepository(SecurityProfile);
        await profiles.save(
          profiles.create({
            user_id: savedUser.id,
            pin_hash: pinHash,
            is_pin_enabled: true,
          }),
        );
      }

      await this.logAction(
        'USER_CREATED',
        savedUser.id,
        tenantId,
        adminId,
        manager,
      );

      await markTenantPublicationDirty(manager, tenantId);

      return savedUser;
    });
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    tenantId: string,
    adminId: string,
  ): Promise<User> {
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : undefined;
    const requiresSecurityRevocation =
      dto.role !== undefined || passwordHash !== undefined;

    if (requiresSecurityRevocation) {
      return this.dataSource.transaction(async (manager) =>
        this.updateSensitiveUser(
          manager,
          id,
          dto,
          tenantId,
          adminId,
          passwordHash,
          pinHash,
        ),
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await bindRlsTenantContext(manager, tenantId);

      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id, tenant_id: tenantId },
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (dto.name) user.name = dto.name;
      if (dto.role) user.role = dto.role;

      const updatedUser = await users.save(user);

      if (pinHash) {
        const profiles = manager.getRepository(SecurityProfile);
        const existingProfile = await profiles.findOne({
          where: { user_id: updatedUser.id },
        });
        const profile =
          existingProfile ?? profiles.create({ user_id: updatedUser.id });
        profile.pin_hash = pinHash;
        profile.is_pin_enabled = true;
        await profiles.save(profile);
      }

      await this.logAction(
        'USER_UPDATED',
        updatedUser.id,
        tenantId,
        adminId,
        manager,
      );

      await markTenantPublicationDirty(manager, tenantId);

      return updatedUser;
    });
  }

  async deactivate(
    id: string,
    tenantId: string,
    adminId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await bindRlsTenantContext(manager, tenantId);

      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id, tenant_id: tenantId },
        lock: { mode: 'pessimistic_write' },
        select: ['id', 'tenant_id', 'is_active', 'security_version'],
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      user.is_active = false;
      user.security_version += 1;
      await users.save(user);
      await this.authService.revokeRefreshSessionForUser(
        manager,
        user.id,
        new Date(),
      );
      await this.logAction('USER_DEACTIVATED', id, tenantId, adminId, manager);
      await markTenantPublicationDirty(manager, tenantId);
    });
  }

  private async updateSensitiveUser(
    manager: EntityManager,
    id: string,
    dto: UpdateUserDto,
    tenantId: string,
    adminId: string,
    passwordHash?: string,
    pinHash?: string,
  ): Promise<User> {
    await bindRlsTenantContext(manager, tenantId);

    const users = manager.getRepository(User);
    const user = await users.findOne({
      where: { id, tenant_id: tenantId },
      lock: { mode: 'pessimistic_write' },
      select: [
        'id',
        'tenant_id',
        'name',
        'role',
        'password_hash',
        'security_version',
      ],
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isRoleActuallyChanged =
      dto.role !== undefined && dto.role !== user.role;
    const isPasswordChanged = passwordHash !== undefined;
    const shouldRevoke = isRoleActuallyChanged || isPasswordChanged;

    if (dto.name) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (passwordHash) user.password_hash = passwordHash;
    if (shouldRevoke) {
      user.security_version += 1;
    }
    const updatedUser = await users.save(user);

    if (pinHash) {
      const profiles = manager.getRepository(SecurityProfile);
      const existingProfile = await profiles.findOne({
        where: { user_id: updatedUser.id },
      });
      const profile =
        existingProfile ?? profiles.create({ user_id: updatedUser.id });
      profile.pin_hash = pinHash;
      profile.is_pin_enabled = true;
      await profiles.save(profile);
    }

    if (shouldRevoke) {
      await this.authService.revokeRefreshSessionForUser(
        manager,
        updatedUser.id,
        new Date(),
      );
    }
    await this.logAction(
      'USER_UPDATED',
      updatedUser.id,
      tenantId,
      adminId,
      manager,
    );
    await markTenantPublicationDirty(manager, tenantId);
    return updatedUser;
  }

  getPermissionsMatrix(): PermissionMatrixResponseDto {
    return {
      role_defaults: DEFAULT_ROLE_PERMISSIONS as Record<
        string,
        AppPermission[]
      >,
      all_permissions: ALL_APP_PERMISSIONS,
    };
  }

  async getUserEffectivePermissions(
    userId: string,
    tenantId: string,
  ): Promise<UserEffectivePermissionsDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenant_id: tenantId, is_active: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const profile = await this.securityProfileRepository.findOne({
      where: { user_id: user.id },
    });

    const customPermissions = (profile?.custom_permissions ??
      []) as AppPermission[];
    const rolePermissions = (DEFAULT_ROLE_PERMISSIONS[user.role] ??
      []) as AppPermission[];
    const effectivePermissions = resolveEffectivePermissions(
      user.role,
      customPermissions,
    );

    return {
      user_id: user.id,
      role: user.role,
      role_permissions: rolePermissions,
      custom_permissions: customPermissions,
      effective_permissions: effectivePermissions,
    };
  }

  async setCustomPermissions(
    userId: string,
    customPermissions: AppPermission[],
    tenantId: string,
    adminId: string,
  ): Promise<UserEffectivePermissionsDto> {
    return this.dataSource.transaction(async (manager) => {
      await bindRlsTenantContext(manager, tenantId);

      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id: userId, tenant_id: tenantId, is_active: true },
      });
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const profiles = manager.getRepository(SecurityProfile);
      let profile = await profiles.findOne({
        where: { user_id: user.id },
      });
      if (!profile) {
        profile = profiles.create({
          user_id: user.id,
          is_pin_enabled: false,
          is_totp_enabled: false,
          custom_permissions: [],
        });
      }

      profile.custom_permissions = customPermissions;
      await profiles.save(profile);

      await this.logAction(
        'USER_PERMISSIONS_UPDATED',
        user.id,
        tenantId,
        adminId,
        manager,
      );

      await markTenantPublicationDirty(manager, tenantId);

      const rolePermissions = (DEFAULT_ROLE_PERMISSIONS[user.role] ??
        []) as AppPermission[];
      const effectivePermissions = resolveEffectivePermissions(
        user.role,
        profile.custom_permissions,
      );

      return {
        user_id: user.id,
        role: user.role,
        role_permissions: rolePermissions,
        custom_permissions: profile.custom_permissions as AppPermission[],
        effective_permissions: effectivePermissions,
      };
    });
  }

  private async logAction(
    action: string,
    targetId: string,
    tenantId: string,
    adminId: string,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(AuditLog)
      : this.auditRepository;

    const lastLog =
      typeof repo.findOne === 'function'
        ? await repo.findOne({
            where: {
              tenant_id: tenantId,
              device_id: 'WEB_ADMIN',
              user_id: adminId,
              forensic_status: 'ACTIVE',
            },
            order: { sequence_no: 'DESC' },
          })
        : null;

    const sequenceNo = lastLog ? Number(lastLog.sequence_no) + 1 : 1;
    const prevHash = lastLog?.entry_hash ? lastLog.entry_hash : 'GENESIS';
    const timestamp = new Date();
    const metadata: Record<string, unknown> = {
      timestamp: timestamp.toISOString(),
    };

    const canonicalPayload = `${adminId}|${action}|WEB_ADMIN|${timestamp.toISOString()}|${sequenceNo}|${prevHash}|null|null|${JSON.stringify(metadata)}`;
    const entryHash = crypto
      .createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    const log = new AuditLog();
    log.action = action;
    log.target_type = 'USER';
    log.target_id = targetId;
    log.tenant_id = tenantId;
    log.user_id = adminId;
    log.device_id = 'WEB_ADMIN';
    log.sequence_no = sequenceNo;
    log.prev_hash = prevHash;
    log.entry_hash = entryHash;
    log.timestamp = timestamp;
    log.metadata = metadata;
    log.forensic_status = 'ACTIVE';

    await repo.save(log);
  }
}
