/**
 * Platform UOM catalog (Zona A, issue: SOHO operational gaps).
 *
 * Two classes of units of measure, with DIFFERENT conversion semantics:
 *
 *  1. UNIVERSAL units — exact physical conversions owned by the platform
 *     (protocol, not tenant-configurable). Every factor is derived from the
 *     dimension's anchor unit; none is a "default 1".
 *       - mass:   anchor gram (lb = 453.59237 g, oz = 28.349523125 g, kg = 1000 g)
 *       - volume: anchor millilitre (l = 1000 ml, fl_oz = 29.5735295625 ml,
 *                 cup = 240 ml, tbsp = 14.7867648 ml, tsp = 4.9289216 ml,
 *                 gal_us = 3785.411784 ml)
 *       - count:  anchor unidad (docena = 12)
 *
 *  2. CONTAINER and SERVING units — frasco, bote, bolsa, caja, saco, paquete,
 *     bandeja, lata, porción, rebanada, tira, slice. They carry NO universal
 *     factor: "1 frasco" of honey is not "1 frasco" of syrup. The conversion
 *     from a container/serving unit to a universal unit is PER-INSUMO business
 *     data (the insumo's conversionFactor = content declaration), never a
 *     platform constant and never a seeder default.
 *
 * THE INVARIANT (S3): an insumo whose purchaseUom and consumptionUom resolve
 * to DIFFERENT catalog codes while conversionFactor === 1 has an UNCONFIGURED
 * conversion — the numeric default was never edited. Purchase loads and insumo
 * writes reject it with an actionable message instead of silently
 * distorting stock and CPP. Identity (same resolved code) with factor 1 is
 * valid regardless of spelling (unidad → unidades).
 */

/**
 * Absolute tolerance for the universal anchor check.
 *
 * `insumos.conversionFactor` is `numeric(12,4)`, so the platform anchor is
 * STORED rounded to four decimals: lb→kg = 0.45359237 is saved as 0.4536 and
 * oz→g = 28.349523125 as 28.3495. A tolerance finer than the storage precision
 * rejects the very value the catalog told the operator to enter, on the next
 * write that touches a UOM field. This is tied to the column's precision, not
 * to the anchor's mathematical precision: it still rejects the unedited
 * factor-1 default and any materially different value.
 */
const ANCHOR_FACTOR_TOLERANCE = 1e-4;

export type UomDimension =
  | 'mass'
  | 'volume'
  | 'count'
  | 'container'
  | 'serving'
  /**
   * A unit the TENANT declared in its own UOM catalog and the platform does
   * not know. Its content is business data (the insumo's conversion factor),
   * never a platform constant — exactly like container/serving, except that
   * even the dimension is unknown.
   */
  | 'tenant';

export interface UomCatalogEntry {
  /** Stable platform code (normalized, singular). */
  code: string;
  /** Display name (Spanish, the operator's language). */
  name: string;
  dimension: UomDimension;
  /** Units of the dimension anchor one entry equals. NULL for container/serving. */
  factorToAnchor: number | null;
  /** Accepted spellings (normalized at resolution time). */
  aliases: readonly string[];
}

export const UOM_ANCHORS = {
  mass: 'g',
  volume: 'ml',
  count: 'unidad',
} as const;

