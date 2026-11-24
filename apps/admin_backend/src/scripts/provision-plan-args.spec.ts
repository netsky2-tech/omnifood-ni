import {
  PROVISION_ARG_REJECTION_CODES,
  ProvisionArgsError,
  parseProvisionPlanArgs,
} from './provision-plan-args';

/**
 * Issue #997 (and ENT-08 of #984, ODD S19): the provisioning script must
 * require `--plan` explicitly (no invisible default) and refuse an invalid
 * plan, add-on or support tier BEFORE it touches any database, so an
 * operator omission or typo never leaves a half-created or silently defaulted
 * tenant. Pure parsing, no Nest context, no clock, no I/O.
 */
describe('provision plan arguments (#997 / ENT-08 #984)', () => {
  it('sin --plan: rechaza con PROVISION_PLAN_REQUIRED y mensaje en español antes de crear nada', () => {
    try {
      parseProvisionPlanArgs([]);
      throw new Error('should have thrown when --plan is omitted');
    } catch (error) {
      expect(error).toBeInstanceOf(ProvisionArgsError);
      const argsError = error as ProvisionArgsError;
      expect(argsError.code).toBe(PROVISION_ARG_REJECTION_CODES.PLAN_REQUIRED);
      expect(argsError.message).toMatch(/--plan/i);
      expect(argsError.message).toMatch(/Nada fue creado/i);
    }
  });

  it('con --add-ons o --support-tier pero sin --plan: también rechaza con PROVISION_PLAN_REQUIRED', () => {
    expect(PROVISION_ARG_REJECTION_CODES.PLAN_REQUIRED).toBe(
      'PROVISION_PLAN_REQUIRED',
    );
    for (const argv of [
      ['--add-ons=pack.cooking'],
      ['--support-tier=priority'],
    ]) {
      try {
        parseProvisionPlanArgs(argv);
        throw new Error(
          `should have thrown when --plan is omitted: ${argv.join(' ')}`,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(ProvisionArgsError);
        expect((error as ProvisionArgsError).code).toBe(
          PROVISION_ARG_REJECTION_CODES.PLAN_REQUIRED,
        );
      }
    }
  });

  it('acepta plan explícito y aplica el nivel de soporte del plan por defecto', () => {
    expect(parseProvisionPlanArgs(['--plan=PRO'])).toEqual({
      planCode: 'PRO',
      supportTier: 'priority',
      addOns: [],
    });
    expect(parseProvisionPlanArgs(['--plan=ESENCIAL'])).toEqual({
      planCode: 'ESENCIAL',
      supportTier: 'standard',
      addOns: [],
    });
  });

  it('acepta plan, nivel de soporte y lista de add-ons explícitos', () => {
    expect(
      parseProvisionPlanArgs([
        '--plan=OPERACION',
        '--support-tier=standard',
        '--add-ons=pack.retail, terminal.extra',
      ]),
    ).toEqual({
      planCode: 'OPERACION',
      supportTier: 'standard',
      addOns: ['pack.retail', 'terminal.extra'],
    });
  });

  it('acepta add-ons sin espacios con plan explícito y sin nivel de soporte explícito', () => {
    expect(
      parseProvisionPlanArgs(['--plan=PRO', '--add-ons=pack.cooking']),
    ).toEqual({
      planCode: 'PRO',
      supportTier: 'priority',
      addOns: ['pack.cooking'],
    });
  });

  it('rechaza un plan fuera del catálogo con código estable, antes de crear nada', () => {
    for (const planCode of ['ENTERPRISE', 'pro', 'PREMIUM', '']) {
      try {
        parseProvisionPlanArgs([`--plan=${planCode}`]);
        throw new Error(`should have thrown for "${planCode}"`);
      } catch (error) {
        expect(error).toBeInstanceOf(ProvisionArgsError);
        expect((error as ProvisionArgsError).code).toBe(
          PROVISION_ARG_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
        );
      }
    }
  });

  it('rechaza un add-on desconocido con código estable', () => {
    expect(() =>
      parseProvisionPlanArgs(['--plan=PRO', '--add-ons=pack.blockchain']),
    ).toThrow(/ADD_ON_NOT_REGISTERED/);
  });

  it('rechaza un add-on vacío en la lista', () => {
    expect(() =>
      parseProvisionPlanArgs(['--plan=PRO', '--add-ons=pack.retail,']),
    ).toThrow(/PROVISION_ADD_ON_LIST_EMPTY_SEGMENT/);
  });

  it('rechaza un nivel de soporte inválido con código estable', () => {
    expect(() =>
      parseProvisionPlanArgs(['--plan=PRO', '--support-tier=urgent']),
    ).toThrow(/SUBSCRIPTION_SUPPORT_TIER_INVALID/);
  });

  it('rechaza una bandera no reconocida (un typo no se ignora en silencio)', () => {
    expect(() => parseProvisionPlanArgs(['--plans=PRO'])).toThrow(
      /PROVISION_FLAG_NOT_RECOGNIZED/,
    );
    expect(() => parseProvisionPlanArgs(['plan=PRO'])).toThrow(
      /PROVISION_FLAG_NOT_RECOGNIZED/,
    );
  });

  it('el código del error es estable y legible por máquina', () => {
    try {
      parseProvisionPlanArgs(['--plan=NOPE']);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProvisionArgsError);
      expect((error as ProvisionArgsError).code).toBe(
        PROVISION_ARG_REJECTION_CODES.PLAN_CODE_NOT_REGISTERED,
      );
    }
  });
});
