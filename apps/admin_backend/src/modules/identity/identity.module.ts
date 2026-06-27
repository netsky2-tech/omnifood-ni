import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { AuditLog } from './entities/audit-log.entity';
import { SecurityProfile } from './entities/security-profile.entity';
import { AuditIntegrityAlert } from './entities/audit-integrity-alert.entity';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { AuditIntegrityService } from './services/audit-integrity.service';
import { AuthController } from './controllers/auth.controller';
import { AuditController } from './controllers/audit.controller';
import { UsersController } from './controllers/users.controller';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';

export const getRequiredIdentityJwtSecret = (
  configService: ConfigService,
): string => {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
};

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      AuditLog,
      SecurityProfile,
      AuditIntegrityAlert,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: getRequiredIdentityJwtSecret(configService),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  controllers: [AuthController, AuditController, UsersController],
  providers: [
    AuthService,
    UserService,
    AuditIntegrityService,
    AuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    UserService,
    AuditIntegrityService,
    AuthGuard,
    RolesGuard,
  ],
})
export class IdentityModule {}
