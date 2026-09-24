import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { AuthGuard } from '../../identity/guards/auth.guard';
import { RolesGuard } from '../../identity/guards/roles.guard';
import { PermissionsGuard } from '../../identity/guards/permissions.guard';
import { InvoicesService } from '../services/invoices.service';
import { AdminInvoicesController } from './admin-invoices.controller';
import { ADMIN_CREDIT_NOTE_FORGED_AUTHORIZER } from '../dto/admin-credit-note.dto';

/**
 * B1c-2 slice A (D-14, #553 part 2): transport-level contract. Real
 * RolesGuard + PermissionsGuard run here (only AuthGuard is stubbed to
 * inject the crafted principal), so the permission matrix and role gate are
 * exercised end-to-end through the HTTP pipeline.
 */
describe('AdminInvoicesController', () => {
  let app: INestApplication;
  let serviceMock: {
    createAdminCreditNote: jest.Mock;
    findAll?: jest.Mock;
  };

  const buildPrincipal = (role: string) => ({
    sub: 'principal-1',
    role,
    tenant_id: 'tenant-1',
  });

  const buildBody = (extra: Record<string, unknown> = {}) => ({
    originInvoiceId: '11111111-1111-4111-8111-111111111111',
    refundReasonCode: 'ERROR_DE_CAPTURA',
    refundReasonPolicy: 'FINANCIAL_ONLY',
    items: [
      { originInvoiceItemId: '22222222-2222-4222-8222-222222222222', quantity: 1 },
    ],
    ...extra,
  });

  let injectedUser: Record<string, unknown> | null;

  const issueRequest = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(body as never);

  beforeAll(async () => {
    serviceMock = {
      findAll: jest.fn().mockResolvedValue([]),
      createAdminCreditNote: jest
        .fn()
        .mockResolvedValue({
          id: 'cn-1',
          number: 'NC-40',
          originInvoiceId: 'origin-1',
          originInvoiceNumber: '001-001-01-00000010',
          total: -57.5,
        }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminInvoicesController],
      providers: [
        { provide: InvoicesService, useValue: serviceMock },
        Reflector,
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = injectedUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    serviceMock.createAdminCreditNote.mockClear();
  });

  it('grants 201 to an OWNER principal and passes the principal-derived authorizer', async () => {
    injectedUser = buildPrincipal('OWNER');

    const res = await request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(buildBody());

    if (res.status !== 201) {
      throw new Error(`EXPECTED 201, GOT ${res.status}: ${JSON.stringify(res.body)}`);
    }
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'cn-1',
      number: 'NC-40',
      originInvoiceId: 'origin-1',
      originInvoiceNumber: '001-001-01-00000010',
    });
    expect(serviceMock.createAdminCreditNote).toHaveBeenCalledTimes(1);
    const [tenantId, , authorizer] =
      serviceMock.createAdminCreditNote.mock.calls[0];
    expect(tenantId).toBe('tenant-1');
    expect(authorizer).toEqual({ userId: 'principal-1', role: 'OWNER' });
  });

  it('rejects 403 without the ISSUE_CREDIT_NOTE permission (cashier)', async () => {
    injectedUser = buildPrincipal('CASHIER');

    const res = await request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(buildBody());

    expect(res.status).toBe(403);
    expect(serviceMock.createAdminCreditNote).not.toHaveBeenCalled();
  });

  it('rejects 403 for a waiter even before the permission check', async () => {
    injectedUser = buildPrincipal('WAITER');

    const res = await request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(buildBody());

    expect(res.status).toBe(403);
  });

  it('rejects 400 with the named error when the body forges the authorizer', async () => {
    injectedUser = buildPrincipal('MANAGER');

    const res = await request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(
        buildBody({
          authorizedByUserId: 'someone-else',
          authorizedByRole: 'owner',
        }),
      );

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(
      ADMIN_CREDIT_NOTE_FORGED_AUTHORIZER,
    );
    expect(serviceMock.createAdminCreditNote).not.toHaveBeenCalled();
  });

  it('rejects 400 with the named error when the body forges only the role', async () => {
    injectedUser = buildPrincipal('MANAGER');

    const res = await request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(buildBody({ authorizedByRole: 'owner' }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(
      ADMIN_CREDIT_NOTE_FORGED_AUTHORIZER,
    );
  });

  it('rejects 400 when the body carries a blank refund reason code', async () => {
    injectedUser = buildPrincipal('MANAGER');

    const res = await request(app.getHttpServer())
      .post('/sales/admin/credit-notes')
      .send(buildBody({ refundReasonCode: '   ' }));

    expect(res.status).toBe(400);
    expect(serviceMock.createAdminCreditNote).not.toHaveBeenCalled();
  });

  describe('GET /sales/admin/invoices (the issuance picker)', () => {
    it('serves the tenant invoice list to a permitted principal', async () => {
      const findAll = jest.fn().mockResolvedValue([
        {
          id: 'inv-1',
          number: '001-001-01-00000010',
          created_at: '2026-09-24T12:00:00Z',
          total: 115,
          type: 'regular',
          isCanceled: false,
          customerId: 'cust-1',
          items: [{ id: 'item-1', quantity: 2 }],
        },
      ]);
      serviceMock.findAll = findAll;
      injectedUser = buildPrincipal('OWNER');

      const res = await request(app.getHttpServer())
        .get('/sales/admin/invoices')
        .send();

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toMatchObject({
        id: 'inv-1',
        number: '001-001-01-00000010',
        type: 'regular',
        isCanceled: false,
      });
      expect(findAll).toHaveBeenCalledWith('tenant-1');
    });

    it('rejects 403 without the permission (cashier cannot browse invoices)', async () => {
      injectedUser = buildPrincipal('CASHIER');

      const res = await request(app.getHttpServer())
        .get('/sales/admin/invoices')
        .send();

      expect(res.status).toBe(403);
    });
  });
});
