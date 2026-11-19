/**
 * ENT-03 — unit spec for the `@RequireCapability` decorator and the
 * `CapabilitiesGuard` (issue #984, ODD slice ENT-03).
 *
 * Contract under test:
 *   - decorator metadata is stored and AND-ed across keys;
 *   - the guard allows when every required key is in the tenant snapshot;
 *   - it denies with a Spanish upgrade message naming the missing key;
 *   - it fails CLOSED on unregistered keys (`isCapabilityGated` throws) and
 *     on non-gateable nucleus keys (catalog §7: no guard may touch `core.*`);
 *   - the snapshot is resolved once per request, never cross-request;
 *   - the tenant id comes EXACTLY from the `@GetTenantId()` sources
 *     (device principal first, then the authenticated user).
 */
import 'reflect-metadata';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CapabilitiesGuard } from './capabilities.guard';
import {
  CAPABILITY_REQUIREMENT_KEY,
  RequireCapability,
} from '../decorators/require-capability.decorator';
import { EntitlementsService } from '../entitlements.service';
import type { EntitlementSnapshotDto } from '../dto/entitlement-snapshot.dto';

@RequireCapability('promotions')
class DecoratedExample {
  @RequireCapability('loyalty')
  overriddenHandler(): void {}

  classLevelOnlyHandler(): void {}
}

const snapshotWith = (capabilities: string[]): EntitlementSnapshotDto => ({
  version: 1,
  planCode: 'OPERACION',
  status: 'active',
  supportTier: 'standard',
  capabilities,
  limits: {},
  addOns: [],
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

const makeRequest = (sources: Record<string, unknown>): object => ({
  ...sources,
});

const contextFor = (
  request: object,
  // Handler/class references: a method or a class (constructor-only type),
  // exactly what ExecutionContext.getHandler/getClass hand to the Reflector.
  handler: unknown = DecoratedExample.prototype.classLevelOnlyHandler,
  cls: unknown = DecoratedExample,
): ExecutionContext =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('RequireCapability decorator', () => {
  const reflector = new Reflector();

  it('stores the required keys as AND-ed metadata on the class', () => {
    expect(
      reflector.get<string[]>(CAPABILITY_REQUIREMENT_KEY, DecoratedExample),
    ).toEqual(['promotions']);
  });

  it('lets a handler-level decorator override the class-level one', () => {
    expect(
      reflector.getAllAndOverride<string[]>(CAPABILITY_REQUIREMENT_KEY, [
        DecoratedExample.prototype.overriddenHandler,
        DecoratedExample,
      ]),
    ).toEqual(['loyalty']);
  });
});

describe('CapabilitiesGuard', () => {
  let snapshot: jest.Mock;
  let guard: CapabilitiesGuard;

  beforeEach(() => {
    snapshot = jest.fn().mockResolvedValue(snapshotWith(['promotions']));
    guard = new CapabilitiesGuard(new Reflector(), {
      snapshot,
    } as unknown as EntitlementsService);
  });

  it('allows when the tenant snapshot carries the required capability (user tenant source)', async () => {
    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(snapshot).toHaveBeenCalledWith('tenant-1');
  });

  it('takes the tenant id from the device principal exactly like @GetTenantId', async () => {
    const request = makeRequest({
      devicePrincipal: { tenantId: 'device-tenant' },
    });
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(snapshot).toHaveBeenCalledWith('device-tenant');
  });

  it('denies with a Spanish upgrade message naming the missing capability', async () => {
    snapshot.mockResolvedValue(snapshotWith(['loyalty']));
    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      'La función requiere el plan o el complemento que incluye "promotions". Actualice su plan para usarla.',
    );
  });

  it('AND-ed keys: allows only when EVERY required key is granted', async () => {
    @RequireCapability('inventory.retail', 'inventory.cooking')
    class BothPacks {}

    snapshot.mockResolvedValue(
      snapshotWith(['inventory.retail', 'inventory.cooking']),
    );
    const both = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(
      guard.canActivate(
        contextFor(both, BothPacks.prototype.constructor, BothPacks),
      ),
    ).resolves.toBe(true);
  });

  it('AND-ed keys: denies naming the one missing key when another is granted', async () => {
    @RequireCapability('inventory.retail', 'inventory.cooking')
    class BothPacks {}

    snapshot.mockResolvedValue(snapshotWith(['inventory.retail']));
    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(
      guard.canActivate(
        contextFor(request, BothPacks.prototype.constructor, BothPacks),
      ),
    ).rejects.toThrow('incluye "inventory.cooking"');
  });

  it('fails CLOSED on an unregistered key: throws loudly, never allows', async () => {
    @RequireCapability('nonexistent.key')
    class Unregistered {}

    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(
      guard.canActivate(
        contextFor(request, Unregistered.prototype.constructor, Unregistered),
      ),
    ).rejects.toThrow(/CAPABILITY_KEY_NOT_REGISTERED/);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('fails CLOSED on a non-gateable nucleus key such as core.sales', async () => {
    @RequireCapability('core.sales')
    class NucleusGated {}

    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(
      guard.canActivate(
        contextFor(request, NucleusGated.prototype.constructor, NucleusGated),
      ),
    ).rejects.toThrow(/CAPABILITY_NOT_GATEABLE/);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('resolves the snapshot once per request, even across several guarded handlers', async () => {
    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await guard.canActivate(contextFor(request));
    await guard.canActivate(contextFor(request));
    await guard.canActivate(contextFor(request));
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('never caches across requests: a new request resolves its own snapshot', async () => {
    await guard.canActivate(
      contextFor(makeRequest({ user: { tenant_id: 'tenant-1' } })),
    );
    await guard.canActivate(
      contextFor(makeRequest({ user: { tenant_id: 'tenant-2' } })),
    );
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(snapshot).toHaveBeenNthCalledWith(1, 'tenant-1');
    expect(snapshot).toHaveBeenNthCalledWith(2, 'tenant-2');
  });

  it('allows routes without the decorator and never touches the snapshot service', async () => {
    class Undecorated {}
    const request = makeRequest({ user: { tenant_id: 'tenant-1' } });
    await expect(
      guard.canActivate(
        contextFor(request, Undecorated.prototype.constructor, Undecorated),
      ),
    ).resolves.toBe(true);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('fails closed with UnauthorizedException when no tenant context exists', async () => {
    const request = makeRequest({});
    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(snapshot).not.toHaveBeenCalled();
  });
});
