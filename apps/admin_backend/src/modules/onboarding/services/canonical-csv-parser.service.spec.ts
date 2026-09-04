import { CanonicalCsvParserService } from './canonical-csv-parser.service';

describe('CanonicalCsvParserService (Unit & Triangulation / AC-14, AC-15, AC-16, AC-17, AC-24, AC-51)', () => {
  let parser: CanonicalCsvParserService;

  beforeEach(() => {
    parser = new CanonicalCsvParserService();
  });

  it('computes deterministic sourceHash (sha256) from raw CSV content', () => {
    const rawCsv = 'nombre,precio_venta\nPizza,250\n';
    const parsed1 = parser.parseRawCsv(rawCsv);
    const parsed2 = parser.parseRawCsv(rawCsv);

    expect(parsed1.sourceHash).toBeDefined();
    expect(parsed1.sourceHash).toBe(parsed2.sourceHash);
    expect(parsed1.sourceHash.length).toBe(64);
  });

  it('parses valid comma-delimited CSV with aliases (AC-14, AC-16)', () => {
    const rawCsv = [
      'producto,precioventa,unidad_venta,codigo,rubro,iva',
      'Hamburguesa Clásica,150.00,UN,HAM-01,Comida,15',
      'Gaseosa 500ml,35.50,UN,BEB-01,Bebidas,15',
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.contractVersion).toBe('v1.0');
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.errorRows).toBe(0);
    expect(result.rows[0]).toMatchObject({
      rowOrdinal: 1,
      isValid: true,
      normalizedValues: {
        nombre: 'Hamburguesa Clásica',
        precioVenta: 150,
        uom: 'UN',
        sku: 'HAM-01',
        categoria: 'Comida',
        porcentajeIva: 15,
      },
    });
  });

  it('parses semicolon-delimited CSV correctly (delimiter triangulation)', () => {
    const rawCsv = [
      'name;price;uom;sku;category',
      'Tacos al Pastor;120;ORDEN;TAC-01;Comida',
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.rows[0].normalizedValues.nombre).toBe('Tacos al Pastor');
    expect(result.rows[0].normalizedValues.precioVenta).toBe(120);
    expect(result.rows[0].normalizedValues.uom).toBe('ORDEN');
  });

  it('handles quotes containing delimiters and currency symbols (sanitization)', () => {
    const rawCsv = [
      'nombre,precio_venta,uom',
      '"Hamburguesa, con queso", "C$ 180.50", UN',
      '"Combo Especial (Papas, Refresco)"," $250.00 ",UN',
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.rows[0].normalizedValues.nombre).toBe(
      'Hamburguesa, con queso',
    );
    expect(result.rows[0].normalizedValues.precioVenta).toBe(180.5);
    expect(result.rows[1].normalizedValues.nombre).toBe(
      'Combo Especial (Papas, Refresco)',
    );
    expect(result.rows[1].normalizedValues.precioVenta).toBe(250);
  });

  it('identifies unknown headers and flags them in summary without dropping row (AC-17)', () => {
    const rawCsv = [
      'nombre,precio_venta,columna_misteriosa,otra_columna',
      'Ensalada César,95,valor1,valor2',
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.unknownHeaders).toEqual(
      expect.arrayContaining(['columna_misteriosa', 'otra_columna']),
    );
    expect(result.rows[0].isValid).toBe(true);
    expect(result.rows[0].unknownColumns).toEqual([
      'columna_misteriosa',
      'otra_columna',
    ]);
  });

  it('strictly isolates Barcode and flags it as unsupported, NEVER copying to SKU (AC-51)', () => {
    const rawCsv = [
      'nombre,precio_venta,codigo_barras',
      'Cerveza Toña,50,743210987654',
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.unsupportedHeaders).toContain('codigo_barras');
    expect(result.rows[0].normalizedValues.sku).toBeNull();
    expect(result.rows[0].unsupportedFieldsDetected).toContain('codigo_barras');
    expect(result.rows[0].warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Barcode no soportado en Product Master V1, no se degrada a SKU',
        ),
      ]),
    );
  });

  it('strictly flags stock and cost as BOH enrichment columns, never loading them into Product Master (AC-24)', () => {
    const rawCsv = [
      'nombre,precio_venta,stock_inicial,costo_insumo',
      'Arroz Especial,30,100,18.5',
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.unsupportedHeaders).toEqual(
      expect.arrayContaining(['stock_inicial', 'costo_insumo']),
    );
    expect(result.rows[0].unsupportedFieldsDetected).toEqual(
      expect.arrayContaining(['stock_inicial', 'costo_insumo']),
    );
    expect(result.rows[0].warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Stock inicial pertenece a BOH Enrichment y Kardex',
        ),
      ]),
    );
  });

  it('detects missing required fields and negative prices as row errors (AC-18)', () => {
    const rawCsv = [
      'nombre,precio_venta',
      ',150', // Missing name
      'Bebida,-20', // Negative price
      'Plato Fuerte,invalido', // Non-numeric price
    ].join('\n');

    const result = parser.parseRawCsv(rawCsv);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(0);
    expect(result.errorRows).toBe(3);

    expect(result.rows[0].isValid).toBe(false);
    expect(result.rows[0].errors).toContain(
      'El nombre del producto es obligatorio',
    );

    expect(result.rows[1].isValid).toBe(false);
    expect(result.rows[1].errors).toContain(
      'El precio de venta no puede ser negativo',
    );

    expect(result.rows[2].isValid).toBe(false);
    expect(result.rows[2].errors).toEqual(
      expect.arrayContaining([expect.stringContaining('no es numérico')]),
    );
  });
});
