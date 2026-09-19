import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HumanAuthorizationModule } from './human-authorization.module';
import { HumanAuthPolicyEpoch } from './entities/human-auth-policy-epoch.entity';
import { HumanAuthTerminalAckHistory } from './entities/human-auth-terminal-ack-history.entity';
import { HumanAuthTerminalAckFloor } from './entities/human-auth-terminal-ack-floor.entity';
import { HumanAuthRecoveryToken } from './entities/human-auth-recovery-token.entity';
import { HumanAuthRecoveryEvent } from './entities/human-auth-recovery-event.entity';
import { HumanAuthVerificationEvent } from './entities/human-auth-verification-event.entity';
import { HumanAuthRolloutCohort } from './entities/human-auth-rollout-cohort.entity';
import { HumanAuthPolicySnapshot } from './entities/human-auth-policy-snapshot.entity';
import { HumanAuthTenantPublicationState } from './entities/human-auth-tenant-publication-state.entity';
import { OhacTenantTransaction } from './rls/ohac-tenant-transaction';
import { StaffPolicySnapshotPublisher } from './services/staff-policy-snapshot-publisher.service';
import { StaffPolicyEpochMaterializationService } from './services/staff-policy-epoch-materialization.service';
import { StaffPolicyEpochDeliveryService } from './services/staff-policy-epoch-delivery.service';

const ohacEntities = [
  HumanAuthPolicyEpoch,
  HumanAuthTerminalAckHistory,
  HumanAuthTerminalAckFloor,
  HumanAuthRecoveryToken,
  HumanAuthRecoveryEvent,
  HumanAuthVerificationEvent,
  HumanAuthRolloutCohort,
  HumanAuthPolicySnapshot,
  HumanAuthTenantPublicationState,
];

describe('HumanAuthorizationModule skeleton', () => {
  let module: TestingModule;

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      imports: [
        // The RLS seam injects the DataSource token, which in production is
        // registered by TypeOrmModule.forRoot at the app level. This dormant
        // module is imported by nobody, so the test wraps it in a
        // DynamicModule that provides a stub DataSource instead.
        {
          module: HumanAuthorizationModule,
          providers: [{ provide: DataSource, useValue: {} }],
        },
      ],
    });
    for (const entity of ohacEntities) {
      builder.overrideProvider(getRepositoryToken(entity)).useValue({});
    }
    module = await builder.compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('registers repositories for all nine OHAC entities', () => {
    for (const entity of ohacEntities) {
      expect(module.get(getRepositoryToken(entity))).toBeDefined();
    }
  });

  it('registers no controllers while routes live in a later slice', () => {
    const controllers =
      Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        HumanAuthorizationModule,
      ) ?? [];
    expect(controllers).toEqual([]);
  });

  it('registers the staff policy snapshot publisher, the epoch materialization service, the delivery negotiation service, and the RLS transaction seam', () => {
    expect(module.get(StaffPolicySnapshotPublisher)).toBeDefined();
    expect(module.get(StaffPolicyEpochMaterializationService)).toBeDefined();
    expect(module.get(StaffPolicyEpochDeliveryService)).toBeDefined();
    expect(module.get(OhacTenantTransaction)).toBeDefined();
  });

  it('exports the delivery negotiation service so the sales pull can delegate to it', () => {
    // Decision 24 puts the route in the sales module while the epoch read
    // stays owned here, which is only possible if this module exports the
    // service the pull delegates to.
    const exports =
      Reflect.getMetadata('exports', HumanAuthorizationModule) ?? [];
    expect(exports).toContain(StaffPolicyEpochDeliveryService);
  });
});
