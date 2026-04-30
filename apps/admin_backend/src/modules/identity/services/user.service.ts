import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { CreateUserDto, UpdateUserDto } from '../dto/user-management.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  async findByTenant(tenantId: string): Promise<User[]> {
    return this.userRepository.find({ 
      where: { tenant_id: tenantId, is_active: true },
      select: ['id', 'email', 'name', 'role', 'created_at']
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id, is_active: true } });
  }

  async create(dto: CreateUserDto, tenantId: string, adminId: string): Promise<User> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
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

    if (dto.pin) {
      user.pin_hash = await bcrypt.hash(dto.pin, 10);
    }

    const savedUser = await this.userRepository.save(user);

    await this.logAction('USER_CREATED', savedUser.id, tenantId, adminId);

    return savedUser;
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string, adminId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id, tenant_id: tenantId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.name) user.name = dto.name;
    if (dto.role) user.role = dto.role;
    
    if (dto.password) {
      user.password_hash = await bcrypt.hash(dto.password, 10);
    }

    if (dto.pin) {
      user.pin_hash = await bcrypt.hash(dto.pin, 10);
    }

    const updatedUser = await this.userRepository.save(user);

    await this.logAction('USER_UPDATED', updatedUser.id, tenantId, adminId);

    return updatedUser;
  }

  async deactivate(id: string, tenantId: string, adminId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id, tenant_id: tenantId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    user.is_active = false;
    await this.userRepository.save(user);

    await this.logAction('USER_DEACTIVATED', id, tenantId, adminId);
  }

  private async logAction(action: string, targetId: string, tenantId: string, adminId: string) {
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
