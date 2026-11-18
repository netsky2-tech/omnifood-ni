/**
 * ENT-07 of issue #984 — internal CLI for audited plan changes and add-ons.
 *
 * Why a CLI and not an endpoint: same owner decision as the exceptions
 * (ODD S14). The backend has no platform role (`UserRole` is
 * OWNER/MANAGER/CASHIER/WAITER), so any HTTP write path guarded by `OWNER`
 * would let every tenant grant itself the top plan. Plan changes are a
 * platform-side commercial act, so they run where only an operator has
 * access: the server.
 *
 * Every write goes through TenantSubscriptionService, which validates the
 * plan, the add-ons and the trace (actor, reason), writes the new contract
 * and its audit row in the same transaction, and refuses a change that would
 * leave the tenant's snapshot unresolvable. This script only parses arguments
 * and reports outcomes.
 *
 * Usage:
 *   npm run entitlements:subscription -- --tenant=<uuid> --list
 *   npm run entitlements:subscription -- --tenant=<uuid> --plan=OPERACION \
 *       --add-ons=pack.retail --actor=soporte@nhilos.com \
 *       --reason="Upgrade solicitado por el cliente; contrato firmado 2026-11-25"
 *   npm run entitlements:subscription -- --tenant=<uuid> --plan=ESENCIAL \
 *       --status=suspended --actor=soporte@nhilos.com --reason="Mora de dos ciclos"
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import {
  SubscriptionRejectedError,
  TenantSubscriptionService,
} from '../modules/entitlements/tenant-subscription.service';
import {
  CliUsageError,
  parseCliInvocation,
  runCli,
} from './entitlement-subscription-args';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(TenantSubscriptionService);
    const invocation = parseCliInvocation(argv);
    const result = await runCli(invocation, service);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
    } else if (error instanceof SubscriptionRejectedError) {
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
