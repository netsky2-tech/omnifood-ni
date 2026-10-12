import {
  Inject,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../entities/user.entity';
import { SecurityProfile } from '../entities/security-profile.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { runInTenantTransaction } from '../../../core/database/tenant-transaction';
import {
  SupervisorOverrideRequestDto,
  SupervisorOverrideResponseDto,
  SupervisorAuthMethod,
} from '../dto/supervisor-override.dto';
import {
  hasPermission,
  resolveEffectivePermissions,
} from '../security/permissions.enum';
import { verifyTotp } from '../security/totp.util';
import {
  IDENTITY_JWT_CONFIG,
  IdentityJwtConfig,
} from '../config/identity-jwt.config';

// S4 (security-hardening-batch2): uniform failure response for supervisor
// override verification. Unknown supervisor and wrong credential return the
// same 401 status and generic message so the endpoint cannot be used to
// enumerate supervisors or enabled methods; the structured reason stays in
// the SUPERVISOR_OVERRIDE_REJECTED audit rows.
const OVERRIDE_UNAUTHORIZED_MESSAGE = 'No se pudo autorizar la anulación';

// S4(a): failed verification attempts are counted per tenant + requesting
// user + terminal with a fixed 15-minute window. The counter is in-memory
// on purpose: food-park POS devices share one egress IP (so per-IP limits
// are wrong) and the offline-first ethos rules out new infrastructure such
// as Redis. Losing the counter on a backend restart only relaxes the
// throttle for at most one window; the audit trail is unaffected.
const OVERRIDE_MAX_FAILED_ATTEMPTS = 5;
const OVERRIDE_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

interface OverrideAttemptEntry {
  count: number;
  windowStart: number;
}

@Injectable()
export class SupervisorOverrideService {
  // Fixed-window failed-attempt counters, keyed by tenant + requesting
  // user + terminal (see overrideAttemptKey). Bounded by the number of
  // distinct requesting identities seen since process start.
  private readonly failedOverrideAttempts = new Map<
    string,
    OverrideAttemptEntry
  >();
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SecurityProfile)
    private securityProfileRepository: Repository<SecurityProfile>,
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
    // Issue #512 T3 slice 9 rework: security_profiles is tenant-RLS
    // FORCE-protected, so its reads must go through the tenant-bound
    // transaction manager; the pooled repositories above stay declared for
    // the audit write path and Nest DI compatibility.
    private readonly dataSource: DataSource,
    private jwtService: JwtService,
    @Inject(IDENTITY_JWT_CONFIG) private readonly jwtConfig: IdentityJwtConfig,
  ) {}

  async authorizeOverride(
    dto: SupervisorOverrideRequestDto,
    tenantId: string,
    requestingUserId: string,
  ): Promise<SupervisorOverrideResponseDto> {
    // S4(a): a requesting identity that has exhausted its failed-attempt
    // window is throttled before any verification work or DB access.
    const attemptKey = this.overrideAttemptKey(tenantId, requestingUserId, dto);
    this.assertOverrideAttemptsAvailable(attemptKey);

    // Issue #512 T3 slice 9 rework: one tenant-bound transaction for the
    // read unit. `users` itself has no RLS yet, but it is read through the
    // same bound manager because the dependent security_profiles findOne is
    // denied without the transaction-local tenant binding (FORCE RLS).
    // The tenant id comes from the JWT via the controller (@GetTenantId()).
    // Everything after this block is CPU work, JWT signing, and audit
    // writes: audit rows are written OUTSIDE the read transaction so a
    // rejection branch that throws does not roll its audit entry back —
    // each write opens its own tenant-bound transaction (issue #581).
    const { supervisor, profile } = await runInTenantTransaction(
      this.dataSource,
      tenantId,
      async (manager) => {
        const supervisor = await manager.getRepository(User).findOne({
          where: { id: dto.supervisorId, tenant_id: tenantId, is_active: true },
        });

        if (!supervisor) {
          return { supervisor: null, profile: null };
        }

        const profile = await manager.getRepository(SecurityProfile).findOne({
          where: { user_id: supervisor.id },
          select: [
            'id',
            'user_id',
            'pin_hash',
            'totp_secret_seed',
            'is_pin_enabled',
            'is_totp_enabled',
            'custom_permissions',
          ],
        });

        return { supervisor, profile };
      },
    );

    if (!supervisor) {
      this.recordFailedOverrideAttempt(attemptKey);
      await this.logOverrideAudit(
        'SUPERVISOR_OVERRIDE_REJECTED',
        dto.supervisorId,
        requestingUserId,
        tenantId,
        dto.method,
        { reason: 'Supervisor not found or inactive', ...dto.context },
      );
      // S4(b): uniform 401 — do not reveal whether the supervisor exists.
      throw new UnauthorizedException(OVERRIDE_UNAUTHORIZED_MESSAGE);
    }

    const effectivePermissions = resolveEffectivePermissions(
      supervisor.role,
      profile?.custom_permissions ?? [],
    );

    if (!hasPermission(effectivePermissions, dto.permissionRequired)) {
      this.recordFailedOverrideAttempt(attemptKey);
      await this.logOverrideAudit(
        'SUPERVISOR_OVERRIDE_REJECTED',
        supervisor.id,
        requestingUserId,
        tenantId,
        dto.method,
        {
          reason: 'Supervisor lacks required permission',
          permissionRequired: dto.permissionRequired,
          ...dto.context,
        },
      );
      throw new ForbiddenException(
        `El supervisor no posee el permiso requerido: ${dto.permissionRequired}`,
      );
    }

    if (dto.method === 'PIN') {
      if (!profile || !profile.is_pin_enabled || !profile.pin_hash) {
        this.recordFailedOverrideAttempt(attemptKey);
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          {
            reason: 'PIN authentication disabled for supervisor',
            ...dto.context,
          },
        );
        // S4(b): uniform 401 — the response must not reveal which methods
        // are enabled on the supervisor's security profile.
        throw new UnauthorizedException(OVERRIDE_UNAUTHORIZED_MESSAGE);
      }

      const pinMatches = await bcrypt.compare(dto.credential, profile.pin_hash);
      if (!pinMatches) {
        this.recordFailedOverrideAttempt(attemptKey);
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          { reason: 'Invalid PIN provided', ...dto.context },
        );
        // S4(b): uniform 401, same message as an unknown supervisor.
        throw new UnauthorizedException(OVERRIDE_UNAUTHORIZED_MESSAGE);
      }
    } else if (dto.method === 'TOTP') {
      if (!profile || !profile.is_totp_enabled || !profile.totp_secret_seed) {
        this.recordFailedOverrideAttempt(attemptKey);
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          {
            reason: 'TOTP authentication disabled for supervisor',
            ...dto.context,
          },
        );
        // S4(b): uniform 401 — no enumeration of enabled methods.
        throw new UnauthorizedException(OVERRIDE_UNAUTHORIZED_MESSAGE);
      }

      const totpValid = verifyTotp(dto.credential, profile.totp_secret_seed, {
        window: 1,
        stepSeconds: 30,
      });

      if (!totpValid) {
        this.recordFailedOverrideAttempt(attemptKey);
        await this.logOverrideAudit(
          'SUPERVISOR_OVERRIDE_REJECTED',
          supervisor.id,
          requestingUserId,
          tenantId,
          dto.method,
          { reason: 'Invalid TOTP token provided', ...dto.context },
        );
        // S4(b): uniform 401, same message as an unknown supervisor.
        throw new UnauthorizedException(OVERRIDE_UNAUTHORIZED_MESSAGE);
      }
    }

    const now = Date.now();
    const expiresAtDate = new Date(now + 60 * 1000);
    const expiresAt = expiresAtDate.toISOString();

    const tokenPayload = {
      sub: requestingUserId,
      supervisor_id: supervisor.id,
      supervisor_name: supervisor.name,
      tenant_id: tenantId,
      method: dto.method,
      permission: dto.permissionRequired,
      token_type: 'supervisor_override',
    };

    const authorizationToken = this.jwtService.sign(tokenPayload, {
      secret: this.jwtConfig.secret,
      expiresIn: '60s',
    });

    await this.logOverrideAudit(
      'SUPERVISOR_OVERRIDE_APPROVED',
      supervisor.id,
      requestingUserId,
      tenantId,
      dto.method,
      {
        permissionRequired: dto.permissionRequired,
        expiresAt,
        ...dto.context,
      },
    );

    // S4(a): a successful verification clears the requesting identity's
    // failed-attempt window.
    this.clearFailedOverrideAttempts(attemptKey);

    return {
      authorized: true,
      supervisorId: supervisor.id,
      supervisorName: supervisor.name,
      authorizationToken,
      expiresAt,
      permission: dto.permissionRequired,
    };
  }

  private async logOverrideAudit(
    action: string,
    authorizerSupervisorId: string,
    requestingUserId: string,
    tenantId: string,
    method: SupervisorAuthMethod,
    metadata?: Record<string, unknown>,
  ) {
    const log = new AuditLog();
    log.action = action;
    log.target_type = 'SUPERVISOR_OVERRIDE';
    log.target_id = authorizerSupervisorId;
    log.tenant_id = tenantId;
    log.user_id = requestingUserId;
    log.usuario_autorizador_id = authorizerSupervisorId;
    log.metodo_autorizacion = method;
    log.device_id = (metadata?.terminalId as string) || 'POS_LOCAL';
    log.timestamp = new Date();
    log.metadata = {
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    // Issue #581: `audit_logs` is a debt table today but becomes
    // direct:SIUD RLS in #512 T3 slice 7, so the write is bound. Every call
    // site sits OUTSIDE the authorizeOverride read transaction by design
    // (a rejection branch must not roll its audit entry back), so the
    // minimal correct binding is a dedicated tenant-bound transaction per
    // audit write, not reusing the already-committed read manager.
    await runInTenantTransaction(this.dataSource, tenantId, (manager) =>
      manager.getRepository(AuditLog).save(log),
    );
  }

  // S4(a): the fixed-window counter is keyed by tenant + requesting user
  // + terminal (context.terminalId, falling back to the local POS default),
  // so one cashier exhausting the window never locks out another.
  private overrideAttemptKey(
    tenantId: string,
    requestingUserId: string,
    dto: SupervisorOverrideRequestDto,
  ): string {
    const terminalId =
      (dto.context?.terminalId as string | undefined) || 'POS_LOCAL';
    return `${tenantId}:${requestingUserId}:${terminalId}`;
  }

  private assertOverrideAttemptsAvailable(key: string): void {
    const entry = this.failedOverrideAttempts.get(key);
    if (!entry) {
      return;
    }

    const elapsedMs = Date.now() - entry.windowStart;
    if (elapsedMs >= OVERRIDE_ATTEMPT_WINDOW_MS) {
      this.failedOverrideAttempts.delete(key);
      return;
    }

    if (entry.count >= OVERRIDE_MAX_FAILED_ATTEMPTS) {
      const retryAfterSeconds = Math.ceil(
        (OVERRIDE_ATTEMPT_WINDOW_MS - elapsedMs) / 1000,
      );
      throw new HttpException(
        {
          statusCode: 429,
          message: `Demasiados intentos fallidos de autorización. Intente nuevamente en ${retryAfterSeconds} segundos.`,
          retryAfterSeconds,
        },
        429,
      );
    }
  }

  private recordFailedOverrideAttempt(key: string): void {
    const now = Date.now();
    // F3 (batch 2 verification): the Map is bounded by pruning expired
    // windows on every write. Keys are tenant+user+terminal, so an
    // authenticated caller rotating terminal ids would otherwise grow the
    // map without limit; sweeping on write keeps it at live identities.
    for (const [k, e] of this.failedOverrideAttempts) {
      if (now - e.windowStart >= OVERRIDE_ATTEMPT_WINDOW_MS) {
        this.failedOverrideAttempts.delete(k);
      }
    }
    const entry = this.failedOverrideAttempts.get(key);
    if (!entry || now - entry.windowStart >= OVERRIDE_ATTEMPT_WINDOW_MS) {
      this.failedOverrideAttempts.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }

  private clearFailedOverrideAttempts(key: string): void {
    this.failedOverrideAttempts.delete(key);
  }
}