export const UOM_CATALOG: readonly UomCatalogEntry[] = [
  // mass — anchor g
  {
    code: 'mg',
    name: 'miligramo',
    dimension: 'mass',
    factorToAnchor: 0.001,
    aliases: ['miligramos', 'mg'],
  },
  {
    code: 'g',
    name: 'gramo',
    dimension: 'mass',
    factorToAnchor: 1,
    aliases: ['gramo', 'gramos', 'g', 'gr', 'grs'],
  },
  {
    code: 'kg',
    name: 'kilogramo',
    dimension: 'mass',
    factorToAnchor: 1000,
    aliases: ['kilogramo', 'kilogramos', 'kg', 'kilo', 'kilos'],
  },
  {
    code: 'lb',
    name: 'libra',
    dimension: 'mass',
    factorToAnchor: 453.59237,
    aliases: ['libra', 'libras', 'lb', 'lbs'],
  },
  {
    code: 'oz',
    name: 'onza',
    dimension: 'mass',
    factorToAnchor: 28.349523125,
    aliases: ['onza', 'onzas', 'oz'],
  },
  // volume — anchor ml
  {
    code: 'ml',
    name: 'mililitro',
    dimension: 'volume',
    factorToAnchor: 1,
    aliases: ['mililitro', 'mililitros', 'ml', 'cc'],
  },
  {
    code: 'l',
    name: 'litro',
    dimension: 'volume',
    factorToAnchor: 1000,
    aliases: ['litro', 'litros', 'l', 'lt', 'lts'],
  },
  {
    code: 'fl_oz',
    name: 'onza fluida',
    dimension: 'volume',
    factorToAnchor: 29.5735295625,
    aliases: ['onza fluida', 'onzas fluidas', 'fl oz', 'floz', 'fl.oz'],
  },
  {
    code: 'cup',
    name: 'taza medidora',
    dimension: 'volume',
    factorToAnchor: 240,
    aliases: ['taza medidora', 'tazas medidoras', 'cup', 'cups'],
  },
  {
    code: 'tbsp',
    name: 'cucharada',
    dimension: 'volume',
    factorToAnchor: 14.7867648,
    aliases: ['cucharada', 'cucharadas', 'tbsp'],
  },
  {
    code: 'tsp',
    name: 'cucharadita',
    dimension: 'volume',
    factorToAnchor: 4.9289216,
    aliases: ['cucharadita', 'cucharaditas', 'tsp'],
  },
  {
    code: 'gal_us',
    name: 'galón',
    dimension: 'volume',
    factorToAnchor: 3785.411784,
    aliases: ['galón', 'galon', 'galones', 'gal', 'gal_us'],
  },
  // count — anchor unidad
  {
    code: 'unidad',
    name: 'unidad',
    dimension: 'count',
    factorToAnchor: 1,
    aliases: ['unidad', 'unidades', 'pieza', 'piezas', 'pieza entera', 'u', 'un'],
  },
  {
    code: 'docena',
    name: 'docena',
    dimension: 'count',
    factorToAnchor: 12,
    aliases: ['docena', 'docenas', 'dz'],
  },
  // container — per-insumo content declaration, NO universal factor
  {
    code: 'frasco',
    name: 'frasco',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['frasco', 'frascos'],
  },
  {
    code: 'bote',
    name: 'bote',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['bote', 'botes'],
  },
  {
    code: 'bolsa',
    name: 'bolsa',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['bolsa', 'bolsas'],
  },
  {
    code: 'caja',
    name: 'caja',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['caja', 'cajas'],
  },
  {
    code: 'saco',
    name: 'saco',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['saco', 'sacos'],
  },
  {
    code: 'paquete',
    name: 'paquete',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['paquete', 'paquetes'],
  },
  {
    code: 'bandeja',
    name: 'bandeja',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['bandeja', 'bandejas'],
  },
  {
    code: 'lata',
    name: 'lata',
    dimension: 'container',
    factorToAnchor: null,
    aliases: ['lata', 'latas'],
  },
  // serving — business consumption unit, NO universal factor
  {
    code: 'porcion',
    name: 'porción',
    dimension: 'serving',
    factorToAnchor: null,
    aliases: ['porción', 'porcion', 'porciones'],
  },
  {
    code: 'taza_serving',
    name: 'taza (cocina)',
    dimension: 'serving',
    factorToAnchor: null,
    aliases: ['taza', 'tazas'],
  },
  {
    code: 'pastel',
    name: 'pastel entero',
    dimension: 'serving',
    factorToAnchor: null,
    aliases: ['pastel entero', 'pastel', 'pasteles'],
  },
  {
    code: 'rebanada',
    name: 'rebanada',
    dimension: 'serving',
    factorToAnchor: null,
    aliases: ['rebanada', 'rebanadas'],
  },
  {
    code: 'tira',
    name: 'tira',
    dimension: 'serving',
    factorToAnchor: null,
    aliases: ['tira', 'tiras'],
  },
  {
    code: 'slice',
    name: 'slice',
    dimension: 'serving',
    factorToAnchor: null,
    aliases: ['slice', 'slices'],
  },
];

const normalize = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    // strip accents so 'galón' resolves like 'galon'
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const BY_ALIAS = new Map<string, UomCatalogEntry>();
for (const entry of UOM_CATALOG) {
  for (const alias of entry.aliases) {
    BY_ALIAS.set(normalize(alias), entry);
  }
  BY_ALIAS.set(normalize(entry.code), entry);
  BY_ALIAS.set(normalize(entry.name), entry);
}

/** Resolves a free-text UOM string to its platform catalog entry. */
export function resolveUom(
  raw: string,
  tenantUomCodes?: readonly string[],
): UomCatalogEntry | null {
  if (!raw) return null;
  const platform = BY_ALIAS.get(normalize(raw));
  if (platform) return platform;
  return tenantUomCodes ? resolveTenantUom(raw, tenantUomCodes) : null;
}

/**
 * A unit the tenant declared in its OWN UOM catalog (Catálogos → UoM).
 *
 * The platform catalog is a protocol (mass/volume/count anchors plus the
 * container/serving families), but the OPERATOR owns the units of his own
 * business: "arroba", "cajilla", "tetrapack". The insumo guard used to
 * reject every one of them with "no está en el catálogo de unidades...
 * Regístrala en el catálogo" — while the only catalog it consulted was the
 * platform one, so the promised escape did not exist. A tenant-declared unit
 * now resolves to this entry: no universal factor, no dimension, and the
 * conversion factor is the operator's own content declaration.
 */
function resolveTenantUom(
  raw: string,
  tenantUomCodes: readonly string[],
): UomCatalogEntry | null {
  const value = normalize(raw);
  const match = tenantUomCodes.find((code) => normalize(code) === value);
  if (!match) return null;
  return {
    code: match,
    name: match,
    dimension: 'tenant',
    factorToAnchor: null,
    aliases: [],
  };
}

