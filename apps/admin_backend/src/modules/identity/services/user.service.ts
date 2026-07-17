import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { CreateUserDto, UpdateUserDto } from '../dto/user-management.dto';
import { AuthService } from './auth.service';

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

    const user = await this.userRepository.findOne({
      where: { id, tenant_id: tenantId },
    });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.name) user.name = dto.name;
    if (dto.role) user.role = dto.role;

    const updatedUser = await this.userRepository.save(user);

    if (pinHash) {
      const existingProfile = await this.securityProfileRepository.findOne({
        where: { user_id: updatedUser.id },
      });
      const profile =
        existingProfile ??
        this.securityProfileRepository.create({ user_id: updatedUser.id });
      profile.pin_hash = pinHash;
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
    await this.dataSource.transaction(async (manager) => {
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

    if (dto.name) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (passwordHash) user.password_hash = passwordHash;
    user.security_version += 1;
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

    await this.authService.revokeRefreshSessionForUser(
      manager,
      updatedUser.id,
      new Date(),
    );
    await this.logAction(
      'USER_UPDATED',
      updatedUser.id,
      tenantId,
      adminId,
      manager,
    );
    return updatedUser;
  }

  private async logAction(
    action: string,
    targetId: string,
    tenantId: string,
    adminId: string,
    manager?: EntityManager,
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

    await (manager
      ? manager.getRepository(AuditLog).save(log)
      : this.auditRepository.save(log));
  }
}
