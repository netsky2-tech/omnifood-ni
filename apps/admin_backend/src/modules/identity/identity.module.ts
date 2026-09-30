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
import { SupervisorOverrideService } from './services/supervisor-override.service';
import { AuditTrailService } from './services/audit-trail.service';
import { AuditMetricsService } from './services/audit-metrics.service';
import { AuditVerificationService } from './services/audit-verification.service';
import { AuthController } from './controllers/auth.controller';
import { AuditController } from './controllers/audit.controller';
import { UsersController } from './controllers/users.controller';
import { CapabilityController } from './controllers/capability.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthoritativeCurrentUserGuard } from './guards/authoritative-current-user.guard';
import { CurrentUserAuthorizationService } from './services/current-user-authorization.service';
import { TenantCapabilityService } from './services/tenant-capability.service';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
  IdentityJwtConfigModule,
} from './config/identity-jwt.config';
import { HumanAuthorizationPepperStartupGuard } from './config/human-authorization-pepper.config';
import { HumanAuthorizationRecoveryTokenController } from './human-authorization/controllers/recovery-token.controller';
import { RecoveryTokenService } from './human-authorization/services/recovery-token.service';
import { HumanAuthorizationMetricsService } from './human-authorization/services/human-authorization-metrics.service';
import { OhacTenantTransaction } from './human-authorization/rls/ohac-tenant-transaction';

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
  controllers: [
    AuthController,
    AuditController,
    UsersController,
    CapabilityController,
    HumanAuthorizationRecoveryTokenController,
  ],
  providers: [
    AuthService,
    UserService,
    AuditIntegrityService,
    SupervisorOverrideService,
    AuditTrailService,
    AuditMetricsService,
    AuditVerificationService,
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    RolesGuard,
    PermissionsGuard,
    CurrentUserAuthorizationService,
    TenantCapabilityService,
    // OHAC recovery lifecycle (design §9): the human routes live here where
    // the human-session guards are registered; the device redeem route in the
    // sales module consumes the exported service. The pepper is validated at
    // bootstrap by the startup guard, never at module compile time.
    OhacTenantTransaction,
    HumanAuthorizationMetricsService,
    RecoveryTokenService,
    HumanAuthorizationPepperStartupGuard,
  ],
  exports: [
    JwtModule,
    IdentityJwtConfigModule,
    AuthService,
    UserService,
    AuditIntegrityService,
    SupervisorOverrideService,
    AuditTrailService,
    AuditMetricsService,
    AuditVerificationService,
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    RolesGuard,
    PermissionsGuard,
    CurrentUserAuthorizationService,
    TenantCapabilityService,
    RecoveryTokenService,
    HumanAuthorizationMetricsService,
  ],
})
export class IdentityModule {}
