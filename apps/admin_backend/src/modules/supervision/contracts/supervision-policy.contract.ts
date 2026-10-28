/**
 * The tenant's SUPERVISION policy: who may authorize a sensitive operation
 * in this business, and what happens when nobody who can is on the floor.
 *
 * WHY THIS IS A TENANT DECISION (owner's decision, 2026-10-20):
 * a food park often has NO manager on the floor — one person sells and
 * prepares, or a cook and a cashier. A rule that says "only an owner or a
 * manager can authorize" does not create a control there: it creates a DEAD
 * END. The shift cannot be closed, the drawer cannot be opened, and the
 * terminal is stuck at the end of the day.
 *
 * The control that actually exists in a small business is not the separation
 * of duties — it is the RECORD. Who did it, with whose credential, and
 * whether a supervisor was involved. So the override is never a lock: it is
 * a record, plus a review the owner can do later.
 *
 * This file is a FRAMEWORK-FREE LEAF (no NestJS, no TypeORM) so the
 * onboarding module can read the policy while building the config snapshot
 * without importing a module (and without a circular Nest dependency).
 *
 * THE WIRE SHAPE IS THE POS'S LOCAL SHAPE: the same field names the terminal
 * stores in `local_configs['supervision_policy']`, so the projection is a
 * straight copy with no translation layer to keep in sync.
 */

import { UserRole } from '../../identity/security/user-role.enum';

/**
 * The tenant-parameters key that holds the policy (the append-only
 * `system_parameters_config` table, read through its active view).
 *
 * It lives HERE — not in the fiscal param keys — because the policy is not
 * fiscal: it is the tenant's operational rule. The fiscal snapshot is the
 * DELIVERY channel (the only one, by the S2 rule), not the owner of the
 * value.
 */
export const SUPERVISION_POLICY_PARAM_KEY = 'SUPERVISION_POLICY';

/**
 * The operations whose authorization this policy governs. The ids are the
 * stable vocabulary; the human wording lives in the UI (dashboard) and in
 * the audit trail (POS) — never in this contract.
 */
export const SUPERVISION_FLOW = {
  /** The shift close (Corte Z): the fiscal duty that MUST be completable. */
  CLOSE_BOX: 'CLOSE_BOX',
  /** Opening the cash drawer by hand: money in and out of the drawer. */
  CASH_DRAWER: 'CASH_DRAWER',
  /** A manual discount: money out of the price. */
  MANUAL_DISCOUNT: 'MANUAL_DISCOUNT',
  /** The quantity an extra takes out of the stock: a DATA question. */
  MODIFIER_QUANTITY: 'MODIFIER_QUANTITY',
} as const;

export type SupervisionFlow =
  (typeof SUPERVISION_FLOW)[keyof typeof SUPERVISION_FLOW];

/**
 * The policy itself.
 *
 * `authorizingRoles` are the roles that count as a supervisor HERE (the food
 * park can make its shift lead a MANAGER; the vocabulary is the one the
 * terminal already knows offline — the inbound sync delivers each user's
 * role, never a permission list, so a policy that named permissions could
 * not be enforced on an offline terminal at all).
 */
/**
 * The forensic action codes the terminal writes when a sensitive operation
 * is signed, mapped to the FLOW they belong to.
 *
 * This is the vocabulary the owner's review queue reads: the queue answers
 * "what happened, who signed it, and was a supervisor involved" by
 * classifying the ledger rows, never by reading the metadata blob.
 */
export const SUPERVISION_FLOW_BY_ACTION: Readonly<
  Record<string, SupervisionFlow>
