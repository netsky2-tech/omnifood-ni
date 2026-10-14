import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CreateDeviceLinkingCodes1809360000000 } from '../../src/migrations/1809360000000-CreateDeviceLinkingCodes';
import { FixDeviceLinkingClaimRlsPredicate1809520000000 } from '../../src/migrations/1809520000000-FixDeviceLinkingClaimRlsPredicate';
import { DeviceLinkingCode } from '../../src/modules/onboarding/entities/device-linking-code.entity';
import {
  DeviceLinkingService,
  LINKING_CODE_GENERIC_FAILURE,
} from '../../src/modules/onboarding/services/device-linking.service';

/**
 * Real-PostgreSQL reproduction of #652: claiming an ALREADY-CLAIMED linking
 * code must collapse into the generic 401 (the service's failure
 * discipline), never a 500. The in-memory e2e harness (device-linking
 * .e2e-spec.ts) cannot reproduce this: its manager.query mock returns []
 * for every statement, so the real device_linking_codes behavior — where
 * the staging 500 lives — is unreachable there.
 *
 * The schema is built by the REAL migrations (1809360000000 + the claim
 * RLS predicate fix 1809520000000) against a scratch schema holding the
 * minimal `tenants` shape, following the 1809360000000 db spec mold.
 */

const postgresConnection = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'omnifood',
};

const TENANTS_DDL = (schema: string) => `
  CREATE TABLE "${schema}".tenants (
    id uuid PRIMARY KEY,
    name varchar NOT NULL,
    slug varchar,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
`;

async function withFreshSchema(
  work: (dataSource: DataSource, schema: string) => Promise<void>,
): Promise<void> {
  const schema = `linking_claim_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new DataSource({ type: 'postgres', ...postgresConnection });
  let dataSource: DataSource | null = null;
  try {
    await bootstrap.initialize();
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    await bootstrap.query(TENANTS_DDL(schema));

    // search_path is pinned per connection (the same recipe as
    // 1809360000000-CreateDeviceLinkingCodes.db.spec.ts).
    dataSource = new DataSource({
      type: 'postgres',
      ...postgresConnection,
      schema,
      // The service's generation path uses manager.getRepository(
      // DeviceLinkingCode) — the entity must be registered for TypeORM to
      // resolve its metadata even though the table itself comes from the
      // migration DDL.
      entities: [DeviceLinkingCode],
      extra: { options: `-c search_path=${schema}` },
    });
    await dataSource.initialize();

    await work(dataSource, schema);
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (bootstrap.isInitialized) {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrap.destroy();
    }
  }
}

const runMigrations = async (dataSource: DataSource) => {
  // Sequential on purpose: the predicate fix (1809520000000) reconciles the
  // policy the create migration (1809360000000) just installed.
  // R3-QUERY-RUNNER-LEAK: each migration query runner is RELEASED after its
  // up() — a Postgres query runner checks out a pooled connection until
  // release(), and a leaked runner would hang dataSource.destroy() below
  // until the Jest timeout, skipping the scratch-schema cleanup.
  const createRunner = dataSource.createQueryRunner();
  try {
    await new CreateDeviceLinkingCodes1809360000000().up(createRunner);
  } finally {
    await createRunner.release();
  }
  const fixRunner = dataSource.createQueryRunner();
  try {
    await new FixDeviceLinkingClaimRlsPredicate1809520000000().up(fixRunner);
  } finally {
    await fixRunner.release();
  }
};

describe('DeviceLinkingService.claimCode double-claim (real DB, #652)', () => {
  const TEST_TIMEOUT_MS = 30000;

  it(
    'collapses the second claim of a single-use code into the generic 401, never a 500',
    async () => {
      await withFreshSchema(async (dataSource) => {
        await runMigrations(dataSource);

        const tenantId = '11111111-1111-4111-8111-111111111111';
        await dataSource.query(
          `INSERT INTO tenants (id, name, slug) VALUES ('${tenantId}', 'Piloto SOHO', 'piloto-soho')`,
        );

        const service = new DeviceLinkingService(dataSource);
        const { code } = await service.generateLinkingCode(tenantId, 'actor-1');

        // First claim: binds the device and returns the tenant context.
        const first = await service.claimCode(code, 'pos-device-1');
        expect(first.tenantId).toBe(tenantId);
        expect(first.slug).toBe('piloto-soho');
        expect(first.deviceId).toBe('pos-device-1');

        // Second claim of the SAME code: the row is CLAIMED and must fall
        // out of the ACTIVE candidate set → the generic 401 (the service's
        // failure discipline). A 500 here is the #652 defect.
        await expect(service.claimCode(code, 'pos-device-2')).rejects.toThrow(
          LINKING_CODE_GENERIC_FAILURE,
        );
      });
    },
    TEST_TIMEOUT_MS,
  );
});
