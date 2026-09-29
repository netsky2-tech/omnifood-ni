import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../core/app/app.module';
import { runInTenantTransaction } from '../core/database/tenant-transaction';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../modules/inventory/entities/insumo.entity';
import { UomConversion } from '../modules/inventory/entities/uom-conversion.entity';
import { Product, ProductType } from '../modules/inventory/entities/product.entity';
import {
  RecipeDetail,
} from '../modules/inventory/entities/recipe-detail.entity';
import {
  RecipeOrigin,
  RecipePublicationState,
  RecipeSuggestionState,
  RecipeVersion,
} from '../modules/inventory/entities/recipe-version.entity';

/**
 * SOHO Café catalog seeder.
 *
 * Data source of truth: `odd/plans/soho-integration-test-plan.md`
 * (FASE 1 insumos, FASE 2 recipe BOM, FASE 3 products and prices).
 *
 * Scope: catalog data only (insumos, products, recipes). Never creates
 * fiscal config, tenants, users, initial stock or purchases — purchases
 * happen at the POS. Every write runs inside `runInTenantTransaction`
 * so RLS binds the tenant context for the whole batch.
 *
 * Idempotent: insumos and products are matched by trimmed case-insensitive
 * name within the tenant; existing rows are skipped and never overwritten.
 * An existing RecipeVersion for a product is authoritative and is skipped
 * with VERSION_ALREADY_EXISTS semantics (mirrors industry-template.service).
 *
 * Usage: npm run seed:soho-catalog -- --tenant-id <uuid>
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extracts and validates the explicit --tenant-id CLI argument.
 * Fails closed: throws before any database access when the value is
 * missing, blank or not a UUID.
 */
export function parseTenantIdArg(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let raw: string | undefined;
    if (arg === '--tenant-id') {
      raw = argv[i + 1];
    } else if (arg.startsWith('--tenant-id=')) {
      raw = arg.slice('--tenant-id='.length);
    }
    if (raw !== undefined) {
      const tenantId = raw.trim();
      if (!tenantId || !UUID_PATTERN.test(tenantId)) {
        throw new Error(
          `Invalid --tenant-id '${raw}'. Expected an explicit UUID: npm run seed:soho-catalog -- --tenant-id <uuid>`,
        );
      }
      return tenantId;
    }
  }
  throw new Error(
    'Missing required --tenant-id. Usage: npm run seed:soho-catalog -- --tenant-id <uuid>',
  );
}

export interface SohoInsumoSeed {
  code: string;
  name: string;
  purchaseUom: string;
  consumptionUom: string;
  /** Conversion factor purchase UOM -> consumption UOM. */
  conversionFactor: number;
  isPerishable: boolean;
  /** Plan ambiguity attached to this row; printed in the run summary. */
  note?: string;
}

export interface SohoRecipeLineSeed {
  insumoCode: string;
  /** Gross quantity per sold unit, exactly as stated in FASE 2. */
  grossQuantity: number;
  /** Component UOM exactly as stated in FASE 2. */
  componentUom: string;
  note?: string;
}

export interface SohoProductSeed {
  name: string;
  sellPrice: number;
  category: string;
  productType: ProductType;
  recipe?: SohoRecipeLineSeed[];
  note?: string;
}

export interface SohoCatalogPlan {
  insumos: SohoInsumoSeed[];
  products: SohoProductSeed[];
  warnings: string[];
}

/**
 * The SOHO menu, extracted faithfully from the integration test plan.
 *
 * Documented decisions (each also surfaced as a run warning):
 * - Approximate factors marked `~` are used at the shown numeric value.
 * - Ranges (10-12) use the conservative lower bound (I-03 pan, I-30 pastel).
 * - Factors the plan leaves non-numeric ("por ml", "por paquete", ...) default
 *   to 1 and MUST be corrected by the owner before real purchases
 *   (I-05, I-13, I-14, I-15, I-22, I-23, I-29).
 * - I-09 plan typo "Qeso frito" is normalized to "Queso frito" so the
 *   insumo name matches the FASE 2 recipe table.
 * - is_perishable is not defined by the plan: every insumo is created with
 *   is_perishable=false and the owner should adjust.
 * - parLevel/minStock are not defined by the plan: left null.
 */
