import {
  UnconfiguredConversionError,
  UOM_CATALOG,
  UOM_ANCHORS,
  resolveUom,
  validateInsumoConversion,
} from './uom-catalog';

/**
 * Unit acceptance for the platform UOM catalog (Zona A, S1-S3).
 *
 * The catalog is a PROTOCOL: universal units carry exact physical anchors
 * (never a "default 1"), container/serving units carry none (their conversion
 * is per-insumo business data), and the S3 invariant rejects the untouched
 * factor-1 default across two different units with an actionable message.
 */
describe('uom-catalog (platform)', () => {
  describe('catalog integrity', () => {
    it('carries the exact physical anchors for every universal unit', () => {
      const byCode = new Map(UOM_CATALOG.map((e) => [e.code, e]));

      expect(byCode.get('lb')?.factorToAnchor).toBe(453.59237);
      expect(byCode.get('oz')?.factorToAnchor).toBe(28.349523125);
      expect(byCode.get('kg')?.factorToAnchor).toBe(1000);
      expect(byCode.get('l')?.factorToAnchor).toBe(1000);
      expect(byCode.get('fl_oz')?.factorToAnchor).toBeCloseTo(
        29.5735295625,
        10,
      );
      expect(byCode.get('cup')?.factorToAnchor).toBe(240);
      expect(byCode.get('gal_us')?.factorToAnchor).toBeCloseTo(3785.411784, 6);
      expect(byCode.get('docena')?.factorToAnchor).toBe(12);
    });

    it('never gives container/serving units a universal factor', () => {
      for (const entry of UOM_CATALOG) {
        if (entry.dimension === 'container' || entry.dimension === 'serving') {
          expect(entry.factorToAnchor).toBeNull();
        }
      }
    });

    it('declares one anchor per physical dimension', () => {
      expect(UOM_ANCHORS).toEqual({ mass: 'g', volume: 'ml', count: 'unidad' });
    });
  });

  describe('resolveUom', () => {
    it('resolves Spanish aliases, accents and plurals to platform codes', () => {
      expect(resolveUom('libra')?.code).toBe('lb');
      expect(resolveUoM_Helper('Libras ')).toBe('lb');
      expect(resolveUom('galón')?.code).toBe('gal_us');
      expect(resolveUom('GALON')?.code).toBe('gal_us');
      expect(resolveUom('mililitros')?.code).toBe('ml');
      expect(resolveUom('unidades')?.code).toBe('unidad');
      // T10/F2b heal: the industry template seed carries uppercase 'UN'
      // (template_products.uom, template_insumos purchase/consumption uoms).
      // resolveUom normalizes to lowercase, so the alias 'un' makes every
      // already-applied tenant row resolve to the unidad entry.
      expect(resolveUom('UN')?.code).toBe('unidad');
      expect(resolveUom('UN')?.dimension).toBe('count');
      expect(resolveUom('porciones')?.code).toBe('porcion');
      expect(resolveUom('frasco')?.dimension).toBe('container');
    });

    it('returns null for unknown units (callers decide how to fail)', () => {
      expect(resolveUom('medida-extraterrestre')).toBeNull();
      expect(resolveUom('')).toBeNull();
    });
  });

  describe('validateInsumoConversion — S3 invariant', () => {
    it('accepts an identity across spellings with factor 1', () => {
      expect(() =>
        validateInsumoConversion('unidad', 'unidades', 1),
      ).not.toThrow();
      expect(() =>
        validateInsumoConversion('bolsa', 'BOLSAS', 1),
      ).not.toThrow();
    });

    it('rejects the untouched factor-1 default across two different units', () => {
      // The exact seeded defect: frasco → porciones, factor 1.
      expect(() => validateInsumoConversion('frasco', 'porciones', 1)).toThrow(
        /Conversión no configurada[\s\S]*contenido real/,
      );
      expect(() => validateInsumoConversion('paquete', 'gramos', 1)).toThrow(
        UnconfiguredConversionError,
      );
    });

    it('accepts a container content declaration with a real factor', () => {
      // Honey jar declared as 60 servings — business data, never platform.
      expect(() =>
        validateInsumoConversion('frasco', 'porciones', 60),
      ).not.toThrow();
    });

    it('enforces the platform anchor for universal same-dimension pairs', () => {
      expect(() =>
        validateInsumoConversion('libra', 'gramos', 453.59237),
      ).not.toThrow();
      expect(() => validateInsumoConversion('litro', 'ml', 1000)).not.toThrow();

      // The seeded "454" approximation is no longer silently accepted: the
      // catalog is authoritative and exact.
      expect(() => validateInsumoConversion('libra', 'gramos', 454)).toThrow(
        /el catálogo establece 453\.59237/,
      );
    });

    it('accepts the four-decimal storage rounding of the anchor (numeric(12,4))', () => {
      // The operator enters the exact anchor, the column stores four decimals,
      // and the next write that touches a UOM field re-validates the STORED
      // value. That round trip must not reject the value the catalog asked for.
      expect(() => validateInsumoConversion('lb', 'kg', 0.4536)).not.toThrow();
      expect(() =>
        validateInsumoConversion('oz', 'g', 28.3495),
      ).not.toThrow();
      // A materially different factor is still rejected.
      expect(() => validateInsumoConversion('lb', 'kg', 0.45)).toThrow(
        /el catálogo establece/,
      );
    });

    it('rejects cross-dimension universal pairs (mass vs volume needs per-insumo density)', () => {
      expect(() => validateInsumoConversion('litro', 'gramos', 1000)).toThrow(
        /No existe conversión universal/,
      );
    });

    it('rejects unknown units and non-positive factors with actionable messages', () => {
      expect(() =>
        validateInsumoConversion('medida-rara', 'gramos', 1),
      ).toThrow(/no está en el catálogo/);
      expect(() => validateInsumoConversion('kg', 'g', 0)).toThrow(
        /debe ser > 0/,
      );
      expect(() => validateInsumoConversion('kg', 'g', -1)).toThrow(
        /debe ser > 0/,
      );
    });

    it('rejects a factor other than 1 for a same-unit pair', () => {
      expect(() => validateInsumoConversion('kg', 'kg', 2)).toThrow(
        /misma unidad/,
      );
    });
  });
});

/** Small indirection so the plural/accent case reads naturally above. */
function resolveUoM_Helper(raw: string): string | null {
  return resolveUom(raw)?.code ?? null;
}
