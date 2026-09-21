import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { AppModule } from '../app/app.module';
import {
  enumerateAppRoutes,
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

  it('classifies every route and matches declared transports to the guards actually present', () => {
    const findings = verifyRouteTransportRegistry(
      routes,
      TRANSPORT_DECLARATIONS,
    );
    expect(findings).toEqual([]);
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
