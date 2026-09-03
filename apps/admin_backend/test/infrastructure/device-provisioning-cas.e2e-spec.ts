import { Test, TestingModule } from '@nestjs/testing';
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Headers,
  HttpException,
  HttpStatus,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';

// Domain DTOs and In-Memory State for Phase 8 E2E Testing
interface DeviceRegistration {
  deviceId: string;
  activationCode: string;
  tenantId: string;
  deviceCertificate: string;
  status: 'ACTIVE' | 'REVOKED';
  enrolledAt: string;
}

interface PolicyMatrix {
  id: string;
  tenantId: string;
  version: number;
  etag: string;
  permissions: Record<string, string[]>;
  updatedAt: string;
}

@Controller('infrastructure')
class InfrastructureE2EController {
  private activationCodes: Record<string, { code: string; tenantId: string }> =
    {
      '123456': { code: '123456', tenantId: 'tenant-demo' },
    };

  private registeredDevices: Record<string, DeviceRegistration> = {};

  private policyMatrices: Record<string, PolicyMatrix> = {
    'tenant-demo': {
      id: 'matrix-01',
      tenantId: 'tenant-demo',
      version: 1,
      etag: '"w/v1"',
      permissions: {
        CASHIER: ['pos:sale:create', 'pos:sale:read'],
        MANAGER: [
          'pos:drawer:open_manual',
          'pos:discount:override',
          'pos:void_sale',
        ],
      },
      updatedAt: new Date().toISOString(),
    },
  };

