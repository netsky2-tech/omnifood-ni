import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { authThrottlers } from './auth-throttle.config';

/**
 * Registers the named auth throttlers (`ip` / `account`) and their in-memory
 * storage for the modules that host pre-auth credential endpoints.
 *
 * Import once per host module: each registration carries its own storage
 * instance, so limits are per backend instance (same known limitation as the
 * onboarding device-linking limiter).
 */
@Module({
  imports: [ThrottlerModule.forRoot(authThrottlers())],
  exports: [ThrottlerModule],
})
export class AuthThrottleModule {}
