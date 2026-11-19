import {
  PROVISION_ARG_REJECTION_CODES,
  ProvisionArgsError,
  parseProvisionPlanArgs,
} from './provision-plan-args';

/**
 * ENT-08 of issue #984 (ODD S19): the provisioning script must refuse an
 * invalid plan, add-on or support tier BEFORE it touches any database, so an
 * operator typo never leaves a half-created tenant. Pure parsing, no Nest
 * context, no clock, no I/O.
 */
describe('provision plan arguments (ENT-08 #984, S19)', () => {
  it('sin banderas: PRO (etapa fundador), sin add-ons y el nivel de soporte del plan', () => {
    expect(parseProvisionPlanArgs([])).toEqual({
      planCode: 'PRO',
      supportTier: 'priority',
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

  it('acepta add-ons sin espacios ni nivel de soporte explícito', () => {
    expect(parseProvisionPlanArgs(['--add-ons=pack.cooking'])).toEqual({
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
    expect(() => parseProvisionPlanArgs(['--add-ons=pack.blockchain'])).toThrow(
      /ADD_ON_NOT_REGISTERED/,
    );
  });

  it('rechaza un add-on vacío en la lista', () => {
    expect(() => parseProvisionPlanArgs(['--add-ons=pack.retail,'])).toThrow(
      /PROVISION_ADD_ON_LIST_EMPTY_SEGMENT/,
    );
  });

  it('rechaza un nivel de soporte inválido con código estable', () => {
    expect(() => parseProvisionPlanArgs(['--support-tier=urgent'])).toThrow(
      /SUBSCRIPTION_SUPPORT_TIER_INVALID/,
    );
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
