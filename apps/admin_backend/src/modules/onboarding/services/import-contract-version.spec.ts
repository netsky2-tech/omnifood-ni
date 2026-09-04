import {
  CANONICAL_IMPORT_CONTRACT_V1,
  getCanonicalImportContract,
  generateOfficialProductTemplateCsv,
  normalizeHeaderName,
  isUnsupportedColumn,
  isUnknownColumn,
  CANONICAL_COLUMN_NAMES,
  UNSUPPORTED_COLUMNS_REASONS,
} from './import-contract-version';

describe('ImportContractVersion (Canonical CSV Authority / AC-16, AC-17, AC-22, AC-24, AC-51)', () => {
  it('exposes contract version v1.0 with UTF-8 encoding and standard delimiters', () => {
    const contract = getCanonicalImportContract();
    expect(contract.version).toBe('v1.0');
    expect(contract.encodingPolicy).toBe('UTF-8');
    expect(contract.delimiterPolicy).toEqual([',', ';']);
    expect(contract.requiredColumns).toEqual(['nombre', 'precio_venta']);
  });

  describe('Header Normalization & Aliases (AC-16, AC-51)', () => {
    it('normalizes product name aliases', () => {
      expect(normalizeHeaderName('nombre')).toBe('nombre');
      expect(normalizeHeaderName('Name')).toBe('nombre');
      expect(normalizeHeaderName('  PRODUCTO  ')).toBe('nombre');
      expect(normalizeHeaderName('descripcion')).toBe('nombre');
      expect(normalizeHeaderName('descripción')).toBe('nombre');
    });

    it('normalizes sell price aliases', () => {
      expect(normalizeHeaderName('precio_venta')).toBe('precio_venta');
      expect(normalizeHeaderName('precioventa')).toBe('precio_venta');
      expect(normalizeHeaderName('precio')).toBe('precio_venta');
      expect(normalizeHeaderName('Price')).toBe('precio_venta');
      expect(normalizeHeaderName('PRECIO VENTA')).toBe('precio_venta');
    });

    it('normalizes uom aliases', () => {
      expect(normalizeHeaderName('unidad_venta')).toBe('uom');
      expect(normalizeHeaderName('unidadventa')).toBe('uom');
      expect(normalizeHeaderName('uom')).toBe('uom');
      expect(normalizeHeaderName('unidad')).toBe('uom');
      expect(normalizeHeaderName('unidad_consumo')).toBe('uom');
    });

    it('normalizes sku aliases and strictly excludes barcode (AC-51)', () => {
      expect(normalizeHeaderName('sku')).toBe('sku');
      expect(normalizeHeaderName('codigo')).toBe('sku');
      expect(normalizeHeaderName('código')).toBe('sku');

      // CRITICAL AC-51: barcode != sku
      expect(normalizeHeaderName('codigo_barras')).not.toBe('sku');
      expect(normalizeHeaderName('barcode')).not.toBe('sku');
      expect(normalizeHeaderName('codigobarras')).not.toBe('sku');
    });

    it('identifies unsupported columns with explicit BOH enrichment or barcode reason (AC-24, AC-51)', () => {
      expect(isUnsupportedColumn('codigo_barras')).toBe(true);
      expect(isUnsupportedColumn('barcode')).toBe(true);
      expect(isUnsupportedColumn('stock_inicial')).toBe(true);
      expect(isUnsupportedColumn('costo_insumo')).toBe(true);
      expect(isUnsupportedColumn('costo_promedio')).toBe(true);
      expect(isUnsupportedColumn('average_cost')).toBe(true);
      expect(isUnsupportedColumn('cpp')).toBe(true);

      expect(UNSUPPORTED_COLUMNS_REASONS['barcode']).toContain('Barcode');
      expect(UNSUPPORTED_COLUMNS_REASONS['stock_inicial']).toContain(
        'BOH Enrichment',
      );
    });

    it('identifies unknown/unsupported columns correctly (AC-17)', () => {
      expect(isUnknownColumn('columna_fantasma')).toBe(true);
      expect(isUnknownColumn('proveedor_desconocido')).toBe(true);
      expect(isUnknownColumn('nombre')).toBe(false);
      expect(isUnknownColumn('precio_venta')).toBe(false);
    });
  });

  describe('OfficialTemplateGenerator (AC-22)', () => {
    it('generates official CSV template derived from active contract version', () => {
      const templateCsv = generateOfficialProductTemplateCsv();
      expect(typeof templateCsv).toBe('string');
      const lines = templateCsv.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);

      const headerLine = lines[0];
      expect(headerLine).toContain('nombre');
      expect(headerLine).toContain('precio_venta');
      expect(headerLine).toContain('unidad_venta');
      expect(headerLine).toContain('sku');
      expect(headerLine).not.toContain('codigo_barras');
      expect(headerLine).not.toContain('stock_inicial');
      expect(headerLine).not.toContain('costo_insumo');
    });
  });
});
