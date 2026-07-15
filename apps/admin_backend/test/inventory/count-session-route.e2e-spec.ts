import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  NestInterceptor,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import { InventoryMovementController } from '../../src/modules/inventory/inventory-movement.controller';
import { CountSessionService } from '../../src/modules/inventory/count-session.service';
import { FxRateResolverService } from '../../src/modules/inventory/fx-rate-resolver.service';
import { InventoryPurchaseService } from '../../src/modules/inventory/inventory-purchase.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { RecipeService } from '../../src/modules/inventory/recipe.service';
import { ShrinkageService } from '../../src/modules/inventory/shrinkage.service';
import { ProductionService } from '../../src/modules/inventory/production.service';
import { TenantInterceptor } from '../../src/core/database/rls.interceptor';
import { AuthGuard } from '../../src/modules/identity/guards/auth.guard';
import { RolesGuard } from '../../src/modules/identity/guards/roles.guard';
import { Insumo } from '../../src/modules/inventory/entities/insumo.entity';
import {
  InventoryMovement,
  MovementType,
} from '../../src/modules/inventory/entities/inventory-movement.entity';
import {
  createIdentityJwtConfigProvider,
  createIdentityJwtTestConfigProvider,
} from '../support/identity-jwt-test.fixture';

const INVENTORY_API_PREFIX = '/api/inventory';
const TEST_TENANT_ID = 'tenant-count-session';

interface RequestWithUser {
  user?: {
    tenant_id: string;
  };
}

interface CountSessionResponseBody {
  sessionId: string;
  movementsCreated: number;
  skippedExisting: boolean;
}

interface BadRequestResponseBody {
  message: string[];
  error: string;
  statusCode: number;
}

interface TestInsumo {
  id: string;
  tenant_id: string;
  stock: number;
  existenciaActual: number;
  averageCost: number;
}

interface RepositoryFindOneInput {
  where: {
    id: string;
    tenant_id: string;
  };
}

const validCountSessionPayload = {
  id: 'count-session-route-1',
  warehouseId: 'warehouse-1',
  warehouseName: 'Main Warehouse',
  cutoffAt: '2026-06-02T10:00:00.000Z',
  status: 'posted',
  createdAt: '2026-06-02T09:00:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  postedAt: '2026-06-02T10:00:00.000Z',
  movementReferences: ['count-session-route-1:line-1'],
  lines: [
    {
      id: 'line-1',
      insumoId: 'ins-count-1',
      insumoName: 'Milk',
      uom: 'L',
      theoreticalQuantity: 15,
      approvedEntryIndex: 0,
      entries: [{ countedQuantity: 10 }],
    },
  ],
};

class TestTenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    request.user = { tenant_id: TEST_TENANT_ID };
    return next.handle();
  }
}

describe('Count session route (integration)', () => {
  let app: INestApplication<App>;
  const savedMovements: InventoryMovement[] = [];
  const findExistingMovement = jest.fn();
  const findInsumo = jest.fn();
  const saveInsumo = jest.fn();
  const createMovement = jest.fn(
    (movement: Partial<InventoryMovement>): InventoryMovement =>
      movement as InventoryMovement,
  );
  const saveMovement = jest.fn((movement: InventoryMovement) => {
    savedMovements.push(movement);
    return Promise.resolve(movement);
  });
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Insumo) {
        return {
          findOne: findInsumo,
          save: saveInsumo,
        };
      }

      if (entity === InventoryMovement) {
        return {
          create: createMovement,
          findOneBy: findExistingMovement,
          save: saveMovement,
        };
      }

      throw new Error('Unexpected repository');
    }),
  };
  const transaction = jest.fn(
    (handler: (entityManager: typeof manager) => Promise<unknown>) =>
      handler(manager),
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [InventoryMovementController],
      providers: [
        CountSessionService,
        {
          provide: DataSource,
          useValue: { transaction },
        },
        {
          provide: FxRateResolverService,
          useValue: { getBcnRateByInvoiceDate: jest.fn() },
        },
        {
          provide: InventoryPurchaseService,
          useValue: {
            previewPurchase: jest.fn(),
            recordPurchase: jest.fn(),
            correctPurchase: jest.fn(),
          },
        },
        {
          provide: ShrinkageService,
          useValue: { recordShrinkage: jest.fn() },
        },
        {
          provide: InventoryService,
          useValue: { syncMovements: jest.fn() },
        },
        {
          provide: RecipeService,
          useValue: { ingestPosVersion: jest.fn() },
        },
        {
          provide: ProductionService,
          useValue: { replayProductionClose: jest.fn() },
        },
        {
          provide: TenantInterceptor,
          useClass: TestTenantInterceptor,
        },
        AuthGuard,
        RolesGuard,
        Reflector,
        JwtService,
        createIdentityJwtTestConfigProvider(),
        createIdentityJwtConfigProvider(),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      (request: RequestWithUser, _response: unknown, next: () => void) => {
        request.user = { tenant_id: TEST_TENANT_ID };
        next();
      },
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    savedMovements.length = 0;
    findExistingMovement.mockResolvedValue(null);
    findInsumo.mockImplementation(({ where }: RepositoryFindOneInput) =>
      Promise.resolve<TestInsumo>({
        id: where.id,
        tenant_id: where.tenant_id,
        stock: 15,
        existenciaActual: 15,
        averageCost: 8,
      }),
    );
    saveInsumo.mockImplementation((insumo: TestInsumo) =>
      Promise.resolve(insumo),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('accepts a valid count-session document and links the resulting adjustment movement', async () => {
    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/count-sessions`)
      .send(validCountSessionPayload)
      .expect(201);

    const body = response.body as CountSessionResponseBody;
    expect(body).toEqual({
      sessionId: validCountSessionPayload.id,
      movementsCreated: 1,
      skippedExisting: false,
    });

    expect(findInsumo).toHaveBeenCalledWith({
      where: { id: 'ins-count-1', tenant_id: TEST_TENANT_ID },
    });
    expect(saveInsumo).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 10, existenciaActual: 10 }),
    );
    expect(savedMovements).toHaveLength(1);
    expect(savedMovements[0]).toEqual(
      expect.objectContaining({
        tenant_id: TEST_TENANT_ID,
        insumoId: 'ins-count-1',
        type: MovementType.ADJUSTMENT,
        quantity: -5,
        sourceDocumentType: 'AJUSTE_CONTEO',
        sourceDocumentId: validCountSessionPayload.id,
      }),
    );
  });

  it('rejects missing required count-session fields before persistence is attempted', async () => {
    const response = await request(app.getHttpServer())
      .post(`${INVENTORY_API_PREFIX}/count-sessions`)
      .send({ ...validCountSessionPayload, lines: undefined })
      .expect(400);

    const body = response.body as BadRequestResponseBody;
    expect(body.error).toBe('Bad Request');
    expect(body.message).toEqual(
      expect.arrayContaining(['lines must be an array']),
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(createMovement).not.toHaveBeenCalled();
  });
});
