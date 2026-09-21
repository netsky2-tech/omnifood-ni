import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';

/**
 * Route transport registry support.
 *
 * Founder decision (2026-09-21, feature `sync-transport-authorization`):
 * no global default-deny APP_GUARD. Instead, per-route guards plus a
 * registry test that fails when a route exists without a declared
 * transport class, so an unauthenticated surface cannot be added
 * silently.
 *
 * Mechanism (choice justified): the route inventory is derived from the
 * real module import graph rooted at AppModule by reading Nest's module
 * and controller metadata — the same enumeration a DiscoveryService walk
 * or the HTTP adapter's route table would produce. Both of those require
 * compiling the application, which instantiates TypeORM and needs a
 * database; a metadata walk needs no instantiation and runs without one.
 * Because the walk starts from the module graph and not from a
 * hand-maintained controller list, adding a controller to any module
 * automatically adds its routes to the table and the registry test fails
 * until the new route is classified.
 *
 * Note: paths are as declared on controllers and handlers. The global
 * `api` prefix set in main.ts is not part of controller metadata and is
 * therefore not part of these routes.
 */

// Nest sets module metadata with these keys (the MODULE_METADATA values
// from @nestjs/core, not re-exported publicly) and controller/handler
// metadata with the keys from @nestjs/common/constants.
const MODULE_METADATA_IMPORTS = 'imports';
const MODULE_METADATA_CONTROLLERS = 'controllers';
const CONTROLLER_WATERMARK = '__controller__';
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
const GUARDS_METADATA = '__guards__';

/** Who authorizes the HTTP transmission of a request. */
export type TransportClass = 'device' | 'human' | 'public';

export interface RouteRecord {
  controller: string;
  controllerPath: string;
  httpMethod: string;
  handlerPath: string;
  /** Full declared route without the global prefix, e.g. `/inventory/shrinkage`. */
  route: string;
  /** Guard class names actually declared on the controller and the handler. */
  guards: string[];
}

/** Per-route transport override that wins over the controller default. */
export interface RouteOverride {
  /** HTTP method the override applies to; omit to match any method. */
  httpMethod?: string;
  /** Handler subpath as declared, e.g. `movements/sync`; omit to match any. */
  handlerPath?: string;
  transport: TransportClass;
  /** Required for `public`: why this surface is deliberately unauthenticated. */
  reason?: string;
}

export interface TransportDeclaration {
  /** Controller class name as registered in a module. */
  controller: string;
  transport: TransportClass;
  /** Required for `public`: why the whole controller is deliberately unauthenticated. */
  reason?: string;
  overrides?: RouteOverride[];
}

export interface RegistryFinding {
  route: string;
  controller: string;
  violation: string;
}

export const DEVICE_GUARD = 'SyncTransportGuard';

/** Guards that authenticate a human session (identity JWT). */
export const HUMAN_AUTH_GUARDS = ['AuthGuard', 'AuthoritativeCurrentUserGuard'];

type ModuleRef = Type | DynamicModule;

function moduleClassOf(ref: unknown): Type | undefined {
  if (typeof ref === 'function') return ref as Type;
  if (ref && typeof ref === 'object' && 'module' in ref) {
    const module = (ref as DynamicModule).module;
    if (typeof module === 'function') return module;
  }
  return undefined;
}

function collectControllers(
  ref: ModuleRef,
  visited: Set<Type>,
  found: Set<Type>,
): void {
  const moduleClass = moduleClassOf(ref);
  if (!moduleClass || visited.has(moduleClass)) return;
  visited.add(moduleClass);

  const controllers = (Reflect.getMetadata(
    MODULE_METADATA_CONTROLLERS,
    moduleClass,
  ) ?? []) as Type[];
  for (const controller of controllers) {
    if (typeof controller === 'function') found.add(controller);
  }

  // Walk both the static imports recorded on the module class and any
  // runtime imports carried by a DynamicModule object (e.g. forRoot()).
  const imports = (Reflect.getMetadata(MODULE_METADATA_IMPORTS, moduleClass) ??
    []) as unknown[];
  if (ref && typeof ref === 'object') {
    imports.push(...((ref.imports ?? []) as unknown[]));
  }
  for (const imported of imports) {
    collectControllers(imported as ModuleRef, visited, found);
  }
}

function guardNames(metadata: unknown): string[] {
  if (!Array.isArray(metadata)) return [];
  return metadata
    .map((guard: unknown) => {
      if (typeof guard === 'function') return (guard as Type).name;
      if (guard !== null && typeof guard === 'object') {
        // Guards may be registered as instances rather than classes; read the
        // constructor off a narrowed shape so the access stays type-safe.
        const constructor = (guard as { constructor?: unknown }).constructor;
        if (typeof constructor === 'function') {
          return (constructor as Type).name;
        }
      }
      return undefined;
    })
    .filter((name): name is string => typeof name === 'string');
}

