import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Tenant } from '../../src/modules/tenant/entities/tenant.entity';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../../src/modules/inventory/entities/system-parameters-config.entity';
import {
  FiscalSetupService,
  FiscalRegime,
} from '../../src/modules/onboarding/services/fiscal-setup.service';
import {
  CheckoutFxMode,
  FiscalSetupDto,
  TenantOperationMode,
} from '../../src/modules/onboarding/dto/fiscal-setup.dto';
import { createMigrationBuiltSchemaFixture } from '../support/migration-built-schema.helper';
import { bindTenantContext } from '../../src/core/database/tenant-transaction';
import { normalizeTenantSlug } from '../../src/modules/tenant/tenant-slug';

/**
 * SOHO P3 — the null-tombstone clear path against the REAL PostgreSQL schema
 * (migration-built), never a mock.
 *
 * Defect: `sys_parametros_config.param_value` was declared `jsonb NOT NULL`
 * (1784000000000-CreateSystemParametersConfig) while the CLEAR design is
 * append-only supersession — FiscalSetupService.upsertOrClearParameter inserts
 * a NEW row whose param_value is NULL (a tombstone), and
 * v_sys_parametros_config_active resolves that tombstone as the governing
 * (absent) version. The NOT NULL constraint made every clear a 500
 * (QueryFailedError: null value in column "param_value" ... violates
 * not-null constraint) and nothing was ever persisted.
 *
 * Migration 1809610000000-AllowNullParamValue drops the NOT NULL constraint.
 * Because the tombstone mechanism is SCHEMA-level behaviour (an append-only
 * trigger plus a DISTINCT ON view), only a real database can prove it: this
 * spec runs the FULL migration set (including 1809610000000) into a scratch
 * schema via test/support/migration-built-schema.helper.ts, then drives the
 * PRODUCTION service (FiscalSetupService.configureFiscalSetup) through the
 * round trip the owner dashboard performs:
 *
 *   set -> clear (blank DGI code / explicit null cap) -> reads null through
 *   the active view -> set again -> reads the new value.
 *
 * It also proves the append-only trigger still rejects UPDATE and DELETE
 * after the constraint change.
 */

const postgresConnection = {
  host: process.env.DB_HOST?.trim() ?? '127.0.0.1',
  port: Number(process.env.DB_PORT?.trim() ?? 5432),
  username: process.env.DB_USERNAME?.trim() ?? 'postgres',
  password: process.env.DB_PASSWORD?.trim() ?? 'postgres',
  database: process.env.DB_DATABASE?.trim() ?? 'omnifood',
};

