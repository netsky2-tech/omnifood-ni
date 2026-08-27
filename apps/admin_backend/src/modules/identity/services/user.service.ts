import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    @InjectRepository(SecurityProfile)
    private securityProfileRepository: Repository<SecurityProfile>,
  ) {}

  async findByTenant(tenantId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { tenant_id: tenantId, is_active: true },
      select: ['id', 'email', 'name', 'role', 'created_at'],
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
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const user = new User();
    user.email = dto.email;
    user.name = dto.name;
    user.role = dto.role;
    user.tenant_id = tenantId;
    user.is_active = true;

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, 10);
    }

    const savedUser = await this.userRepository.save(user);

    if (dto.pin) {
      const profile = this.securityProfileRepository.create({
        user_id: savedUser.id,
        pin_hash: await bcrypt.hash(dto.pin, 10),
        is_pin_enabled: true,
      });
      await this.securityProfileRepository.save(profile);
    }

    await this.logAction('USER_CREATED', savedUser.id, tenantId, adminId);

    return savedUser;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    tenantId: string,
    adminId: string,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.name) user.name = dto.name;
    if (dto.role) user.role = dto.role;

    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, 10);
    }

    const updatedUser = await this.userRepository.save(user);

    if (dto.pin) {
      const existingProfile = await this.securityProfileRepository.findOne({
        where: { user_id: updatedUser.id },
      });
      const profile =
        existingProfile ??
        this.securityProfileRepository.create({ user_id: updatedUser.id });
      profile.pin_hash = await bcrypt.hash(dto.pin, 10);
      profile.is_pin_enabled = true;
      await this.securityProfileRepository.save(profile);
    }

    await this.logAction('USER_UPDATED', updatedUser.id, tenantId, adminId);

    return updatedUser;
  }

  async deactivate(
    id: string,
    tenantId: string,
    adminId: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    user.is_active = false;
    await this.userRepository.save(user);

    await this.logAction('USER_DEACTIVATED', id, tenantId, adminId);
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
    const user = await this.userRepository.findOne({
      where: { id: userId, tenant_id: tenantId, is_active: true },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    let profile = await this.securityProfileRepository.findOne({
      where: { user_id: user.id },
    });
    if (!profile) {
      profile = this.securityProfileRepository.create({
        user_id: user.id,
        is_pin_enabled: false,
        is_totp_enabled: false,
        custom_permissions: [],
      });
    }

    profile.custom_permissions = customPermissions;
    await this.securityProfileRepository.save(profile);

    await this.logAction(
      'USER_PERMISSIONS_UPDATED',
      user.id,
      tenantId,
      adminId,
    );

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
  }

  private async logAction(
    action: string,
    targetId: string,
    tenantId: string,
    adminId: string,
  ) {
    const log = new AuditLog();
    log.action = action;
    log.target_type = 'USER';
    log.target_id = targetId;
    log.tenant_id = tenantId;
    log.user_id = adminId;
    log.device_id = 'WEB_ADMIN';
    log.timestamp = new Date();
    log.metadata = { timestamp: new Date().toISOString() };

    await this.auditRepository.save(log);
  }
}
