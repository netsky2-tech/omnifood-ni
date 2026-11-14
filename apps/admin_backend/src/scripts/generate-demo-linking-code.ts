import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DeviceLinkingService } from '../modules/onboarding/services/device-linking.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const linkingService = app.get(DeviceLinkingService);
    const tenantId = 'd0000000-0000-4000-8000-000000000001';
    const adminUserId = '92d9b5e0-5cb2-4569-8346-96f269207229';

    const result = await linkingService.generateLinkingCode(tenantId, adminUserId, {
      expiryMinutes: 120, // 2 hours
    });

    console.log('----------------------------------------------------');
    console.log('  LINKING CODE GENERATED FOR DEMO TENANT:');
    console.log(`  CODE:       ${result.code}`);
    console.log(`  EXPIRES AT: ${result.expiresAt.toISOString()}`);
    console.log('----------------------------------------------------');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Failed to generate linking code:', err);
  process.exit(1);
});
