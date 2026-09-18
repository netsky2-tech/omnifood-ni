import * as fs from 'fs';
import * as path from 'path';
import { CanonicalCsvParserService } from './canonical-csv-parser.service';
import {
  CANONICAL_COLUMN_NAMES,
  CANONICAL_IMPORT_CONTRACT_V1,
  generateOfficialProductTemplateCsv,
} from './import-contract-version';

/**
 * Fixtures live under docs/onboarding/evidence/acceptance/fixtures at the
 * repository root (six directories above this spec file).
 */
const FIXTURES_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'docs',
  'onboarding',
  'evidence',
  'acceptance',
  'fixtures',
);

const OFFICIAL_TEMPLATE_HEADERS = [
  'nombre',
  'precio_venta',
  'unidad_venta',
  'sku',
  'categoria',
  'porcentaje_iva',
];

function readFixture(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName), 'utf-8');
}

describe('Acceptance CSV fixtures F2-F5 (founder pilot freeze)', () => {
  let parser: CanonicalCsvParserService;

  beforeEach(() => {
    parser = new CanonicalCsvParserService();
  });

  describe('F2 — clean canonical catalog', () => {
    it('parses 25 valid rows under official template headers with no unsupported columns', () => {
      const result = parser.parseRawCsv(readFixture('F2_csv_clean.csv'));

      expect(result.headers).toEqual(OFFICIAL_TEMPLATE_HEADERS);
      expect(result.unsupportedHeaders).toEqual([]);
      expect(result.unknownHeaders).toEqual([]);
      expect(result.totalRows).toBe(25);
      expect(result.validRows).toBe(25);
      expect(result.errorRows).toBe(0);
    });

    it('keeps every row sellable: positive price and unique product name (no duplicates)', () => {
      const result = parser.parseRawCsv(readFixture('F2_csv_clean.csv'));

      const names = result.rows.map((r) => r.normalizedValues.nombre);
      expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(25);

      for (const row of result.rows) {
        expect(row.isValid).toBe(true);
        expect(row.normalizedValues.precioVenta).toBeGreaterThan(0);
        expect(row.normalizedValues.porcentajeIva).toBeGreaterThanOrEqual(0);
        expect(row.normalizedValues.porcentajeIva).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('F3 — mixed valid/invalid rows with alias and unknown column', () => {
    it('maps contract-supported aliases and keeps the unknown column flagged', () => {
      const result = parser.parseRawCsv(readFixture('F3_csv_mixed.csv'));

      expect(result.normalizedHeaders['producto']).toBe('nombre');
      expect(result.normalizedHeaders['precioventa']).toBe('precio_venta');
      expect(result.unknownHeaders).toContain('fuente_insumo');
      expect(result.unsupportedHeaders).toEqual([]);
    });

    it('yields exactly 20 valid and 5 intentionally invalid rows', () => {
      const result = parser.parseRawCsv(readFixture('F3_csv_mixed.csv'));

      expect(result.totalRows).toBe(25);
      expect(result.validRows).toBe(20);
      expect(result.errorRows).toBe(5);
      expect(result.rows.slice(0, 20).every((r) => r.isValid)).toBe(true);
      expect(result.rows.slice(20).every((r) => !r.isValid)).toBe(true);
    });

    it('normalizes alias-header values into canonical product fields', () => {
      const result = parser.parseRawCsv(readFixture('F3_csv_mixed.csv'));

      expect(result.rows[0].normalizedValues).toMatchObject({
        nombre: 'Hamburguesa Clásica',
        precioVenta: 180,
        uom: 'UN',
        sku: 'HAM-01',
      });
      expect(result.rows[0].unknownColumns).toEqual(['fuente_insumo']);
      expect(result.rows[0].isValid).toBe(true);
    });

    it('encodes each invalid intent deterministically by row ordinal', () => {
      const result = parser.parseRawCsv(readFixture('F3_csv_mixed.csv'));

      const invalid = result.rows.slice(20);
      expect(invalid[0].errors).toContain(
        'El nombre del producto es obligatorio',
      );
      expect(invalid[1].errors).toContain(
        'El precio de venta no puede ser negativo',
      );
      expect(invalid[2].errors).toEqual([
        "El precio de venta 'N/A' no es numérico",
      ]);
      expect(invalid[3].errors).toEqual([
        "El precio de venta '' no es numérico",
      ]);
      expect(invalid[4].errors).toEqual([
        "El precio de venta '12.5.5' no es numérico",
      ]);
    });
  });

  describe('F4 — duplicate rows for REPLACE/SKIP/FAIL policy exercise', () => {
    it('parses all rows as valid: duplicates are a commit policy decision, not a parse error', () => {
      const result = parser.parseRawCsv(readFixture('F4_csv_duplicate.csv'));

      expect(result.unsupportedHeaders).toEqual([]);
      expect(result.unknownHeaders).toEqual([]);
      expect(result.totalRows).toBe(8);
      expect(result.validRows).toBe(8);
      expect(result.errorRows).toBe(0);
    });

    it('contains exactly three duplicated names plus two fresh rows', () => {
      const result = parser.parseRawCsv(readFixture('F4_csv_duplicate.csv'));

      const counts = new Map<string, number>();
      for (const row of result.rows) {
        const key = row.normalizedValues.nombre.trim().toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      const duplicated = [...counts.entries()].filter(
        ([, count]) => count === 2,
      );
      expect(duplicated).toHaveLength(3);
      // 8 rows total = 3 duplicate pairs + 2 fresh single rows.
      expect([...counts.values()].filter((c) => c === 1)).toHaveLength(2);
    });

    it('limits REPLACE deltas to Product Master sell price and UOM (AC-24, AC-52)', () => {
      // commitImport REPLACE updates ONLY Product Master fields (sellPrice,
      // uom). Within each duplicate pair, sku/categoria/porcentaje_iva stay
      // identical, and the pair differs at most in sell price and UOM, so the
      // fixture cannot exercise any replacement beyond Product Master scope.
      const result = parser.parseRawCsv(readFixture('F4_csv_duplicate.csv'));

      const byName = new Map<string, typeof result.rows>();
      for (const row of result.rows) {
        const key = row.normalizedValues.nombre.trim().toLowerCase();
        byName.set(key, [...(byName.get(key) || []), row]);
      }

      const pairs = [...byName.values()].filter((rows) => rows.length === 2);
      expect(pairs).toHaveLength(3);

      for (const [first, second] of pairs) {
        expect(second.normalizedValues.sku).toBe(first.normalizedValues.sku);
        expect(second.normalizedValues.categoria).toBe(
          first.normalizedValues.categoria,
        );
        expect(second.normalizedValues.porcentajeIva).toBe(
          first.normalizedValues.porcentajeIva,
        );
      }

      // Pair 1: price and UOM both change (full REPLACE observability).
      expect(pairs[0][1].normalizedValues.precioVenta).not.toBe(
        pairs[0][0].normalizedValues.precioVenta,
      );
      expect(pairs[0][1].normalizedValues.uom).not.toBe(
        pairs[0][0].normalizedValues.uom,
      );

      // Pair 2: only the sell price changes.
      expect(pairs[1][1].normalizedValues.precioVenta).not.toBe(
        pairs[1][0].normalizedValues.precioVenta,
      );
      expect(pairs[1][1].normalizedValues.uom).toBe(
        pairs[1][0].normalizedValues.uom,
      );

      // Pair 3: identical values (REPLACE is a no-op, SKIP keeps the original,
      // FAIL aborts the commit).
      expect(pairs[2][1].normalizedValues).toEqual(
        pairs[2][0].normalizedValues,
      );
    });
  });

  describe('F5 — legacy unsafe columns', () => {
    it('flags every documented legacy column as unsupported and none as unknown', () => {
      const result = parser.parseRawCsv(
        readFixture('F5_csv_legacy_unsafe.csv'),
      );

      expect(result.unsupportedHeaders).toEqual([
        'stock_inicial',
        'stock',
        'costo_insumo',
        'costo_promedio',
        'codigo_barras',
        'barcode',
      ]);
      expect(result.unknownHeaders).toEqual([]);
      for (const header of result.unsupportedHeaders) {
        expect(CANONICAL_IMPORT_CONTRACT_V1.unsupportedColumns).toContain(
          header,
        );
      }
    });

    it('keeps identity rows parseable: valid rows, no barcode-to-SKU degradation', () => {
      const result = parser.parseRawCsv(
        readFixture('F5_csv_legacy_unsafe.csv'),
      );

      expect(result.totalRows).toBe(4);
      expect(result.validRows).toBe(4);
      expect(result.errorRows).toBe(0);

      for (const row of result.rows) {
        expect(row.isValid).toBe(true);
        expect(row.normalizedValues.nombre).not.toBe('');
        expect(row.normalizedValues.precioVenta).toBeGreaterThan(0);
        expect(row.normalizedValues.sku).toBeNull();
        expect(row.unsupportedFieldsDetected).toHaveLength(6);
        expect(row.warnings).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Barcode no soportado'),
            expect.stringContaining('BOH Enrichment'),
          ]),
        );
      }
    });
  });

  describe('contract alignment', () => {
    it('F2 headers match the official template CSV generated from the contract', () => {
      const templateHeaderLine =
        generateOfficialProductTemplateCsv().split('\n')[0];
      const templateHeaders = templateHeaderLine.split(',');
      expect(templateHeaders).toEqual(OFFICIAL_TEMPLATE_HEADERS);
      expect(OFFICIAL_TEMPLATE_HEADERS).toEqual([...CANONICAL_COLUMN_NAMES]);
    });
  });
});
