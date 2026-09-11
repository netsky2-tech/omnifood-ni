import { Injectable, BadRequestException } from '@nestjs/common';

export enum OnboardingFeatureFlag {
  SESSION_V1 = 'onboarding.session_v1',
  TEMPLATE_SAFE_V1 = 'onboarding.template_safe_v1',
  IMPORT_CONTRACT_V1 = 'onboarding.import_contract_v1',
  SETUP_CENTER_V1 = 'onboarding.setup_center_v1',
  REQUIRED_CONFIG_V1 = 'onboarding.required_config_v1',
  ACTIVATION_V1 = 'onboarding.activation_v1',
}

export interface CutoverValidationResult {
  isValid: boolean;
  violations: string[];
}

export interface CutoverStageDefinition {
  stage: number;
  name: string;
  flagsToEnable: OnboardingFeatureFlag[];
}

export const CUTOVER_STAGES: CutoverStageDefinition[] = [
  {
    stage: 1,
    name: 'schema expandido + core session/readiness/idempotency/concurrency',
    flagsToEnable: [OnboardingFeatureFlag.SESSION_V1],
  },
  {
    stage: 2,
    name: 'M2 state-based Setup Center authority/resume',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
    ],
  },
  {
    stage: 3,
    name: 'M3 template safe writer',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
    ],
  },
  {
    stage: 4,
    name: 'M4 product import safe writer',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
    ],
  },
  {
    stage: 5,
    name: 'Setup Center UX completion',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
    ],
  },
  {
    stage: 6,
    name: 'M5 required config cloud->POS: Fiscal + verification Product + Identity offline proof',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.REQUIRED_CONFIG_V1,
    ],
  },
  {
    stage: 7,
    name: 'Activation cloud APIs/finalizer',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.REQUIRED_CONFIG_V1,
      OnboardingFeatureFlag.ACTIVATION_V1,
    ],
  },
  {
    stage: 8,
    name: 'M6 POS Activation runner',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.REQUIRED_CONFIG_V1,
      OnboardingFeatureFlag.ACTIVATION_V1,
    ],
  },
  {
    stage: 9,
    name: 'TTFSS/telemetry + progressive BOH',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.REQUIRED_CONFIG_V1,
      OnboardingFeatureFlag.ACTIVATION_V1,
    ],
  },
  {
    stage: 10,
    name: 'founder tenant pilot',
    flagsToEnable: [
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.REQUIRED_CONFIG_V1,
      OnboardingFeatureFlag.ACTIVATION_V1,
    ],
  },
];

@Injectable()
export class OnboardingFeatureRolloutService {
  // Tenant-specific in-memory store (for testing and runtime orchestration)
  private readonly tenantFlags = new Map<string, Map<OnboardingFeatureFlag, boolean>>();

  isEnabled(tenantId: string, flag: OnboardingFeatureFlag): boolean {
    const trimmed = tenantId?.trim();
    if (!trimmed) return false;
    const flags = this.tenantFlags.get(trimmed);
    if (!flags) return false;
    return flags.get(flag) ?? false;
  }

  setFlag(tenantId: string, flag: OnboardingFeatureFlag, enabled: boolean): void {
    const trimmed = tenantId?.trim();
    if (!trimmed) throw new BadRequestException('tenantId is required');

    let flags = this.tenantFlags.get(trimmed);
    if (!flags) {
      flags = new Map<OnboardingFeatureFlag, boolean>();
      this.tenantFlags.set(trimmed, flags);
    }
    flags.set(flag, enabled);
  }

  validateCutoverOrder(activeFlags: Set<OnboardingFeatureFlag>): CutoverValidationResult {
    const violations: string[] = [];

    // Dependency rules based on ONB1.10E:
    // 1. All sub-features require onboarding.session_v1
    if (activeFlags.has(OnboardingFeatureFlag.SETUP_CENTER_V1) && !activeFlags.has(OnboardingFeatureFlag.SESSION_V1)) {
      violations.push('onboarding.setup_center_v1 requires onboarding.session_v1');
    }
    if (activeFlags.has(OnboardingFeatureFlag.TEMPLATE_SAFE_V1) && !activeFlags.has(OnboardingFeatureFlag.SESSION_V1)) {
      violations.push('onboarding.template_safe_v1 requires onboarding.session_v1');
    }
    if (activeFlags.has(OnboardingFeatureFlag.IMPORT_CONTRACT_V1) && !activeFlags.has(OnboardingFeatureFlag.SESSION_V1)) {
      violations.push('onboarding.import_contract_v1 requires onboarding.session_v1');
    }
    if (activeFlags.has(OnboardingFeatureFlag.REQUIRED_CONFIG_V1) && !activeFlags.has(OnboardingFeatureFlag.SESSION_V1)) {
      violations.push('onboarding.required_config_v1 requires onboarding.session_v1');
    }
    // 2. activation_v1 strictly requires session_v1 AND required_config_v1
    if (activeFlags.has(OnboardingFeatureFlag.ACTIVATION_V1)) {
      if (!activeFlags.has(OnboardingFeatureFlag.SESSION_V1)) {
        violations.push('onboarding.activation_v1 requires onboarding.session_v1');
      }
      if (!activeFlags.has(OnboardingFeatureFlag.REQUIRED_CONFIG_V1)) {
        violations.push('onboarding.activation_v1 requires onboarding.required_config_v1');
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  applyCutoverStage(tenantId: string, stage: number): void {
    if (stage < 1 || stage > 10) {
      throw new BadRequestException(`Cutover stage must be between 1 and 10. Received: ${stage}`);
    }

    const stageDef = CUTOVER_STAGES.find((s) => s.stage === stage);
    if (!stageDef) {
      throw new BadRequestException(`Unknown stage: ${stage}`);
    }

    // Reset all flags first for deterministic state
    for (const flag of Object.values(OnboardingFeatureFlag)) {
      this.setFlag(tenantId, flag, false);
    }

    // Enable flags prescribed for this stage
    for (const flag of stageDef.flagsToEnable) {
      this.setFlag(tenantId, flag, true);
    }
  }

  rollbackAll(tenantId: string): void {
    const trimmed = tenantId?.trim();
    if (!trimmed) return;
    const flags = this.tenantFlags.get(trimmed);
    if (flags) {
      for (const flag of Object.values(OnboardingFeatureFlag)) {
        flags.set(flag, false);
      }
    }
  }
}
