import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DataSource } from 'typeorm';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { runInTenantTransaction } from '../core/database/tenant-transaction';
import { normalizeTenantSlug } from '../modules/tenant/tenant-slug';
import { TenantSubscriptionService } from '../modules/entitlements/tenant-subscription.service';
import * as bcrypt from 'bcrypt';
import {
  ProvisionArgsError,
  parseProvisionPlanArgs,
  type ProvisionPlanArgs,
} from './provision-plan-args';

/**
 * NON-INTERACTIVE DEV PROVISIONING
 * Creates tenant SOHO + owner Maxwell + audited subscription with the values
 * provided. Issue #997: requires an explicit plan via `--plan=<code>` or
 * `PROVISION_PLAN=<code>` (no silent default) and creates the subscription
 * atomically in the same transaction as the tenant.
 */

const TENANT_NAME = process.env.PROVISION_TENANT_NAME ?? 'SOHO';
const TENANT_RUC = process.env.PROVISION_TENANT_RUC ?? 'j0000000001';
const OWNER_NAME = process.env.PROVISION_OWNER_NAME ?? 'Maxwell';
const OWNER_EMAIL = process.env.PROVISION_OWNER_EMAIL ?? 'admin@soho.com';
const OWNER_PASS = process.env.PROVISION_OWNER_PASS ?? 'password';
const OWNER_PIN = process.env.PROVISION_OWNER_PIN ?? '150898';

async function provision() {
  console.log('--- OmniFood NI: Dev Provisioning ---');

  const rawArgv = [...process.argv.slice(2)];
  const hasPlanFlag = rawArgv.some((arg) => arg.startsWith('--plan='));
  if (!hasPlanFlag && process.env.PROVISION_PLAN !== undefined) {
    rawArgv.push(`--plan=${process.env.PROVISION_PLAN}`);
  }

  let planArgs: ProvisionPlanArgs;
  try {
    planArgs = parseProvisionPlanArgs(rawArgv);
  } catch (error) {
    if (error instanceof ProvisionArgsError) {
      console.error(`❌ ${error.message}`);
    } else {
      console.error('❌ Error al leer los argumentos:', error);
    }
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  const subscriptions = app.get(TenantSubscriptionService);

  let failed = false;
  try {
    // The tenant id must be known before the transaction opens: the wrapper
    // binds the transaction-local RLS context from it. `tenants` is a public
    // (non-RLS) table, so inserting it inside the bound callback is fine.
    const tenantId = randomUUID();
    await runInTenantTransaction(dataSource, tenantId, async (manager) => {
      const tenant = new Tenant();
      tenant.id = tenantId;
      tenant.name = TENANT_NAME;
      // Issue #556 slice 11: the stable provisioning slug, derived with the
      // canonical normalization rule (src/modules/tenant/tenant-slug.ts).
      tenant.slug = normalizeTenantSlug(TENANT_NAME);
      tenant.ruc = TENANT_RUC;
      tenant.is_active = true;
      const savedTenant = await manager.save(tenant);
      console.log(`Tenant created: ${savedTenant.id}`);

      const user = new User();
      user.name = OWNER_NAME;
      user.email = OWNER_EMAIL;
      user.role = UserRole.OWNER;
      user.tenant_id = savedTenant.id;
      user.password_hash = await bcrypt.hash(OWNER_PASS, 10);
      user.is_active = true;

      const savedUser = await manager.save(user);
      const profile = new SecurityProfile();
      profile.user_id = savedUser.id;
      profile.pin_hash = await bcrypt.hash(OWNER_PIN, 10);
      profile.is_pin_enabled = true;
      profile.is_totp_enabled = false;
      await manager.save(profile);

      const subscription = await subscriptions.changePlanInTransaction(
        manager,
        {
          tenantId,
          planCode: planArgs.planCode,
          supportTier: planArgs.supportTier,
          addOns: planArgs.addOns,
          startsAt: new Date(),
          actor: OWNER_EMAIL,
          reason: `Alta dev del tenant por provision-dev (issue #997): plan ${planArgs.planCode}`,
        },
      );
      console.log(`Owner created: ${savedUser.id}`);
      console.log(`Tenant ID: ${savedTenant.id}`);
      console.log(
        `Subscription created: ${subscription.planCode} (${subscription.subscriptionId})`,
      );
    });

    console.log('--- Provisioning complete ---');
  } catch (error) {
    // Issue #75: never swallow provisioning errors silently — a failed
    // provision must be visible in the process exit code so callers
    // (CI, shell chains) can react.
    console.error('Provisioning failed:', error);
    failed = true;
  } finally {
    await app.close();
  }
  if (failed) {
    process.exit(1);
  }
}

void provision();
