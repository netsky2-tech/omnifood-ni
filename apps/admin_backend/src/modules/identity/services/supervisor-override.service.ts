import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { AuditLog } from '../entities/audit-log.entity';
import {
  SupervisorOverrideRequestDto,
  SupervisorOverrideResponseDto,
  SupervisorAuthMethod,
} from '../dto/supervisor-override.dto';
import {
  hasPermission,
  resolveEffectivePermissions,
} from '../security/permissions.enum';
import { verifyTotp } from '../security/totp.util';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
} from '../config/identity-jwt.config';

@Injectable()
export class SupervisorOverrideService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SecurityProfile)
    private securityProfileRepository: Repository<SecurityProfile>,
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    private jwtService: JwtService,
    @Inject(IDENTITY_JWT_CONFIG) private readonly jwtConfig: IdentityJwtConfig,
  ) {}

  async authorizeOverride(
    dto: SupervisorOverrideRequestDto,
    tenantId: string,
    requestingUserId: string,
  ): Promise<SupervisorOverrideResponseDto> {
    const supervisor = await this.userRepository.findOne({
      where: { id: dto.supervisorId, tenant_id: tenantId, is_active: true },
    });

    if (!supervisor) {
      await this.logOverrideAudit(
        'SUPERVISOR_OVERRIDE_REJECTED',
        dto.supervisorId,
        requestingUserId,
        tenantId,
        dto.method,
        { reason: 'Supervisor not found or inactive', ...dto.context },
      );
      throw new NotFoundException('Supervisor no encontrado o inactivo');
    }

    const profile = await this.securityProfileRepository.findOne({
      where: { user_id: supervisor.id },
      select: [
        'id',
        'user_id',
        'pin_hash',
        'totp_secret_seed',
        'is_pin_enabled',
        'is_totp_enabled',
        'custom_permissions',
      ],
    });

    const effectivePermissions = resolveEffectivePermissions(
      supervisor.role,
      profile?.custom_permissions ?? [],
    );

    if (!hasPermission(effectivePermissions, dto.permissionRequired)) {
      await this.logOverrideAudit(
        'SUPERVISOR_OVERRIDE_REJECTED',
        supervisor.id,
        requestingUserId,
        tenantId,
        dto.method,
        {
          reason: 'Supervisor lacks required permission',
          permissionRequired: dto.permissionRequired,
          ...dto.context,
        },
      );
      throw new ForbiddenException(
        `El supervisor no posee el permiso requerido: ${dto.permissionRequired}`,
      );
    }

    if (dto.method === 'PIN') {
      if (!profile || !profile.is_pin_enabled || !profile.pin_hash) {
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          {
            reason: 'PIN authentication disabled for supervisor',
            ...dto.context,
          },
        );
        throw new UnauthorizedException(
          'Método PIN no habilitado para este supervisor',
        );
      }

      const pinMatches = await bcrypt.compare(dto.credential, profile.pin_hash);
      if (!pinMatches) {
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          { reason: 'Invalid PIN provided', ...dto.context },
        );
        throw new UnauthorizedException('PIN de supervisor incorrecto');
      }
    } else if (dto.method === 'TOTP') {
      if (!profile || !profile.is_totp_enabled || !profile.totp_secret_seed) {
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          {
            reason: 'TOTP authentication disabled for supervisor',
            ...dto.context,
          },
        );
        throw new UnauthorizedException(
          'Método TOTP no habilitado para este supervisor',
        );
      }

      const totpValid = verifyTotp(dto.credential, profile.totp_secret_seed, {
        window: 1,
        stepSeconds: 30,
      });

      if (!totpValid) {
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          { reason: 'Invalid TOTP token provided', ...dto.context },
        );
        throw new UnauthorizedException(
          'Código TOTP de supervisor incorrecto o expirado',
        );
      }
    }

    const now = Date.now();
    const expiresAtDate = new Date(now + 60 * 1000);
    const expiresAt = expiresAtDate.toISOString();

    const tokenPayload = {
      sub: requestingUserId,
      supervisor_id: supervisor.id,
      supervisor_name: supervisor.name,
      tenant_id: tenantId,
      method: dto.method,
      permission: dto.permissionRequired,
      token_type: 'supervisor_override',
    };

    const authorizationToken = this.jwtService.sign(tokenPayload, {
      secret: this.jwtConfig.secret,
      expiresIn: '60s',
    });

    await this.logOverrideAudit(
      'SUPERVISOR_OVERRIDE_APPROVED',
      supervisor.id,
      requestingUserId,
      tenantId,
      dto.method,
      {
        permissionRequired: dto.permissionRequired,
        expiresAt,
        ...dto.context,
      },
    );

    return {
      authorized: true,
      supervisorId: supervisor.id,
      supervisorName: supervisor.name,
      authorizationToken,
      expiresAt,
      permission: dto.permissionRequired,
    };
  }

  private async logOverrideAudit(
    action: string,
    authorizerSupervisorId: string,
    requestingUserId: string,
    tenantId: string,
    method: SupervisorAuthMethod,
    metadata?: Record<string, unknown>,
  ) {
    const log = new AuditLog();
    log.action = action;
    log.target_type = 'SUPERVISOR_OVERRIDE';
    log.target_id = authorizerSupervisorId;
    log.tenant_id = tenantId;
    log.user_id = requestingUserId;
    log.usuario_autorizador_id = authorizerSupervisorId;
    log.metodo_autorizacion = method;
    log.device_id = (metadata?.terminalId as string) || 'POS_LOCAL';
    log.timestamp = new Date();
    log.metadata = {
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    await this.auditRepository.save(log);
  }
}
