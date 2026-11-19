import {
  CliUsageError,
  parseCliInvocation,
  runCli,
} from './entitlement-subscription-args';

/**
 * ENT-07 of issue #984 — the operator surface of the subscription CLI
 * (ODD S14/S15).
 *
 * The CLI is the ONLY way a plan changes (no HTTP write path: the backend has
 * no platform role), so its parsing bugs are production bugs: a silently
 * dropped `--add-ons` would write a contract smaller than the one sold, and
 * a silently ignored `--status` would leave a suspended client looking
 * active. These tests pin the exact refusal, not just the happy path.
 */

const TENANT = '4f1c2f7e-9a1b-4c3d-8e5f-0123456789ab';

const usageErrorOf = (argv: string[]): string => {
  try {
    parseCliInvocation(argv);
  } catch (error) {
    expect(error).toBeInstanceOf(CliUsageError);
    return (error as Error).message;
  }
  throw new Error('expected a usage error');
};

describe('parseCliInvocation (ENT-07 #984)', () => {
  it('lee el rastro de cambios de plan', () => {
    expect(parseCliInvocation(['--tenant=' + TENANT, '--list'])).toStrictEqual({
      mode: 'list',
      tenantId: TENANT,
    });
  });

  it('parsea un cambio de plan con sus add-ons y su vigencia', () => {
    const invocation = parseCliInvocation([
      '--tenant=' + TENANT,
      '--plan=OPERACION',
      '--add-ons=pack.retail,bundle.marketing',
      '--starts-at=2026-12-01T00:00:00Z',
      '--ends-at=2027-11-30T23:59:59Z',
      '--actor=soporte@nhilos.com',
      '--reason=Upgrade autorizado por el dueño',
    ]);

    expect(invocation).toStrictEqual({
      mode: 'change',
      tenantId: TENANT,
      planCode: 'OPERACION',
      status: 'active',
      addOns: ['pack.retail', 'bundle.marketing'],
      supportTier: 'standard',
      startsAt: new Date('2026-12-01T00:00:00Z'),
      endsAt: new Date('2027-11-30T23:59:59Z'),
      actor: 'soporte@nhilos.com',
      reason: 'Upgrade autorizado por el dueño',
    });
  });

  it('aplica los valores predeterminados cuando la bandera falta', () => {
    expect(
      parseCliInvocation([
        '--tenant=' + TENANT,
        '--plan=PRO',
        '--actor=a',
        '--reason=b',
      ]),
    ).toStrictEqual({
      mode: 'change',
      tenantId: TENANT,
      planCode: 'PRO',
      status: 'active',
      addOns: [],
      supportTier: 'standard',
      startsAt: undefined,
      endsAt: undefined,
      actor: 'a',
      reason: 'b',
    });
  });

  it('acepta estado y nivel de soporte explícitos', () => {
    expect(
      parseCliInvocation([
        '--tenant=' + TENANT,
        '--plan=ESENCIAL',
        '--status=suspended',
        '--support-tier=priority',
        '--actor=a',
        '--reason=b',
      ]),
    ).toMatchObject({ status: 'suspended', supportTier: 'priority' });
  });

  it('exige un solo modo', () => {
    expect(usageErrorOf(['--tenant=' + TENANT])).toContain('un solo modo');
    expect(
      usageErrorOf(['--tenant=' + TENANT, '--list', '--plan=PRO']),
    ).toContain('un solo modo');
  });

  it('exige actor y motivo al cambiar, y el modo sin plan pide --plan', () => {
    expect(
      usageErrorOf(['--tenant=' + TENANT, '--actor=a', '--reason=b']),
    ).toContain('--plan para cambiar el plan');
    expect(
      usageErrorOf(['--tenant=' + TENANT, '--plan=PRO', '--reason=b']),
    ).toContain('Falta --actor');
    expect(
      usageErrorOf(['--tenant=' + TENANT, '--plan=PRO', '--actor=a']),
    ).toContain('Falta --reason');
  });

  it('valida el estado, el nivel de soporte y las fechas', () => {
    const base = [
      '--tenant=' + TENANT,
      '--plan=PRO',
      '--actor=a',
      '--reason=b',
    ];
    expect(usageErrorOf([...base, '--status=trial'])).toContain(
      '--status acepta active, suspended, expired',
    );
    expect(usageErrorOf([...base, '--support-tier=gold'])).toContain(
      '--support-tier acepta standard, priority',
    );
    expect(usageErrorOf([...base, '--starts-at=no-es-fecha'])).toContain(
      'no es una fecha válida',
    );
    expect(usageErrorOf([...base, '--ends-at=tampoco'])).toContain(
      'no es una fecha válida',
    );
  });

  it('rechaza add-ons vacíos o malformados', () => {
    const base = [
      '--tenant=' + TENANT,
      '--plan=PRO',
      '--actor=a',
      '--reason=b',
    ];
    expect(usageErrorOf([...base, '--add-ons=pack.retail,'])).toContain(
      '--add-ons no puede tener códigos vacíos',
    );
    expect(
      usageErrorOf([...base, '--add-ons=pack.retail,,pack.cooking']),
    ).toContain('--add-ons no puede tener códigos vacíos');
  });

  it('rechaza un argumento que no es una bandera', () => {
    expect(usageErrorOf(['--tenant=' + TENANT, 'basura'])).toContain(
      'Argumento no reconocido',
    );
  });
});

describe('runCli (ENT-07 #984)', () => {
  const service = () => ({
    changePlan: jest.fn().mockResolvedValue({ subscriptionId: 's-1' }),
    list: jest.fn().mockResolvedValue([]),
  });

  const NOW = new Date('2026-11-18T15:00:00.000Z');

  it('cambia el plan con el reloj inyectado y los valores predeterminados', async () => {
    const port = service();
    await runCli(
      {
        mode: 'change',
        tenantId: TENANT,
        planCode: 'OPERACION',
        status: 'active',
        addOns: ['pack.retail'],
        supportTier: 'standard',
        startsAt: undefined,
        endsAt: undefined,
        actor: 'soporte@nhilos.com',
        reason: 'Upgrade',
      },
      port,
      NOW,
    );

    expect(port.changePlan).toHaveBeenCalledWith({
      tenantId: TENANT,
      planCode: 'OPERACION',
      status: 'active',
      startsAt: NOW,
      endsAt: null,
      addOns: ['pack.retail'],
      supportTier: 'standard',
      actor: 'soporte@nhilos.com',
      reason: 'Upgrade',
      now: NOW,
    });
  });

  it('respeta la vigencia explícita y no inventa la que falta', async () => {
    const port = service();
    await runCli(
      {
        mode: 'change',
        tenantId: TENANT,
        planCode: 'PRO',
        status: 'active',
        addOns: [],
        supportTier: 'priority',
        startsAt: new Date('2026-12-01T00:00:00Z'),
        endsAt: undefined,
        actor: 'a',
        reason: 'b',
      },
      port,
      NOW,
    );
    expect(port.changePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        startsAt: new Date('2026-12-01T00:00:00Z'),
        endsAt: null,
      }),
    );
  });

  it('lista el rastro con el reloj inyectado', async () => {
    const port = service();
    await runCli({ mode: 'list', tenantId: TENANT }, port, NOW);
    expect(port.list).toHaveBeenCalledWith({ tenantId: TENANT, now: NOW });
  });
});
