import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DataSource } from 'typeorm';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { runInTenantTransaction } from '../core/database/tenant-transaction';
import { normalizeTenantSlug } from '../modules/tenant/tenant-slug';
import { CatalogService } from '../modules/catalog/catalog.service';
import { TenantSubscriptionService } from '../modules/entitlements/tenant-subscription.service';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { assertSeedOutcome } from './provision-seed-guard';
import {
  ProvisionArgsError,
  parseProvisionPlanArgs,
  type ProvisionPlanArgs,
} from './provision-plan-args';

/**
 * MASS PROVISIONING SCRIPT
 *
 * This script allows for the manual creation of a new Tenant and its initial Owner.
 * Useful for onboarding new clients massively or for initial setup.
 *
 * ENT-08 of issue #984 (ODD S18): a provisioned tenant is operable in ONE
 * command, so besides the tenant and its owner this script creates the
 * audited plan subscription through TenantSubscriptionService (never raw
 * SQL), right after the owner exists, with the owner's email as actor and a
 * reason naming the provisioning. Flags: --plan=<code> (default PRO while
 * the founder stage lasts), --support-tier=<tier>, --add-ons=a,b.
 *
 * ENT-08 (ODD S19): an invalid plan or add-on is rejected BEFORE any
 * database connection, prompt or write — exit 1 with a stable code and
 * nothing half-created.
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function provision() {
  console.log('--- OmniFood NI: Mass Provisioning Tool ---');

  // ENT-08 (ODD S19): parse and validate the plan flags FIRST — before the
  // Nest context, the prompts or any write. An invalid value exits 1 with a
  // stable code and the database is never touched, so no half-created
  // tenant can exist.
  let planArgs: ProvisionPlanArgs;
  try {
    planArgs = parseProvisionPlanArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ProvisionArgsError) {
      console.error(`❌ ${error.code}: ${error.message}`);
    } else {
      console.error('❌ Error al leer los argumentos:', error);
    }
    process.exit(1);
  }
  console.log(
    `Plan solicitado: ${planArgs.planCode} (soporte ${planArgs.supportTier}, add-ons: ${planArgs.addOns.join(', ') || 'ninguno'})`,
  );

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  let failed = false;
  try {
    const tenantName = await ask('Nombre del Tenant (Negocio): ');
    const ruc = await ask('RUC del Negocio (opcional): ');
    const ownerName = await ask('Nombre del Dueño/Administrador: ');
    const ownerEmail = await ask('Email del Dueño: ');
    const ownerPass = await ask('Contraseña inicial: ');
    const ownerPin = await ask('PIN inicial (se recomiendan 6 dígitos): ');

    // The tenant id must be known before the transaction opens: the wrapper
    // binds the transaction-local RLS context from it. `tenants` is a public
    // (non-RLS) table, so inserting it inside the bound callback is fine.
    const tenantId = randomUUID();
    await runInTenantTransaction(dataSource, tenantId, async (manager) => {
      // 1. Create Tenant
      const tenant = new Tenant();
      tenant.id = tenantId;
      tenant.name = tenantName;
      // Issue #556 slice 11: the stable provisioning slug, derived with the
      // canonical normalization rule (src/modules/tenant/tenant-slug.ts).
      tenant.slug = normalizeTenantSlug(tenantName);
      tenant.ruc = ruc || null;
      tenant.is_active = true;
      const savedTenant = await manager.save(tenant);
      console.log(`✅ Tenant creado: ${savedTenant.id}`);

      // 2. Create Owner User
      const user = new User();
      user.name = ownerName;
      user.email = ownerEmail;
      user.role = UserRole.OWNER;
      user.tenant_id = savedTenant.id;
      user.password_hash = await bcrypt.hash(ownerPass, 10);
      user.is_active = true;

      const savedUser = await manager.save(user);
      const profile = new SecurityProfile();
      profile.user_id = savedUser.id;
      profile.pin_hash = await bcrypt.hash(ownerPin, 10);
      profile.is_pin_enabled = true;
      profile.is_totp_enabled = false;
      await manager.save(profile);
      console.log(`✅ Usuario OWNER creado: ${savedUser.id}`);
    });

    // Issue #903: a provisioned tenant must be born OPERATIONAL — seed the
    // default master catalogs (UOM, inventory/sales categories and types)
    // right after the owner exists, inside the tenant context. Idempotent:
    // seedDefaults skips codes that already exist and never clobbers tenant
    // edits. Without this, a blank tenant cannot create its first insumo
    // (no UOM in the catalog) and the only seed entry point is a hidden
    // button in the insumo form.
    const catalogService = app.get(CatalogService);
    const seeded = await catalogService.seedDefaults(tenantId);
    assertSeedOutcome(tenantId, seeded);
    console.log(`✅ Catálogos por defecto sembrados: ${seeded} valores`);

    // ENT-08 (ODD S18): the audited subscription goes through
    // TenantSubscriptionService — the same transaction the CLI uses, which
    // writes the new contract AND its tenant_entitlement_change_history row
    // and refuses a contract that would break the snapshot. The OWNER just
    // created is the actor; the reason names the provisioning.
    const subscriptions = app.get(TenantSubscriptionService);
    const subscription = await subscriptions.changePlan({
      tenantId,
      planCode: planArgs.planCode,
      supportTier: planArgs.supportTier,
      addOns: planArgs.addOns,
      startsAt: new Date(),
      actor: ownerEmail,
      reason: `Alta inicial del tenant por npm run provision (issue #984): plan ${planArgs.planCode} con add-ons [${planArgs.addOns.join(', ')}]`,
    });
    console.log(
      `✅ Suscripción creada: plan ${subscription.planCode} (${subscription.subscriptionId})`,
    );

    console.log('--- Provisión completada exitosamente ---');
  } catch (error) {
    // Issue #75: never swallow provisioning errors silently — a failed
    // provision must be visible in the process exit code so callers
    // (CI, shell chains) can react.
    console.error('❌ Error durante la provisión:', error);
    failed = true;
  } finally {
    await app.close();
    rl.close();
  }
  if (failed) {
    process.exit(1);
  }
}

void provision();
