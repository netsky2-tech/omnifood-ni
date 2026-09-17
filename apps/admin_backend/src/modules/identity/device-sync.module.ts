import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DeviceSyncCredential } from './entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from './entities/device-sync-credential-event.entity';
import { ActivationAttempt } from '../onboarding/entities/activation-attempt.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { DeviceSyncCredentialService } from './services/device-sync-credential.service';
import { DeviceSyncTokenController } from './controllers/device-sync-token.controller';
import { SyncTransportGuard } from './guards/sync-transport.guard';
import {
  DEVICE_SYNC_JWT_CONFIG,
  DeviceSyncJwtConfig,
  DeviceSyncJwtConfigModule,
} from './config/device-sync-jwt.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceSyncCredential,
      DeviceSyncCredentialEvent,
      ActivationAttempt,
      Tenant,
    ]),
    DeviceSyncJwtConfigModule,
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
  controllers: [DeviceSyncTokenController],
  providers: [DeviceSyncCredentialService, SyncTransportGuard],
  exports: [
    DeviceSyncCredentialService,
    SyncTransportGuard,
    DeviceSyncJwtConfigModule,
    TypeOrmModule,
    JwtModule,
  ],
})
export class DeviceSyncModule {}
