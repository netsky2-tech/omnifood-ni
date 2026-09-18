import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HumanAuthPolicyEpoch } from './entities/human-auth-policy-epoch.entity';
import { HumanAuthTerminalAckHistory } from './entities/human-auth-terminal-ack-history.entity';
import { HumanAuthTerminalAckFloor } from './entities/human-auth-terminal-ack-floor.entity';
import { HumanAuthRecoveryToken } from './entities/human-auth-recovery-token.entity';
import { HumanAuthRecoveryEvent } from './entities/human-auth-recovery-event.entity';
import { HumanAuthVerificationEvent } from './entities/human-auth-verification-event.entity';
import { HumanAuthRolloutCohort } from './entities/human-auth-rollout-cohort.entity';
import { HumanAuthPolicySnapshot } from './entities/human-auth-policy-snapshot.entity';
import { HumanAuthTenantPublicationState } from './entities/human-auth-tenant-publication-state.entity';

/**
 * Human Authorization (OHAC) backend module.
 *
 * Registration-only seam: this slice maps the nine tables and nothing else.
 * Routes, controllers, services, and DTOs arrive in a later slice, and no
 * other module imports this one yet, so the dormant registration is
 * intentional.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      HumanAuthPolicyEpoch,
      HumanAuthTerminalAckHistory,
      HumanAuthTerminalAckFloor,
      HumanAuthRecoveryToken,
      HumanAuthRecoveryEvent,
      HumanAuthVerificationEvent,
      HumanAuthRolloutCohort,
      HumanAuthPolicySnapshot,
      HumanAuthTenantPublicationState,
    ]),
  ],
})
export class HumanAuthorizationModule {}
