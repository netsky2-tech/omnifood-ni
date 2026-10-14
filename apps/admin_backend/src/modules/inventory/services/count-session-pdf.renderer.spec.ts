import * as zlib from 'node:zlib';
import {
  renderCountSessionPdf,
  type CountSessionPrintDocument,
  type CountSessionPrintEntry,
} from './count-session-pdf.renderer';
import type { CompanyIdentity } from '../../tenant/services/company-identity.service';

/**
 * PDF content verification technique (why this spec is not `buffer.length > 100`):
 *
 * The sales-export precedent asserts only `buffer.length > 100`, which a blank
 * one-page PDF passes. Here the content streams are rendered UNCOMPRESSED
 * (`compress: false`), and pdfkit 0.20 emits every drawn text run as hex
 * strings `<...>` inside TJ arrays, split by kerning adjustments. The
 * extractor below decodes every hex chunk in document order and joins them,
 * which reconstructs the printed text even across kerning splits. Page
 * objects and page-tree counts are readable in the raw bytes, so page count,
 * per-page footers and per-page identity are all asserted from the actual
 * rendered content, not from metadata.
 *
 * Encoding caveat (deliberate): pdfkit maps text to WinAnsi. Characters in
 * the Latin-1 range (á é í ó ú ñ) round-trip through a latin1 buffer decode,
 * and this document avoids the punctuation WinAnsi re-maps (em dashes, curly
 * quotes), so byte-level assertions below are exact.
 */

/** Reconstructs the printed text of an uncompressed pdfkit PDF buffer. */
export const extractPrintedText = (buffer: Buffer): string => {
  const raw = buffer.toString('latin1');
  let out = '';
  const operator =
    /\[((?:<[^>]*>|-?\d+(?:\.\d+)?|\s)*)\]\s*TJ|\(((?:\\.|[^()\\])*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = operator.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      const hexes = match[1].match(/<([^>]*)>/g) ?? [];
      for (const hex of hexes) {
        out += Buffer.from(hex.slice(1, -1), 'hex').toString('latin1');
      }
    } else if (match[2] !== undefined) {
      out += match[2].replace(/\\([()\\])/g, '$1');
    }
  }
  return out;
};

export const pageCountOf = (buffer: Buffer): number =>
  (buffer.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? [])
    .length;

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

const PRESENT_IDENTITY = {
  name: 'Pupusería La Casita, S.A.',
  ruc: 'J0310001234567',
  address: 'Barrio El Huente, León',
  phone: '+505 2512 3456',
  email: 'facturacion@lacasita.ni',
};

const IDENTITY_FIELDS = ['name', 'ruc', 'address', 'phone', 'email'] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];

const FIELD_LABELS: Record<IdentityField, string> = {
  name: '',
  ruc: 'RUC',
  address: 'Dirección',
  phone: 'Teléfono',
  email: 'Correo',
};

/** Builds the full 2^5 matrix of present/absent company identity values. */
const makeIdentity = (absentMask: number): CompanyIdentity => {
  const isAbsent = (field: IdentityField): boolean =>
    (absentMask & (1 << IDENTITY_FIELDS.indexOf(field))) !== 0;
  return {
    name: isAbsent('name')
      ? { present: false }
      : { present: true, value: PRESENT_IDENTITY.name },
    ruc: isAbsent('ruc')
      ? { present: false }
      : { present: true, value: PRESENT_IDENTITY.ruc },
    address: isAbsent('address')
      ? { present: false }
      : { present: true, value: PRESENT_IDENTITY.address },
    phone: isAbsent('phone')
      ? { present: false }
      : { present: true, value: PRESENT_IDENTITY.phone },
    email: isAbsent('email')
      ? { present: false }
      : { present: true, value: PRESENT_IDENTITY.email },
  };
};

const makeEntries = (
  count: number,
  prefix = 'Insumo',
): CountSessionPrintEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    insumoName: `${prefix}-${String(i + 1).padStart(3, '0')} harina especial`,
    uom: 'kg',
    theoreticalQuantity: 8.25,
    countedQuantity: 12.5,
    countedAtIso: '2026-10-14T09:35:00.000Z',
    actorLabel: 'María López',
    notes: null,
    isDisputed: false,
    isApproved: true,
  }));

