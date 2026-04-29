import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/core/app/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
      return request(app.getHttpServer())
        .get('/identity/staff')
        .expect(401);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
