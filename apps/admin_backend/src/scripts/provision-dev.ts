import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DataSource } from 'typeorm';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import * as bcrypt from 'bcrypt';

/**
 * NON-INTERACTIVE DEV PROVISIONING
 * Creates tenant SOHO + owner Maxwell with the values provided.
 */

const TENANT_NAME = process.env.PROVISION_TENANT_NAME ?? 'SOHO';
const TENANT_RUC = process.env.PROVISION_TENANT_RUC ?? 'j0000000001';
const OWNER_NAME = process.env.PROVISION_OWNER_NAME ?? 'Maxwell';
const OWNER_EMAIL = process.env.PROVISION_OWNER_EMAIL ?? 'admin@soho.com';
const OWNER_PASS = process.env.PROVISION_OWNER_PASS ?? 'password';
const OWNER_PIN = process.env.PROVISION_OWNER_PIN ?? '150898';

async function provision() {
  console.log('--- OmniFood NI: Dev Provisioning ---');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    await dataSource.transaction(async (manager) => {
      const tenant = new Tenant();
      tenant.name = TENANT_NAME;
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
      console.log(`Owner created: ${savedUser.id}`);
      console.log(`Tenant ID: ${savedTenant.id}`);
    });

    console.log('--- Provisioning complete ---');
  } catch (error) {
    console.error('Provisioning failed:', error);
  } finally {
    await app.close();
  }
}

void provision();
