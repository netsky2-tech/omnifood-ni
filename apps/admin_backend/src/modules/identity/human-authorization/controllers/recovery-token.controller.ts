import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { AuthGuard } from '../../guards/auth.guard';
import { AuthoritativeCurrentUserGuard } from '../../guards/authoritative-current-user.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../../../core/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { TenantInterceptor } from '../../../../core/database/rls.interceptor';
import { GetTenantId } from '../../../../core/decorators/tenant.decorator';
import {
  RecoveryTokenService,
  type RecoveryRevokeOutcome,
} from '../services/recovery-token.service';

/**
 * Human-side recovery-token surface (design §9).
 *
 * An active OWNER/MANAGER of the tenant issues a token for an enrolled
 * same-tenant terminal or revokes an unredeemed one. The plaintext token is
 * returned exactly once at issuance and is never retrievable again. Both
 * routes run under the human session transport (identity JWT), never the
 * device transport, and never touch Device Sync credentials.
 */

class IssueRecoveryTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  terminalId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;
}

class RevokeRecoveryTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  requestId?: string;
}

interface RequestWithUser extends ExpressRequest {
  user: {
    sub: string;
    tenant_id: string;
    role: UserRole;
  };
}

@Controller('identity/human-authorization/recovery-tokens')
@UseGuards(AuthGuard, AuthoritativeCurrentUserGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.MANAGER)
@UseInterceptors(TenantInterceptor)
export class HumanAuthorizationRecoveryTokenController {
  constructor(private readonly recoveryTokenService: RecoveryTokenService) {}

  @Post()
  @HttpCode(201)
  async issue(
    @GetTenantId() tenantId: string | undefined,
    @Request() req: RequestWithUser,
    @Body() dto: IssueRecoveryTokenDto,
  ): Promise<{ tokenId: string; token: string; expiresAt: Date }> {
    if (!tenantId?.trim()) {
      throw new ForbiddenException('Tenant context is required');
    }
    try {
      return await this.recoveryTokenService.issue({
        tenantId,
        terminalId: dto.terminalId,
        issuedByUserId: req.user.sub,
        reason: dto.reason,
        correlationId: dto.requestId,
      });
    } catch (error) {
      // Issuance preconditions are policy: inactive issuer or an unenrolled
      // terminal is a 403, not a 500.
      throw new ForbiddenException(
        error instanceof Error ? error.message : 'Recovery token denied',
      );
    }
  }

  @Delete(':tokenId')
  async revoke(
    @GetTenantId() tenantId: string | undefined,
    @Request() req: RequestWithUser,
    @Param('tokenId', ParseUUIDPipe) tokenId: string,
    @Body() dto: RevokeRecoveryTokenDto,
  ): Promise<{ tokenId: string; status: string }> {
    if (!tenantId?.trim()) {
      throw new ForbiddenException('Tenant context is required');
    }
    const outcome: RecoveryRevokeOutcome =
      await this.recoveryTokenService.revoke({
        tenantId,
        tokenId,
        revokedByUserId: req.user.sub,
        reason: dto.reason,
        correlationId: dto.requestId,
      });
    switch (outcome.status) {
      case 'revoked':
      case 'already-revoked':
        return { tokenId: outcome.tokenId, status: outcome.status };
      case 'not-found':
        throw new ForbiddenException('Recovery token not found');
      case 'rejected':
        throw new ForbiddenException('Recovery token cannot be revoked');
    }
  }
}
