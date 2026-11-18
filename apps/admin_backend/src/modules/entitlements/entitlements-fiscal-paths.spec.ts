/**
 * ENT-03 — the regression net that protects the fiscal and transactional
 * paths (issue #984, catalog §7's closed list of unguardable keys).
 *
 * These source files must NEVER carry `@RequireCapability`, for one reason:
 * DGI emissions, cancellations, reprints, cash closing, POS sync and
 * point-transaction sync must never be blocked by a plan. The catalog is
 * frozen (`docs/plans/entitlements/catalogo_capacidades_v1.md` §7) and ODD
 * S2/S3 say the same: «El snapshot no puede impedir vender, facturar,
 * anular, reimprimir ni cerrar caja.» «Los guards no se aplican al camino
 * fiscal ni al cobro.»
 *
 * The net reads the controller sources themselves, so decorating any of
 * them in a future slice fails this spec before it reaches production.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// __dirname = src/modules/entitlements → two levels up is src/.
const SRC_DIR = join(__dirname, '..', '..');

const controllersInDir = (relativeDir: string): string[] =>
  readdirSync(join(SRC_DIR, relativeDir))
    .filter((file) => file.endsWith('.controller.ts'))
    .sort()
    .map((file) => join(relativeDir, file));

const salesControllers = controllersInDir('modules/sales/controllers');
const customersControllers = controllersInDir('modules/customers/controllers');

/**
 * Every controller the closed list protects. The directory reads above keep
 * the net covering NEW sales/customers controllers automatically.
 */
const FISCAL_PATH_CONTROLLERS: string[] = [
  // DGI emissions, cancellations, reprints, cash closing, essential reports
  // and every current and future POS sync controller.
  ...salesControllers,
  // Point-transaction sync: the POS's loyalty earning path is transactional,
  // family of the fiscal path (catalog v1.1, gap H4).
  'modules/loyalty/controllers/loyalty-sync.controller.ts',
  // Without catalog there is no valid sale.
  'modules/catalog/catalog.controller.ts',
  // The customer's name and RUC print on the fiscal invoice (decision #1).
  ...customersControllers,
  // Terminal enrolment is transactional infrastructure; its quota
  // (limits.terminals) is a separate mechanism that blocks enrolment, never
  // the sale — and it is NOT a @RequireCapability concern.
  'modules/identity/controllers/device-sync-token.controller.ts',
  // The audit-contract versioning endpoint must stay reachable so
  // contracts keep activating regardless of the plan.
  'modules/identity/controllers/capability.controller.ts',
];

describe('fiscal and transactional paths never carry @RequireCapability', () => {
  it('the net actually covers the controllers it claims to protect', () => {
    // If one of these is renamed or moved, this spec must fail so the list
    // is updated — never silently pass on an empty/renamed surface.
    for (const expected of [
      'modules/sales/controllers/invoices.controller.ts',
      'modules/sales/controllers/admin-invoices.controller.ts',
      'modules/sales/controllers/cash-shift.controller.ts',
      'modules/sales/controllers/cash-shift-sync.controller.ts',
      'modules/sales/controllers/reports.controller.ts',
      'modules/loyalty/controllers/loyalty-sync.controller.ts',
      'modules/catalog/catalog.controller.ts',
      'modules/customers/controllers/customers.controller.ts',
      'modules/customers/controllers/customer-sync.controller.ts',
      'modules/identity/controllers/device-sync-token.controller.ts',
      'modules/identity/controllers/capability.controller.ts',
    ]) {
      expect(FISCAL_PATH_CONTROLLERS).toContain(expected);
    }
    expect(FISCAL_PATH_CONTROLLERS.length).toBeGreaterThanOrEqual(11);
  });

  it.each(FISCAL_PATH_CONTROLLERS)(
    '%s stays free of @RequireCapability',
    (relativePath) => {
      const source = readFileSync(join(SRC_DIR, relativePath), 'utf-8');
      // DGI emissions, cancellations, reprints, cash closing, POS sync and
      // point-transaction sync must never be blocked by a plan (catalog §7).
      expect(source).not.toContain('@RequireCapability');
    },
  );
});
