import { z } from "zod";

/**
 * The tenant's supervision policy — the WHOLE vocabulary of the card, kept
 * in one place so the form, the guard and the tests speak the same words.
 *
 * It mirrors the backend contract
 * (apps/admin_backend/src/modules/supervision/contracts/supervision-policy.contract.ts).
 */
export const SupervisionRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  WAITER: "WAITER",
} as const;

export type SupervisionRole = (typeof SupervisionRole)[keyof typeof SupervisionRole];

export const SUPERVISION_ROLES: SupervisionRole[] = [
  SupervisionRole.OWNER,
  SupervisionRole.MANAGER,
  SupervisionRole.CASHIER,
  SupervisionRole.WAITER,
];

/**
 * The role labels in the words the owner uses, plus what each one means
 * for an authorization. The label alone ("Cajero") does not answer the
 * question the owner is actually asking ("¿puede un cajero autorizar?"),
 * so each entry carries its consequence.
 */
export const SUPERVISION_ROLE_LABELS: Record<
  SupervisionRole,
  { label: string; description: string }
> = {
  [SupervisionRole.OWNER]: {
    label: "Dueño",
    description: "El propietario del negocio.",
  },
  [SupervisionRole.MANAGER]: {
    label: "Gerente",
    description: "El responsable del turno o del local.",
  },
  [SupervisionRole.CASHIER]: {
    label: "Cajero",
    description:
      "Quien cobra en el mostrador. Úselo cuando en su negocio el encargado de turno figure como cajero.",
  },
  [SupervisionRole.WAITER]: {
    label: "Mesero",
    description: "Quien atiende las mesas.",
  },
};

export interface SupervisionPolicy {
  authorizingRoles: SupervisionRole[];
  selfAuthorizationAllowedCloseBox: boolean;
  selfAuthorizationAllowedCashDrawer: boolean;
  selfAuthorizationAllowedManualDiscount: boolean;
  supervisorRequiredForModifierQuantity: boolean;
}

export interface SupervisionPolicyResponse {
  /** The tenant's configured policy, or null when it never configured one. */
  policy: SupervisionPolicy | null;
  /** What the terminals apply when the tenant has no policy. */
  defaultPolicy: SupervisionPolicy;
  configured: boolean;
  operationMode: string | null;
  validation: { errors: string[]; warnings: string[] };
  configVersion: { revision: number; fingerprint: string } | null;
}

export const supervisionPolicySchema = z.object({
  authorizingRoles: z.array(
    z.enum([
      SupervisionRole.OWNER,
      SupervisionRole.MANAGER,
      SupervisionRole.CASHIER,
      SupervisionRole.WAITER,
    ]),
  ),
  selfAuthorizationAllowedCloseBox: z.boolean(),
  selfAuthorizationAllowedCashDrawer: z.boolean(),
  selfAuthorizationAllowedManualDiscount: z.boolean(),
  supervisorRequiredForModifierQuantity: z.boolean(),
});

export type SupervisionPolicyFormValues = z.infer<typeof supervisionPolicySchema>;

/**
 * Reads a policy off the wire without trusting it: a malformed role or a
 * missing flag degrades to the default the tenant's mode implies, never to
 * a half-read rule the form would then display as if it were real.
 */
export function resolveSupervisionPolicy(
  raw: unknown,
  fallback: SupervisionPolicy,
): SupervisionPolicy {
  if (typeof raw !== "object" || raw === null) return fallback;
  const object = raw as Record<string, unknown>;
  const roles = Array.isArray(object.authorizingRoles)
    ? object.authorizingRoles.filter(
        (role): role is SupervisionRole =>
          typeof role === "string" &&
          (SUPERVISION_ROLES as string[]).includes(role),
      )
    : null;
  if (roles === null) return fallback;
  const flags = [
    "selfAuthorizationAllowedCloseBox",
    "selfAuthorizationAllowedCashDrawer",
    "selfAuthorizationAllowedManualDiscount",
    "supervisorRequiredForModifierQuantity",
  ] as const;
  for (const flag of flags) {
    if (typeof object[flag] !== "boolean") return fallback;
  }
  return {
    authorizingRoles: roles,
    selfAuthorizationAllowedCloseBox: object.selfAuthorizationAllowedCloseBox as boolean,
    selfAuthorizationAllowedCashDrawer: object.selfAuthorizationAllowedCashDrawer as boolean,
    selfAuthorizationAllowedManualDiscount: object.selfAuthorizationAllowedManualDiscount as boolean,
    supervisorRequiredForModifierQuantity: object.supervisorRequiredForModifierQuantity as boolean,
  };
}

/**
 * The invariant, mirrored from the backend so the owner sees the
 * consequence BEFORE saving, in the same words the server would use.
 *
 * Only the shift close is a duty: it is the fiscal close (Corte Z) and an
 * unclosed shift is a worse fiscal problem than a self-authorized one. The
 * other flows can legitimately refuse (the customer pays the full price),
 * so they are warnings, never blocks.
 */
export function validateSupervisionPolicyForm(values: {
  authorizingRoles: readonly string[];
  selfAuthorizationAllowedCloseBox: boolean;
  selfAuthorizationAllowedCashDrawer: boolean;
  selfAuthorizationAllowedManualDiscount: boolean;
  supervisorRequiredForModifierQuantity: boolean;
}): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasAuthorizer = values.authorizingRoles.length > 0;

  if (!hasAuthorizer && !values.selfAuthorizationAllowedCloseBox) {
    errors.push(
      "Ningún rol puede autorizar y el cierre de turno no admite auto-autorización: el corte de caja quedaría imposible de completar.",
    );
  }
  if (!hasAuthorizer && !values.selfAuthorizationAllowedCashDrawer) {
    warnings.push(
      "Con ningún rol autorizado, la gaveta sólo se abriría con una venta en efectivo: no habría apertura manual.",
    );
  }
  if (!hasAuthorizer && !values.selfAuthorizationAllowedManualDiscount) {
    warnings.push(
      "Con ningún rol autorizado, ningún descuento manual podría aplicarse: el descuento quedaría siempre rechazado.",
    );
  }
  if (!hasAuthorizer && values.supervisorRequiredForModifierQuantity) {
    warnings.push(
      "Con ningún rol autorizado, la cantidad de un extra no podría ajustarse: quedaría siempre pendiente.",
    );
  }

  return { errors, warnings };
}

/**
 * The sentence that tells the owner what "sin definir" MEANS in their
 * business — the standard's "never hide uncertainty" rule applied to a
 * configuration: the default is not a hidden value, it is a named one.
 */
export const OPERATION_MODE_LABELS: Record<string, string> = {
  FOODPARK_QSR: "Food Park / QSR (mostrador, sin mesas)",
  RESTAURANT: "Restaurante (mesas y comandas)",
  HYBRID: "Híbrido (mostrador y mesas)",
};
