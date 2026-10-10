import 'reflect-metadata';
import { resolve } from 'node:path';
import { Controller, Get, Module } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import {
  enumerateAppRoutes,
  findUnregisteredSourceControllers,
  verifyRouteTransportRegistry,
  TRANSPORT_DECLARATIONS,
  type RouteRecord,
} from '../../../test/support/route-transport-registry';

describe('route transport registry (AppModule route table)', () => {
  const routes = enumerateAppRoutes(AppModule);

  it('enumerates the real route table from the AppModule import graph without a database', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('picks up controllers registered anywhere in the module graph', () => {
    @Controller('fixture-enumeration')
    class FixtureController {
      @Get()
      handler(): void {}
    }
    @Module({ controllers: [FixtureController] })
    class FixtureModule {}

    const fixtureRoutes = enumerateAppRoutes(FixtureModule).map(
      (record) => `${record.httpMethod} ${record.route}`,
    );
    expect(fixtureRoutes).toEqual(['GET /fixture-enumeration']);
  });

  it('sees device sync transport where SyncTransportGuard is declared', () => {
    const batch = routes.find(
      (record) =>
        record.route === '/v1/sync/batch' && record.httpMethod === 'POST',
    );
    expect(batch?.controller).toBe('SyncBatchController');
    expect(batch?.guards).toContain('SyncTransportGuard');

    const movementsSync = routes.find(
      (record) =>
        record.route === '/inventory/movements/sync' &&
        record.httpMethod === 'POST',
    );
    expect(movementsSync?.guards).toContain('SyncTransportGuard');

    const shrinkage = routes.find(
      (record) =>
        record.route === '/inventory/shrinkage' && record.httpMethod === 'POST',
    );
    expect(shrinkage?.guards).toContain('SyncTransportGuard');
  });

  it('serves and declares every @Controller class declared in source files', () => {
    // Source scan, not module graph: a controller never registered in a
    // module produces no routes, so every served-route rule is blind to it
    // (it silently 404s forever). Guard against that root class.
    const srcDir = resolve(__dirname, '..', '..');
    const orphans = findUnregisteredSourceControllers(
      srcDir,
      routes,
      TRANSPORT_DECLARATIONS,
    );
    // Known orphans used to be listed here — e.g. `InventoryController`
    // (dead POST /inventory/purchase surface), found by this same guard,
    // left unregistered deliberately and reported for a founder decision.
    // It was retired in 359d3515 (the route is covered by
    // InventoryMovementController), so the guard now expects ZERO
    // source-declared orphans. A newly orphaned controller must be served
    // or recorded here with a deliberate, commented decision — never
    // absorbed silently.
    expect(orphans).toEqual([]);
  });

  it('reports a source-declared controller that no module serves (positive control, #829)', () => {
    // Why this test exists: the rule above asserts ZERO orphans, so it proves
    // nothing if the detector itself stops finding anything. A broken source
    // walk (path change, filter regression, early return) would keep
    // `expect(orphans).toEqual([])` green forever and silently retire the
    // guard. This is the control: point the detector at a directory that DOES
    // hold an unregistered @Controller and require it to report that class.
    const fixtureDir = resolve(
      __dirname,
      '..',
      '..',
      '..',
      'test',
      'fixtures',
      'orphan-guard',
    );

    const reported = findUnregisteredSourceControllers(
      fixtureDir,
      routes,
      TRANSPORT_DECLARATIONS,
    );
    expect(reported).toEqual([
      {
        controller: 'OrphanFixtureController',
        file: 'orphan-fixture.controller.ts',
        served: false,
        declared: false,
      },
    ]);

    // Two-sided control: a detector that reported EVERY source class would also
    // satisfy the assertion above, so the same fixture must disappear once the
    // class is both served and declared.
    const servedAndDeclared = findUnregisteredSourceControllers(
      fixtureDir,
      [
        {
          controller: 'OrphanFixtureController',
          controllerPath: 'orphan-fixture',
          httpMethod: 'GET',
          handlerPath: '',
          route: '/orphan-fixture',
          guards: ['AuthGuard'],
        },
      ],
      [{ controller: 'OrphanFixtureController', transport: 'human' }],
    );
    expect(servedAndDeclared).toEqual([]);
  });

  it('classifies every route and matches declared transports to the guards actually present', () => {
    const findings = verifyRouteTransportRegistry(
      routes,
      TRANSPORT_DECLARATIONS,
    );
    expect(findings).toEqual([]);
  });

  it('classifies POST /inventory/regularization/sync as device transport (ST-06)', () => {
    const sync = routes.find(
      (record) =>
        record.route === '/inventory/regularization/sync' &&
        record.httpMethod === 'POST',
    );
    expect(sync?.controller).toBe('RegularizationController');
    expect(sync?.guards).toContain('SyncTransportGuard');
    expect(sync?.guards).not.toContain('AuthGuard');
    expect(sync?.guards).not.toContain('RolesGuard');
  });

  it('no longer serves the retired GET /inventory/alerts surface (ST-05)', () => {
    // The inventory-alert read was folded into /v1/sync/inbound/deltas as a
    // one-way cloud-to-POS projection; the separate human surface that
    // answered with an incompatible stock-summary shape is retired.
    const retired = routes.filter(
      (record) =>
        record.route === '/inventory/alerts' && record.httpMethod === 'GET',
    );
    expect(retired).toEqual([]);
  });
});

describe('route transport registry (verification rules)', () => {
  const route = (over: Partial<RouteRecord> = {}): RouteRecord => ({
    controller: 'FixtureController',
    controllerPath: 'fixture',
    httpMethod: 'POST',
    handlerPath: 'write',
    route: '/fixture/write',
    guards: [],
    ...over,
  });

  it('fails a route whose controller has no declaration', () => {
    const findings = verifyRouteTransportRegistry([route()], []);
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('unclassified'),
      },
    ]);
  });

  it('fails a device-declared route without SyncTransportGuard', () => {
    const findings = verifyRouteTransportRegistry(
      [route({ guards: [] })],
      [{ controller: 'FixtureController', transport: 'device' }],
    );
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('SyncTransportGuard'),
      },
    ]);
  });

  it('fails a device-declared route carrying a human authentication guard', () => {
    const findings = verifyRouteTransportRegistry(
      [route({ guards: ['SyncTransportGuard', 'AuthGuard'] })],
      [{ controller: 'FixtureController', transport: 'device' }],
    );
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('human'),
      },
    ]);
  });

  it('fails a human-declared route without any human authentication guard', () => {
    const findings = verifyRouteTransportRegistry(
      [route({ guards: ['RolesGuard'] })],
      [{ controller: 'FixtureController', transport: 'human' }],
    );
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('human'),
      },
    ]);
  });

  it('fails a human-declared route carrying the device transport guard', () => {
    const findings = verifyRouteTransportRegistry(
      [route({ guards: ['AuthGuard', 'SyncTransportGuard'] })],
      [{ controller: 'FixtureController', transport: 'human' }],
    );
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('device'),
      },
    ]);
  });

  it('fails a public-declared route carrying any guard', () => {
    const findings = verifyRouteTransportRegistry(
      [route({ guards: ['AuthGuard'] })],
      [
        {
          controller: 'FixtureController',
          transport: 'public',
          reason: 'fixture public controller',
        },
      ],
    );
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('guard'),
      },
    ]);
  });

  it('fails a public declaration without a recorded reason', () => {
    const findings = verifyRouteTransportRegistry(
      [route({ guards: [] })],
      [{ controller: 'FixtureController', transport: 'public' }],
    );
    expect(findings).toEqual([
      {
        route: 'POST /fixture/write',
        controller: 'FixtureController',
        violation: expect.stringContaining('reason'),
      },
    ]);
  });

  it('resolves a route override over the controller default', () => {
    const write = route({ guards: ['SyncTransportGuard'] });
    const read = route({
      httpMethod: 'GET',
      handlerPath: 'read',
      route: '/fixture/read',
      guards: ['AuthGuard', 'RolesGuard'],
    });
    const findings = verifyRouteTransportRegistry(
      [write, read],
      [
        {
          controller: 'FixtureController',
          transport: 'human',
          overrides: [
            {
              httpMethod: 'POST',
              handlerPath: 'write',
              transport: 'device',
            },
          ],
        },
      ],
    );
    expect(findings).toEqual([]);
  });

  it('fails a stale declaration for a controller that no longer exists', () => {
    const findings = verifyRouteTransportRegistry(
      [],
      [{ controller: 'RemovedController', transport: 'human' }],
    );
    expect(findings).toEqual([
      {
        route: expect.any(String),
        controller: 'RemovedController',
        violation: expect.stringContaining('stale'),
      },
    ]);
  });
});
