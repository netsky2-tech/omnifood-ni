import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';

export interface GovernanceCheckInput {
  totalDeltaNio: number;
  isClosedPeriod: boolean;
  role: string;
}

@Injectable()
export class GovernanceApprovalService {
  private readonly AUTO_APPROVE_THRESHOLD = 1500.0;
  private readonly MANAGER_MAX_THRESHOLD = 10000.0;

  evaluateApprovalRequirement(totalDeltaNio: number, isClosedPeriod: boolean): {
    requiresApproval: boolean;
    allowedRoles: string[];
    reason?: string;
  } {
    if (isClosedPeriod) {
      return {
        requiresApproval: true,
        allowedRoles: ['admin', 'accountant', 'owner'],
        reason: 'PERIODO_CERRADO',
      };
    }

    if (Math.abs(totalDeltaNio) > this.MANAGER_MAX_THRESHOLD) {
      return {
        requiresApproval: true,
        allowedRoles: ['admin', 'accountant', 'owner'],
        reason: 'UMBRAL_SUPERVISOR_EXCEDIDO',
      };
    }

    if (Math.abs(totalDeltaNio) > this.AUTO_APPROVE_THRESHOLD) {
      return {
        requiresApproval: true,
        allowedRoles: ['manager', 'admin', 'accountant', 'owner'],
        reason: 'UMBRAL_EXCEDIDO',
      };
    }

    return {
      requiresApproval: false,
      allowedRoles: [],
    };
  }

  assertAuthorized(input: GovernanceCheckInput): void {
    const requirement = this.evaluateApprovalRequirement(input.totalDeltaNio, input.isClosedPeriod);
    if (!requirement.requiresApproval) {
      return;
    }

    const normalizedRole = (input.role || '').toLowerCase();
    if (!requirement.allowedRoles.includes(normalizedRole)) {
      throw new UnauthorizedException(
        `Rol '${input.role}' no tiene autorización para regularizar con motivo: ${requirement.reason}. Roles permitidos: ${requirement.allowedRoles.join(', ')}`,
      );
    }
  }
}
