import { Global, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DeviceSyncModule } from './device-sync.module';
import { DeviceSyncCredentialService } from './services/device-sync-credential.service';
import { DeviceSyncTokenController } from './controllers/device-sync-token.controller';
import { SyncTransportGuard } from './guards/sync-transport.guard';
import { DeviceSyncCredential } from './entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from './entities/device-sync-credential-event.entity';
import { ActivationAttempt } from '../onboarding/entities/activation-attempt.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { DEVICE_SYNC_JWT_CONFIG } from './config/device-sync-jwt.config';

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: { transaction: jest.fn() } }],
  exports: [DataSource],
})
class TestDatabaseModule {}

describe('DeviceSyncModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_SECRET: 'test-secret-at-least-thirty-two-bytes-long',
              JWT_ISSUER: 'omnifood-admin',
              JWT_AUDIENCE: 'omnifood-pos',
              DEVICE_SYNC_JWT_AUDIENCE: 'omnifood-device-sync',
              DEVICE_SYNC_JWT_ACCESS_TTL_SECONDS: '900',
            }),
          ],
        }),
        TestDatabaseModule,
        DeviceSyncModule,
      ],
    })
      .overrideProvider(getRepositoryToken(DeviceSyncCredential))
      .useValue({})
      .overrideProvider(getRepositoryToken(DeviceSyncCredentialEvent))
      .useValue({})
      .overrideProvider(getRepositoryToken(ActivationAttempt))
      .useValue({})
      .overrideProvider(getRepositoryToken(Tenant))
      .useValue({})
      .compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('compiles DeviceSyncModule and provides DeviceSyncCredentialService and SyncTransportGuard', () => {
    const controller = module.get<DeviceSyncTokenController>(
      DeviceSyncTokenController,
    );
    expect(controller).toBeDefined();
    const service = module.get<DeviceSyncCredentialService>(
      DeviceSyncCredentialService,
    );
    expect(service).toBeDefined();
    const guard = module.get<SyncTransportGuard>(SyncTransportGuard);
    expect(guard).toBeDefined();
    const config = module.get(DEVICE_SYNC_JWT_CONFIG);
    expect(config).toBeDefined();
    expect(config.audience).toBe('omnifood-device-sync');
    expect(config.accessTokenTtlSeconds).toBe(900);
  });
});