describe('param_value null-tombstone clear round trip (Real PostgreSQL DB, migration-built schema)', () => {
  jest.setTimeout(300000);

  let admin: DataSource;
  let runtime: DataSource;
  let fixture: Awaited<ReturnType<typeof createMigrationBuiltSchemaFixture>>;
  let service: FiscalSetupService;

  const tenantId = randomUUID();
  const userId = 'user-uuid-tombstone-probe';

  const baseDto = (
    overrides: Partial<FiscalSetupDto> = {},
  ): FiscalSetupDto => ({
    regime: FiscalRegime.CUOTA_FIJA,
    businessName: 'Soho Food Park',
    ruc: 'J0000001203012',
    commercialFxSpread: 36.6243,
    pricesIncludeTax: false,
    phone: '',
    address: '',
    operationMode: TenantOperationMode.FOODPARK_QSR,
    checkoutFxMode: CheckoutFxMode.COMMERCIAL,
    ...overrides,
  });

  /** Raw governing rows through the ACTIVE VIEW, exactly as the app reads. */
  const activeValue = async (
    paramKey: string,
  ): Promise<{ paramValue: unknown; version: number } | null> => {
    return runtime.transaction(async (manager) => {
      // The view is security_invoker = true: raw reads must bind the tenant
      // context exactly like the service paths do (RLS + uuid cast).
      await bindTenantContext(manager, tenantId);
      const rows = (await manager.query(
        `SELECT param_value AS "paramValue", version
           FROM v_sys_parametros_config_active
          WHERE tenant_id = $1 AND param_key = $2`,
        [tenantId, paramKey],
      )) as Array<{ paramValue: unknown; version: number }>;
      return rows[0] ?? null;
    });
  };

  /** Every physical row for a key (append-only: nothing is ever rewritten). */
  const physicalRows = async (
    paramKey: string,
  ): Promise<Array<{ param_value: unknown; version: number }>> => {
    return runtime.transaction(async (manager) => {
      await bindTenantContext(manager, tenantId);
      return (await manager.query(
        `SELECT param_value, version
           FROM sys_parametros_config
          WHERE tenant_id = $1 AND param_key = $2
          ORDER BY version`,
        [tenantId, paramKey],
      )) as Array<{ param_value: unknown; version: number }>;
    });
  };

  beforeAll(async () => {
    fixture = await createMigrationBuiltSchemaFixture();

    admin = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      // The scratch schema is the ENTIRE target: never let the unscoped
      // default search_path touch the shared public tables.
      schema: fixture.schema,
      extra: {
        max: 2,
        allowExitOnIdle: true,
        options: `-c search_path=${fixture.schema},public`,
      },
    });
    await admin.initialize();

    runtime = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      username: fixture.runtimeRoleName,
      password: fixture.runtimeRolePassword,
      entities: [
        Tenant,
        SystemParametersConfig,
        SystemParametersConfigActiveView,
      ],
      synchronize: false,
      extra: { max: 2, allowExitOnIdle: true },
    });
    await runtime.initialize();

    await admin.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)`,
      [tenantId, 'Soho Food Park', normalizeTenantSlug(`Soho ${tenantId}`)],
    );

    // The production service exactly as Nest would build it: real DataSource
    // and repository; the optional session/reconciler/version collaborators
    // are omitted exactly like the unit specs do.
    service = new FiscalSetupService(
      runtime.getRepository(Tenant),
      { emit: jest.fn() } as unknown as EventEmitter2,
      runtime,
    );
  });

  afterAll(async () => {
    await runtime?.destroy();
    await admin?.destroy();
    await fixture?.close();
  });

  it('migration 1809610000000 made param_value nullable in the migrated schema', async () => {
    const rows = (await admin.query(
      `SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'sys_parametros_config'
          AND column_name = 'param_value'`,
      [fixture.schema],
    )) as Array<{ is_nullable: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].is_nullable).toBe('YES');
  });

  it('clears a blank DGI code and an explicit null cap through a superseding tombstone, then reads null through the active view, then sets again', async () => {
    // 1) SET: the dashboard's happy path — values persist.
    await service.configureFiscalSetup(
      tenantId,
      baseDto({
        dgiAuthorizationCode: 'DGI-SFC-2024-00123',
        dgiAuthorizationIssuedAt: '2025-01-15',
        maxDiscountAmount: 120,
        maxDiscountPercent: 10,
      }),
      userId,
    );

    expect(await activeValue('DGI_AUTHORIZATION_CODE')).toEqual({
      paramValue: 'DGI-SFC-2024-00123',
      version: 1,
    });
    expect(await activeValue('MAX_DISCOUNT_AMOUNT')).toEqual({
      paramValue: 120,
      version: 1,
    });

    // 2) CLEAR: exactly the body that 500'd in production — blank DGI code
    //    and an explicit null discount cap.
    const cleared = await service.configureFiscalSetup(
      tenantId,
      baseDto({
        dgiAuthorizationCode: '',
        maxDiscountAmount: null,
      }),
      userId,
    );
    expect(cleared.dgiAuthorizationCode).toBeNull();
    expect(cleared.maxDiscountAmount).toBeNull();

    // The tombstone governs through the ACTIVE VIEW.
    expect(await activeValue('DGI_AUTHORIZATION_CODE')).toEqual({
      paramValue: null,
      version: 2,
    });
    expect(await activeValue('MAX_DISCOUNT_AMOUNT')).toEqual({
      paramValue: null,
      version: 2,
    });

    // Absent fields were no-ops: the issued-at value from step 1 still
    // governs (a clear never touches an omitted key).
    expect(await activeValue('DGI_AUTHORIZATION_ISSUED_AT')).toEqual({
      paramValue: '2025-01-15',
      version: 1,
    });

    // Append-only held: the value row was never rewritten — the tombstone is
    // a NEW row superseding it.
    const codeRows = await physicalRows('DGI_AUTHORIZATION_CODE');
    expect(codeRows).toHaveLength(2);
    expect(codeRows[0]).toEqual({
      param_value: 'DGI-SFC-2024-00123',
      version: 1,
    });
    expect(codeRows[1]).toEqual({ param_value: null, version: 2 });
  });

  it('supersedes the tombstone when a value is set again', async () => {
    const resupplied = await service.configureFiscalSetup(
      tenantId,
      baseDto({
        dgiAuthorizationCode: 'DGI-SFC-2025-00456',
        maxDiscountAmount: 80,
      }),
      userId,
    );
    expect(resupplied.dgiAuthorizationCode).toBe('DGI-SFC-2025-00456');
    expect(resupplied.maxDiscountAmount).toBe(80);

    expect(await activeValue('DGI_AUTHORIZATION_CODE')).toEqual({
      paramValue: 'DGI-SFC-2025-00456',
      version: 3,
    });
    expect(await activeValue('MAX_DISCOUNT_AMOUNT')).toEqual({
      paramValue: 80,
      version: 3,
    });

    // Full history survives: three append-only rows for the code.
    const codeRows = await physicalRows('DGI_AUTHORIZATION_CODE');
    expect(codeRows.map((r) => r.param_value)).toEqual([
      'DGI-SFC-2024-00123',
      null,
      'DGI-SFC-2025-00456',
    ]);
  });

  it('RLS denies UPDATE for an ordinary app role (SELECT+INSERT-only policies, migration 1809340000000)', async () => {
    // Layer ONE of the append-only contract: the runtime role has no
    // permissive UPDATE/DELETE policy, so RLS filters every row away — the
    // UPDATE silently affects zero rows and the governing value is untouched.
    const res = await runtime.transaction(async (manager) => {
      await bindTenantContext(manager, tenantId);
      return manager.query(
        `UPDATE sys_parametros_config SET param_value = '{"hacked":true}' WHERE tenant_id = $1 AND param_key = 'DGI_AUTHORIZATION_CODE'`,
        [tenantId],
      );
    });
    expect(res[1]).toBe(0);
    expect(await activeValue('DGI_AUTHORIZATION_CODE')).toMatchObject({
      paramValue: 'DGI-SFC-2025-00456',
    });
  });

  it('append-only trigger still rejects UPDATE and DELETE after the constraint change', async () => {
    // Layer TWO: the trigger fires for EVERY role — including a BYPASSRLS
    // superuser, who skips the RLS policies but never skips triggers. The
    // superuser connection therefore isolates the trigger from the RLS denial
    // above.
    await expect(
      admin.query(
        `UPDATE sys_parametros_config SET param_value = '{"hacked":true}' WHERE tenant_id = $1 AND param_key = 'DGI_AUTHORIZATION_CODE'`,
        [tenantId],
      ),
    ).rejects.toThrow(/append-only/i);

    await expect(
      admin.query(
        `DELETE FROM sys_parametros_config WHERE tenant_id = $1 AND param_key = 'DGI_AUTHORIZATION_CODE'`,
        [tenantId],
      ),
    ).rejects.toThrow(/append-only/i);
  });
});
