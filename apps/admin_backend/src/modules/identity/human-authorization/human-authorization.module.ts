import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HumanAuthPolicyEpoch } from './entities/human-auth-policy-epoch.entity';
import { HumanAuthTerminalAckHistory } from './entities/human-auth-terminal-ack-history.entity';
import { HumanAuthTerminalAckFloor } from './entities/human-auth-terminal-ack-floor.entity';

/**
 * Human Authorization (OHAC) backend module.
 *
 * Registration-only seam: this slice maps the OHAC core tables and nothing else.
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
    ]),
  ],
})
export class HumanAuthorizationModule {}
