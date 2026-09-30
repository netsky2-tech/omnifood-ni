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
import { StaffPolicySnapshotPublisher } from './services/staff-policy-snapshot-publisher.service';
import { StaffPolicyEpochMaterializationService } from './services/staff-policy-epoch-materialization.service';
import { StaffPolicyEpochDeliveryService } from './services/staff-policy-epoch-delivery.service';
import { StaffPolicyEpochAcknowledgementService } from './services/staff-policy-epoch-acknowledgement.service';
import { HumanAuthorizationVerifierService } from './services/human-authorization-verifier.service';
import { HumanAuthorizationMetricsService } from './services/human-authorization-metrics.service';
import { HUMAN_AUTHORIZATION_VERIFIER_PORT } from './ports/human-authorization-verifier.port';
import { OhacTenantTransaction } from './rls/ohac-tenant-transaction';

/**
 * Human Authorization (OHAC) backend module.
 *
 * Maps the nine OHAC tables and registers the serialized staff-policy
 * snapshot publisher, the per-terminal epoch materialization service, the
 * delivery negotiation service, the shared RLS transaction seam, and the §8
 * backend verifier port. The delivery and acknowledgement services are
 * exported because the device pull and the acknowledgement route live in the
 * sales module while every epoch and history read stays owned here, per
 * design §11.4 decision 24. The §9 recovery-token routes and service live in
 * the identity module, where the human-session guards are registered.
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
  providers: [
    OhacTenantTransaction,
    HumanAuthorizationMetricsService,
    StaffPolicySnapshotPublisher,
    StaffPolicyEpochMaterializationService,
    StaffPolicyEpochDeliveryService,
    StaffPolicyEpochAcknowledgementService,
    HumanAuthorizationVerifierService,
    {
      provide: HUMAN_AUTHORIZATION_VERIFIER_PORT,
      useExisting: HumanAuthorizationVerifierService,
    },
  ],
  exports: [
    StaffPolicyEpochDeliveryService,
    StaffPolicyEpochAcknowledgementService,
    HumanAuthorizationVerifierService,
    HUMAN_AUTHORIZATION_VERIFIER_PORT,
    HumanAuthorizationMetricsService,
  ],
})
export class HumanAuthorizationModule {}