/**
 * The codes of the units the tenant declared in its own UOM catalog. The
 * catalog is the operator's registry (the insumo form says so: "¿Falta una
 * unidad? Agrégala en Catálogos"), so the guard honours it.
 */
export interface UomResolutionOptions {
  /** The tenant's UOM catalog codes (`catalog_values` of type UOM). */
  tenantUomCodes?: readonly string[];
}

export class UnconfiguredConversionError extends Error {
  readonly expectedFactor: number | null;

  constructor(message: string, expectedFactor: number | null = null) {
    super(message);
    this.name = 'UnconfiguredConversionError';
    this.expectedFactor = expectedFactor;
  }
}

/**
 * S3 invariant. Throws UnconfiguredConversionError when the insumo's
 * conversion is the untouched numeric default (factor 1) across two
 * DIFFERENT catalog units, or when a universal same-dimension pair carries a
 * factor that contradicts the platform anchor. Container/serving content
 * declarations (factor ≠ 1) always pass — they are business data.
 */
export function validateInsumoConversion(
  purchaseUom: string,
  consumptionUom: string,
  factor: number,
  options: UomResolutionOptions = {},
): void {
  const purchase = resolveUom(purchaseUom, options.tenantUomCodes);
  const consumption = resolveUom(consumptionUom, options.tenantUomCodes);

  if (!purchase) {
    throw new UnconfiguredConversionError(
      `UOM de compra "${purchaseUom}" no está en el catálogo de unidades. Regístrala en Catálogos → UoM o usa una unidad reconocida.`,
    );
  }
  if (!consumption) {
    throw new UnconfiguredConversionError(
      `UOM de consumo "${consumptionUom}" no está en el catálogo de unidades. Regístrala en Catálogos → UoM o usa una unidad reconocida.`,
    );
  }
  if (!(factor > 0)) {
    throw new UnconfiguredConversionError(
      `El factor de conversión debe ser > 0 (recibido ${factor}).`,
    );
  }

  const sameUnit = purchase.code === consumption.code;
  if (sameUnit && factor !== 1) {
    throw new UnconfiguredConversionError(
      `"${purchaseUom}" y "${consumptionUom}" son la misma unidad (${purchase.code}); el factor debe ser 1, recibido ${factor}.`,
    );
  }

  // A unit the TENANT declared carries no platform factor and no dimension:
  // its content is the operator's own declaration. The only universal rule
  // that survives is "two different units with factor 1 is the untouched
  // default", which stays enforced below.
  const isTenantDeclared =
    purchase.dimension === 'tenant' || consumption.dimension === 'tenant';

  if (
    !sameUnit &&
    factor === 1 &&
    (purchase.dimension === 'container' ||
      consumption.dimension === 'container' ||
      purchase.dimension === 'serving' ||
      consumption.dimension === 'serving' ||
      purchase.dimension !== consumption.dimension)
  ) {
    throw new UnconfiguredConversionError(
      `Conversión no configurada: "${purchaseUom}" → "${consumptionUom}" con factor 1 (el default nunca fue editado). Declara el contenido real del envase/porción en el factor — p.ej. cuántos ${consumptionUom} trae un ${purchaseUom}.`,
    );
  }

  // Universal units in DIFFERENT dimensions cannot have a platform factor
  // at all (mass vs volume needs a per-insumo density — a content
  // declaration, not a universal constant). A tenant-declared unit has no
  // known dimension, so it is always a content declaration.
  if (
    !sameUnit &&
    !isTenantDeclared &&
    purchase.dimension !== 'container' &&
    purchase.dimension !== 'serving' &&
    consumption.dimension !== 'container' &&
    consumption.dimension !== 'serving' &&
    purchase.dimension !== consumption.dimension
  ) {
    throw new UnconfiguredConversionError(
      `No existe conversión universal "${purchaseUom}" → "${consumptionUom}" (dimensiones distintas: ${purchase.dimension} vs ${consumption.dimension}). Declara la densidad/contenido del insumo usando una unidad de la misma dimensión o un envase.`,
    );
  }

  // Universal same-dimension pairs must match the platform anchor exactly.
  // A tenant-declared unit has no anchor, so it is never checked here.
  if (
    purchase.dimension === consumption.dimension &&
    purchase.dimension !== 'container' &&
    purchase.dimension !== 'serving' &&
    purchase.dimension !== 'tenant' &&
    !sameUnit
  ) {
    const expected = purchase.factorToAnchor / consumption.factorToAnchor;
    const tolerance = ANCHOR_FACTOR_TOLERANCE;
    if (Math.abs(factor - expected) > tolerance) {
      throw new UnconfiguredConversionError(
        `Factor inválido para "${purchaseUom}" → "${consumptionUom}": el catálogo establece ${expected} (recibido ${factor}).`,
        expected,
      );
    }
  }
}
