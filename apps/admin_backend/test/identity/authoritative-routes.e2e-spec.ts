import {
  Controller,
  Get,
  INestApplication,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../src/modules/identity/guards/authoritative-current-user.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { CurrentUserAuthorizationService } from '../../src/modules/identity/services/current-user-authorization.service';
import { AuthController } from '../../src/modules/identity/controllers/auth.controller';
import { UsersController } from '../../src/modules/identity/controllers/users.controller';

@Controller('identity')
class SensitiveIdentityController {
  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @Post('users')
  write() {
    return { ok: true };
  }
  @UseGuards(AuthGuard, RolesGuard)
  @Get('users')
  read() {
    return { ok: true };
  }
}

@Controller('v1/sync')
class CreditNoteBoundaryController {
  @UseGuards(AuthGuard, RolesGuard)
  @Post('batch')
  batch() {
    return { ok: true };
  }
}

const handler = (prototype: object, name: string): object => {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, name) as
    | {
        value?: unknown;
      }
    | undefined;
  const value = descriptor?.value;
  if (typeof value !== 'function') {
    throw new Error(`Missing ${name} handler`);
  }
  return value;
};

describe('authoritative identity routes (e2e)', () => {
  let app: INestApplication<App>;
  const auth = { canActivate: jest.fn() };
  const authoritative = { canActivate: jest.fn() };
  const roles = { canActivate: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SensitiveIdentityController, CreditNoteBoundaryController],
    })
      .overrideGuard(AuthGuard)
      .useValue(auth)
      .overrideGuard(AuthoritativeCurrentUserGuard)
      .useValue(authoritative)
      .overrideGuard(RolesGuard)
      .useValue(roles)
      .overrideProvider(CurrentUserAuthorizationService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    auth.canActivate.mockReset().mockResolvedValue(true);
    authoritative.canActivate.mockReset().mockResolvedValue(true);
    roles.canActivate.mockReset().mockResolvedValue(true);
  });

  it('fails a protected write before the handler when authoritative authorization rejects', async () => {
    authoritative.canActivate.mockRejectedValue(new UnauthorizedException());

    await request(app.getHttpServer()).post('/identity/users').expect(401);
    expect(auth.canActivate).toHaveBeenCalledTimes(1);
    expect(roles.canActivate).not.toHaveBeenCalled();
  });

  it('keeps the non-sensitive GET route outside authoritative enforcement', async () => {
    await request(app.getHttpServer()).get('/identity/users').expect(200);
    expect(authoritative.canActivate).not.toHaveBeenCalled();
  });

  it('keeps CREDIT_NOTE synchronization outside this 2A-E boundary', async () => {
    await request(app.getHttpServer()).post('/v1/sync/batch').expect(201);
    expect(authoritative.canActivate).not.toHaveBeenCalled();
  });

  it('declares AuthGuard, authoritative guard, then RolesGuard only on approved identity routes', () => {
    const userCreate = handler(UsersController.prototype, 'create');
    const userList = handler(UsersController.prototype, 'list');
    const getStaff = handler(AuthController.prototype, 'getStaff');

    expect(Reflect.getMetadata(GUARDS_METADATA, userCreate)).toEqual([
      AuthGuard,
      AuthoritativeCurrentUserGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, userList)).toEqual([
      AuthGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, getStaff)).toEqual([
      AuthGuard,
      AuthoritativeCurrentUserGuard,
      RolesGuard,
    ]);
  });

  afterAll(async () => app.close());
});
