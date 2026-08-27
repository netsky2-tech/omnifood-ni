import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { SecurityProfile } from './entities/security-profile.entity';
import { AuditIntegrityAlert } from './entities/audit-integrity-alert.entity';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { AuditIntegrityService } from './services/audit-integrity.service';
import { SupervisorOverrideService } from './services/supervisor-override.service';
import { AuditTrailService } from './services/audit-trail.service';
import { AuthController } from './controllers/auth.controller';
import { AuditController } from './controllers/audit.controller';
import { UsersController } from './controllers/users.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
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
    ]),
    JwtModule.registerAsync({
      imports: [IdentityJwtConfigModule],
      inject: [IDENTITY_JWT_CONFIG],
      useFactory: (config: IdentityJwtConfig) => ({
        secret: config.secret,
        signOptions: {
          algorithm: config.algorithm,
          expiresIn: '1d',
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
    SupervisorOverrideService,
    AuditTrailService,
    AuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [
    JwtModule,
    AuthService,
    UserService,
    AuditIntegrityService,
    SupervisorOverrideService,
    AuditTrailService,
    AuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
})
export class IdentityModule {}