function joinRoute(controllerPath: string, handlerPath: string): string {
  const segments = [controllerPath, handlerPath].filter(
    (segment) => segment !== '' && segment !== '/',
  );
  return `/${segments.join('/')}`;
}

function declaredRoutes(controller: Type): RouteRecord[] {
  const watermark = Reflect.getMetadata(
    CONTROLLER_WATERMARK,
    controller,
  ) as unknown;
  if (watermark !== true) return [];

  const controllerPath =
    (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ??
    '';
  const classGuards = guardNames(
    Reflect.getMetadata(GUARDS_METADATA, controller) as unknown,
  );

  const records: RouteRecord[] = [];
  let proto = controller.prototype as object | null;
  while (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      const handler = (proto as Record<string, unknown>)[key];
      if (typeof handler !== 'function') continue;
      const methodValue = Reflect.getMetadata(METHOD_METADATA, handler) as
        | number
        | undefined;
      if (methodValue === undefined) continue;
      const handlerPath =
        (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ??
        '';
      const guards = [
        ...new Set([
          ...classGuards,
          ...guardNames(
            Reflect.getMetadata(GUARDS_METADATA, handler) as unknown,
          ),
        ]),
      ];
      records.push({
        controller: controller.name,
        controllerPath,
        httpMethod: RequestMethod[methodValue] ?? `METHOD_${methodValue}`,
        handlerPath,
        route: joinRoute(controllerPath, handlerPath),
        guards,
      });
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return records;
}

/**
 * Enumerate every route registered under the given module root by walking
 * the real module import graph. No application is compiled and no database
 * is needed.
 */
export function enumerateAppRoutes(rootModule: ModuleRef): RouteRecord[] {
  const controllers = new Set<Type>();
  collectControllers(rootModule, new Set(), controllers);

  const routes: RouteRecord[] = [];
  for (const controller of controllers) {
    routes.push(...declaredRoutes(controller));
  }
  return routes.sort(
    (a, b) =>
      a.route.localeCompare(b.route) ||
      a.httpMethod.localeCompare(b.httpMethod),
  );
}

function effectiveTransport(
  declaration: TransportDeclaration,
  route: RouteRecord,
): { transport: TransportClass; reason?: string } {
  let effective = {
    transport: declaration.transport,
    reason: declaration.reason,
  };
  for (const override of declaration.overrides ?? []) {
    if (override.httpMethod && override.httpMethod !== route.httpMethod)
      continue;
    if (
      override.handlerPath !== undefined &&
      override.handlerPath !== route.handlerPath
    ) {
      continue;
    }
    effective = { transport: override.transport, reason: override.reason };
  }
  return effective;
}

function finding(route: RouteRecord, violation: string): RegistryFinding {
  return {
    route: `${route.httpMethod} ${route.route}`,
    controller: route.controller,
    violation,
  };
}

/**
 * Verify that every enumerated route is classified and that each
 * declaration matches the guards actually present on the route.
 * Returns the violations; the registry test asserts this list is empty.
 */
export function verifyRouteTransportRegistry(
  routes: RouteRecord[],
  declarations: TransportDeclaration[],
): RegistryFinding[] {
  const findings: RegistryFinding[] = [];
  const byController = new Map(
    declarations.map((declaration) => [declaration.controller, declaration]),
  );

  for (const route of routes) {
    const declaration = byController.get(route.controller);
    if (!declaration) {
      findings.push(
        finding(
          route,
          'unclassified: route exists without a declared transport class',
        ),
      );
      continue;
    }

    const { transport, reason } = effectiveTransport(declaration, route);
    if (transport === 'device') {
      if (!route.guards.includes(DEVICE_GUARD)) {
        findings.push(
          finding(route, `declared device but does not carry ${DEVICE_GUARD}`),
        );
      }
      const humanGuards = route.guards.filter((guard) =>
        HUMAN_AUTH_GUARDS.includes(guard),
      );
      if (humanGuards.length > 0) {
        findings.push(
          finding(
            route,
            `declared device but carries human authentication guard(s): ${humanGuards.join(', ')}`,
          ),
        );
      }
    } else if (transport === 'human') {
      if (!route.guards.some((guard) => HUMAN_AUTH_GUARDS.includes(guard))) {
        findings.push(
          finding(
            route,
            'declared human but carries no human authentication guard',
          ),
        );
      }
      if (route.guards.includes(DEVICE_GUARD)) {
        findings.push(
          finding(
            route,
            `declared human but carries the device transport guard ${DEVICE_GUARD}`,
          ),
        );
      }
    } else {
      if (route.guards.length > 0) {
        findings.push(
          finding(
            route,
            `declared public but carries guard(s): ${route.guards.join(', ')}`,
          ),
        );
      }
      if (!reason) {
        findings.push(
          finding(route, 'declared public without a recorded reason'),
        );
      }
    }
  }

  // A declaration for a controller that no longer exists is drift too:
  // renaming or removing a controller must not leave a stale allowance.
  for (const declaration of declarations) {
    if (!routes.some((route) => route.controller === declaration.controller)) {
      findings.push({
        route: '*',
        controller: declaration.controller,
        violation: 'stale declaration: no registered controller with this name',
      });
    }
  }

  return findings;
}

// The transport registry: every registered controller must appear here.
// `device` = POS device sync transport (SyncTransportGuard);
// `human` = human session transport (identity JWT);
// `public` = deliberately unauthenticated, listed with a one-line reason.
// A controller missing from this list fails the registry test, so a new
// surface cannot be added silently.
export const TRANSPORT_DECLARATIONS: TransportDeclaration[] = [
  {
    controller: 'AppController',
    transport: 'public',
    reason: 'liveness and health probe endpoints',
  },
  {
    controller: 'AuthController',
    transport: 'human',
    overrides: [
      {
        httpMethod: 'POST',
        handlerPath: 'login',
        transport: 'public',
        reason: 'credential login; issues the access and refresh tokens',
      },
      {
        httpMethod: 'POST',
        handlerPath: 'refresh',
        transport: 'public',
        reason: 'refresh-token exchange; issues a new access token',
      },
    ],
  },
  {
    controller: 'DeviceSyncTokenController',
    transport: 'public',
    reason:
      'device sync token exchange (POS DeviceSyncExchangePort); authenticated by the renewal credential in the body, no human session',
  },
  { controller: 'AuditController', transport: 'human' },
  { controller: 'UsersController', transport: 'human' },
  { controller: 'CapabilityController', transport: 'human' },
  { controller: 'OnboardingCatalogController', transport: 'human' },
  { controller: 'IndustryTemplateController', transport: 'human' },
  { controller: 'OnboardingSessionController', transport: 'human' },
  { controller: 'TerminalPrimingController', transport: 'human' },
  { controller: 'FiscalSetupController', transport: 'human' },
  { controller: 'ActivationController', transport: 'human' },
  { controller: 'OnboardingTelemetryController', transport: 'human' },
  { controller: 'OnboardingRolloutController', transport: 'human' },
  { controller: 'ImportStagingController', transport: 'human' },
  {
    controller: 'SyncBatchController',
    transport: 'device',
  },
  {
    controller: 'InboundSyncController',
    transport: 'device',
  },
  { controller: 'ReportsController', transport: 'human' },
  { controller: 'CashShiftController', transport: 'human' },
  {
    controller: 'InvoicesController',
    transport: 'device',
  },
  { controller: 'FulfillmentTopologyController', transport: 'human' },
  { controller: 'FulfillmentRetentionController', transport: 'human' },
  { controller: 'FulfillmentRolloutController', transport: 'human' },
  { controller: 'PromotionsController', transport: 'human' },
  { controller: 'CatalogController', transport: 'human' },
  { controller: 'LoyaltyController', transport: 'human' },
  { controller: 'CustomersController', transport: 'human' },
  {
    controller: 'InventoryMovementController',
    transport: 'human',
    overrides: [
      {
        httpMethod: 'POST',
        handlerPath: 'movements/sync',
        transport: 'device',
      },
      {
        httpMethod: 'POST',
        handlerPath: 'shrinkage',
        transport: 'device',
      },
      {
        httpMethod: 'POST',
        handlerPath: 'purchases',
        transport: 'device',
      },
      {
        httpMethod: 'POST',
        handlerPath: 'recipes/versions',
        transport: 'device',
      },
      {
        httpMethod: 'POST',
        handlerPath: 'production-orders/close',
        transport: 'device',
      },
      {
        httpMethod: 'POST',
        handlerPath: 'count-sessions',
        transport: 'public',
        reason:
          'TRANSITIONAL (issue #445): open write the POS completes today; guarded in ST-04 together with its transport change, because guarding it alone breaks POS sync (founder decision)',
      },
    ],
  },
  { controller: 'RegularizationController', transport: 'human' },
  { controller: 'RemediationController', transport: 'human' },
  { controller: 'InventoryReportsController', transport: 'human' },
  { controller: 'ProductController', transport: 'human' },
  { controller: 'RecipeController', transport: 'human' },
  { controller: 'InsumoController', transport: 'human' },
];
