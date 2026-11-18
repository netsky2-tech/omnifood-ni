/**
 * ENT-07 of issue #984 — argument parsing and execution for the subscription
 * CLI. Pure on purpose: the operator surface is testable without a database,
 * a Nest context or a real clock.
 */
import type { TenantSubscriptionService } from '../modules/entitlements/tenant-subscription.service';
import {
  SUBSCRIPTION_STATUSES,
  SUPPORT_TIERS,
} from '../modules/entitlements/tenant-subscription.service';

export const USAGE = `Uso:
  --tenant=<uuid>                      tenant (obligatorio)
  --list                               consulta el rastro de cambios de plan
  --plan=<código>                      plan nuevo: ESENCIAL | OPERACION | PRO
  --status=<estado>                    active | suspended | expired (predeterminado: active)
  --add-ons=a,b                        códigos de add-on separados por coma (opcional)
  --support-tier=<nivel>               standard | priority (predeterminado: standard)
  --starts-at=<ISO-8601>               inicio de la vigencia (predeterminado: ahora)
  --ends-at=<ISO-8601>                 fin de la vigencia (opcional)
  --actor=<quien autoriza>             obligatorio al cambiar el plan
  --reason="<por qué>"                 obligatorio al cambiar el plan`;

export type CliInvocation =
  | { readonly mode: 'list'; readonly tenantId: string }
  | {
      readonly mode: 'change';
      readonly tenantId: string;
      readonly planCode: string;
      readonly status: string;
      readonly addOns: string[];
      readonly supportTier: string;
      readonly startsAt?: Date;
      readonly endsAt?: Date;
      readonly actor: string;
      readonly reason: string;
    };

/** A bad invocation, as opposed to a rejected plan change. */
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

const optionalDate = (
  flags: Map<string, string>,
  name: string,
): Date | undefined => {
  const raw = flags.get(name);
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new CliUsageError(`--${name} no es una fecha válida: ${raw}`);
  }
  return date;
};

const parseAddOns = (flags: Map<string, string>): string[] => {
  const raw = flags.get('add-ons');
  if (raw === undefined) return [];
  const codes = raw.split(',').map((code) => code.trim());
  if (codes.some((code) => code === '')) {
    throw new CliUsageError(
      '--add-ons no puede tener códigos vacíos; separe los códigos con comas',
    );
  }
  return codes;
};

/**
 * Pure argument parsing: the operator surface is testable without a database.
 */
export function parseCliInvocation(argv: readonly string[]): CliInvocation {
  const flags = readFlags(argv);
  const tenantId = required(flags, 'tenant');
  const wantsList = flags.has('list');
  const wantsChange = flags.has('plan');
  if ([wantsList, wantsChange].filter(Boolean).length !== 1) {
    throw new CliUsageError(
      'Indique un solo modo: --list para consultar el rastro, o --plan para cambiar el plan',
    );
  }

  if (wantsList) return { mode: 'list', tenantId };

  const status = flags.get('status')?.trim() ?? 'active';
  if (
    !SUBSCRIPTION_STATUSES.includes(
      status as (typeof SUBSCRIPTION_STATUSES)[number],
    )
  ) {
    throw new CliUsageError(
      `--status acepta ${SUBSCRIPTION_STATUSES.join(', ')}, recibió "${flags.get('status')}"`,
    );
  }

  const supportTier = flags.get('support-tier')?.trim() ?? 'standard';
  if (!SUPPORT_TIERS.includes(supportTier as (typeof SUPPORT_TIERS)[number])) {
    throw new CliUsageError(
      `--support-tier acepta ${SUPPORT_TIERS.join(', ')}, recibió "${flags.get('support-tier')}"`,
    );
  }

  return {
    mode: 'change',
    tenantId,
    planCode: required(flags, 'plan'),
    status,
    addOns: parseAddOns(flags),
    supportTier,
    startsAt: optionalDate(flags, 'starts-at'),
    endsAt: optionalDate(flags, 'ends-at'),
    actor: required(flags, 'actor'),
    reason: required(flags, 'reason'),
  };
}

export type SubscriptionsPort = Pick<
  TenantSubscriptionService,
  'changePlan' | 'list'
>;

/** Executes one parsed invocation against the service. */
export async function runCli(
  invocation: CliInvocation,
  service: SubscriptionsPort,
  now: Date = new Date(),
): Promise<unknown> {
  switch (invocation.mode) {
    case 'list':
      return service.list({ tenantId: invocation.tenantId, now });
    case 'change':
      return service.changePlan({
        tenantId: invocation.tenantId,
        planCode: invocation.planCode,
        status: invocation.status,
        startsAt: invocation.startsAt ?? now,
        endsAt: invocation.endsAt ?? null,
        addOns: invocation.addOns,
        supportTier: invocation.supportTier,
        actor: invocation.actor,
        reason: invocation.reason,
        now,
      });
  }
}
