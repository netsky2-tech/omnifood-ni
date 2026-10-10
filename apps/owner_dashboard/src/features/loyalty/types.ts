import { z } from 'zod';

// §17.6 (loyalty slice): a FREE_PRODUCT reward's product target comes from
// the governed selector (EntitySearchSelect + useProductSearch), so the only
// value it can carry is the uuid of a product row the operator picked by its
// human label. Empty means "nothing picked yet" and blocks submit; free text
// is rejected exactly like the promotions form's target_product_id.
const PRODUCT_UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type LoyaltyProgramType = 'SPEND_POINTS' | 'PRODUCT_STAMPS' | 'VISIT_STAMPS';

export const LOYALTY_PROGRAM_TYPES: { id: LoyaltyProgramType; label: string }[] = [
  { id: 'SPEND_POINTS', label: 'Puntos por compra' },
  { id: 'PRODUCT_STAMPS', label: 'Sellos por producto' },
  { id: 'VISIT_STAMPS', label: 'Sellos por visita' },
];

export type LoyaltyProgramStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export type RewardType = 'DISCOUNT_AMOUNT' | 'FREE_PRODUCT';

export const REWARD_TYPES: { id: RewardType; label: string }[] = [
  { id: 'DISCOUNT_AMOUNT', label: 'Descuento (C$)' },
  { id: 'FREE_PRODUCT', label: 'Producto gratis' },
];

export type RewardStatus = 'ACTIVE' | 'INACTIVE';

export interface LoyaltyProgram {
  id: string;
  tenant_id: string;
  name: string;
  program_type: LoyaltyProgramType;
  status: LoyaltyProgramStatus;
  starts_at: string | null;
  ends_at: string | null;
  earning_rule: Record<string, unknown>;
  eligibility_rule: Record<string, unknown>;
  config_version: number;
  rewards?: RewardDefinition[];
  created_at: string;
  updated_at: string;
}

export interface RewardDefinition {
  id: string;
  tenant_id: string;
  loyalty_program_id: string;
  name: string;
  description: string | null;
  reward_type: RewardType;
  cost_units: number;
  benefit_config: Record<string, unknown>;
  status: RewardStatus;
  starts_at: string | null;
  ends_at: string | null;
  presentation_order: number;
  config_version: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerLoyaltyAccount {
  tenant_id: string;
  customer_id: string;
  loyalty_program_id: string;
  balance_units: number;
  last_transaction_id: string | null;
  projection_version: number;
  recomputed_at: string;
}

export interface CustomerPointTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  loyalty_program_id: string | null;
  ticket_id: string | null;
  invoice_id: string | null;
  reward_id: string | null;
  transaction_type: string;
  units: number | null;
  reversal_of_transaction_id: string | null;
  idempotency_key: string | null;
  source_event_id: string | null;
  actor_user_id: string | null;
  branch_id: string | null;
  terminal_id: string | null;
  program_version: number | null;
  reward_version: number | null;
  commercial_snapshot: Record<string, unknown> | null;
  origin: string | null;
  occurred_at: string | null;
  recorded_at: string | null;
  legacy_imported: boolean;
  type: string;
  points: number;
  balance_after: number;
  conversion_rate: number;
  reason: string | null;
  created_at: string;
}

