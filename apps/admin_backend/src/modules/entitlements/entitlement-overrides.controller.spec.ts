import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../core/decorators/roles.decorator';
import { UserRole } from '../identity/entities/user.entity';
import { EntitlementOverridesService } from './entitlement-overrides.service';
import { EntitlementsController } from './entitlements.controller';
import { EntitlementsService } from './entitlements.service';

/**
 * ENT-06 of issue #984 — the read side of audited overrides.
 *
 * Two properties matter and neither is about the happy path:
 *   1. The tenant always comes from the authenticated request (`@GetTenantId`),
 *      never from a query string, so one tenant cannot read another's
 *      commercial exceptions.
 *   2. This controller has NO write handler at all. Overrides are granted only
 *      through the internal CLI; the day someone adds a POST here, this spec
 *      fails and the decision gets re-examined instead of quietly reversed.
 */

const buildController = () => {
  const snapshot = jest.fn();
  const list = jest.fn();
  const history = jest.fn();
  const controller = new EntitlementsController(
    { snapshot } as unknown as EntitlementsService,
    { list, history } as unknown as EntitlementOverridesService,
  );
  return { controller, snapshot, list, history };
};

const handlerOf = (name: string): unknown =>
  (EntitlementsController.prototype as unknown as Record<string, unknown>)[
    name
  ];

describe('EntitlementsController overrides (ENT-06 #984)', () => {
  it('consulta las excepciones del tenant autenticado', async () => {
    const { controller, list } = buildController();
    list.mockResolvedValue([]);

    await controller.getOverrides('tenant-del-token');

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith({ tenantId: 'tenant-del-token' });
  });

  it('consulta el historial del tenant autenticado', async () => {
    const { controller, history } = buildController();
    history.mockResolvedValue([]);

    await controller.getOverrideHistory('tenant-del-token');

    expect(history).toHaveBeenCalledWith({ tenantId: 'tenant-del-token' });
  });

  it('reserva ambas consultas al OWNER: son condiciones comerciales', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, handlerOf('getOverrides')),
    ).toStrictEqual([UserRole.OWNER]);
    expect(
      Reflect.getMetadata(ROLES_KEY, handlerOf('getOverrideHistory')),
    ).toStrictEqual([UserRole.OWNER]);
  });

  it('el snapshot sigue abierto a cualquier rol del tenant', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, handlerOf('getEntitlements')),
    ).toBeUndefined();
  });

  it('no expone ninguna ruta de escritura: las excepciones se conceden por CLI', () => {
    const handlers = Object.getOwnPropertyNames(
      EntitlementsController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(handlers.length).toBeGreaterThan(0);
    for (const name of handlers) {
      const target = handlerOf(name);
      const method = Reflect.getMetadata(METHOD_METADATA, target) as
        RequestMethod | undefined;
      expect({ handler: name, method }).toStrictEqual({
        handler: name,
        method: RequestMethod.GET,
      });
    }
  });

  it('ningún controlador del módulo declara una ruta de escritura', () => {
    // The prototype check above only sees THIS class. A future controller in
    // the module could add the write path the decision forbids, so scan the
    // module's controllers at the source level too.
    const dir = __dirname;
    const controllers = readdirSync(dir).filter((name) =>
      name.endsWith('.controller.ts'),
    );
    expect(controllers).toContain('entitlements.controller.ts');

    for (const name of controllers) {
      const source = readFileSync(join(dir, name), 'utf8');
      for (const verb of ['@Post(', '@Put(', '@Patch(', '@Delete(']) {
        expect({
          controller: name,
          verb,
          found: source.includes(verb),
        }).toStrictEqual({
          controller: name,
          verb,
          found: false,
        });
      }
    }
  });

  it('declara las rutas de consulta bajo /tenant', () => {
    expect(Reflect.getMetadata(PATH_METADATA, EntitlementsController)).toBe(
      'tenant',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handlerOf('getOverrides'))).toBe(
      'entitlement-overrides',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, handlerOf('getOverrideHistory')),
    ).toBe('entitlement-overrides/history');
  });
});