  // 1. Enrolamiento: Código de 6 dígitos emite certificado y catálogo inicial
  @Post('devices/enroll')
  enrollDevice(@Body() body: { activationCode: string; deviceId: string }) {
    const valid = this.activationCodes[body.activationCode];
    if (!valid) {
      throw new HttpException(
        'Invalid or expired activation code',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const registration: DeviceRegistration = {
      deviceId: body.deviceId,
      activationCode: body.activationCode,
      tenantId: valid.tenantId,
      deviceCertificate: `CERT-${body.deviceId}-${Date.now()}`,
      status: 'ACTIVE',
      enrolledAt: new Date().toISOString(),
    };

    this.registeredDevices[body.deviceId] = registration;

    return {
      status: 'ENROLLED',
      tenantId: valid.tenantId,
      certificate: registration.deviceCertificate,
      initialCatalog: {
        categories: ['Bebidas', 'Alimentos'],
        policies: this.policyMatrices[valid.tenantId],
      },
    };
  }

  // 2. Kill-Switch: Revocar dispositivo desde el BOH
  @Post('devices/:deviceId/revoke')
  revokeDevice(@Param('deviceId') deviceId: string) {
    const device = this.registeredDevices[deviceId];
    if (!device) {
      throw new HttpException('Device not found', HttpStatus.NOT_FOUND);
    }
    device.status = 'REVOKED';
    return {
      status: 'REVOKED',
      deviceId,
      message: 'Device kill-switch activated',
    };
  }

  // Sincronización de dispositivo: si está revocado, responde 403 KILL_SWITCH_TRIGGERED
  @Get('devices/:deviceId/sync-status')
  checkSyncStatus(@Param('deviceId') deviceId: string) {
    const device = this.registeredDevices[deviceId];
    if (!device || device.status === 'REVOKED') {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'DEVICE_REVOKED',
          action: 'PURGE_LOCAL_DATABASE_AND_LOGOUT',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return { status: 'ACTIVE', tenantId: device.tenantId };
  }

  // 3. Control de Concurrencia (CAS): Matriz de Permisos
  @Get('policies/:tenantId')
  getPolicies(@Param('tenantId') tenantId: string) {
    const policy = this.policyMatrices[tenantId];
    if (!policy) {
      throw new HttpException('Policy matrix not found', HttpStatus.NOT_FOUND);
    }
    return policy;
  }

  @Put('policies/:tenantId')
  updatePolicies(
    @Param('tenantId') tenantId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: { version: number; permissions: Record<string, string[]> },
  ) {
    const policy = this.policyMatrices[tenantId];
    if (!policy) {
      throw new HttpException('Policy matrix not found', HttpStatus.NOT_FOUND);
    }

    // CAS optimistic concurrency check
    if (ifMatch && ifMatch !== policy.etag) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PRECONDITION_FAILED,
          error: 'PRECONDITION_FAILED',
          message:
            'La política fue modificada concurrentemente por otro administrador. Por favor recargue.',
          currentVersion: policy.version,
          currentEtag: policy.etag,
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    if (body.version !== policy.version) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PRECONDITION_FAILED,
          error: 'VERSION_MISMATCH',
          message: 'Version conflict detected',
          currentVersion: policy.version,
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    policy.version += 1;
    policy.etag = `"w/v${policy.version}"`;
    policy.permissions = body.permissions;
    policy.updatedAt = new Date().toISOString();

    return {
      status: 'UPDATED',
      version: policy.version,
      etag: policy.etag,
      permissions: policy.permissions,
    };
  }
}

describe('Fase 8: Motor de Provisión y Concurrencia (Infraestructura & CAS) (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InfrastructureE2EController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Enrolamiento de Dispositivo: Código 6 dígitos emite certificado y descarga catálogo', async () => {
    const response = await request(app.getHttpServer())
      .post('/infrastructure/devices/enroll')
      .send({ activationCode: '123456', deviceId: 'tablet-pos-new-01' })
      .expect(201);

    expect(response.body.status).toEqual('ENROLLED');
    expect(response.body.certificate).toContain('CERT-tablet-pos-new-01');
    expect(response.body.initialCatalog).toBeDefined();
    expect(response.body.initialCatalog.policies.permissions.MANAGER).toContain(
      'pos:drawer:open_manual',
    );
  });

  it('2. Revocación (Kill-Switch): Dispositivo revocado recibe 403 para purgar SQLite local', async () => {
    // Verificar que el dispositivo está activo
    await request(app.getHttpServer())
      .get('/infrastructure/devices/tablet-pos-new-01/sync-status')
      .expect(200);

    // Desde el BOH se revoca el dispositivo
    const revokeRes = await request(app.getHttpServer())
      .post('/infrastructure/devices/tablet-pos-new-01/revoke')
      .expect(201);

    expect(revokeRes.body.status).toEqual('REVOKED');

    // En el siguiente intento de sincronización, la tablet recibe la instrucción de purga local
    const syncRes = await request(app.getHttpServer())
      .get('/infrastructure/devices/tablet-pos-new-01/sync-status')
      .expect(403);

    expect(syncRes.body.error).toEqual('DEVICE_REVOKED');
    expect(syncRes.body.action).toEqual('PURGE_LOCAL_DATABASE_AND_LOGOUT');
  });

  it('3. Control de Concurrencia (CAS): Pestaña A guarda -> Pestaña B es rechazada con HTTP 412', async () => {
    // Pestaña A y B leen la versión 1 de la política
    const initialPolicy = await request(app.getHttpServer())
      .get('/infrastructure/policies/tenant-demo')
      .expect(200);

    expect(initialPolicy.body.version).toEqual(1);
    expect(initialPolicy.body.etag).toEqual('"w/v1"');

    // Pestaña A guarda un cambio primero (agrega permiso a CASHIER)
    const updateTabA = await request(app.getHttpServer())
      .put('/infrastructure/policies/tenant-demo')
      .set('If-Match', '"w/v1"')
      .send({
        version: 1,
        permissions: {
          CASHIER: ['pos:sale:create', 'pos:sale:read', 'pos:discount:manual'],
          MANAGER: ['pos:drawer:open_manual'],
        },
      })
      .expect(200);

    expect(updateTabA.body.version).toEqual(2);
    expect(updateTabA.body.etag).toEqual('"w/v2"');

    // Pestaña B intenta guardar sobre la versión 1 (con If-Match desactualizado)
    const updateTabB = await request(app.getHttpServer())
      .put('/infrastructure/policies/tenant-demo')
      .set('If-Match', '"w/v1"')
      .send({
        version: 1,
        permissions: {
          CASHIER: ['pos:sale:create'],
          MANAGER: ['pos:drawer:open_manual', 'pos:override:all'],
        },
      })
      .expect(412); // HTTP 412 Precondition Failed

    expect(updateTabB.body.error).toEqual('PRECONDITION_FAILED');
    expect(updateTabB.body.message).toContain('modificada concurrentemente');
  });
});
