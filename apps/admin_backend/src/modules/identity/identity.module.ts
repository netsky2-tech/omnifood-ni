import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { SecurityProfile } from './entities/security-profile.entity';
import { AuditIntegrityAlert } from './entities/audit-integrity-alert.entity';
import { TenantCapabilityEvent } from './entities/tenant-capability-event.entity';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { AuditIntegrityService } from './services/audit-integrity.service';
import { AuditMetricsService } from './services/audit-metrics.service';
import { AuditVerificationService } from './services/audit-verification.service';
import { AuthController } from './controllers/auth.controller';
import { AuditController } from './controllers/audit.controller';
import { UsersController } from './controllers/users.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthoritativeCurrentUserGuard } from './guards/authoritative-current-user.guard';
import { CurrentUserAuthorizationService } from './services/current-user-authorization.service';
import { TenantCapabilityService } from './services/tenant-capability.service';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
  IdentityJwtConfigModule,
} from './config/identity-jwt.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuditLog,
      SecurityProfile,
      AuditIntegrityAlert,
      TenantCapabilityEvent,
    ]),
    JwtModule.registerAsync({
      imports: [IdentityJwtConfigModule],
      inject: [IDENTITY_JWT_CONFIG],
      useFactory: (config: IdentityJwtConfig) => ({
        secret: config.secret,
        signOptions: {
          algorithm: config.algorithm,
          expiresIn: config.accessTokenTtlSeconds,
          issuer: config.issuer,
          audience: config.audience,
        },
      }),
    }),
    IdentityJwtConfigModule,
  ],
  controllers: [AuthController, AuditController, UsersController],
  providers: [
    AuthService,
    UserService,
    AuditIntegrityService,
    AuditMetricsService,
    AuditVerificationService,
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    RolesGuard,
    CurrentUserAuthorizationService,
    TenantCapabilityService,
  ],
  exports: [
    JwtModule,
    IdentityJwtConfigModule,
    AuthService,
    UserService,
    AuditIntegrityService,
    AuditMetricsService,
    AuditVerificationService,
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    RolesGuard,
    CurrentUserAuthorizationService,
    TenantCapabilityService,
  ],
})
export class IdentityModule {}
