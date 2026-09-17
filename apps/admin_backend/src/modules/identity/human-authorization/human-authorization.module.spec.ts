import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { HumanAuthorizationModule } from './human-authorization.module';
import { HumanAuthPolicyEpoch } from './entities/human-auth-policy-epoch.entity';
import { HumanAuthTerminalAckHistory } from './entities/human-auth-terminal-ack-history.entity';
import { HumanAuthTerminalAckFloor } from './entities/human-auth-terminal-ack-floor.entity';

const ohacEntities = [
  HumanAuthPolicyEpoch,
  HumanAuthTerminalAckHistory,
  HumanAuthTerminalAckFloor,
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

  it('registers repositories for every OHAC entity', () => {
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
