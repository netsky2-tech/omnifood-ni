import {
  CliUsageError,
  parseCliInvocation,
  runCli,
} from './entitlement-override-args';

/**
 * ENT-06 of issue #984 — the operator surface of the override CLI.
 *
 * The CLI is the ONLY way an exception enters the system, so its parsing bugs
 * are production bugs: a silently ignored `--expires` would record an override
 * that the service then rejects for a reason the operator never sees, and a
 * silently misparsed `--limit` would grant the wrong quota. These tests pin
 * the exact refusal, not just the happy path.
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

describe('parseCliInvocation (ENT-06 #984)', () => {
  it('lee el listado y el historial con su límite', () => {
    expect(parseCliInvocation(['--tenant=' + TENANT, '--list'])).toStrictEqual({
      mode: 'list',
      tenantId: TENANT,
    });
    expect(
      parseCliInvocation(['--tenant=' + TENANT, '--history', '--limit=20']),
    ).toStrictEqual({ mode: 'history', tenantId: TENANT, limit: 20 });
  });

  it('parsea una concesión de capacidad con su expiración', () => {
    const invocation = parseCliInvocation([
      '--tenant=' + TENANT,
      '--key=inventory.retail',
      '--included=true',
      '--expires=2026-12-31T23:59:59Z',
      '--actor=soporte@nhilos.com',
      '--reason=Piloto autorizado',
    ]);

    expect(invocation).toStrictEqual({
      mode: 'grant',
      tenantId: TENANT,
      capabilityKey: 'inventory.retail',
      valueJson: { included: true },
      actor: 'soporte@nhilos.com',
      reason: 'Piloto autorizado',
      expiresAt: new Date('2026-12-31T23:59:59Z'),
    });
  });

  it('parsea una cuota, incluido el ilimitado', () => {
    const base = [
      '--tenant=' + TENANT,
      '--key=limits.terminals',
      '--expires=2026-12-31T23:59:59Z',
      '--actor=soporte@nhilos.com',
      '--reason=Piloto',
    ];
    expect(parseCliInvocation([...base, '--limit=3'])).toMatchObject({
      valueJson: { limit: 3 },
    });
    expect(parseCliInvocation([...base, '--limit=none'])).toMatchObject({
      valueJson: { limit: null },
    });
  });

  it('distingue revocar por id de revocar por clave', () => {
    const base = [
      '--tenant=' + TENANT,
      '--actor=soporte@nhilos.com',
      '--reason=El cliente canceló el piloto',
    ];
    expect(
      parseCliInvocation([
        ...base,
        '--revoke=0b6f1a2c-1111-4222-8333-444455556666',
      ]),
    ).toMatchObject({
      mode: 'revoke',
      overrideId: '0b6f1a2c-1111-4222-8333-444455556666',
    });
    expect(parseCliInvocation([...base, '--revoke=loyalty'])).toMatchObject({
      mode: 'revoke',
      capabilityKey: 'loyalty',
    });
  });

  it('exige un solo modo', () => {
    expect(usageErrorOf(['--tenant=' + TENANT])).toContain('un solo modo');
    expect(
      usageErrorOf(['--tenant=' + TENANT, '--list', '--history']),
    ).toContain('un solo modo');
  });

  it('exige exactamente un valor, y del tipo correcto', () => {
    const base = [
      '--tenant=' + TENANT,
      '--key=limits.terminals',
      '--expires=2026-12-31T23:59:59Z',
      '--actor=soporte@nhilos.com',
      '--reason=Piloto',
    ];
    expect(usageErrorOf(base)).toContain(
      'exactamente uno de --included o --limit',
    );
    expect(usageErrorOf([...base, '--included=true', '--limit=2'])).toContain(
      'exactamente uno de --included o --limit',
    );
    expect(usageErrorOf([...base, '--included=si'])).toContain('true o false');
    expect(usageErrorOf([...base, '--limit=-2'])).toContain(
      'entero no negativo',
    );
    expect(usageErrorOf([...base, '--limit=2.5'])).toContain(
      'entero no negativo',
    );
  });

  it('no deja pasar una concesión sin rastro ni sin expiración', () => {
    const partial = [
      '--tenant=' + TENANT,
      '--key=inventory.retail',
      '--included=true',
    ];
    expect(
      usageErrorOf([...partial, '--reason=Piloto', '--expires=2026-12-31']),
    ).toContain('Falta --actor');
    expect(
      usageErrorOf([...partial, '--actor=a', '--expires=2026-12-31']),
    ).toContain('Falta --reason');
    expect(usageErrorOf([...partial, '--actor=a', '--reason=b'])).toContain(
      'Falta --expires',
    );
    expect(
      usageErrorOf([
        ...partial,
        '--actor=a',
        '--reason=b',
        '--expires=no-es-fecha',
      ]),
    ).toContain('no es una fecha válida');
  });

  it('rechaza un argumento que no es una bandera', () => {
    expect(usageErrorOf(['--tenant=' + TENANT, 'basura'])).toContain(
      'Argumento no reconocido',
    );
  });
});

describe('runCli (ENT-06 #984)', () => {
  const service = () => ({
    grant: jest.fn().mockResolvedValue({ overrideId: 'o-1' }),
    revoke: jest.fn().mockResolvedValue({ overrideId: 'o-1' }),
    list: jest.fn().mockResolvedValue([]),
    history: jest.fn().mockResolvedValue([]),
  });

  const NOW = new Date('2026-11-18T15:00:00.000Z');

  it('concede con el reloj inyectado y el tenant del argumento', async () => {
    const port = service();
    await runCli(
      {
        mode: 'grant',
        tenantId: TENANT,
        capabilityKey: 'inventory.retail',
        valueJson: { included: true },
        actor: 'soporte@nhilos.com',
        reason: 'Piloto',
        expiresAt: new Date('2026-12-31T23:59:59Z'),
      },
      port,
      NOW,
    );

    expect(port.grant).toHaveBeenCalledWith({
      tenantId: TENANT,
      capabilityKey: 'inventory.retail',
      valueJson: { included: true },
      actor: 'soporte@nhilos.com',
      reason: 'Piloto',
      expiresAt: new Date('2026-12-31T23:59:59Z'),
      now: NOW,
    });
  });

  it('revoca por id o por clave, sin inventar el que falta', async () => {
    const byId = service();
    await runCli(
      {
        mode: 'revoke',
        tenantId: TENANT,
        overrideId: 'o-1',
        actor: 'a',
        reason: 'b',
      },
      byId,
      NOW,
    );
    expect(byId.revoke).toHaveBeenCalledWith({
      tenantId: TENANT,
      overrideId: 'o-1',
      capabilityKey: undefined,
      actor: 'a',
      reason: 'b',
      now: NOW,
    });
  });

  it('lista y consulta historial con el reloj inyectado', async () => {
    const port = service();
    await runCli({ mode: 'list', tenantId: TENANT }, port, NOW);
    await runCli({ mode: 'history', tenantId: TENANT, limit: 5 }, port, NOW);

    expect(port.list).toHaveBeenCalledWith({ tenantId: TENANT, now: NOW });
    expect(port.history).toHaveBeenCalledWith({ tenantId: TENANT, limit: 5 });
  });
});
