import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  Headers,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ACCOUNT_THROTTLER_NAME,
  IP_THROTTLER_NAME,
  LOGIN_PER_ACCOUNT_LIMIT,
  LOGIN_PER_IP_LIMIT,
  REFRESH_PER_IP_LIMIT,
  THROTTLE_TTL_MS,
} from '../security/auth-throttle.config';
import { AuthService } from '../services/auth.service';
import { SupervisorOverrideService } from '../services/supervisor-override.service';
import { AuthGuard } from '../guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../guards/authoritative-current-user.guard';
import { RolesGuard } from '../guards/roles.guard';
import { TenantInterceptor } from '../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../core/decorators/tenant.decorator';
import { LoginDto, RefreshTokenDto } from '../dto/identity.dto';
import { SupervisorOverrideRequestDto } from '../dto/supervisor-override.dto';

@Controller('identity')
export class AuthController {
  constructor(
    private authService: AuthService,
    private supervisorOverrideService: SupervisorOverrideService,
  ) {}

  @Post('login')
  // Pre-auth credential seam: aggressive limits per IP and per account
  // (tenantSlug|email) so brute force and credential stuffing are bounded
  // (security audit remediation S1).
  @UseGuards(ThrottlerGuard)
  @Throttle({
    [IP_THROTTLER_NAME]: { limit: LOGIN_PER_IP_LIMIT, ttl: THROTTLE_TTL_MS },
    [ACCOUNT_THROTTLER_NAME]: {
      limit: LOGIN_PER_ACCOUNT_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.pass, body.tenantSlug);
  }

  @Post('refresh')
  // Pre-auth credential seam: bound per IP (see security audit remediation
  // S1). The per-account bucket is login-only: refresh bodies carry no email.
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [ACCOUNT_THROTTLER_NAME]: true })
  @Throttle({
    [IP_THROTTLER_NAME]: {
      limit: REFRESH_PER_IP_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshTokens(
      body.userId,
      body.refreshToken,
      body.tenantSlug,
    );
  }

  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @UseInterceptors(TenantInterceptor)
  @Post('auth/supervisor-override')
  async supervisorOverride(
    @GetTenantId() tenantId: string,
    @Body() body: SupervisorOverrideRequestDto,
    @Req() req: { user?: { sub?: string; tenant_id?: string } },
  ) {
    return this.supervisorOverrideService.authorizeOverride(
      body,
      tenantId || req.user?.tenant_id || '',
      req.user?.sub || '',
    );
  }

  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @UseInterceptors(TenantInterceptor)
  @Get('me')
  async getMe(@Req() req: { user?: { sub?: string; tenant_id?: string } }) {
    // Issue #556 stage 12d: the tenant id comes from the JWT (never from
    // the client body) so the self read binds the matching tenant context.
    return this.authService.getMe(
      req.user?.sub || '',
      req.user?.tenant_id || '',
    );
  }

  @UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
  @UseInterceptors(TenantInterceptor)
  @Get('staff')
  async getStaff(
    @GetTenantId() tenantId: string,
    @Req() req: { user?: { role?: string; sub?: string } },
    @Headers('x-offline-sync-scope') syncScope?: string,
  ) {
    return this.authService.getStaffForSync(
      tenantId || '',
      req.user?.role,
      req.user?.sub,
      syncScope,
    );
  }
}
