-- ============================================================================
-- OmniFood NI — Bootstrap Base Tables (FIXED: tenant_id = uuid)
-- ============================================================================

BEGIN;

-- ENUM TYPES
DO $$ BEGIN CREATE TYPE recipe_ingredient_type_enum AS ENUM ('INSUMO', 'PRODUCT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cash_shift_session_status_enum AS ENUM ('OPEN', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE cash_movement_type_enum AS ENUM ('CASH_IN', 'CASH_OUT', 'PETTY_CASH', 'SAFE_DROP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE warehouses ADD CONSTRAINT fk_warehouses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses (tenant_id);

-- 2. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar NOT NULL,
  phone varchar,
  contact_person varchar,
  credit_terms text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers (tenant_id);

-- 3. insumos
CREATE TABLE IF NOT EXISTS insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  warehouse_id varchar,
  is_perishable boolean NOT NULL DEFAULT false,
  name varchar NOT NULL,
  "purchaseUom" varchar NOT NULL,
  "consumptionUom" varchar NOT NULL,
  "conversionFactor" numeric(12,4) NOT NULL DEFAULT 1,
  stock numeric(14,4) NOT NULL DEFAULT 0,
  existencia_actual numeric(14,4) NOT NULL DEFAULT 0,
  costo_promedio_nio numeric(14,4) NOT NULL DEFAULT 0,
  "parLevel" numeric(14,4),
  min_stock numeric(14,4),
  max_stock numeric(14,4),
  is_active boolean NOT NULL DEFAULT true,
  negative_stock_policy varchar NOT NULL DEFAULT 'RESTRICT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE insumos ADD CONSTRAINT fk_insumos_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_insumos_tenant ON insumos (tenant_id);

-- 4. uom_conversions
CREATE TABLE IF NOT EXISTS uom_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  unit_name varchar NOT NULL,
  factor numeric(12,4) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE uom_conversions ADD CONSTRAINT fk_uom_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE uom_conversions ADD CONSTRAINT fk_uom_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_uom_tenant ON uom_conversions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_uom_insumo ON uom_conversions (insumo_id);

-- 5. batches
CREATE TABLE IF NOT EXISTS batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  batch_number varchar NOT NULL,
  received_date date NOT NULL,
  expiration_date date NOT NULL,
  remaining_stock numeric(14,4) NOT NULL,
  cost numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE batches ADD CONSTRAINT fk_batches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE batches ADD CONSTRAINT fk_batches_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_batches_tenant ON batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_batches_insumo ON batches (insumo_id);

-- 6. products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  warehouse_id varchar,
  is_perishable boolean NOT NULL DEFAULT false,
  name varchar NOT NULL,
  uom varchar NOT NULL,
  stock numeric(12,4) NOT NULL DEFAULT 0,
  "averageCost" numeric(12,2) NOT NULL DEFAULT 0,
  "sellPrice" numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE products ADD CONSTRAINT fk_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products (tenant_id);

-- 7. recipes
CREATE TABLE IF NOT EXISTS recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  "productId" uuid NOT NULL,
  "ingredientId" uuid NOT NULL,
  "ingredientType" recipe_ingredient_type_enum NOT NULL DEFAULT 'INSUMO',
  quantity numeric(14,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE recipes ADD CONSTRAINT fk_recipes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE recipes ADD CONSTRAINT fk_recipes_product FOREIGN KEY ("productId") REFERENCES products(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON recipes (tenant_id);

-- 8. recipe_versions
CREATE TABLE IF NOT EXISTS recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  version_number integer NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  fecha_inicio_vigencia timestamptz,
  fecha_fin_vigencia timestamptz,
  pos_document_id varchar,
  product_name varchar,
  yield_quantity numeric(14,4) NOT NULL DEFAULT 1,
  technical_shrink_pct numeric(14,4) NOT NULL DEFAULT 0,
  version_note varchar,
  published_at timestamptz,
  pos_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE recipe_versions ADD CONSTRAINT fk_rv_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE recipe_versions ADD CONSTRAINT fk_rv_product FOREIGN KEY (product_id) REFERENCES products(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_rv_tenant ON recipe_versions (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rv_active_product ON recipe_versions (tenant_id, product_id) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rv_tenant_pos_doc ON recipe_versions (tenant_id, pos_document_id) WHERE pos_document_id IS NOT NULL;

-- 9. recipe_details
CREATE TABLE IF NOT EXISTS recipe_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipe_version_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  quantity numeric(14,4) NOT NULL,
  gross_quantity numeric(14,4) NOT NULL DEFAULT 0,
  technical_shrink_pct numeric(14,4) NOT NULL DEFAULT 0,
  ingredient_name varchar,
  ingredient_type varchar NOT NULL DEFAULT 'INSUMO',
  component_uom varchar,
  reference_version_id varchar
);
DO $$ BEGIN ALTER TABLE recipe_details ADD CONSTRAINT fk_rd_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE recipe_details ADD CONSTRAINT fk_rd_version FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_rd_tenant ON recipe_details (tenant_id);
CREATE INDEX IF NOT EXISTS idx_rd_version ON recipe_details (recipe_version_id);

-- 10. shrinkages
CREATE TABLE IF NOT EXISTS shrinkages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  shrinkage_type varchar NOT NULL,
  reason varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE shrinkages ADD CONSTRAINT fk_shrinkages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_shrinkages_tenant ON shrinkages (tenant_id);

-- 11. shrinkage_details
CREATE TABLE IF NOT EXISTS shrinkage_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shrinkage_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  quantity numeric(14,4) NOT NULL,
  unit_cost_nio numeric(14,4) NOT NULL
);
DO $$ BEGIN ALTER TABLE shrinkage_details ADD CONSTRAINT fk_sd_shrinkage FOREIGN KEY (shrinkage_id) REFERENCES shrinkages(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_sd_shrinkage ON shrinkage_details (shrinkage_id);

-- 12. production_orders
CREATE TABLE IF NOT EXISTS production_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipe_version_id varchar NOT NULL,
  planned_quantity numeric(14,4) NOT NULL,
  status varchar NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE production_orders ADD CONSTRAINT fk_po_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_po_tenant ON production_orders (tenant_id);

-- 13. production_order_lines
CREATE TABLE IF NOT EXISTS production_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL,
  insumo_id uuid NOT NULL,
  quantity numeric(14,4) NOT NULL,
  unit_cost_nio numeric(14,4) NOT NULL
);
DO $$ BEGIN ALTER TABLE production_order_lines ADD CONSTRAINT fk_pol_order FOREIGN KEY (production_order_id) REFERENCES production_orders(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_pol_order ON production_order_lines (production_order_id);

-- 14. invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_number varchar NOT NULL,
  created_at timestamp NOT NULL,
  user_id uuid NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  total_tax numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  is_canceled boolean NOT NULL DEFAULT false,
  void_reason varchar,
  payment_status varchar NOT NULL DEFAULT 'pending',
  customer_id varchar,
  global_tax_override boolean NOT NULL DEFAULT false,
  type varchar NOT NULL DEFAULT 'regular',
  related_invoice_id varchar,
  origin_invoice_id varchar,
  refund_reason_code varchar,
  refund_reason_policy varchar,
  authorized_by_user_id varchar,
  authorized_by_role varchar,
  bcn_official_rate numeric(10,4) NOT NULL DEFAULT 36.6241,
  commercial_rate numeric(10,4) NOT NULL DEFAULT 36.5,
  total_usd numeric(12,2) NOT NULL DEFAULT 0.0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE invoices ADD CONSTRAINT fk_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_origin ON invoices (tenant_id, origin_invoice_id) WHERE origin_invoice_id IS NOT NULL;

-- 15. invoice_items
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name varchar NOT NULL,
  quantity numeric(12,4) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  original_tax_rate numeric(12,4) NOT NULL,
  applied_tax_rate numeric(12,4) NOT NULL,
  tax_amount numeric(12,2) NOT NULL,
  total numeric(12,2) NOT NULL,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  variant_id varchar,
  notes varchar,
  recipe_version_id varchar,
  origin_invoice_item_id varchar
);
DO $$ BEGIN ALTER TABLE invoice_items ADD CONSTRAINT fk_ii_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_ii_tenant ON invoice_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ii_invoice ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ii_tenant_inv ON invoice_items (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_ii_tenant_origin ON invoice_items (tenant_id, origin_invoice_item_id) WHERE origin_invoice_item_id IS NOT NULL;

-- 16. invoice_item_modifiers
CREATE TABLE IF NOT EXISTS invoice_item_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id uuid NOT NULL,
  name varchar NOT NULL,
  extra_price numeric(12,2) NOT NULL
);
DO $$ BEGIN ALTER TABLE invoice_item_modifiers ADD CONSTRAINT fk_iim_item FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_iim_item ON invoice_item_modifiers (invoice_item_id);

-- 17. invoice_payments
CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  method varchar NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency varchar NOT NULL DEFAULT 'NIO',
  exchange_rate numeric(12,4) NOT NULL DEFAULT 1.0,
  amount_nio numeric(12,2) NOT NULL DEFAULT 0.0,
  change_given numeric(12,2) NOT NULL DEFAULT 0.0,
  change_currency varchar NOT NULL DEFAULT 'NIO',
  voucher_code varchar,
  card_brand varchar,
  card_type varchar,
  bank_pos varchar,
  reconciliation_status varchar DEFAULT 'PENDIENTE',
  "last4" varchar,
  batch_number varchar,
  reconciled_at timestamp,
  reconciled_by_user_id varchar,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN ALTER TABLE invoice_payments ADD CONSTRAINT fk_ip_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_ip_invoice ON invoice_payments (invoice_id);

-- 18. cash_shift_sessions
CREATE TABLE IF NOT EXISTS cash_shift_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  terminal_id varchar(100) NOT NULL,
  cashier_id varchar(100) NOT NULL,
  cashier_name varchar(150) NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  status cash_shift_session_status_enum NOT NULL DEFAULT 'OPEN',
  initial_float_nio numeric(12,4) NOT NULL DEFAULT 0,
  initial_float_usd numeric(12,4) NOT NULL DEFAULT 0,
  final_counted_nio numeric(12,4),
  final_counted_usd numeric(12,4),
  expected_cash_nio numeric(12,4) NOT NULL DEFAULT 0,
  expected_cash_usd numeric(12,4) NOT NULL DEFAULT 0,
  difference_nio numeric(12,4),
  difference_usd numeric(12,4),
  z_report_sequence integer,
  supervisor_id varchar(100),
  notes text
);
CREATE INDEX IF NOT EXISTS idx_css_tenant_terminal ON cash_shift_sessions (tenant_id, terminal_id);
CREATE INDEX IF NOT EXISTS idx_css_tenant_status ON cash_shift_sessions (tenant_id, status);

-- 19. cash_movements
CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  terminal_id varchar(100) NOT NULL,
  type cash_movement_type_enum NOT NULL,
  amount_nio numeric(12,4) NOT NULL DEFAULT 0,
  amount_usd numeric(12,4) NOT NULL DEFAULT 0,
  reason varchar(255) NOT NULL,
  authorized_by_user_id varchar(100),
  timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cm_tenant_shift ON cash_movements (tenant_id, shift_id);
CREATE INDEX IF NOT EXISTS idx_cm_tenant_terminal ON cash_movements (tenant_id, terminal_id);

COMMIT;
