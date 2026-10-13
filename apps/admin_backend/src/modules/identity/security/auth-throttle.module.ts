import {
  Module,
  OnModuleInit,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import type { ThrottlerOptions } from '@nestjs/throttler';
import { ThrottlerModule, getOptionsToken } from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { authThrottlers } from './auth-throttle.config';

/**
 * Registers the named auth throttlers (`ip` / `account`) and their in-memory
 * storage for the modules that host pre-auth credential endpoints.
 *
 * Import once per host module: each registration carries its own storage
 * instance, so limits are per backend instance (same known limitation as the
 * onboarding device-linking limiter).
 */
/**
 * TEMPORARY diagnostic (issue #896): logs the throttler names resolved in
 * THIS module context at boot, so the production investigation can confirm
 * the identity registration carries `ip`/`account` and was not shadowed by
 * another ThrottlerModule registration. Remove once #896 closes.
 */
@Injectable()
export class AuthThrottleOptionsProbe implements OnModuleInit {
  private readonly logger = new Logger('AuthThrottleProbe');

  constructor(
    @Inject(getOptionsToken())
    private readonly options: ThrottlerModuleOptions | ThrottlerOptions[],
  ) {}

  onModuleInit(): void {
    const list = Array.isArray(this.options)
      ? this.options
      : (this.options.throttlers ?? []);
    const resolved = list.map((t) => ({
      name: t.name,
      limit: t.limit,
      ttl: t.ttl,
    }));
    this.logger.log(`resolved throttlers: ${JSON.stringify(resolved)}`);
  }
}

@Module({
  imports: [ThrottlerModule.forRoot(authThrottlers())],
  exports: [ThrottlerModule],
  providers: [AuthThrottleOptionsProbe],
})
export class AuthThrottleModule {}
