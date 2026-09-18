import { readFileSync } from 'fs';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createTypeOrmOptions, getRequiredConfigValue } from './app.module';
import { Insumo } from '../../modules/inventory/entities/insumo.entity';
import { Product } from '../../modules/inventory/entities/product.entity';
import { Recipe } from '../../modules/inventory/entities/recipe.entity';
import { InventoryMovement } from '../../modules/inventory/entities/inventory-movement.entity';
import { InventorySyncReceipt } from '../../modules/inventory/entities/inventory-sync-receipt.entity';
import { PurchaseDocument } from '../../modules/inventory/entities/purchase-document.entity';
import { ProductionBatchHistory } from '../../modules/inventory/entities/production-batch-history.entity';
import { DeviceSyncCredential } from '../../modules/identity/entities/device-sync-credential.entity';
import { DeviceSyncCredentialEvent } from '../../modules/identity/entities/device-sync-credential-event.entity';
import { ConfigService } from '@nestjs/config';
import { DatabaseConnectionConfigError } from '../config/database-connection.config';

describe('AppModule Registration', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DB_PASSWORD') return 'test-db-password';
      return fallback;
    }),
  } as unknown as ConfigService;

  const options = createTypeOrmOptions(configService);

  it('should have Insumo repository registered', () => {
    expect(options.entities).toContain(Insumo);
  });

  it('should have Product repository registered', () => {
    expect(options.entities).toContain(Product);
  });

  it('should have Recipe repository registered', () => {
    expect(options.entities).toContain(Recipe);
  });

  it('should have InventoryMovement repository registered', () => {
    expect(options.entities).toContain(InventoryMovement);
  });

  it('should have InventorySyncReceipt repository registered for replay transactions', () => {
    expect(options.entities).toContain(InventorySyncReceipt);
  });

  it('should have PurchaseDocument repository registered', () => {
    expect(options.entities).toContain(PurchaseDocument);
  });

  it('should have ProductionBatchHistory repository registered', () => {
    expect(options.entities).toContain(ProductionBatchHistory);
  });

  it('should have DeviceSyncCredential and DeviceSyncCredentialEvent registered', () => {
    expect(options.entities).toContain(DeviceSyncCredential);
    expect(options.entities).toContain(DeviceSyncCredentialEvent);
  });
});

describe('createTypeOrmOptions', () => {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'DB_PASSWORD') return 'test-db-password';
      return fallback;
    }),
  } as unknown as ConfigService;

  it('disables synchronize in test environment', () => {
    const options = createTypeOrmOptions(configService);

    expect(options.synchronize).toBe(false);
  });

  it('disables synchronize outside test environment', () => {
    const options = createTypeOrmOptions(configService);

    expect(options.synchronize).toBe(false);
  });

  it('fails startup when DB_PASSWORD is missing', () => {
    const missingConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() =>
      getRequiredConfigValue(missingConfigService, 'DB_PASSWORD'),
    ).toThrow('DB_PASSWORD is required');
  });

  describe('production runtime resolution', () => {
    const productionConfig = (
      overrides: Record<string, string | undefined>,
    ): ConfigService => {
      const values: Record<string, string | undefined> = {
        NODE_ENV: 'production',
        DB_HOST: 'db.example.internal',
        DB_PORT: '5432',
        DB_USERNAME: 'runtime_role',
        DB_PASSWORD: 'runtime-password',
        DB_DATABASE: 'runtime_db',
        ...overrides,
      };
      return {
        get: jest.fn((key: string) => values[key]),
      } as unknown as ConfigService;
    };

    it('resolves the runtime role in production without local defaults', () => {
      const options = createTypeOrmOptions(productionConfig({}));

      expect(options.username).toBe('runtime_role');
      expect(options.database).toBe('runtime_db');
      expect(options.host).toBe('db.example.internal');
      expect(options.port).toBe(5432);
      expect(options.synchronize).toBe(false);
    });

    it('fails closed instead of defaulting DB_USERNAME to postgres in production', () => {
      expect(() =>
        createTypeOrmOptions(productionConfig({ DB_USERNAME: undefined })),
      ).toThrow(DatabaseConnectionConfigError);
    });

    it('fails closed instead of defaulting DB_DATABASE to omnifood in production', () => {
      expect(() =>
        createTypeOrmOptions(productionConfig({ DB_DATABASE: undefined })),
      ).toThrow(DatabaseConnectionConfigError);
    });
  });
});

describe('backend test harness scripts', () => {
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };

  const backendWorkflow = readFileSync(
    join(__dirname, '../../../../../.github/workflows/admin-backend-ci.yml'),
    'utf8',
  );

  const noOnlyGuardScript = readFileSync(
    join(__dirname, '../../../scripts/check-no-only.js'),
    'utf8',
  );

  it('guards against focused unit and e2e tests committed with .only', () => {
    const noOnlyScript = packageJson.scripts['test:no-only'];

    expect(noOnlyScript).toBe('node scripts/check-no-only.js');
    expect(noOnlyGuardScript).toContain("path.join(root, 'src')");
    expect(noOnlyGuardScript).toContain("path.join(root, 'test')");
    expect(noOnlyGuardScript).toContain('e2e-spec');
  });

  it('enforces the no-only guard in backend CI', () => {
    expect(backendWorkflow).toContain('npm run test:no-only');
  });

  it('rejects Jest focus aliases, concurrent-only, and table-only forms', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'omnifood-no-only-'));
    const fixtureSrc = join(fixtureRoot, 'src');
    const fixtureTest = join(fixtureRoot, 'test');
    const focusPrefix = 'f';
    const dot = '.';
    const only = 'only';

    mkdirSync(fixtureSrc, { recursive: true });
    mkdirSync(fixtureTest, { recursive: true });
    writeFileSync(
      join(fixtureSrc, 'focused-aliases.spec.ts'),
      [
        `${focusPrefix}it('focused fit', () => undefined);`,
        `${focusPrefix}describe('focused fdescribe', () => undefined);`,
        `it${dot}concurrent${dot}${only}('focused concurrent it', () => undefined);`,
      ].join('\n'),
    );
    writeFileSync(
      join(fixtureSrc, 'focused-tables.spec.ts'),
      `it${dot}${only}${dot}each([['row']])('focused it table', () => undefined);`,
    );
    writeFileSync(
      join(fixtureTest, 'focused-concurrent.e2e-spec.ts'),
      `test ${dot} concurrent ${dot} ${only} ('focused concurrent test', () => undefined);`,
    );
    writeFileSync(
      join(fixtureTest, 'focused-tables.e2e-spec.ts'),
      [
        `test${dot}${only}${dot}each([['row']])('focused test table', () => undefined);`,
        `describe${dot}${only}${dot}each([['row']])('focused describe table', () => undefined);`,
      ].join('\n'),
    );

    try {
      const result = spawnSync(
        process.execPath,
        [join(__dirname, '../../../scripts/check-no-only.js'), fixtureRoot],
        { encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('focused-aliases.spec.ts');
      expect(result.stderr).toContain('focused-concurrent.e2e-spec.ts');
      expect(result.stderr).toContain('focused-tables.spec.ts');
      expect(result.stderr).toContain('focused-tables.e2e-spec.ts');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