const makeDocument = (
  entries: CountSessionPrintEntry[],
  overrides: Partial<CountSessionPrintDocument> = {},
): CountSessionPrintDocument => ({
  sessionId: 'SESS-2026-10-14-0001',
  warehouseName: 'Bodega Central',
  status: 'POSTED',
  cutoffDay: '2026-10-14',
  postedDay: '2026-10-14',
  notes: null,
  totalEntries: entries.length,
  entries,
  generatedAtIso: '2026-10-14T21:30:00.000Z',
  ...overrides,
});

const renderText = async (
  document: CountSessionPrintDocument,
  identity: CompanyIdentity,
): Promise<{ buffer: Buffer; text: string; pages: number }> => {
  const buffer = await renderCountSessionPdf(document, identity, {
    compress: false,
  });
  return {
    buffer,
    text: extractPrintedText(buffer),
    pages: pageCountOf(buffer),
  };
};

describe('count-session-pdf.renderer — the signed count list (R19 T3, S14/S15/S15-bis)', () => {
  it('produces a real PDF whose printed text is extractable (technique guard)', async () => {
    const { buffer, text, pages } = await renderText(
      makeDocument(makeEntries(2)),
      makeIdentity(0),
    );
    expect(buffer.slice(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pages).toBe(1);
    // If this guard fails, the extractor is broken and every assertion
    // below would be vacuously green — fix the technique, not the doc.
    expect(text).toContain('LISTA DE CONTEO FÍSICO DE INVENTARIO');
  });

  it('S14: the header is a structured formal block, not a data dump', async () => {
    const { text } = await renderText(
      makeDocument(makeEntries(2)),
      makeIdentity(0),
    );
    expect(text).toContain('Pupusería La Casita, S.A.');
    expect(text).toContain('RUC: J0310001234567');
    expect(text).toContain('Dirección: Barrio El Huente, León');
    expect(text).toContain('Teléfono: +505 2512 3456');
    expect(text).toContain('Correo: facturacion@lacasita.ni');
    expect(text).toContain('Sesión: SESS-2026-10-14-0001');
    expect(text).toContain('Depósito: Bodega Central');
    expect(text).toContain('Fecha del conteo: 2026-10-14');
    expect(text).toContain('Registrado: 2026-10-14');
    expect(text).toContain('Estado: POSTED');
    expect(text).toContain('Entradas registradas: 2');
    // The count table itself.
    expect(text).toContain('Insumo');
    expect(text).toContain('Teórico');
    expect(text).toContain('Contado');
    expect(text).toContain('Contó');
  });

  it.each(Array.from({ length: 32 }, (_, mask) => mask))(
    'S15: absence combination %# prints each field as its value or the declared marker, never null/undefined/empty',
    async (absentMask) => {
      const { text, pages } = await renderText(
        makeDocument(makeEntries(2)),
        makeIdentity(absentMask),
      );

      for (const field of IDENTITY_FIELDS) {
        const label = FIELD_LABELS[field];
        const prefix = label === '' ? '' : `${label}: `;
        const expected =
          (absentMask & (1 << IDENTITY_FIELDS.indexOf(field))) !== 0
            ? `${prefix}No registrado`
            : `${prefix}${PRESENT_IDENTITY[field]}`;
        expect(text).toContain(expected);
      }

      expect(text).not.toMatch(/\bnull\b/);
      expect(text).not.toMatch(/\bundefined\b/);
      expect(pages).toBeGreaterThanOrEqual(1);
      // S15-bis even at one page: the signature block is present.
      expect(
        countOccurrences(text, 'Firma de quien realizó el recuento físico'),
      ).toBe(pages);
    },
  );

  it('R-05 / S15-bis: a paginated list carries signature, date and repeated identity on EVERY page', async () => {
    const entries = makeEntries(140, 'Artículo');
    const { text, pages } = await renderText(
      makeDocument(entries),
      makeIdentity(0),
    );

    expect(pages).toBeGreaterThan(1);

    // Signature space on every page — the legal core, not a nicety.
    expect(
      countOccurrences(text, 'Firma de quien realizó el recuento físico'),
    ).toBe(pages);

    // Date space on every page.
    expect(countOccurrences(text, 'Fecha de la firma')).toBe(pages);

    // Every page repeats the document identity (session + date), so a loose
    // sheet stays attributable: header block + footer line = twice per page.
    expect(countOccurrences(text, 'SESS-2026-10-14-0001')).toBe(2 * pages);
    expect(countOccurrences(text, 'Fecha del conteo: 2026-10-14')).toBe(pages);

    // Page numbering is complete and consistent: Página 1..N de N.
    const pageNumbers = [...text.matchAll(/Página (\d+) de (\d+)/g)];
    expect(pageNumbers).toHaveLength(pages);
    for (const [, _current, total] of pageNumbers) {
      expect(Number(total)).toBe(pages);
    }
    expect(pageNumbers.map(([, current]) => Number(current))).toEqual(
      Array.from({ length: pages }, (_, i) => i + 1),
    );
  });

  it('paginates BETWEEN entries, never inside one', async () => {
    const entries = makeEntries(120, 'Artículo');
    const { text, pages } = await renderText(
      makeDocument(entries),
      makeIdentity(0),
    );

    expect(pages).toBeGreaterThan(1);
    // Each entry is rendered exactly once: a break inside an entry block
    // would split (or duplicate) its printed identity.
    for (const entry of entries) {
      expect(countOccurrences(text, entry.insumoName)).toBe(1);
    }
    expect(text).toContain(entries[0].insumoName);
    expect(text).toContain(entries[entries.length - 1].insumoName);
  });

  it('prints the frozen entry evidence: quantities, uom, who counted and when', async () => {
    const entries: CountSessionPrintEntry[] = [
      {
        position: 1,
        insumoName: 'Harina de trigo',
        uom: 'kg',
        theoreticalQuantity: 8.25,
        countedQuantity: 7.5,
        countedAtIso: '2026-10-14T09:35:00.000Z',
        actorLabel: 'María López',
        notes: 'Bolsa abierta encontrada en anaquel',
        isDisputed: true,
        isApproved: false,
      },
    ];
    const { text } = await renderText(makeDocument(entries), makeIdentity(0));

    expect(text).toContain('Harina de trigo');
    expect(text).toContain('kg');
    expect(text).toContain('8.25');
    expect(text).toContain('7.5');
    expect(text).toContain('2026-10-14 09:35');
    expect(text).toContain('María López');
    expect(text).toContain('DISPUTADA');
    expect(text).toContain('Notas: Bolsa abierta encontrada en anaquel');
  });

  it('prints declared markers for absent entry evidence, never null', async () => {
    const entries: CountSessionPrintEntry[] = [
      {
        position: 1,
        insumoName: 'Azúcar morena',
        uom: 'lb',
        theoreticalQuantity: 4,
        countedQuantity: 4,
        countedAtIso: null,
        actorLabel: null,
        notes: null,
        isDisputed: false,
        isApproved: true,
      },
    ];
    const { text } = await renderText(makeDocument(entries), makeIdentity(0));

    expect(text).toContain('sin dato');
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).not.toMatch(/\bundefined\b/);
  });

  it('prints the session notes line when the session carries notes', async () => {
    const { text } = await renderText(
      makeDocument(makeEntries(1), { notes: 'Conteo de cierre trimestral' }),
      makeIdentity(0),
    );
    expect(text).toContain('Notas de la sesión: Conteo de cierre trimestral');
  });

  it('production path (compressed): the shipped bytes carry the same printed content', async () => {
    // The other tests render uncompressed to read text directly; THIS one
    // renders exactly as production does (compress defaults to true) and
    // inflates the content streams with zlib, proving the compressed bytes
    // the endpoint actually serves are not a blank page.
    const buffer = await renderCountSessionPdf(
      makeDocument(makeEntries(2)),
      makeIdentity(0),
    );
    const raw = buffer.toString('latin1');
    let inflated = '';
    const stream = /stream\r?\n([\s\S]*?)endstream/g;
    let match: RegExpExecArray | null;
    while ((match = stream.exec(raw)) !== null) {
      try {
        inflated += zlib
          .inflateSync(Buffer.from(match[1], 'latin1'))
          .toString('latin1');
      } catch {
        // Not every stream is deflate-compressed; non-inflatable ones carry no text.
      }
    }

    const printed = extractPrintedText(Buffer.from(inflated, 'latin1'));
    expect(printed).toContain('LISTA DE CONTEO FÍSICO DE INVENTARIO');
    expect(printed).toContain('Firma de quien realizó el recuento físico');
    expect(pageCountOf(buffer)).toBe(1);
  });
});
