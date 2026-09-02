export const PromotionType = {
  BUY_X_GET_Y_FREE: 'buyXGetYFree',
  PERCENTAGE_DISCOUNT: 'percentageDiscount',
  FIXED_DISCOUNT: 'fixedDiscount',
  COMBO_PACKAGE: 'comboPackage',
} as const;

export type PromotionType = typeof PromotionType[keyof typeof PromotionType];

export interface Promotion {
  id: string;
  tenant_id: string;
  name: string;
  type: PromotionType;
  target_product_id?: string | null;
  target_category_id?: string | null;
  buy_quantity: number;
  get_quantity: number;
  discount_value: number;
  min_order_amount: number;
  days_of_week?: string[] | null;
  start_time?: string | null;
  end_time?: string | null;
  start_date?: number | null;
  end_date?: number | null;
  priority: number;
  is_stackable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePromotionDto {
  name: string;
  type: PromotionType;
  target_product_id?: string;
  target_category_id?: string;
  buy_quantity?: number;
  get_quantity?: number;
  discount_value?: number;
  min_order_amount?: number;
  days_of_week?: string[];
  start_time?: string;
  end_time?: string;
  start_date?: number;
  end_date?: number;
  priority?: number;
  is_stackable?: boolean;
}

export interface UpdatePromotionDto {
  name?: string;
  type?: PromotionType;
  target_product_id?: string;
  target_category_id?: string;
  buy_quantity?: number;
  get_quantity?: number;
  discount_value?: number;
  min_order_amount?: number;
  days_of_week?: string[];
  start_time?: string;
  end_time?: string;
  start_date?: number;
  end_date?: number;
  priority?: number;
  is_stackable?: boolean;
  is_active?: boolean;
}

export const PROMOTION_TYPE_LABELS = {
  [PromotionType.BUY_X_GET_Y_FREE]: 'Compra X Llévate Y',
  [PromotionType.PERCENTAGE_DISCOUNT]: 'Descuento Porcentaje',
  [PromotionType.FIXED_DISCOUNT]: 'Descuento Fijo',
  [PromotionType.COMBO_PACKAGE]: 'Combo',
} as const;