> = {
  SUPERVISOR_OVERRIDE_CLOSE_SESSION: SUPERVISION_FLOW.CLOSE_BOX,
  SELF_AUTHORIZED_CLOSE_SESSION: SUPERVISION_FLOW.CLOSE_BOX,
  SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT: SUPERVISION_FLOW.MANUAL_DISCOUNT,
  SELF_AUTHORIZED_MANUAL_DISCOUNT: SUPERVISION_FLOW.MANUAL_DISCOUNT,
  DRAWER_OPENED_MANUALLY: SUPERVISION_FLOW.CASH_DRAWER,
  SELF_AUTHORIZED_DRAWER_OPENED: SUPERVISION_FLOW.CASH_DRAWER,
  MODIFIER_EFFECT_QUANTITY_OVERRIDE: SUPERVISION_FLOW.MODIFIER_QUANTITY,
  SELF_AUTHORIZED_MODIFIER_EFFECT_QUANTITY: SUPERVISION_FLOW.MODIFIER_QUANTITY,
  MODIFIER_EFFECT_QUANTITY_ADJUSTED: SUPERVISION_FLOW.MODIFIER_QUANTITY,
};

/**
 * The action codes the review queue reads. It is the INVERSE of the map
 * above: the queue asks the store for exactly these rows.
 */
export const SUPERVISION_REVIEW_ACTIONS: readonly string[] = Object.keys(
  SUPERVISION_FLOW_BY_ACTION,
);

/**
 * Whether the given action code is a SELF-authorization: the operator
 * signed their own operation because nobody else was on the floor.
 *
 * It is read from the ACTION CODE, never from the metadata: the code is
 * what the terminal wrote at the moment of the operation, and the metadata
 * is a payload this surface does not expose.
 */
export function isSelfAuthorizedAction(action: string): boolean {
  return String(action ?? '')
    .trim()
    .toUpperCase()
    .startsWith('SELF_AUTHORIZED_');
}

export interface SupervisionPolicy {
  readonly authorizingRoles: readonly UserRole[];
  readonly selfAuthorizationAllowedCloseBox: boolean;
  readonly selfAuthorizationAllowedCashDrawer: boolean;
  readonly selfAuthorizationAllowedManualDiscount: boolean;
  readonly supervisorRequiredForModifierQuantity: boolean;
}

const USER_ROLE_VALUES: readonly string[] = Object.values(UserRole);

const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && USER_ROLE_VALUES.includes(value);

const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The policy a tenant gets when it never configured one.
 *
 * The DEFAULT follows the operation mode, because the mode already says how
 * much bureaucracy the business has: a food park counter has no manager on
 * the floor, a restaurant normally does. Mirrors the POS default
 * (`SupervisionPolicy.forOperationMode`) — the terminal is the offline
 * master of its own fallback, and both sides MUST agree.
 */
export function defaultSupervisionPolicy(
  isFoodParkQsr: boolean,
): SupervisionPolicy {
  return {
    // Sorted like every canonical form of the policy (the config
    // fingerprint is content-addressed: the same rule set must always
    // serialize the same way).
    authorizingRoles: [UserRole.MANAGER, UserRole.OWNER],
    // The close box is a fiscal duty: an unclosed shift is a worse fiscal
    // problem than a self-authorized one. Always completable.
    selfAuthorizationAllowedCloseBox: true,
    selfAuthorizationAllowedCashDrawer: isFoodParkQsr,
    selfAuthorizationAllowedManualDiscount: isFoodParkQsr,
    supervisorRequiredForModifierQuantity: false,
  };
}

/**
 * Strictly parses a stored/served policy. Returns null for anything that is
 * not a COMPLETE, well-typed policy: absence and corruption must both read
 * as "never configured" so the terminal falls back to the mode default
 * instead of enforcing a half-understood rule.
 */
