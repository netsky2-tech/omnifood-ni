import { randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../core/app/app.module';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { Tenant } from '../modules/tenant/entities/tenant.entity';

/** The physical Q80 terminal identity, not its Wi-Fi ADB transport serial. */
export const Q80_TERMINAL_ID = 'Q802024120001';

type FixtureEnvironment = Record<string, string | undefined>;

export interface FounderPilotFixture {
  runId: string;
  tenantName: string;
  terminalId: string;
  owner: {
    name: string;
    email: string;
    password: string;
    offlinePin: string;
    role: UserRole;
  };
}

const secret = (bytes: number) => randomBytes(bytes).toString('base64url');

export function buildFounderPilotFixture(
  env: FixtureEnvironment = process.env,
): FounderPilotFixture {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = env.ONBOARDING_FOUNDER_OWNER_PASSWORD ?? secret(24);
  const offlinePin =
    env.ONBOARDING_FOUNDER_OWNER_PIN ??
    (randomBytes(4).readUInt32BE(0) % 1000000).toString().padStart(6, '0');

  if (!/^\d{6}$/.test(offlinePin)) {
    throw new Error('ONBOARDING_FOUNDER_OWNER_PIN must contain exactly six digits');
  }
  if (password.length < 8) {
    throw new Error('ONBOARDING_FOUNDER_OWNER_PASSWORD must contain at least eight characters');
  }

  return {
    runId,
    tenantName: `Founder Pilot Q80 ${runId}`,
    terminalId: Q80_TERMINAL_ID,
    owner: {
      name: 'Founder Pilot Owner',
      email: `founder-pilot-${runId}@pilot.omnifood.ni`,
      password,
      offlinePin,
      role: UserRole.OWNER,
    },
  };
}

async function seedFounderPilot(): Promise<void> {
  const fixture = buildFounderPilotFixture();
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    const ids = await dataSource.transaction(async (manager) => {
      const tenant = await manager.save(
        manager.create(Tenant, {
          name: fixture.tenantName,
          is_active: true,
        }),
      );
      const owner = await manager.save(
        manager.create(User, {
          tenant_id: tenant.id,
          name: fixture.owner.name,
          email: fixture.owner.email,
          role: UserRole.OWNER,
          password_hash: await bcrypt.hash(fixture.owner.password, 10),
          is_active: true,
        }),
      );
      const profile = await manager.save(
        manager.create(SecurityProfile, {
          user_id: owner.id,
          pin_hash: await bcrypt.hash(fixture.owner.offlinePin, 10),
          is_pin_enabled: true,
          is_totp_enabled: false,
        }),
      );
      return { tenantId: tenant.id, ownerId: owner.id, securityProfileId: profile.id };
    });

    // This is intentionally the only output: it is a machine-readable handoff for
    // the attached-device test. The current activation DevicePrincipal contract binds
    // this physical terminal via x-device-terminal-id; it has no persisted terminal table.
    console.log(
      JSON.stringify({
        kind: 'ONB1.10F_FOUNDER_PILOT_FIXTURE',
        createdAt: new Date().toISOString(),
        runId: fixture.runId,
        tenant: { id: ids.tenantId, name: fixture.tenantName },
        owner: {
          id: ids.ownerId,
          name: fixture.owner.name,
          email: fixture.owner.email,
          password: fixture.owner.password,
          offlinePin: fixture.owner.offlinePin,
          role: fixture.owner.role,
          securityProfileId: ids.securityProfileId,
        },
        devicePrincipal: {
          terminalId: fixture.terminalId,
          header: 'x-device-terminal-id',
        },
      }),
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void seedFounderPilot().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
