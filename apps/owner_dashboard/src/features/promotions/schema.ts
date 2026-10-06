import { z } from 'zod';
import { PromotionType } from '@/types/promotions';

export const promotionFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  type: z.nativeEnum(PromotionType, { required_error: 'Seleccione un tipo de promoción' }),
  target_product_id: z.string().optional(),
  target_category_id: z.string().optional(),
  buy_quantity: z.coerce.number().int().min(0).optional(),
  get_quantity: z.coerce.number().int().min(0).optional(),
  discount_value: z.coerce.number().min(0).optional(),
  min_order_amount: z.coerce.number().min(0).optional(),
  days_of_week: z.array(z.string()).optional(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM').optional().or(z.literal('')),
  end_time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM').optional().or(z.literal('')),
  start_date: z.coerce.number().optional(),
  end_date: z.coerce.number().optional(),
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