export interface CreateLoyaltyProgramInput {
  name: string;
  program_type: LoyaltyProgramType;
  earning_rule: Record<string, unknown>;
  eligibility_rule?: Record<string, unknown>;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface UpdateLoyaltyProgramInput {
  name?: string;
  earning_rule?: Record<string, unknown>;
  eligibility_rule?: Record<string, unknown>;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface CreateRewardInput {
  name: string;
  description?: string;
  reward_type: RewardType;
  cost_units: number;
  benefit_config: Record<string, unknown>;
  presentation_order?: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface UpdateRewardInput {
  name?: string;
  description?: string;
  cost_units?: number;
  benefit_config?: Record<string, unknown>;
  presentation_order?: number;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  points_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdjustPointsInput {
  points_delta: number;
  reason: string;
  invoice_id?: string;
}

// --- Profit-aware Reward Metrics (LV1.6) ---

export type MetricStatus = 'AVAILABLE' | 'NOT_AVAILABLE' | 'STALE' | 'NOT_APPLICABLE';

export interface ProfitAwareMetric<T> {
  status: MetricStatus;
  value?: T;
  reason?: string;
  asOfUtc?: string;
  lastCompleteSyncAt?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ProfitAwareWindow {
  startUtc: string;
  endUtc: string;
  label: string; // 'LAST_30_DAYS'
}

export interface RewardProfitAwareView {
  rewardId: string;
  programId: string;
  asOfUtc: string;
  window: ProfitAwareWindow;
  retailPriceNio: ProfitAwareMetric<number>;
  estimatedCppNio: ProfitAwareMetric<number>;
  estimatedRewardCostNio: ProfitAwareMetric<number>;
  qualifiedSalesNio: ProfitAwareMetric<number>;
  estimatedIncentiveCostInWindowNio: ProfitAwareMetric<number>;
  effectiveIncentiveRatePct: ProfitAwareMetric<number>;
}

// --- Loyalty form validation (Unit C, form sweep) ---

/**
 * The program and reward dialogs leaned on the browser: `required` and
 * numeric `min` attributes only ran inside constraint validation, so the
 * native balloon replaced the app's Spanish inline errors, and any submit
 * not coming from the button (e.g. a programmatic requestSubmit()) bypassed
 * the guard entirely.
 *
 * Fidelity rules, measured against the native attributes:
 * - The conditional fields are validated ONLY for the branch the form is
 *   actually showing (guided mode AND the selected program/reward type),
 *   exactly like the native attributes, which only existed on the inputs the
 *   active branch rendered. A value left in an INACTIVE branch — even an
 *   invalid one — must never block a legitimate submit, so the conditional
 *   checks live in the refinement and the base object accepts anything.
 * - `name` is validated RAW (no trim): native `required` only blocks the
 *   empty string, so a whitespace-only value was valid before and MUST
 *   remain valid (the submit path never trimmed it either).
 * - The numeric inputs mirror the old state handling (`Number(e.target.value)`):
 *   a cleared input becomes 0, which the `min 1` rules then refuse. Native
 *   `min 0` on the OPTIONAL minimum spend refuses negatives only; an empty
 *   string means "not provided" and stays legal.
 * - No maximum is invented anywhere (native had none), and the JSON-advanced
 *   mode keeps its handler-level parse with its own message: the JSON
 *   textarea carried no native constraint, only that parse guarded it.
 */

const finiteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export const programFormSchema = z
  .object({
    name: z.string().min(1, 'El nombre del programa es obligatorio'),
    programType: z.enum(['SPEND_POINTS', 'PRODUCT_STAMPS', 'VISIT_STAMPS']),
    useCustomJson: z.boolean(),
    // Base object never fails on the conditional fields: an inactive branch's
    // value (even invalid) must not block the submit, so the type and range
    // checks happen in the refinement for the ACTIVE branch only.
    spendBlockNio: z.number().or(z.nan()),
    pointsPerBlock: z.number().or(z.nan()),
    // §17.6 (loyalty slice 2): a LIST datum — the uuids of the products the
    // operator picked from the governed multi selector, one row per comma of
    // the old free-text field. Never a typed identifier.
    eligibleProductIds: z.array(z.string()),
    unitsPerPurchasedUnit: z.number().or(z.nan()),
    unitsPerVisit: z.number().or(z.nan()),
    minimumSpendNio: z.string(),
  })
  .superRefine((values, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    const guardNumber = (
      field: string,
      value: number,
      notANumber: string,
      belowMinimum: string,
    ) => {
      if (!finiteNumber(value)) issue(field, notANumber);
      else if (value < 1) issue(field, belowMinimum);
    };

    if (values.useCustomJson) return;
    if (values.programType === 'SPEND_POINTS') {
      guardNumber(
        'spendBlockNio',
        values.spendBlockNio,
        'El monto bloque debe ser un número',
        'El monto bloque debe ser mayor o igual a 1',
      );
      guardNumber(
        'pointsPerBlock',
        values.pointsPerBlock,
        'Los puntos por bloque deben ser un número',
        'Los puntos por bloque deben ser mayores o iguales a 1',
      );
    } else if (values.programType === 'PRODUCT_STAMPS') {
      // §17.6: the products are picked from the governed multi selector,
      // never typed. Empty = nothing picked (the old fabricated
      // ['prod-smash'] default is gone); anything picked must be a uuid.
      if (values.eligibleProductIds.length < 1)
        issue('eligibleProductIds', 'Seleccione al menos un producto elegible');
      else if (
        values.eligibleProductIds.some((id) => !PRODUCT_UUID_PATTERN.test(id))
      )
        issue('eligibleProductIds', 'Seleccione productos válidos');
      guardNumber(
        'unitsPerPurchasedUnit',
        values.unitsPerPurchasedUnit,
        'Los sellos por unidad deben ser un número',
        'Los sellos por unidad deben ser mayores o iguales a 1',
      );
    } else {
      guardNumber(
        'unitsPerVisit',
        values.unitsPerVisit,
        'Los sellos por visita deben ser un número',
        'Los sellos por visita deben ser mayores o iguales a 1',
      );
      // OPTIONAL: native min={0} without required. Empty means "not provided".
      if (values.minimumSpendNio.trim() !== '') {
        const minSpend = Number(values.minimumSpendNio);
        if (!Number.isFinite(minSpend))
          issue('minimumSpendNio', 'El gasto mínimo debe ser un número');
        else if (minSpend < 0)
          issue('minimumSpendNio', 'El gasto mínimo debe ser mayor o igual a 0');
      }
    }
  });

export type ProgramFormValues = z.infer<typeof programFormSchema>;

export const rewardFormSchema = z
  .object({
    name: z.string().min(1, 'El nombre de la recompensa es obligatorio'),
    description: z.string(),
    rewardType: z.enum(['DISCOUNT_AMOUNT', 'FREE_PRODUCT']),
    useCustomJson: z.boolean(),
    // The cost input renders in EVERY mode and branch, so unlike the
    // conditional fields it is validated at object level, exactly where the
    // native attributes always applied.
    costUnits: z
      .number({ invalid_type_error: 'El costo en unidades debe ser un número' })
      .min(1, 'El costo en unidades debe ser mayor o igual a 1'),
    amountNio: z.number().or(z.nan()),
    productId: z.string(),
  })
  .superRefine((values, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });

    if (values.useCustomJson) return;
    if (values.rewardType === 'DISCOUNT_AMOUNT') {
      if (!finiteNumber(values.amountNio))
        issue('amountNio', 'El monto de descuento debe ser un número');
      else if (values.amountNio < 1)
        issue('amountNio', 'El monto de descuento debe ser mayor o igual a 1');
    } else {
      // §17.6: the product is picked from the governed selector, never
      // typed. Empty = nothing picked; anything else must be a uuid. The
      // old "Indique el ID del producto a entregar" asked the operator to
      // transcribe an identifier — the selector replaces that surface.
      const trimmed = values.productId.trim();
      if (trimmed.length < 1)
        issue('productId', 'Seleccione el producto a entregar');
      else if (!PRODUCT_UUID_PATTERN.test(trimmed))
        issue('productId', 'Seleccione un producto válido');
    }
  });

export type RewardFormValues = z.infer<typeof rewardFormSchema>;
