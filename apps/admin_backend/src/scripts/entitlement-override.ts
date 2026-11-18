/**
 * ENT-06 of issue #984 — internal CLI for audited entitlement exceptions.
 *
 * Why a CLI and not an endpoint: the backend has no platform role
 * (`UserRole` is OWNER/MANAGER/CASHIER/WAITER), so any HTTP write path would
 * have to be guarded by `OWNER` — and that would let every tenant grant itself
 * the top plan. Exceptions are a platform-side commercial act, so they run
 * where only an operator has access: the server.
 *
 * Every write goes through EntitlementOverridesService, which validates the
 * key, the value shape and the expiry, writes the audit row in the same
 * transaction, and refuses an exception that would leave the tenant's snapshot
 * unresolvable. This script only parses arguments and reports outcomes.
 *
 * Usage:
 *   npm run entitlements:override -- --tenant=<uuid> --list
 *   npm run entitlements:override -- --tenant=<uuid> --history [--limit=20]
 *   npm run entitlements:override -- --tenant=<uuid> --key=inventory.retail \
 *       --included=true --expires=2026-12-31T23:59:59Z \
 *       --actor=soporte@nhilos.com --reason="Piloto autorizado por el dueño"
 *   npm run entitlements:override -- --tenant=<uuid> --key=limits.terminals \
 *       --limit=3 --expires=... --actor=... --reason=...
 *   npm run entitlements:override -- --tenant=<uuid> --revoke=<id|key> \
 *       --actor=... --reason="El cliente canceló el piloto"
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { OverrideRejectedError } from '../modules/entitlements/entitlement-override-input';
import { EntitlementOverridesService } from '../modules/entitlements/entitlement-overrides.service';
import {
  CliUsageError,
  parseCliInvocation,
  runCli,
} from './entitlement-override-args';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(EntitlementOverridesService);
    const invocation = parseCliInvocation(argv);
    const result = await runCli(invocation, service);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
    } else if (error instanceof OverrideRejectedError) {
      // The code is the contract; the prose already explains it.
      console.error(`${error.code}\n${error.message}`);
    } else {
      console.error('Error inesperado:', error);
    }
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main();
}
