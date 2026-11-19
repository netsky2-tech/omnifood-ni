/**
 * ENT-06 of issue #984 — argument parsing and execution for the audited
 * override CLI. Pure on purpose: the operator surface is testable without a
 * database, a Nest context or a real clock.
 */
import type { EntitlementOverridesService } from '../modules/entitlements/entitlement-overrides.service';

export const USAGE = `Uso:
  --tenant=<uuid>                      tenant (obligatorio)
  --list                               lista las excepciones registradas
  --history [--limit=N]                historial auditado de excepciones
  --key=<capability>                   clave sobre la que se concede la excepción
  --included=true|false                valor para una capacidad de tipo flag
  --limit=<n|none>                     valor para una cuota (none = ilimitado)
  --expires=<ISO-8601>                 expiración futura (obligatoria al conceder)
  --revoke=<id|key>                    termina una excepción vigente
  --actor=<quien autoriza>             obligatorio al conceder o revocar
  --reason="<por qué>"                 obligatorio al conceder o revocar`;

export type CliInvocation =
  | { readonly mode: 'list'; readonly tenantId: string }
  | {
      readonly mode: 'history';
      readonly tenantId: string;
      readonly limit?: number;
    }
  | {
      readonly mode: 'grant';
      readonly tenantId: string;
      readonly capabilityKey: string;
      readonly valueJson: Record<string, unknown>;
      readonly actor: string;
      readonly reason: string;
      readonly expiresAt: Date;
    }
  | {
      readonly mode: 'revoke';
      readonly tenantId: string;
      readonly overrideId?: string;
      readonly capabilityKey?: string;
      readonly actor: string;
      readonly reason: string;
    };

/** A bad invocation, as opposed to a rejected exception. */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(`${message}\n\n${USAGE}`);
    this.name = 'CliUsageError';
  }
}

const readFlags = (argv: readonly string[]): Map<string, string> => {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      throw new CliUsageError(`Argumento no reconocido: ${arg}`);
    }
    const [name, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=');
    flags.set(name, value === '' ? 'true' : value);
  }
  return flags;
};

const required = (flags: Map<string, string>, name: string): string => {
  const value = flags.get(name)?.trim();
  if (!value) throw new CliUsageError(`Falta --${name}`);
  return value;
};

const parseValue = (flags: Map<string, string>): Record<string, unknown> => {
  const hasIncluded = flags.has('included');
  const hasLimit = flags.has('limit');
  if (hasIncluded === hasLimit) {
    throw new CliUsageError(
      'Indique exactamente uno de --included o --limit para el valor de la excepción',
    );
  }
  if (hasIncluded) {
    const raw = required(flags, 'included').toLowerCase();
    if (raw !== 'true' && raw !== 'false') {
      throw new CliUsageError('--included acepta true o false');
    }
    return { included: raw === 'true' };
  }
  const raw = required(flags, 'limit').toLowerCase();
  if (raw === 'none') return { limit: null };
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 0) {
    throw new CliUsageError('--limit acepta un entero no negativo o none');
  }
  return { limit };
};

/**
 * Pure argument parsing: the operator surface is testable without a database.
 */
export function parseCliInvocation(argv: readonly string[]): CliInvocation {
  const flags = readFlags(argv);
  const tenantId = required(flags, 'tenant');
  const wantsList = flags.has('list');
  const wantsHistory = flags.has('history');
  const wantsRevoke = flags.has('revoke');
  const modes = [wantsList, wantsHistory, wantsRevoke, flags.has('key')].filter(
    Boolean,
  ).length;
  if (modes !== 1) {
    throw new CliUsageError(
      'Indique un solo modo: --list, --history, concesión (--key) o --revoke',
    );
  }

  if (wantsList) return { mode: 'list', tenantId };

  if (wantsHistory) {
    const rawLimit = flags.get('limit');
    if (rawLimit === undefined) return { mode: 'history', tenantId };
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new CliUsageError('--limit debe ser un entero positivo');
    }
    return { mode: 'history', tenantId, limit };
  }

  const actor = required(flags, 'actor');
  const reason = required(flags, 'reason');

  if (wantsRevoke) {
    const target = required(flags, 'revoke');
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      target,
    )
      ? { mode: 'revoke', tenantId, overrideId: target, actor, reason }
      : { mode: 'revoke', tenantId, capabilityKey: target, actor, reason };
  }

  const capabilityKey = required(flags, 'key');
  const expiresRaw = required(flags, 'expires');
  const expiresAt = new Date(expiresRaw);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new CliUsageError(`--expires no es una fecha válida: ${expiresRaw}`);
  }

  return {
    mode: 'grant',
    tenantId,
    capabilityKey,
    valueJson: parseValue(flags),
    actor,
    reason,
    expiresAt,
  };
}

export type OverridesPort = Pick<
  EntitlementOverridesService,
  'grant' | 'revoke' | 'list' | 'history'
>;

/** Executes one parsed invocation against the service. */
export async function runCli(
  invocation: CliInvocation,
  service: OverridesPort,
  now: Date = new Date(),
): Promise<unknown> {
  switch (invocation.mode) {
    case 'list':
      return service.list({ tenantId: invocation.tenantId, now });
    case 'history':
      return service.history({
        tenantId: invocation.tenantId,
        limit: invocation.limit,
      });
    case 'grant':
      return service.grant({
        tenantId: invocation.tenantId,
        capabilityKey: invocation.capabilityKey,
        valueJson: invocation.valueJson,
        actor: invocation.actor,
        reason: invocation.reason,
        expiresAt: invocation.expiresAt,
        now,
      });
    case 'revoke':
      return service.revoke({
        tenantId: invocation.tenantId,
        overrideId: invocation.overrideId,
        capabilityKey: invocation.capabilityKey,
        actor: invocation.actor,
        reason: invocation.reason,
        now,
      });
  }
}
