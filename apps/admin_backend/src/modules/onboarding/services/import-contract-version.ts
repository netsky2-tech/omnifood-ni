export interface ImportContractDefinition {
  version: string;
  encodingPolicy: 'UTF-8';
  delimiterPolicy: string[];
  requiredColumns: string[];
  supportedColumns: string[];
  unsupportedColumns: string[];
}

export const CANONICAL_IMPORT_CONTRACT_V1: ImportContractDefinition = {
  version: 'v1.0',
  encodingPolicy: 'UTF-8',
  delimiterPolicy: [',', ';'],
  requiredColumns: ['nombre', 'precio_venta'],
  supportedColumns: [
    'nombre',
    'precio_venta',
    'uom',
    'sku',
    'categoria',
    'porcentaje_iva',
  ],
  unsupportedColumns: [
    'codigo_barras',
    'barcode',
    'codigobarras',
    'stock_inicial',
    'stock',
    'costo_insumo',
    'costo_promedio',
    'average_cost',
    'cpp',
  ],
};

export const UNSUPPORTED_COLUMNS_REASONS: Record<string, string> = {
  codigo_barras:
    'Barcode no soportado en Product Master V1, no se degrada a SKU (AC-51)',
  barcode:
    'Barcode no soportado en Product Master V1, no se degrada a SKU (AC-51)',
  codigobarras:
    'Barcode no soportado en Product Master V1, no se degrada a SKU (AC-51)',
  stock_inicial:
    'Stock inicial pertenece a BOH Enrichment y Kardex, no a la importación de catálogo V1 (AC-24)',
  stock:
    'Stock pertenece a BOH Enrichment y Kardex, no a la importación de catálogo V1 (AC-24)',
  costo_insumo:
    'Costo inicial pertenece a BOH Enrichment y Kardex, no a la importación de catálogo V1 (AC-24)',
  costo_promedio:
    'Costo promedio pertenece a BOH Enrichment y Kardex, no a la importación de catálogo V1 (AC-24)',
  average_cost:
    'Average cost pertenece a BOH Enrichment y Kardex, no a la importación de catálogo V1 (AC-24)',
  cpp: 'CPP pertenece a BOH Enrichment y Kardex, no a la importación de catálogo V1 (AC-24)',
};

export const CANONICAL_COLUMN_NAMES = [
  'nombre',
  'precio_venta',
  'unidad_venta',
  'sku',
  'categoria',
  'porcentaje_iva',
] as const;

function cleanHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

export function normalizeHeaderName(rawHeader: string): string | null {
  const cleaned = cleanHeader(rawHeader);

  // Name / Nombre
  if (['nombre', 'name', 'producto', 'descripcion'].includes(cleaned)) {
    return 'nombre';
  }

  // Price / Precio venta
  if (['precio_venta', 'precioventa', 'precio', 'price'].includes(cleaned)) {
    return 'precio_venta';
  }

  // UOM / Unidad de venta
  if (
    ['unidad_venta', 'unidadventa', 'uom', 'unidad', 'unidad_consumo'].includes(
      cleaned,
    )
  ) {
    return 'uom';
  }

  // SKU (NOTE: Barcode is strictly excluded AC-51)
  if (['sku', 'codigo'].includes(cleaned)) {
    return 'sku';
  }

  // Category
  if (['categoria', 'category', 'rubro'].includes(cleaned)) {
    return 'categoria';
  }

  // VAT / IVA
  if (['porcentaje_iva', 'porcentajeiva', 'iva', 'tax'].includes(cleaned)) {
    return 'porcentaje_iva';
  }

  return null;
}

export function isUnsupportedColumn(rawHeader: string): boolean {
  const cleaned = cleanHeader(rawHeader);
  return CANONICAL_IMPORT_CONTRACT_V1.unsupportedColumns.includes(cleaned);
}

export function isUnknownColumn(rawHeader: string): boolean {
  const normalized = normalizeHeaderName(rawHeader);
  if (normalized) return false;
  return !isUnsupportedColumn(rawHeader);
}

export function getCanonicalImportContract(): ImportContractDefinition {
  return CANONICAL_IMPORT_CONTRACT_V1;
}

export function generateOfficialProductTemplateCsv(): string {
  const headers = [
    'nombre',
    'precio_venta',
    'unidad_venta',
    'sku',
    'categoria',
    'porcentaje_iva',
  ];
  const sampleRows = [
    ['Hamburguesa Clásica', '180.00', 'UN', 'HAM-01', 'Comida', '15'],
    ['Gaseosa 500ml', '35.00', 'UN', 'BEB-01', 'Bebidas', '15'],
    ['Papas Fritas Medianas', '75.00', 'UN', 'PAP-01', 'Acompañamientos', '15'],
  ];

  const csvRows = [headers.join(',')];
  for (const row of sampleRows) {
    csvRows.push(row.join(','));
  }
  return csvRows.join('\n');
}
