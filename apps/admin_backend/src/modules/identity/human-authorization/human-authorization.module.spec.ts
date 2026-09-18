import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
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
      imports: [HumanAuthorizationModule],
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
});
