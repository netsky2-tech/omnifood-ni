import { z } from 'zod';
import { PromotionType } from '@/types/promotions';

// Same shape the backend guard enforces (T0.5'a/T0.5'd): a category target
// must be a uuid or an explicit empty selection ("Global"). Free text is
// rejected here so the form can never submit a blank-string target.
const CATEGORY_UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const promotionFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  type: z.nativeEnum(PromotionType, { required_error: 'Seleccione un tipo de promoción' }),
  target_product_id: z.string().optional(),
  // T0.5'd: '' = nothing selected (global); anything else must be a uuid
  // chosen from the synced category picker.
  target_category_id: z
    .string()
    .refine((value) => value === '' || CATEGORY_UUID_PATTERN.test(value), {
      message: 'Seleccione una categoría de producto válida',
    })
    .optional(),
  buy_quantity: z.coerce.number().int().min(0).optional(),
  get_quantity: z.coerce.number().int().min(0).optional(),
  discount_value: z.coerce.number().min(0).optional(),
  min_order_amount: z.coerce.number().min(0).optional(),
  days_of_week: z.array(z.string()).optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM').optional().or(z.literal('')),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM').optional().or(z.literal('')),
  // Promo-fix: what <input type="date"> yields is a plain 'YYYY-MM-DD'
  // string (or '' when cleared) — the schema validates THAT, never a number.
  // The numeric epoch-ms format the backend's bigint columns and DTOs
  // (IsInt) expect is produced at submit time by dateInputValueToEpochMs,
  // so the payload still leaves in the backend's format.
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione una fecha válida')
    .optional()
    .or(z.literal('')),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione una fecha válida')
    .optional()
    .or(z.literal('')),
  priority: z.coerce.number().int().min(0).optional(),
  is_stackable: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.type === PromotionType.BUY_X_GET_Y_FREE) {
      return data.buy_quantity && data.buy_quantity > 0 && data.get_quantity && data.get_quantity > 0;
    }
    if (data.type === PromotionType.PERCENTAGE_DISCOUNT || data.type === PromotionType.FIXED_DISCOUNT) {
      return data.discount_value && data.discount_value > 0;
    }
    return true;
  },
  {
    message: 'Complete los campos requeridos para el tipo de promoción seleccionado',
    path: ['discount_value'],
  }
);

export type PromotionFormData = z.infer<typeof promotionFormSchema>;

/**
 * Parses a date-input string as LOCAL midnight so the epoch-ms we send the
 * backend round-trips through epochMsToDateInputValue without drifting with
 * the UTC offset (same local-midnight rule as the fiscal setup's
 * parseAsLocalMidnight in features/settings/types.ts). Accepts only the
 * YYYY-MM-DD a <input type="date"> delivers; '' and anything else map to
 * undefined so a cleared date is omitted from the payload, never sent as 0.
 */
export function dateInputValueToEpochMs(value: string): number | undefined {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateOnly) return undefined;
  return new Date(
    Number(dateOnly[1]),
    Number(dateOnly[2]) - 1,
    Number(dateOnly[3]),
  ).getTime();
}

/**
 * Inverse for the edit path: the Promotion entity stores epoch-ms numbers,
 * the date input needs YYYY-MM-DD. Non-finite/absent values render as ''
 * (an empty input), never as a fabricated date.
 */
export function epochMsToDateInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}