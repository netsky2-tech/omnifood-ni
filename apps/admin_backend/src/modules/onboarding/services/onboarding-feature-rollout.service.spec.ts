import {
  OnboardingFeatureFlag,
  OnboardingFeatureRolloutService,
} from './onboarding-feature-rollout.service';

describe('OnboardingFeatureRolloutService (ONB1.10E — TDD)', () => {
  let service: OnboardingFeatureRolloutService;

  beforeEach(() => {
    service = new OnboardingFeatureRolloutService();
  });

  it('defaults all flags to disabled for unconfigured tenant', () => {
    const tenantId = 'tenant-unconfigured';
    for (const flag of Object.values(OnboardingFeatureFlag)) {
      expect(service.isEnabled(tenantId, flag)).toBe(false);
    }
  });

  it('allows enabling individual flags and isolates between tenants', () => {
    const tenantA = 'tenant-a';
    const tenantB = 'tenant-b';

    service.setFlag(tenantA, OnboardingFeatureFlag.SESSION_V1, true);

    expect(service.isEnabled(tenantA, OnboardingFeatureFlag.SESSION_V1)).toBe(
      true,
    );
    expect(service.isEnabled(tenantB, OnboardingFeatureFlag.SESSION_V1)).toBe(
      false,
    );
  });

  it('validates cutover order dependencies strictly (Rule ONB1.10E)', () => {
    // Attempting to enable activation_v1 without session_v1 or required_config_v1 must fail validation
    const invalidSet = new Set<OnboardingFeatureFlag>([
      OnboardingFeatureFlag.ACTIVATION_V1,
    ]);

    const result = service.validateCutoverOrder(invalidSet);
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(
      result.violations.some((v) =>
        v.includes('requires onboarding.session_v1'),
      ),
    ).toBe(true);
    expect(
      result.violations.some((v) =>
        v.includes('requires onboarding.required_config_v1'),
      ),
    ).toBe(true);
  });

  it('validates a compliant cutover set successfully', () => {
    const validSet = new Set<OnboardingFeatureFlag>([
      OnboardingFeatureFlag.SESSION_V1,
      OnboardingFeatureFlag.SETUP_CENTER_V1,
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.REQUIRED_CONFIG_V1,
      OnboardingFeatureFlag.ACTIVATION_V1,
    ]);

    const result = service.validateCutoverOrder(validSet);
    expect(result.isValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('advances through 10 cutover stages in correct sequence without skipping dependencies', () => {
    const tenantId = 'tenant-pilot-1';

    // Stage 1: schema expandido + core session
    service.applyCutoverStage(tenantId, 1);
    expect(service.isEnabled(tenantId, OnboardingFeatureFlag.SESSION_V1)).toBe(
      true,
    );
    expect(
      service.isEnabled(tenantId, OnboardingFeatureFlag.SETUP_CENTER_V1),
    ).toBe(false);

    // Stage 2: M2 state-based Setup Center authority
    service.applyCutoverStage(tenantId, 2);
    expect(
      service.isEnabled(tenantId, OnboardingFeatureFlag.SETUP_CENTER_V1),
    ).toBe(true);

    // Stage 3: M3 template safe writer
    service.applyCutoverStage(tenantId, 3);
    expect(
      service.isEnabled(tenantId, OnboardingFeatureFlag.TEMPLATE_SAFE_V1),
    ).toBe(true);

    // Stage 4: M4 product import safe writer
    service.applyCutoverStage(tenantId, 4);
    expect(
      service.isEnabled(tenantId, OnboardingFeatureFlag.IMPORT_CONTRACT_V1),
    ).toBe(true);

    // Stage 6: M5 required config
    service.applyCutoverStage(tenantId, 6);
    expect(
      service.isEnabled(tenantId, OnboardingFeatureFlag.REQUIRED_CONFIG_V1),
    ).toBe(true);

    // Stage 7/8: Activation cloud & runner
    service.applyCutoverStage(tenantId, 8);
    expect(
      service.isEnabled(tenantId, OnboardingFeatureFlag.ACTIVATION_V1),
    ).toBe(true);

    // Stage 10: Founder tenant pilot (all active)
    service.applyCutoverStage(tenantId, 10);
    for (const flag of Object.values(OnboardingFeatureFlag)) {
      expect(service.isEnabled(tenantId, flag)).toBe(true);
    }
  });

  it('rejects invalid cutover stage number', () => {
    const tenantId = 'tenant-err';
    expect(() => service.applyCutoverStage(tenantId, 0)).toThrow();
    expect(() => service.applyCutoverStage(tenantId, 11)).toThrow();
  });

  it('triangulation: trims tenant IDs and handles edge whitespace seamlessly', () => {
    service.setFlag(
      '  tenant-padded  ',
      OnboardingFeatureFlag.SESSION_V1,
      true,
    );
    expect(
      service.isEnabled('tenant-padded', OnboardingFeatureFlag.SESSION_V1),
    ).toBe(true);
    expect(
      service.isEnabled('  tenant-padded  ', OnboardingFeatureFlag.SESSION_V1),
    ).toBe(true);
  });

  it('triangulation: returns false safely when tenantId is empty or null', () => {
    expect(service.isEnabled('', OnboardingFeatureFlag.SESSION_V1)).toBe(false);
    expect(
      service.isEnabled(null as any, OnboardingFeatureFlag.SESSION_V1),
    ).toBe(false);
    expect(
      service.isEnabled(undefined as any, OnboardingFeatureFlag.SESSION_V1),
    ).toBe(false);
  });

  it('triangulation: detects multiple missing dependencies in chaotic flag combinations', () => {
    // Activating template, import, and activation without session or required config
    const chaoticSet = new Set<OnboardingFeatureFlag>([
      OnboardingFeatureFlag.TEMPLATE_SAFE_V1,
      OnboardingFeatureFlag.IMPORT_CONTRACT_V1,
      OnboardingFeatureFlag.ACTIVATION_V1,
    ]);

    const result = service.validateCutoverOrder(chaoticSet);
    expect(result.isValid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});
