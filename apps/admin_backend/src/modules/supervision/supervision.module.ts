import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  SystemParametersConfig,
  SystemParametersConfigActiveView,
} from '../inventory/entities/system-parameters-config.entity';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { IdentityModule } from '../identity/identity.module';
import { SupervisionPolicyService } from './services/supervision-policy.service';
import { SupervisionPolicyController } from './controllers/supervision-policy.controller';

/**
 * The tenant's supervision policy: who may authorize a sensitive operation
 * here, and what happens when nobody who can is on the floor.
 *
 * It reads/writes the tenant-parameters table and bumps the config revision
 * so the terminals receive it (the snapshot is the only delivery channel).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SystemParametersConfig,
      SystemParametersConfigActiveView,
    ]),
    OnboardingModule,
    // The guards (AuthGuard → JwtService, RolesGuard, PermissionsGuard) live
    // in the identity module: without it the controller cannot be wired.
    IdentityModule,
  ],
  controllers: [SupervisionPolicyController],
  providers: [SupervisionPolicyService],
  exports: [SupervisionPolicyService],
})
export class SupervisionModule {}