export function buildSohoCatalogPlan(): SohoCatalogPlan {
  const insumos: SohoInsumoSeed[] = [
    // FASE 1.1 — Brunch insumos
    { code: 'I-01', name: 'Huevos (bandeja)', purchaseUom: 'docena', consumptionUom: 'unidades', conversionFactor: 12, isPerishable: false },
    { code: 'I-02', name: 'Bacon (paquete)', purchaseUom: 'libra', consumptionUom: 'tiras', conversionFactor: 16, isPerishable: false, note: 'FASE 1 says ~16 strips/lb, plan asks to measure the real yield' },
    { code: 'I-03', name: 'Pan de masa madre', purchaseUom: 'pieza entera', consumptionUom: 'rebanadas', conversionFactor: 10, isPerishable: false, note: 'FASE 1 says ~10-12 slices/piece; conservative lower bound 10 applied' },
    { code: 'I-04', name: 'Mantequilla', purchaseUom: 'libra', consumptionUom: 'porciones', conversionFactor: 30, isPerishable: false },
    { code: 'I-05', name: 'Miel', purchaseUom: 'frasco', consumptionUom: 'porciones', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por ml o porción"); defaulted to 1 and must be corrected' },
    { code: 'I-06', name: 'Pancakes (preparados)', purchaseUom: 'porción', consumptionUom: 'unidades', conversionFactor: 1, isPerishable: false },
    { code: 'I-07', name: 'Gallo Pinto', purchaseUom: 'libra', consumptionUom: 'tazas', conversionFactor: 4, isPerishable: false },
    { code: 'I-08', name: 'Maduro frito', purchaseUom: 'pieza', consumptionUom: 'rebanadas', conversionFactor: 4, isPerishable: false },
    { code: 'I-09', name: 'Queso frito', purchaseUom: 'libra', consumptionUom: 'onzas', conversionFactor: 16, isPerishable: false, note: 'Plan FASE 1 row reads "Qeso frito" (typo); normalized to "Queso frito" to match the FASE 2 recipe table' },
    { code: 'I-10', name: 'Queso mozarella', purchaseUom: 'libra', consumptionUom: 'gramos', conversionFactor: 454, isPerishable: false },
    { code: 'I-11', name: 'Jamón de pavo', purchaseUom: 'libra', consumptionUom: 'slices', conversionFactor: 10, isPerishable: false },
    { code: 'I-12', name: 'Bagel', purchaseUom: 'unidad', consumptionUom: 'unidades', conversionFactor: 1, isPerishable: false },
    { code: 'I-13', name: 'Yogurt griego', purchaseUom: 'bote', consumptionUom: 'porciones', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por ml"); defaulted to 1 and must be corrected' },
    { code: 'I-14', name: 'Mermelada de fresa', purchaseUom: 'frasco', consumptionUom: 'porciones', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por ml"); defaulted to 1 and must be corrected' },
    { code: 'I-15', name: 'Sirope de chocolate', purchaseUom: 'frasco', consumptionUom: 'porciones', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por ml"); defaulted to 1 and must be corrected' },
    { code: 'I-16', name: 'Chips Lays', purchaseUom: 'bolsa', consumptionUom: 'bolsas', conversionFactor: 1, isPerishable: false },
    { code: 'I-17', name: 'Queso para derretir', purchaseUom: 'libra', consumptionUom: 'gramos', conversionFactor: 454, isPerishable: false },
    // FASE 1.2 — Café and beverage insumos (the plan's first row of this
    // section is a malformed fragment with no insumo name: "gramos | 1000 |
    // Base en gramos". It defines no insumo and is intentionally ignored.)
    { code: 'I-18', name: 'Café molido', purchaseUom: 'libra', consumptionUom: 'gramos', conversionFactor: 454, isPerishable: false },
    { code: 'I-19', name: 'Leche entera', purchaseUom: 'litro', consumptionUom: 'ml', conversionFactor: 1000, isPerishable: false },
    { code: 'I-20', name: 'Leche deslactosada', purchaseUom: 'litro', consumptionUom: 'ml', conversionFactor: 1000, isPerishable: false, note: 'Created but no FASE 2 recipe uses it' },
    { code: 'I-21', name: 'Hielo', purchaseUom: 'saco', consumptionUom: 'gramos', conversionFactor: 5000, isPerishable: false },
    { code: 'I-22', name: 'Matcha en polvo', purchaseUom: 'paquete', consumptionUom: 'gramos', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por paquete"); defaulted to 1 and must be corrected' },
    { code: 'I-23', name: 'Sirope de caramelo', purchaseUom: 'frasco', consumptionUom: 'ml', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por frasco"); defaulted to 1 and must be corrected' },
    { code: 'I-24', name: 'Galleta Oreo', purchaseUom: 'paquete', consumptionUom: 'unidades', conversionFactor: 12, isPerishable: false },
    { code: 'I-25', name: 'Fresa (fresco o congelado)', purchaseUom: 'libra', consumptionUom: 'gramos', conversionFactor: 454, isPerishable: false },
    // FASE 1.3 — Postres insumos
    { code: 'I-26', name: 'Galleta Crumb', purchaseUom: 'caja', consumptionUom: 'unidades', conversionFactor: 12, isPerishable: false },
    { code: 'I-27', name: 'Galleta Pistachos', purchaseUom: 'caja', consumptionUom: 'unidades', conversionFactor: 12, isPerishable: false },
    { code: 'I-28', name: 'Galleta Ferrero Rocher', purchaseUom: 'caja', consumptionUom: 'unidades', conversionFactor: 12, isPerishable: false },
    { code: 'I-29', name: 'Mantquilla de Maní', purchaseUom: 'frasco', consumptionUom: 'porciones', conversionFactor: 1, isPerishable: false, note: 'Plan gives no numeric factor ("por gramos"); defaulted to 1 and must be corrected' },
    { code: 'I-30', name: 'Pastel de Chocolate', purchaseUom: 'pastel entero', consumptionUom: 'slices', conversionFactor: 10, isPerishable: false, note: 'Plan flags this UOM conversion as CRITICAL and states ~10-12 slices/cake; conservative lower bound 10 applied' },
  ];

  const products: SohoProductSeed[] = [
    // FASE 2.1 / 3.1 — Brunch
    {
      name: 'Desayuno Americano', sellPrice: 250, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-01', grossQuantity: 2, componentUom: 'unidades' },
        { insumoCode: 'I-02', grossQuantity: 2, componentUom: 'tiras' },
        { insumoCode: 'I-06', grossQuantity: 2, componentUom: 'unidades' },
        { insumoCode: 'I-04', grossQuantity: 1, componentUom: 'porciones' },
        { insumoCode: 'I-05', grossQuantity: 1, componentUom: 'porciones' },
        { insumoCode: 'I-03', grossQuantity: 1, componentUom: 'rebanadas' },
      ],
    },
    {
      name: 'Desayuno Pinolero', sellPrice: 220, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-01', grossQuantity: 2, componentUom: 'unidades' },
        { insumoCode: 'I-07', grossQuantity: 1, componentUom: 'tazas' },
        { insumoCode: 'I-08', grossQuantity: 4, componentUom: 'rebanadas' },
        { insumoCode: 'I-09', grossQuantity: 2, componentUom: 'onzas' },
      ],
    },
    {
      name: 'Omelet Jamón y Queso', sellPrice: 230, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-01', grossQuantity: 2, componentUom: 'unidades' },
        { insumoCode: 'I-11', grossQuantity: 1, componentUom: 'slices' },
        { insumoCode: 'I-10', grossQuantity: 30, componentUom: 'gramos' },
        { insumoCode: 'I-03', grossQuantity: 1, componentUom: 'rebanadas' },
      ],
    },
    {
      name: 'Tostadas Morning', sellPrice: 200, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-03', grossQuantity: 2, componentUom: 'rebanadas' },
        { insumoCode: 'I-17', grossQuantity: 40, componentUom: 'gramos' },
        { insumoCode: 'I-01', grossQuantity: 2, componentUom: 'unidades' },
        { insumoCode: 'I-02', grossQuantity: 2, componentUom: 'tiras' },
      ],
    },
    {
      name: 'Bagel Cremoso', sellPrice: 180, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-12', grossQuantity: 1, componentUom: 'unidades' },
        { insumoCode: 'I-13', grossQuantity: 60, componentUom: 'gramos', note: 'Recipe states 60g but the insumo consumption UOM is "porciones" with an unknown plan factor; stored as stated in FASE 2' },
        { insumoCode: 'I-14', grossQuantity: 15, componentUom: 'gramos', note: 'Recipe states 15g but the insumo consumption UOM is "porciones" with an unknown plan factor; stored as stated in FASE 2' },
      ],
    },
    {
      name: 'Bagel Nica', sellPrice: 220, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-12', grossQuantity: 1, componentUom: 'unidades' },
        { insumoCode: 'I-01', grossQuantity: 2, componentUom: 'unidades' },
        { insumoCode: 'I-07', grossQuantity: 1, componentUom: 'tazas' },
        { insumoCode: 'I-02', grossQuantity: 2, componentUom: 'tiras' },
        { insumoCode: 'I-04', grossQuantity: 1, componentUom: 'porciones' },
      ],
    },
    {
      name: 'Bagel Jamón de Pavo', sellPrice: 200, category: 'Brunch', productType: ProductType.COMPOUND,
      recipe: [
        { insumoCode: 'I-12', grossQuantity: 1, componentUom: 'unidades' },
        { insumoCode: 'I-01', grossQuantity: 1, componentUom: 'unidades' },
        { insumoCode: 'I-11', grossQuantity: 1, componentUom: 'slices' },
        { insumoCode: 'I-16', grossQuantity: 1, componentUom: 'bolsas' },
      ],
    },
    // FASE 2.5 / 3.1 — Postres. The four SIMPLE galletas have a FASE 2.5 BOM
    // in the plan, but FASE 3 declares them SIMPLE: per this seeder's contract
    // recipes are only created for COMPOUND products, so their BOM is skipped
    // and the conflict is reported as a warning.
    { name: 'Galleta Crumb', sellPrice: 40, category: 'Postres', productType: ProductType.SIMPLE, recipe: [{ insumoCode: 'I-26', grossQuantity: 1, componentUom: 'unidades' }], note: 'FASE 2.5 defines a BOM but FASE 3 declares this product SIMPLE; no RecipeVersion is created for SIMPLE products' },
    { name: 'Galleta Pistachos', sellPrice: 45, category: 'Postres', productType: ProductType.SIMPLE, recipe: [{ insumoCode: 'I-27', grossQuantity: 1, componentUom: 'unidades' }], note: 'FASE 2.5 defines a BOM but FASE 3 declares this product SIMPLE; no RecipeVersion is created for SIMPLE products' },
    { name: 'Galleta Ferrero Rocher', sellPrice: 50, category: 'Postres', productType: ProductType.SIMPLE, recipe: [{ insumoCode: 'I-28', grossQuantity: 1, componentUom: 'unidades' }], note: 'FASE 2.5 defines a BOM but FASE 3 declares this product SIMPLE; no RecipeVersion is created for SIMPLE products' },
    { name: 'Mantquilla de Maní', sellPrice: 35, category: 'Postres', productType: ProductType.SIMPLE, recipe: [{ insumoCode: 'I-29', grossQuantity: 1, componentUom: 'porciones' }], note: 'FASE 2.5 defines a BOM but FASE 3 declares this product SIMPLE; no RecipeVersion is created for SIMPLE products' },
    {
      name: 'Slice Pastel Chocolate', sellPrice: 80, category: 'Postres', productType: ProductType.COMPOUND,
      recipe: [{ insumoCode: 'I-30', grossQuantity: 1, componentUom: 'slices' }],
    },
    // FASE 2.2 / 3.1 — Café Caliente
    { name: 'Café Americano 8oz', sellPrice: 80, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }] },
    { name: 'Café Americano 12oz', sellPrice: 100, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }] },
    { name: 'Café Americano 16oz', sellPrice: 120, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 36, componentUom: 'gramos' }] },
    { name: 'Cappuccino 8oz', sellPrice: 110, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 120, componentUom: 'ml' }] },
    { name: 'Cappuccino 12oz', sellPrice: 130, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 180, componentUom: 'ml' }] },
    { name: 'Cappuccino 16oz', sellPrice: 150, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 36, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 240, componentUom: 'ml' }] },
    { name: 'Flat White 8oz', sellPrice: 120, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 150, componentUom: 'ml' }] },
    { name: 'Flat White 12oz', sellPrice: 140, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 210, componentUom: 'ml' }] },
    { name: 'Flat White 16oz', sellPrice: 160, category: 'Café Caliente', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 36, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 300, componentUom: 'ml' }] },
    // FASE 2.3 / 3.1 — Café Helado
    { name: 'Frappé Oreo 8oz', sellPrice: 130, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 120, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 150, componentUom: 'gramos' }, { insumoCode: 'I-24', grossQuantity: 1, componentUom: 'unidades' }] },
    { name: 'Frappé Oreo 12oz', sellPrice: 150, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 180, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 200, componentUom: 'gramos' }, { insumoCode: 'I-24', grossQuantity: 1, componentUom: 'unidades' }] },
    { name: 'Frappé Oreo 16oz', sellPrice: 170, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 36, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 240, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 250, componentUom: 'gramos' }, { insumoCode: 'I-24', grossQuantity: 2, componentUom: 'unidades' }] },
    { name: 'Frappé Caramelo 8oz', sellPrice: 130, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 120, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 150, componentUom: 'gramos' }, { insumoCode: 'I-23', grossQuantity: 15, componentUom: 'ml' }] },
    { name: 'Frappé Caramelo 12oz', sellPrice: 150, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 180, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 200, componentUom: 'gramos' }, { insumoCode: 'I-23', grossQuantity: 15, componentUom: 'ml' }] },
    { name: 'Frappé Caramelo 16oz', sellPrice: 170, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 36, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 240, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 250, componentUom: 'gramos' }, { insumoCode: 'I-23', grossQuantity: 20, componentUom: 'ml' }] },
    { name: 'Iced Coffee 8oz', sellPrice: 100, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-21', grossQuantity: 200, componentUom: 'gramos' }] },
    { name: 'Iced Coffee 12oz', sellPrice: 120, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 18, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 60, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 250, componentUom: 'gramos' }] },
    { name: 'Iced Coffee 16oz', sellPrice: 140, category: 'Café Helado', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-18', grossQuantity: 36, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 90, componentUom: 'ml' }, { insumoCode: 'I-21', grossQuantity: 300, componentUom: 'gramos' }] },
    // FASE 2.4 / 3.1 — Especiales. FASE 2.4 lists "hielo" for Matcha Fresa
    // without any quantity: the ice line is intentionally omitted rather
    // than invented, and reported as a warning.
    { name: 'Matcha Caliente 8oz', sellPrice: 120, category: 'Especial', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-22', grossQuantity: 3, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 180, componentUom: 'ml' }] },
    { name: 'Matcha Caliente 12oz', sellPrice: 140, category: 'Especial', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-22', grossQuantity: 4, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 240, componentUom: 'ml' }] },
    { name: 'Matcha Caliente 16oz', sellPrice: 160, category: 'Especial', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-22', grossQuantity: 5, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 350, componentUom: 'ml' }] },
    { name: 'Matcha Fresa 8oz', sellPrice: 140, category: 'Especial', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-22', grossQuantity: 3, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 120, componentUom: 'ml' }, { insumoCode: 'I-25', grossQuantity: 30, componentUom: 'gramos' }], note: 'FASE 2.4 lists hielo for Matcha Fresa without a quantity; the ice line is omitted rather than invented' },
    { name: 'Matcha Fresa 12oz', sellPrice: 160, category: 'Especial', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-22', grossQuantity: 4, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 180, componentUom: 'ml' }, { insumoCode: 'I-25', grossQuantity: 50, componentUom: 'gramos' }], note: 'FASE 2.4 lists hielo for Matcha Fresa without a quantity; the ice line is omitted rather than invented' },
    { name: 'Matcha Fresa 16oz', sellPrice: 180, category: 'Especial', productType: ProductType.COMPOUND, recipe: [{ insumoCode: 'I-22', grossQuantity: 5, componentUom: 'gramos' }, { insumoCode: 'I-19', grossQuantity: 240, componentUom: 'ml' }, { insumoCode: 'I-25', grossQuantity: 60, componentUom: 'gramos' }], note: 'FASE 2.4 lists hielo for Matcha Fresa without a quantity; the ice line is omitted rather than invented' },
  ];

  const warnings: string[] = [];
  for (const insumo of insumos) {
    if (insumo.note) warnings.push(`${insumo.code} ${insumo.name}: ${insumo.note}`);
  }
  for (const product of products) {
    if (product.note) warnings.push(`${product.name}: ${product.note}`);
  }
  warnings.push(
    'is_perishable and parLevel/minStock are not defined by the plan: insumos are created with is_perishable=false and null stock policy thresholds',
  );
  warnings.push(
    'Prices marked ~ in FASE 3 are approximate; the shown numeric value is used as the sell price',
  );

  return { insumos, products, warnings };
}

export interface SohoSeedCounts {
  insumosCreated: number;
  insumosSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  recipesCreated: number;
  recipesSkipped: number;
  recipeDetailsCreated: number;
  uomConversionsCreated: number;
  warnings: string[];
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

/**
 * Seeds the SOHO catalog for one tenant inside a single tenant-bound
 * transaction. Idempotent on re-run: existing names are skipped and
 * reported, never overwritten.
 */
export async function seedSohoCatalog(
  dataSource: DataSource,
  tenantId: string,
  plan: SohoCatalogPlan = buildSohoCatalogPlan(),
): Promise<SohoSeedCounts> {
  return runInTenantTransaction(dataSource, tenantId, async (manager) => {
    const counts: SohoSeedCounts = {
      insumosCreated: 0,
      insumosSkipped: 0,
      productsCreated: 0,
      productsSkipped: 0,
      recipesCreated: 0,
      recipesSkipped: 0,
      recipeDetailsCreated: 0,
      uomConversionsCreated: 0,
      warnings: plan.warnings,
    };

    // ---- FASE 1: insumos -------------------------------------------------
    const existingInsumos = await manager.find(Insumo, {
      where: { tenant_id: tenantId },
    });
    const insumoByName = new Map<string, Insumo>();
    for (const insumo of existingInsumos) {
      insumoByName.set(normalizeName(insumo.name), insumo);
    }

    for (const seed of plan.insumos) {
      const key = normalizeName(seed.name);
      if (insumoByName.has(key)) {
        counts.insumosSkipped++;
        continue;
      }
      const created = await manager.save(
        Insumo,
        manager.create(Insumo, {
          tenant_id: tenantId,
          name: seed.name,
          purchaseUom: seed.purchaseUom,
          consumptionUom: seed.consumptionUom,
          conversionFactor: seed.conversionFactor,
          is_perishable: seed.isPerishable,
          negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
          stock: 0,
          averageCost: 0,
          is_active: true,
        }),
      );
      insumoByName.set(key, created);
      counts.insumosCreated++;

      if (seed.purchaseUom !== seed.consumptionUom) {
        await manager.save(
          UomConversion,
          manager.create(UomConversion, {
            tenant_id: tenantId,
            insumo_id: created.id,
            unit_name: seed.consumptionUom,
            factor: seed.conversionFactor,
            is_default: seed.conversionFactor === 1,
          }),
        );
        counts.uomConversionsCreated++;
      }
    }

    // ---- FASE 3: products ------------------------------------------------
    const existingProducts = await manager.find(Product, {
      where: { tenant_id: tenantId },
    });
    const productByName = new Map<string, Product>();
    for (const product of existingProducts) {
      productByName.set(normalizeName(product.name), product);
    }

    // An existing RecipeVersion for a product is authoritative: collect the
    // product ids up front so re-runs skip recipes entirely
    // (VERSION_ALREADY_EXISTS semantics, mirroring industry-template.service).
    const existingVersions = await manager.find(RecipeVersion, {
      where: { tenant_id: tenantId },
    });
    const productIdsWithVersion = new Set(
      existingVersions.map((version) => version.product_id),
    );

    // Resolve plan codes -> insumo rows through the same case-insensitive
    // name map used for idempotency, so re-runs resolve existing rows too.
    const nameByCode = new Map(
      plan.insumos.map((insumo) => [insumo.code, insumo.name]),
    );

    for (const seed of plan.products) {
      const key = normalizeName(seed.name);
      let product = productByName.get(key);
      if (product) {
        counts.productsSkipped++;
      } else {
        product = await manager.save(
          Product,
          manager.create(Product, {
            tenant_id: tenantId,
            name: seed.name,
            sellPrice: seed.sellPrice,
            uom: 'UN',
            category_code: seed.category,
            product_type: seed.productType,
            stock: 0,
            averageCost: 0,
            is_active: true,
          }),
        );
        productByName.set(key, product);
        counts.productsCreated++;
      }

      // ---- FASE 2: recipes (COMPOUND products only) ----------------------
      if (seed.productType !== ProductType.COMPOUND || !seed.recipe?.length) {
        continue;
      }
      if (productIdsWithVersion.has(product.id)) {
        counts.recipesSkipped++;
        continue;
      }

      const version = await manager.save(
        RecipeVersion,
        manager.create(RecipeVersion, {
          tenant_id: tenantId,
          product_id: product.id,
          product_name: product.name,
          version_number: 1,
          is_active: false,
          yield_quantity: 1,
          technical_shrink_pct: 0,
          origin: RecipeOrigin.MANUAL,
          publication_state: RecipePublicationState.DRAFT,
          suggestion_state: RecipeSuggestionState.SUGGESTED,
        }),
      );
      counts.recipesCreated++;

      for (const line of seed.recipe) {
        const insumoName = nameByCode.get(line.insumoCode);
        const insumo = insumoName
          ? insumoByName.get(normalizeName(insumoName))
          : undefined;
        if (!insumo) {
          // Fail closed inside the transaction: the whole seed rolls back
          // rather than persisting a broken BOM line.
          throw new Error(
            `Plan integrity error: recipe line for '${seed.name}' references unresolved insumo '${line.insumoCode}'`,
          );
        }
        await manager.save(
          RecipeDetail,
          manager.create(RecipeDetail, {
            tenant_id: tenantId,
            recipe_version_id: version.id,
            insumo_id: insumo.id,
            quantity: line.grossQuantity,
            gross_quantity: line.grossQuantity,
            technical_shrink_pct: 0,
            ingredient_name: insumo.name,
            ingredient_type: 'INSUMO',
            component_uom: line.componentUom,
          }),
        );
        counts.recipeDetailsCreated++;
      }
    }

    return counts;
  });
}

export async function main(argv: string[]): Promise<void> {
  // Fail closed before any application/DataSource bootstrap: an invalid
  // tenant id must never open a connection, let alone write.
  const tenantId = parseTenantIdArg(argv);
  const plan = buildSohoCatalogPlan();

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const dataSource = app.get(DataSource);
    const counts = await seedSohoCatalog(dataSource, tenantId, plan);

    console.log('\n--- SOHO catalog seed summary ---');
    console.log(`tenant_id: ${tenantId}`);
    console.log(
      `insumos: ${counts.insumosCreated} created, ${counts.insumosSkipped} skipped`,
    );
    console.log(
      `products: ${counts.productsCreated} created, ${counts.productsSkipped} skipped`,
    );
    console.log(
      `recipes: ${counts.recipesCreated} created, ${counts.recipesSkipped} skipped (VERSION_ALREADY_EXISTS)`,
    );
    console.log(`recipe details: ${counts.recipeDetailsCreated} created`);
    console.log(`uom conversions: ${counts.uomConversionsCreated} created`);
    if (counts.warnings.length) {
      console.log('\nPlan data warnings (review with the owner):');
      for (const warning of counts.warnings) {
        console.log(` - ${warning}`);
      }
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
