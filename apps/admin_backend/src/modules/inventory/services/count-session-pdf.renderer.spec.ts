import * as zlib from 'node:zlib';
import {
  COUNT_SESSION_PDF_COLUMN_X_RANGES,
  COUNT_SESSION_PDF_CONTENT_AREA,
  COUNT_SESSION_PDF_MIN_COLUMN_GAP,
  renderCountSessionPdf,
  type CountSessionPdfLayoutTrace,
  type CountSessionPdfTraceElement,
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

/** Builds a structurally valid 2x1 RGB PNG (IHDR + IDAT + IEND, CRCs set). */
const buildTestPng = (left: number, right: number): Buffer => {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = (data: Buffer): number => {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const raw = Buffer.from([0, left, 128, 64, right, 200, 90]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const hasEmbeddedImage = (buffer: Buffer): boolean =>
  buffer.toString('latin1').includes('/Subtype /Image');

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

/**
 * LAYOUT BLIND SPOT, closed (S14 fix): content presence could not see two
 * texts drawn at the same coordinates — that is how a document with notes
 * printed OVER the table passed. These helpers assert GEOMETRY from the
 * renderer's own layout trace: page, box and role of every drawn element.
 */

/** Boxes overlap only if their intersection exceeds the tolerance. */
const TRACE_EPSILON = 0.25;

const rectsOverlap = (
  a: Pick<CountSessionPdfTraceElement, 'x' | 'y' | 'width' | 'height'>,
  b: Pick<CountSessionPdfTraceElement, 'x' | 'y' | 'width' | 'height'>,
): boolean =>
  a.x < b.x + b.width - TRACE_EPSILON &&
  b.x < a.x + a.width - TRACE_EPSILON &&
  a.y < b.y + b.height - TRACE_EPSILON &&
  b.y < a.y + a.height - TRACE_EPSILON;

const renderWithTrace = async (
  document: CountSessionPrintDocument,
  identity: CompanyIdentity,
  logo?: Parameters<typeof renderCountSessionPdf>[3],
): Promise<{
  buffer: Buffer;
  text: string;
  pages: number;
  trace: CountSessionPdfLayoutTrace;
}> => {
  let trace: CountSessionPdfLayoutTrace | undefined;
  const buffer = await renderCountSessionPdf(
    document,
    identity,
    {
      compress: false,
      trace: (received) => {
        trace = received;
      },
    },
    logo,
  );
  // If the renderer stops emitting a trace, every geometric assertion below
  // would be vacuous — fail loudly instead.
  expect(trace).toBeDefined();
  expect(trace.elements.length).toBeGreaterThan(0);
  return {
    buffer,
    text: extractPrintedText(buffer),
    pages: pageCountOf(buffer),
    trace: trace,
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
    expect(text).toContain('Fecha del conteo: 14/10/2026');
    expect(text).toContain('Registrado: 14/10/2026');
    // S14: the state is a word on paper, not a storage token.
    expect(text).toContain('Estado: Conciliada');
    expect(text).not.toContain('Estado: POSTED');
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
    expect(countOccurrences(text, 'Fecha del conteo: 14/10/2026')).toBe(pages);

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
    // S14: dates a person reads (the counted act, Managua local: 09:35Z is
    // 03:35 in Nicaragua).
    expect(text).toContain('14/10/2026 03:35');
    expect(text).not.toContain('2026-10-14 09:35');
    expect(text).toContain('María López');
    expect(text).toContain('DISPUTADA');
    // The entry's note is labeled with its insumo — distinguishable from the
    // session's note — and it is drawn BELOW its row, never over it.
    expect(text).toContain(
      'Notas de la entrada "Harina de trigo": Bolsa abierta encontrada en anaquel',
    );
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

  describe('P3 slice 1 — the company logo original (S5/S15)', () => {
    const renderWithLogo = async (
      logo: Parameters<typeof renderCountSessionPdf>[3],
    ): Promise<{ buffer: Buffer; text: string; pages: number }> => {
      const buffer = await renderCountSessionPdf(
        makeDocument(makeEntries(1)),
        makeIdentity(0),
        { compress: false },
        logo,
      );
      return {
        buffer,
        text: extractPrintedText(buffer),
        pages: pageCountOf(buffer),
      };
    };

    it('embeds the ORIGINAL bytes when a logo is present and the header text survives', async () => {
      const { buffer, text, pages } = await renderWithLogo({
        present: true,
        bytes: buildTestPng(10, 20),
        contentType: 'image/png',
      });
      // The image XObject is IN the document — not just "a buffer exists".
      expect(hasEmbeddedImage(buffer)).toBe(true);
      expect(buffer.toString('latin1')).toContain('/Width 2');
      expect(buffer.toString('latin1')).toContain('/Height 1');
      // S15: the formal document is intact around the image.
      expect(text).toContain('LISTA DE CONTEO FÍSICO DE INVENTARIO');
      expect(text).toContain('Pupusería La Casita, S.A.');
      expect(text).toContain('Firma de quien realizó el recuento físico');
      expect(pages).toBe(1);
    });

    it('a tenant with NO logo produces the same valid, formal document', async () => {
      const { buffer, text, pages } = await renderWithLogo({
        present: false,
      });
      expect(hasEmbeddedImage(buffer)).toBe(false);
      expect(text).toContain('LISTA DE CONTEO FÍSICO DE INVENTARIO');
      expect(text).toContain('Pupusería La Casita, S.A.');
      expect(text).toContain('RUC: J0310001234567');
      expect(text).toContain('Firma de quien realizó el recuento físico');
      expect(pages).toBe(1);
    });

    it('a logo that cannot be decoded or rendered never takes the document down', async () => {
      // PNG signature followed by garbage: pdfkit's parser throws on the
      // truncated chunk walk — the renderer must skip the image and still
      // produce the whole signed document.
      const corrupt = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from([0x00, 0x00, 0xff, 0xff, 0x7f, 0x7f, 0x7f, 0x7f]),
      ]);
      const { buffer, text, pages } = await renderWithLogo({
        present: true,
        bytes: corrupt,
        contentType: 'image/png',
      });
      expect(hasEmbeddedImage(buffer)).toBe(false);
      expect(text).toContain('LISTA DE CONTEO FÍSICO DE INVENTARIO');
      expect(text).toContain('Pupusería La Casita, S.A.');
      expect(text).toContain('Firma de quien realizó el recuento físico');
      expect(pages).toBe(1);
    });

    it('the logo repeats on EVERY page (S15-bis attribution) without duplicating the bytes', async () => {
      const bytes = buildTestPng(10, 20);
      const buffer = await renderCountSessionPdf(
        makeDocument(makeEntries(60)),
        makeIdentity(0),
        { compress: false },
        { present: true, bytes, contentType: 'image/png' },
      );
      expect(pageCountOf(buffer)).toBeGreaterThan(1);
      expect(hasEmbeddedImage(buffer)).toBe(true);
      // One embedded image object, not one copy per page: the raw bytes of
      // the IDAT stream appear ONCE in the document.
      const idat = zlib.deflateSync(Buffer.from([0, 10, 128, 64, 20, 200, 90]));
      const occurrences =
        buffer.toString('latin1').split(idat.toString('latin1')).length - 1;
      expect(occurrences).toBe(1);
    });
  });

  /**
   * THE BLIND SPOT, CLOSED (S14 fix). The structural assertions above
   * verify that content APPEARS — which is how a document with notes drawn
   * ON TOP of the table rows and cascading column headers passed. The
   * renderer now exposes its layout trace (page, box, role of every drawn
   * element), and these tests assert the GEOMETRY: two texts at the same
   * coordinates are a defect by itself, whatever they say.
   */
  describe('layout trace — geometry the content assertions could not see (S14 fix)', () => {
    const makeNotedEntries = (count: number): CountSessionPrintEntry[] =>
      makeEntries(count, 'Artículo').map((entry, i) => ({
        ...entry,
        notes:
          i % 3 === 0
            ? `Revisión pendiente del lote ${i + 1} en repisa B`
            : null,
        isDisputed: i % 5 === 0,
        isApproved: i % 5 !== 0,
      }));

    const describeBox = (element: CountSessionPdfTraceElement): string =>
      `[${element.kind} p${element.page} "${element.text.slice(0, 40)}" @ (${element.x},${element.y}) ${element.width}x${element.height}]`;

    it('no two drawn elements share coordinates — text over text is a defect by itself', async () => {
      const { trace } = await renderWithTrace(
        makeDocument(makeNotedEntries(24), {
          notes: 'Conteo de cierre quincenal con mermas en revisión',
        }),
        makeIdentity(0),
      );
      const elements = trace.elements;
      // The scenario must actually exercise the defect class: entries with
      // notes AND cells on the same pages.
      expect(elements.some((e) => e.kind === 'entry-note')).toBe(true);
      expect(elements.some((e) => e.kind === 'cell')).toBe(true);

      for (let i = 0; i < elements.length; i += 1) {
        for (let j = i + 1; j < elements.length; j += 1) {
          const a = elements[i];
          const b = elements[j];
          if (a.page !== b.page) continue;
          if (rectsOverlap(a, b)) {
            throw new Error(
              `Drawn elements overlap (text over text): ${describeBox(a)} vs ${describeBox(b)}`,
            );
          }
        }
      }
    });

    it('column headers sit on ONE row, each aligned with its column', async () => {
      const { trace } = await renderWithTrace(
        makeDocument(makeEntries(140, 'Artículo')),
        makeIdentity(0),
      );
      const labels = trace.elements.filter((e) => e.kind === 'column-label');
      const EXPECTED_LABELS = [
        '#',
        'Insumo',
        'UM',
        'Teórico',
        'Contado',
        'Fecha',
        'Contó',
      ];
      // The seven labels appear once per page, in column order.
      const labelPages = [...new Set(labels.map((l) => l.page))].sort(
        (a, b) => a - b,
      );
      expect(labelPages.length).toBeGreaterThan(1);
      expect(labels.length).toBe(EXPECTED_LABELS.length * labelPages.length);
      for (const page of labelPages) {
        expect(
          labels.filter((l) => l.page === page).map((l) => l.text),
        ).toEqual(EXPECTED_LABELS);
      }

      // On EVERY page the seven labels share one y (a cascade — each header
      // inheriting the previous header's cursor advance — shifts them down).
      for (const page of labelPages) {
        const pageLabels = labels.filter((l) => l.page === page);
        const ys = pageLabels.map((l) => l.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(
          TRACE_EPSILON,
        );
      }

      // And each label sits INSIDE its own column's x range, so a reader can
      // map header to column.
      const LABEL_TO_COLUMN = {
        '#': 'position',
        Insumo: 'insumo',
        UM: 'uom',
        Teórico: 'theoretical',
        Contado: 'counted',
        Fecha: 'countedAt',
        Contó: 'actor',
      } as const;
      for (const label of labels) {
        const column =
          COUNT_SESSION_PDF_COLUMN_X_RANGES[
            LABEL_TO_COLUMN[label.text as keyof typeof LABEL_TO_COLUMN]
          ];
        expect(column).toBeDefined();
        expect(label.x).toBeGreaterThanOrEqual(column.x - TRACE_EPSILON);
        expect(label.x + label.width).toBeLessThanOrEqual(
          column.x + column.width + TRACE_EPSILON,
        );
      }
    });

    it('entry notes sit strictly BELOW their row band, labeled with their insumo', async () => {
      const { trace } = await renderWithTrace(
        makeDocument(makeNotedEntries(30)),
        makeIdentity(0),
      );
      const cells = trace.elements.filter((e) => e.kind === 'cell');
      const notes = trace.elements.filter((e) => e.kind === 'entry-note');
      expect(notes.length).toBeGreaterThanOrEqual(10);

      for (const note of notes) {
        // The note is a labeled sentence naming its entry — never a run-on
        // string a reader cannot attribute.
        expect(note.text).toMatch(/^Notas de la entrada "/);

        const cellsAbove = cells.filter(
          (c) => c.page === note.page && c.y < note.y - TRACE_EPSILON,
        );
        expect(cellsAbove.length).toBeGreaterThan(0);
        // The nearest row above: its band bottom must be at or above the
        // note's top. A note drawn ON its row (the shipped defect) puts the
        // row's cells at note.y and fails the strict-below assertion.
        const nearestRowTop = Math.max(...cellsAbove.map((c) => c.y));
        const bandBottom = Math.max(
          ...cellsAbove
            .filter((c) => Math.abs(c.y - nearestRowTop) <= TRACE_EPSILON)
            .map((c) => c.y + c.height),
        );
        expect(note.y).toBeGreaterThanOrEqual(bandBottom - TRACE_EPSILON);
      }
    });

    it('row bands are monotonic and every element stays inside the content area, above the signature footer', async () => {
      const { trace, pages } = await renderWithTrace(
        makeDocument(makeNotedEntries(140), {
          notes: 'Conteo de cierre trimestral',
        }),
        makeIdentity(0),
      );
      expect(pages).toBeGreaterThan(1);

      const cells = trace.elements.filter((e) => e.kind === 'cell');
      // Group cells into rows per page (same y within tolerance).
      for (const page of new Set(cells.map((c) => c.page))) {
        const pageCells = cells.filter((c) => c.page === page);
        const rowTops = [
          ...new Set(pageCells.map((c) => Math.round(c.y * 4) / 4)),
        ].sort((a, b) => a - b);
        // Monotonic: each row starts strictly below the previous one — no
        // duplicated or reordered entries.
        for (let i = 1; i < rowTops.length; i += 1) {
          expect(rowTops[i]).toBeGreaterThan(rowTops[i - 1]);
        }
        // Every band bottom stays inside the printable area: a row clipped
        // into the footer zone (the capture's clipped last row) fails here.
        for (const cell of pageCells) {
          expect(cell.y + cell.height).toBeLessThanOrEqual(
            COUNT_SESSION_PDF_CONTENT_AREA.bottom + TRACE_EPSILON,
          );
        }
      }

      // Every drawn element respects the page's horizontal margins.
      for (const element of trace.elements) {
        expect(element.x).toBeGreaterThanOrEqual(
          COUNT_SESSION_PDF_CONTENT_AREA.x - TRACE_EPSILON,
        );
        expect(element.x + element.width).toBeLessThanOrEqual(
          COUNT_SESSION_PDF_CONTENT_AREA.x +
            COUNT_SESSION_PDF_CONTENT_AREA.width +
            TRACE_EPSILON,
        );
      }
    });

    /**
     * SPACING invariant (the `7.514/10/2026` defect): two values sharing a
     * line must be separated by at least the declared minimum, so the paper
     * can never read them as one token. Overlap alone does not catch this —
     * two glyph boxes 2pt apart PASS an overlap check while concatenating
     * on paper — which is why the gap, not the intersection, is asserted.
     */
    it('values sharing a line keep at least the declared minimum gap', async () => {
      const { trace } = await renderWithTrace(
        makeDocument(makeNotedEntries(24), {
          notes: 'Conteo de cierre quincenal',
        }),
        makeIdentity(0),
      );
      const elements = trace.elements;
      expect(elements.filter((e) => e.kind === 'cell').length).toBeGreaterThan(
        10,
      );

      for (let i = 0; i < elements.length; i += 1) {
        for (let j = i + 1; j < elements.length; j += 1) {
          const a = elements[i];
          const b = elements[j];
          if (a.page !== b.page) continue;
          const verticalOverlap =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          if (verticalOverlap <= TRACE_EPSILON) continue;
          const gap = a.x < b.x ? b.x - (a.x + a.width) : a.x - (b.x + b.width);
          if (gap < COUNT_SESSION_PDF_MIN_COLUMN_GAP - TRACE_EPSILON) {
            throw new Error(
              `Values sharing a line are only ${gap.toFixed(2)}pt apart (minimum ${COUNT_SESSION_PDF_MIN_COLUMN_GAP}pt) and can read as one token: ${describeBox(a)} vs ${describeBox(b)}`,
            );
          }
        }
      }
    });

    /**
     * BAND COMPOSITION invariant: the logo and the company-data block share
     * ONE header band — the logo vertically inside the data block's band and
     * strictly to its left — not two stacked rows.
     */
    it('the logo and the company-data block share one header band, logo left of the data', async () => {
      const { trace, pages } = await renderWithTrace(
        makeDocument(makeEntries(60, 'Artículo')),
        makeIdentity(0),
        {
          present: true,
          bytes: buildTestPng(10, 20),
          contentType: 'image/png',
        },
      );
      expect(pages).toBeGreaterThan(1);

      for (const page of new Set(trace.elements.map((e) => e.page))) {
        const logo = trace.elements.find(
          (e) => e.page === page && e.kind === 'logo',
        );
        const data = trace.elements.filter(
          (e) =>
            e.page === page &&
            (e.kind === 'company-name' || e.kind === 'company-identity'),
        );
        expect(data.length).toBeGreaterThan(0);
        if (!logo) continue; // a skipped logo is S15 absence, not a band defect

        const dataTop = Math.min(...data.map((e) => e.y));
        const dataBottom = Math.max(...data.map((e) => e.y + e.height));
        const dataLeft = Math.min(...data.map((e) => e.x));
        // Vertically INSIDE the data band (same band, not stacked above it).
        if (
          logo.y < dataTop - TRACE_EPSILON ||
          logo.y + logo.height > dataBottom + TRACE_EPSILON
        ) {
          throw new Error(
            `The logo is NOT in the company-data band: logo spans y ${logo.y}..${logo.y + logo.height}, data band spans y ${dataTop}..${dataBottom} on page ${page}`,
          );
        }
        // And strictly LEFT of the data, by the declared minimum gap.
        const gapToData = dataLeft - (logo.x + logo.width);
        if (gapToData < COUNT_SESSION_PDF_MIN_COLUMN_GAP - TRACE_EPSILON) {
          throw new Error(
            `The logo is not left of the company data by the minimum gap: ${gapToData.toFixed(2)}pt on page ${page}`,
          );
        }
      }
    });

    /**
     * CENTRING invariant: the metadata block (like the title) is centred on
     * the page — the block's glyph extents bracket the page centre within a
     * declared tolerance.
     */
    it('the metadata block is centred on the page, like the title', async () => {
      const CENTRING_TOLERANCE_PTS = 6;
      const { trace } = await renderWithTrace(
        makeDocument(makeEntries(3, 'Artículo')),
        makeIdentity(0),
      );
      const metaByPage = new Map<number, CountSessionPdfTraceElement[]>();
      for (const element of trace.elements) {
        if (element.kind !== 'session-meta') continue;
        const list = metaByPage.get(element.page) ?? [];
        list.push(element);
        metaByPage.set(element.page, list);
      }
      expect(metaByPage.size).toBeGreaterThan(0);

      for (const [page, meta] of metaByPage) {
        const blockLeft = Math.min(...meta.map((e) => e.x));
        const blockRight = Math.max(...meta.map((e) => e.x + e.width));
        const blockCentre = (blockLeft + blockRight) / 2;
        if (
          Math.abs(blockCentre - COUNT_SESSION_PDF_CONTENT_AREA.centreX) >
          CENTRING_TOLERANCE_PTS
        ) {
          throw new Error(
            `The metadata block is not centred on page ${page}: block centre ${blockCentre.toFixed(2)}pt, page centre ${COUNT_SESSION_PDF_CONTENT_AREA.centreX}pt (tolerance ${CENTRING_TOLERANCE_PTS}pt)`,
          );
        }
      }
    });
  });
});
