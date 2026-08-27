import { Test, TestingModule } from '@nestjs/testing';
import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { User } from '../../src/modules/identity/entities/user.entity';
import { AuditLog } from '../../src/modules/identity/entities/audit-log.entity';
import { SecurityProfile } from '../../src/modules/identity/entities/security-profile.entity';
import { AuditIntegrityAlert } from '../../src/modules/identity/entities/audit-integrity-alert.entity';

@Global()
@Module({
  providers: [{ provide: DataSource, useValue: {} }],
  exports: [DataSource],
})
class TestDatabaseModule {}

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let userRepository: Partial<Record<keyof Repository<User>, jest.Mock>>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET =
      'supersecretjwtkeyforadminbackenddevelopmentonly-32bytes';
    process.env.JWT_ISSUER = 'omnifood-admin-api';
    process.env.JWT_AUDIENCE = 'omnifood-pos-client';

    userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        TestDatabaseModule,
        IdentityModule,
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(userRepository)
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue({ save: jest.fn() })
      .overrideProvider(getRepositoryToken(SecurityProfile))
      .useValue({ findOne: jest.fn() })
      .overrideProvider(getRepositoryToken(AuditIntegrityAlert))
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  describe('/identity/login (POST)', () => {
    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/identity/login')
        .send({ email: 'wrong@test.com', pass: 'wrong' })
        .expect(401);
    });
  });

  describe('/identity/staff (GET)', () => {
    it('should return 401 when no token is provided', () => {
      return request(app.getHttpServer()).get('/identity/staff').expect(401);
    });
  });

  afterAll(async () => {
    await app?.close();
  });
});
