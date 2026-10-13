import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DeviceSyncCredential } from './entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from './entities/device-sync-credential-event.entity';
import { ActivationAttempt } from '../onboarding/entities/activation-attempt.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { DeviceSyncCredentialService } from './services/device-sync-credential.service';
import { DeviceSyncTokenController } from './controllers/device-sync-token.controller';
import { DeviceSyncRevocationController } from './controllers/device-sync-revocation.controller';
import { SyncTransportGuard } from './guards/sync-transport.guard';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  DeviceSyncJwtConfig,
  DeviceSyncJwtConfigModule,
} from './config/device-sync-jwt.config';
import { IdentityJwtConfigModule } from './config/identity-jwt.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceSyncCredential,
      DeviceSyncCredentialEvent,
      ActivationAttempt,
      Tenant,
    ]),
    DeviceSyncJwtConfigModule,
    IdentityJwtConfigModule,
    JwtModule.registerAsync({
      imports: [DeviceSyncJwtConfigModule],
      inject: [DEVICE_SYNC_JWT_CONFIG],
      useFactory: (config: DeviceSyncJwtConfig) => ({
        secret: config.secret,
        signOptions: {
          algorithm: config.algorithm,
          expiresIn: config.accessTokenTtlSeconds,
          issuer: config.issuer,
          audience: config.audience,
        },
      }),
    }),
  ],
  controllers: [DeviceSyncTokenController, DeviceSyncRevocationController],
  providers: [
    DeviceSyncCredentialService,
    SyncTransportGuard,
    AuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [
    DeviceSyncCredentialService,
    SyncTransportGuard,
    DeviceSyncJwtConfigModule,
    TypeOrmModule,
    JwtModule,
  ],
})
export class DeviceSyncModule {}
