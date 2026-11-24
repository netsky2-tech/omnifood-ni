import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { AuthoritativeCurrentUserGuard } from './authoritative-current-user.guard';
import { CurrentUserAuthorizationService } from '../services/current-user-authorization.service';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
  IdentityJwtConfigModule,
} from '../config/identity-jwt.config';

/**
 * R3-004: the single home of the identity auth wiring —
 * `IdentityJwtConfigModule`, the `JwtModule.registerAsync` derivation, and
 * the three providers the guarded routes depend on (`AuthGuard`,
 * `AuthoritativeCurrentUserGuard`, `CurrentUserAuthorizationService`).
 *
 * `IdentityModule` and `EntitlementsModule` used to carry two copies of the
 * same `JwtModule.registerAsync` factory (secret/algorithm/TTL/issuer/
 * audience from `IDENTITY_JWT_CONFIG`) plus the same guard list, which could
 * drift apart silently — a license for a second implementer to change one
 * copy's signature options and leave the other issuing divergent tokens.
 * Both modules now import this one, so there is exactly ONE factory and one
 * provider graph.
 *
 * `IdentityJwtConfigModule` is re-exported so any consumer of this module
 * keeps resolving the exact `IDENTITY_JWT_CONFIG` token without importing it
 * a second time.
 */
@Module({
  imports: [
    IdentityJwtConfigModule,
    JwtModule.registerAsync({
      imports: [IdentityJwtConfigModule],
      inject: [IDENTITY_JWT_CONFIG],
      useFactory: (config: IdentityJwtConfig) => ({
        secret: config.secret,
        signOptions: {
          algorithm: config.algorithm,
          expiresIn: config.accessTokenTtlSeconds,
          issuer: config.issuer,
          audience: config.audience,
        },
      }),
    }),
  ],
  providers: [
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    CurrentUserAuthorizationService,
  ],
  exports: [
    IdentityJwtConfigModule,
    JwtModule,
    AuthGuard,
    AuthoritativeCurrentUserGuard,
    CurrentUserAuthorizationService,
  ],
})
export class IdentityGuardsModule {}
