import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DataSource } from 'typeorm';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

/**
 * MASS PROVISIONING SCRIPT
 * 
 * This script allows for the manual creation of a new Tenant and its initial Owner.
 * Useful for onboarding new clients massively or for initial setup.
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

async function provision() {
  console.log('--- OmniFood NI: Mass Provisioning Tool ---');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);
  
  try {
    const tenantName = await ask('Nombre del Tenant (Negocio): ');
    const ruc = await ask('RUC del Negocio (opcional): ');
    const ownerName = await ask('Nombre del Dueño/Administrador: ');
    const ownerEmail = await ask('Email del Dueño: ');
    const ownerPass = await ask('Contraseña inicial: ');
    const ownerPin = await ask('PIN inicial (4-6 dígitos): ');

    await dataSource.transaction(async manager => {
      // 1. Create Tenant
      const tenant = new Tenant();
      tenant.name = tenantName;
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
      user.pin_hash = await bcrypt.hash(ownerPin, 10);
      user.is_active = true;
      
      const savedUser = await manager.save(user);
      console.log(`✅ Usuario OWNER creado: ${savedUser.id}`);
    });

    console.log('--- Provisión completada exitosamente ---');
  } catch (error) {
    console.error('❌ Error durante la provisión:', error);
  } finally {
    await app.close();
    rl.close();
  }
}

void provision();