export function parseSupervisionPolicy(raw: unknown): SupervisionPolicy | null {
  if (!isPlainObject(raw)) return null;

  const roles = raw['authorizingRoles'];
  if (!Array.isArray(roles) || roles.some((role) => !isUserRole(role))) {
    return null;
  }
  // Sorted + de-duplicated so the same rule set always has the same
  // canonical form (the config fingerprint is content-addressed).
  const authorizingRoles = Array.from(new Set(roles as UserRole[])).sort();

  const closeBox = raw['selfAuthorizationAllowedCloseBox'];
  const cashDrawer = raw['selfAuthorizationAllowedCashDrawer'];
  const manualDiscount = raw['selfAuthorizationAllowedManualDiscount'];
  const modifierQuantity = raw['supervisorRequiredForModifierQuantity'];
  if (
    !isBoolean(closeBox) ||
    !isBoolean(cashDrawer) ||
    !isBoolean(manualDiscount) ||
    !isBoolean(modifierQuantity)
  ) {
    return null;
  }

  return {
    authorizingRoles,
    selfAuthorizationAllowedCloseBox: closeBox,
    selfAuthorizationAllowedCashDrawer: cashDrawer,
    selfAuthorizationAllowedManualDiscount: manualDiscount,
    supervisorRequiredForModifierQuantity: modifierQuantity,
  };
}

/**
 * The plain JSON shape (the wire + the local storage shape).
 *
 * The roles are SORTED here: this is the canonical serialization, so the
 * same rule set always produces the same bytes (the config fingerprint is
 * content-addressed — an unsorted list would change the fingerprint
 * without changing the rule).
 */
export function supervisionPolicyToJson(policy: {
  readonly authorizingRoles: readonly UserRole[];
  readonly selfAuthorizationAllowedCloseBox: boolean;
  readonly selfAuthorizationAllowedCashDrawer: boolean;
  readonly selfAuthorizationAllowedManualDiscount: boolean;
  readonly supervisorRequiredForModifierQuantity: boolean;
}): Record<string, unknown> {
  return {
    authorizingRoles: Array.from(new Set(policy.authorizingRoles)).sort(),
    selfAuthorizationAllowedCloseBox: policy.selfAuthorizationAllowedCloseBox,
    selfAuthorizationAllowedCashDrawer:
      policy.selfAuthorizationAllowedCashDrawer,
    selfAuthorizationAllowedManualDiscount:
      policy.selfAuthorizationAllowedManualDiscount,
    supervisorRequiredForModifierQuantity:
      policy.supervisorRequiredForModifierQuantity,
  };
}

export interface SupervisionPolicyValidation {
  /** A DEAD END: the operation could not be completed at all. */
  readonly errors: readonly string[];
  /** A control that could never be exercised (the operation still closes). */
  readonly warnings: readonly string[];
}

/**
 * The invariant that makes the policy safe to configure: the shift close
 * MUST stay completable.
 *
 * Only the close box is a DUTY: it is the fiscal close (Corte Z) and an
 * unclosed shift is a worse fiscal problem than a self-authorized one. The
 * other flows are NOT duties — refusing a discount is a legitimate
 * business outcome (the customer pays the full price) and the drawer still
 * opens with a cash sale — so a policy that closes them off is a WARNING,
 * not an error.
 *
 * This is the guard the backoffice enforces on save AND the POS mirrors as
 * its own last line of defense: a policy that would strand a till at 6pm is
 * never applied.
 */
export function validateSupervisionPolicy(
  policy: SupervisionPolicy,
): SupervisionPolicyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hasAuthorizer = policy.authorizingRoles.length > 0;

  if (!hasAuthorizer && !policy.selfAuthorizationAllowedCloseBox) {
    errors.push(
      'Ningún rol puede autorizar y el cierre de turno no admite auto-autorización: el corte de caja quedaría imposible de completar.',
    );
  }
  if (!hasAuthorizer && !policy.selfAuthorizationAllowedCashDrawer) {
    warnings.push(
      'Con ningún rol autorizado, la gaveta sólo se abriría con una venta en efectivo: no habría apertura manual.',
    );
  }
  if (!hasAuthorizer && !policy.selfAuthorizationAllowedManualDiscount) {
    warnings.push(
      'Con ningún rol autorizado, ningún descuento manual podría aplicarse: el descuento quedaría siempre rechazado.',
    );
  }
  if (!hasAuthorizer && policy.supervisorRequiredForModifierQuantity) {
    warnings.push(
      'Con ningún rol autorizado, la cantidad de un extra no podría ajustarse: quedaría siempre pendiente.',
    );
  }

  return { errors, warnings };
}
