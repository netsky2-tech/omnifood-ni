// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import type {
  CompanyIdentity,
  CompanyIdentityField,
} from '../../tenant/services/company-identity.service';

/**
 * R19 T3 — the printable, signable count list (S10, S14, S15, S15-bis).
 *
 * This is a FORMAL document, not a data dump: a header with the company
 * identity and the count's date, the ordered list of counted entries, and
 * signature + date space ON EVERY PAGE (Reglamento de la Ley 822, art. 33 →
 * R-05: "listas originales firmadas y fechadas en cada hoja por las personas
 * que hicieron el recuento físico"). Every page repeats the document
 * identity (session, date) so a loose sheet stays attributable, and page
 * breaks land BETWEEN entries, never inside one.
 *
 * Absence discipline (S15): this renderer never decides per field. It
 * consumes a `CompanyIdentity` whose fields declare their own presence, and
 * one uniform policy — an absent company value prints the declared marker
 * `No registrado` — is applied by iterating the identity lines. A missing
 * company value can never print `null`, `undefined` or `''`, never break
 * the header, and never break a page.
 *
 * Company identity parity P3, slice 1 (S5/S15): the header can now carry
 * the company logo's ORIGINAL bytes (pdfkit accepts a Buffer) — not the
 * terminal's 1-bit raster, which belongs to the printer. The logo is passed
 * as a declared-presence shape; a logo that cannot be decoded or rendered
 * is SKIPPED (S15: an absence never degrades the document), and a tenant
 * with no logo still produces the exact formal document this renderer
 * produced before this slice.
 *
 * Layout trace (S14 fix): the renderer's historical failure was INVISIBLE
 * to content assertions — notes were drawn ON TOP of table rows and the
 * column headers cascaded down the page, while every "the text is present"
 * test stayed green. The renderer therefore records every element it draws
 * (page, box, text) and hands the trace back through `options.trace`, so a
 * spec can assert GEOMETRY, not just presence: one header row, notes below
 * their row, monotonic rows inside the content area, and no two elements
 * sharing coordinates.
 */

/** The declared-presence logo a formal document may embed. */
export type CompanyLogoForPrint =
  | {
      readonly present: true;
      readonly bytes: Buffer;
      readonly contentType: string;
    }
  | { readonly present: false };

export interface CountSessionPrintEntry {
  /** 1-based position in the printed list. */
  readonly position: number;
  readonly insumoName: string;
  readonly uom: string;
  readonly theoreticalQuantity: number;
  readonly countedQuantity: number;
  /** ISO instant of the counted act, or null when the device sent none. */
  readonly countedAtIso: string | null;
  readonly actorLabel: string | null;
  readonly notes: string | null;
  readonly isDisputed: boolean;
  readonly isApproved: boolean;
}

export interface CountSessionPrintDocument {
  readonly sessionId: string;
  readonly warehouseName: string;
  readonly status: string;
  /** Calendar day (YYYY-MM-DD) of the count cutoff — the sheet's date. */
  readonly cutoffDay: string;
  /** Calendar day the session was posted, when it has been posted. */
  readonly postedDay: string | null;
  readonly notes: string | null;
  readonly totalEntries: number;
  readonly entries: readonly CountSessionPrintEntry[];
  readonly generatedAtIso: string;
}

/** What a traced element is, so a spec can group and assert per role. */
export type CountSessionPdfTraceElementKind =
  | 'logo'
  | 'company-name'
  | 'company-identity'
  | 'document-title'
  | 'session-meta'
  | 'column-label'
  | 'cell'
  | 'entry-note'
  | 'session-note'
  | 'footer';

/** One drawn element's actual box: the geometry content assertions cannot see. */
export interface CountSessionPdfTraceElement {
  readonly kind: CountSessionPdfTraceElementKind;
  /** 1-based page the element was drawn on. */
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
}

export interface CountSessionPdfLayoutTrace {
  readonly elements: ReadonlyArray<CountSessionPdfTraceElement>;
}

export interface RenderCountSessionPdfOptions {
  /** Defaults to true (production); the spec renders uncompressed to verify content. */
  readonly compress?: boolean;
  /**
   * Receives the layout trace of the finished document (every drawn text
   * run and the logo box, with page + box). Observation only: the bytes are
   * identical with and without it.
   */
  readonly trace?: (trace: CountSessionPdfLayoutTrace) => void;
}

/** S15 declared marker: a company value that is not stored prints this. */
const MISSING_COMPANY_VALUE_MARKER = 'No registrado';
/** Declared marker for evidence fields the device did not send. */
const MISSING_EVIDENCE_MARKER = 'sin dato';

const PAGE_MARGIN = 48;
/** Bottom strip reserved for the per-page signature block and page identity. */
const FOOTER_ZONE_HEIGHT = 118;

/** Logo box in the header: the original scales DOWN to fit, never up. */
const MAX_LOGO_WIDTH = 180;
const MAX_LOGO_HEIGHT = 52;

const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2;
const CONTENT_BOTTOM = 792 - PAGE_MARGIN - FOOTER_ZONE_HEIGHT;

/**
 * The printable content band, exported so the spec can assert geometry
 * against the SAME numbers the renderer uses (no drift, no magic numbers
 * in the test).
 */
export const COUNT_SESSION_PDF_CONTENT_AREA = {
  x: PAGE_MARGIN,
  top: PAGE_MARGIN,
  width: CONTENT_WIDTH,
  bottom: CONTENT_BOTTOM,
  pageWidth: 612,
  /** Horizontal centre of the page: the centring invariant's reference. */
  centreX: 306,
} as const;

/**
 * S14 (the `7.514/10/2026` defect): the minimum horizontal gap between two
 * drawn values that share a line. At 8pt Helvetica the narrowest digit is
 * ~4.45pt wide, so a gap below one digit-width lets a right-aligned value
 * sit flush against its right neighbour and the paper reads `7.514/10/2026`
 * as ONE token. The declared minimum is two digit-widths: wide enough that
 * no two adjacent cells can ever concatenate, and ASSERTED by the spec
 * against the renderer's own glyph boxes — the column layout below is built
 * from it, not tuned by eye in seven places.
 */
export const COUNT_SESSION_PDF_MIN_COLUMN_GAP = 8;

/** Gap between the metadata block's two columns (dates left, fields right). */
const META_COLUMN_GAP = 24;

const IDENTITY_LINES: ReadonlyArray<{
  readonly label: string;
  readonly field: keyof CompanyIdentity;
}> = [
  { label: 'RUC', field: 'ruc' },
  { label: 'Dirección', field: 'address' },
  { label: 'Teléfono', field: 'phone' },
  { label: 'Correo', field: 'email' },
];

const COLUMNS = {
  position: { x: PAGE_MARGIN, width: 20 },
  insumo: { x: 76, width: 128 },
  uom: { x: 212, width: 32 },
  theoretical: { x: 252, width: 48, align: 'right' as const },
  counted: { x: 308, width: 48, align: 'right' as const },
  countedAt: { x: 364, width: 78 },
  actor: { x: 450, width: 66 },
  flags: { x: 524, width: 40 },
} as const;

/** The printed columns' x ranges, for geometry assertions on the trace. */
export const COUNT_SESSION_PDF_COLUMN_X_RANGES = COLUMNS;

const COLUMN_LABELS: ReadonlyArray<{
  readonly x: number;
  readonly width: number;
  readonly label: string;
  readonly align?: 'right';
}> = [
  { x: COLUMNS.position.x, width: COLUMNS.position.width, label: '#' },
  { x: COLUMNS.insumo.x, width: COLUMNS.insumo.width, label: 'Insumo' },
  { x: COLUMNS.uom.x, width: COLUMNS.uom.width, label: 'UM' },
  {
    x: COLUMNS.theoretical.x,
    width: COLUMNS.theoretical.width,
    label: 'Teórico',
    align: 'right',
  },
  {
    x: COLUMNS.counted.x,
    width: COLUMNS.counted.width,
    label: 'Contado',
    align: 'right',
  },
  { x: COLUMNS.countedAt.x, width: COLUMNS.countedAt.width, label: 'Fecha' },
  { x: COLUMNS.actor.x, width: COLUMNS.actor.width, label: 'Contó' },
];

/**
 * S14: the document carries DATES a person reads, not storage shapes.
 * Days are formatted from their calendar-day parts — never through a Date,
 * which is exactly the one-day-shift class `calendar-day.ts` exists to kill.
 * Instants are shown in the repo's established local convention
 * (`America/Managua`, the same timezone every fiscal report uses) because a
 * count act is local evidence: 09:35Z is 03:35 in Nicaragua.
 */
const DISPLAY_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const formatDay = (day: string): string => {
  const trimmed = day?.trim() ?? '';
  if (!DISPLAY_DAY_PATTERN.test(trimmed)) {
    // S15: never print void — an unexpected shape prints as-is.
    return trimmed || MISSING_EVIDENCE_MARKER;
  }
  const [year, month, dayOfMonth] = trimmed.split('-');
  return `${dayOfMonth}/${month}/${year}`;
};

const MANAGUA_DISPLAY_FORMAT = new Intl.DateTimeFormat('es-NI', {
  timeZone: 'America/Managua',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Prints an ISO instant as the human local (Managua) day and clock time. */
const formatInstant = (iso: string | null): string => {
  if (!iso) return MISSING_EVIDENCE_MARKER;
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return MISSING_EVIDENCE_MARKER;
  const parts = MANAGUA_DISPLAY_FORMAT.formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
};

/**
 * S14: the count's state is a word on paper, not a storage token. The map
 * covers the persisted session states; an unknown token is humanised
 * (underscores to spaces, first letter capitalised) rather than printed raw.
 */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: 'Borrador',
  open: 'Abierta',
  counting: 'En conteo',
  recount: 'Reconteo',
  approval_pending: 'Pendiente de aprobación',
  approved: 'Aprobada',
  posted: 'Conciliada',
  closed: 'Cerrada',
  canceled: 'Anulada',
};

const formatStatus = (status: string): string => {
  const key = status?.trim().toLowerCase() ?? '';
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  const humanised = key.replace(/_/g, ' ');
  return humanised
    ? humanised.charAt(0).toUpperCase() + humanised.slice(1)
    : MISSING_EVIDENCE_MARKER;
};

const IDENTITY_TABLE = 'Helvetica';
const IDENTITY_TABLE_BOLD = 'Helvetica-Bold';
const IDENTITY_TABLE_OBLIQUE = 'Helvetica-Oblique';

/**
 * THE on-paper absence policy (S15), applied uniformly: the header renders
 * one labeled line per identity field, and an absent value prints the
 * declared marker. The loop below is the only branch in the document that
 * turns an absent company value into ink.
 */
const identityText = (field: CompanyIdentityField): string =>
  field.present ? field.value : MISSING_COMPANY_VALUE_MARKER;

/** Prints a decimal quantity in its natural trimmed form (8.2500 → 8.25). */
const formatQuantity = (value: number): string =>
  Number.isFinite(value)
    ? String(Number(value.toFixed(4)))
    : MISSING_EVIDENCE_MARKER;

/** Declares text evidence the device did not send instead of printing void. */
const evidenceText = (raw: string | null | undefined): string => {
  const value = raw?.trim();
  return value ? value : MISSING_EVIDENCE_MARKER;
};

const buildPdfBuffer = (doc: PDFKit.PDFDocument): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

export const renderCountSessionPdf = (
  document: CountSessionPrintDocument,
  identity: CompanyIdentity,
  options: RenderCountSessionPdfOptions = {},
  logo: CompanyLogoForPrint = { present: false },
): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'portrait',
    margin: PAGE_MARGIN,
    bufferPages: true,
    compress: options.compress ?? true,
    info: {
      Title: `Lista de conteo físico de inventario ${document.sessionId}`,
    },
  });
  const done = buildPdfBuffer(doc);

  /**
   * The layout trace: every text run records its real box BEFORE drawing,
   * at the same font and size the draw uses, so the recorded height is the
   * height the reader sees. The trace is pure observation — with no
   * `options.trace` nothing is recorded and the bytes are identical.
   */
  const traceElements: CountSessionPdfTraceElement[] = [];
  // 1-based page an element is drawn on: the layout pass sets it on every
  // page break, and the buffered-page footer loop pins it to the page it is
  // stamping (the buffer range's count is the TOTAL, not the current page).
  let tracePageNumber = 1;
  const record = (element: CountSessionPdfTraceElement): void => {
    if (options.trace) traceElements.push(element);
  };

  /**
   * Draws one text run at an EXPLICIT position and records its box. Every
   * positioned element in the document goes through here — that single seam
   * is what makes the layout assertable: a caller cannot draw text without
   * its box landing in the trace.
   */
  const placeText = (
    kind: CountSessionPdfTraceElementKind,
    text: string,
    x: number,
    y: number,
    width: number,
    style: {
      readonly font?: string;
      readonly size?: number;
      readonly color?: string;
      readonly align?: 'left' | 'center' | 'right';
    } = {},
  ): number => {
    const align = style.align ?? 'left';
    doc.font(style.font ?? IDENTITY_TABLE).fontSize(style.size ?? 8);
    const height = doc.heightOfString(text, { width, align });
    // The box the READER sees: the glyphs, not the layout column. A
    // right-aligned value's ink sits at the right edge of its column —
    // recording the full column width would hide exactly the flush-
    // against-the-next-column defect (`7.514/10/2026`) the spacing
    // invariant exists to catch. Wrapped text records its layout width
    // (its ink can fill it); aligned text records where its ink sits.
    const glyphWidth = Math.min(doc.widthOfString(text), width);
    let glyphX = x;
    if (align === 'right') glyphX = x + width - glyphWidth;
    else if (align === 'center') glyphX = x + (width - glyphWidth) / 2;
    doc.fillColor(style.color ?? '#111111').text(text, x, y, { width, align });
    record({
      kind,
      page: tracePageNumber,
      x: glyphX,
      y,
      width: glyphWidth,
      height,
      text,
    });
    return height;
  };

  // The logo is parsed ONCE and the same opened image is embedded on every
  // page: pdfkit only deduplicates images registered by string path, so
  // re-passing the buffer per page would embed a fresh copy of the bytes on
  // every sheet. `openImage` and object-form image sources exist in the
  // pdfkit runtime (PDFImage.open / `src.width && src.height`) but not in
  // its typings, hence the two narrow casts. A buffer pdfkit cannot parse
  // reads as an absent logo (S15: the document is never taken down).
  let logoImage: { width: number; height: number } | null = null;
  if (logo.present) {
    try {
      logoImage = (
        doc as unknown as {
          openImage(src: Buffer): { width: number; height: number };
        }
      ).openImage(logo.bytes);
    } catch {
      logoImage = null;
    }
  }

  const rule = (): void => {
    doc
      .moveTo(PAGE_MARGIN, doc.y + 2)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y + 2)
      .lineWidth(0.75)
      .strokeColor('#444444')
      .stroke();
    doc.y += 8;
  };

  /** The formal header, repeated on EVERY page (S15-bis identity + date). */
  const drawPageHeader = (): void => {
    doc.y = PAGE_MARGIN;
    const bandTop = doc.y;

    // S14, one header BAND: the logo at the left margin and the company
    // data centred ON THE PAGE, sharing the same vertical band — not two
    // stacked rows. The data lines are measured FIRST because they decide
    // how much width the logo may take: the widest centred line's left
    // edge is (CONTENT_WIDTH - widest) / 2 from the margin, and the logo
    // must end at least MIN_COLUMN_GAP left of it. A logo that cannot fit
    // beside the data is skipped (S15: an absence never degrades the
    // document), and a logo that cannot be decoded or rendered is skipped
    // without ever throwing into the document.
    const nameText = identityText(identity.name);
    const identityLineTexts = IDENTITY_LINES.map(
      ({ label, field }) => `${label}: ${identityText(identity[field])}`,
    );

    doc.font(IDENTITY_TABLE_BOLD).fontSize(13);
    let dataBlockHeight =
      doc.heightOfString(nameText, { width: CONTENT_WIDTH, align: 'center' }) +
      2;
    let widestDataGlyph = doc.widthOfString(nameText);
    doc.font(IDENTITY_TABLE).fontSize(9);
    for (const line of identityLineTexts) {
      dataBlockHeight +=
        doc.heightOfString(line, { width: CONTENT_WIDTH, align: 'center' }) + 2;
      widestDataGlyph = Math.max(widestDataGlyph, doc.widthOfString(line));
    }

    let logoBottom = bandTop;
    if (logoImage && logoImage.width > 0 && logoImage.height > 0) {
      const maxLogoWidth = Math.min(
        MAX_LOGO_WIDTH,
        (CONTENT_WIDTH - widestDataGlyph) / 2 -
          COUNT_SESSION_PDF_MIN_COLUMN_GAP,
      );
      const maxLogoHeight = Math.min(MAX_LOGO_HEIGHT, dataBlockHeight);
      if (maxLogoWidth > 0 && maxLogoHeight > 0) {
        const scale = Math.min(
          1,
          maxLogoWidth / logoImage.width,
          maxLogoHeight / logoImage.height,
        );
        const drawWidth = logoImage.width * scale;
        const drawHeight = logoImage.height * scale;
        doc.image(
          logoImage as unknown as Parameters<PDFKit.PDFDocument['image']>[0],
          PAGE_MARGIN,
          bandTop,
          { width: drawWidth, height: drawHeight },
        );
        record({
          kind: 'logo',
          page: tracePageNumber,
          x: PAGE_MARGIN,
          y: bandTop,
          width: drawWidth,
          height: drawHeight,
          text: '',
        });
        logoBottom = bandTop + drawHeight;
      }
    }

    // The centred data block, in the SAME band as the logo.
    let dataY = bandTop;
    dataY +=
      placeText('company-name', nameText, PAGE_MARGIN, dataY, CONTENT_WIDTH, {
        font: IDENTITY_TABLE_BOLD,
        size: 13,
        align: 'center',
        color: '#111111',
      }) + 2;
    for (const line of identityLineTexts) {
      dataY +=
        placeText('company-identity', line, PAGE_MARGIN, dataY, CONTENT_WIDTH, {
          size: 9,
          align: 'center',
          color: '#333333',
        }) + 2;
    }

    doc.y = Math.max(logoBottom, dataY) + 8;
    rule();

    const titleY = doc.y;
    placeText(
      'document-title',
      'LISTA DE CONTEO FÍSICO DE INVENTARIO',
      PAGE_MARGIN,
      titleY,
      CONTENT_WIDTH,
      {
        font: IDENTITY_TABLE_BOLD,
        size: 12,
        align: 'center',
        color: '#111111',
      },
    );
    doc.y = titleY + 22;

    doc.y += 4;
    // S14: the metadata is TWO COLUMNS, not a run-on line — the dates on
    // the left, the session's identity fields on the right — and the BLOCK
    // is CENTRED on the page like the title, with each column sized to its
    // own widest line instead of pinned to the margins.
    const metaTop = doc.y;

    const dateLines: string[] = [
      `Fecha del conteo: ${formatDay(document.cutoffDay)}`,
    ];
    if (document.postedDay) {
      dateLines.push(`Registrado: ${formatDay(document.postedDay)}`);
    }
    dateLines.push(`Emitido: ${formatInstant(document.generatedAtIso)}`);

    const fieldLines: string[] = [
      `Sesión: ${document.sessionId}`,
      `Depósito: ${document.warehouseName}`,
      `Estado: ${formatStatus(document.status)}`,
      `Entradas registradas: ${document.totalEntries}`,
    ];

    doc.font(IDENTITY_TABLE).fontSize(9.5);
    const metaLeftWidth = Math.max(
      ...dateLines.map((line) => doc.widthOfString(line)),
    );
    const metaRightWidth = Math.max(
      ...fieldLines.map((line) => doc.widthOfString(line)),
    );
    const metaBlockWidth = metaLeftWidth + META_COLUMN_GAP + metaRightWidth;
    // Centred when it fits; pinned to the margins when a huge value would
    // push the block out of the page (degradation, never overflow).
    const metaBlockX =
      metaBlockWidth <= CONTENT_WIDTH
        ? PAGE_MARGIN + (CONTENT_WIDTH - metaBlockWidth) / 2
        : PAGE_MARGIN;
    const metaLeftX = metaBlockX;
    const metaRightX = metaBlockX + metaLeftWidth + META_COLUMN_GAP;

    let leftY = metaTop;
    for (const line of dateLines) {
      leftY +=
        placeText('session-meta', line, metaLeftX, leftY, metaLeftWidth, {
          size: 9.5,
          color: '#222222',
        }) + 3;
    }
    let rightY = metaTop;
    for (const line of fieldLines) {
      rightY +=
        placeText('session-meta', line, metaRightX, rightY, metaRightWidth, {
          size: 9.5,
          color: '#222222',
        }) + 3;
    }
    doc.y = Math.max(leftY, rightY);

    doc.y += 4;
    rule();

    // S14 (the cascade defect): the column headers sit on ONE row, each at
    // its own column's x, all at the SAME y — captured once, before any
    // drawing, so no header can inherit another header's cursor advance.
    const labelY = doc.y;
    let labelHeight = 0;
    for (const column of COLUMN_LABELS) {
      labelHeight = Math.max(
        labelHeight,
        placeText(
          'column-label',
          column.label,
          column.x,
          labelY,
          column.width,
          {
            font: IDENTITY_TABLE_BOLD,
            size: 7.5,
            align: column.align,
          },
        ),
      );
    }
    doc.y = labelY + labelHeight + 4;
    rule();
    doc.y += 4;
  };

  interface CellDraw {
    readonly x: number;
    readonly width: number;
    readonly text: string;
    readonly align?: 'right';
    readonly font?: string;
    readonly size?: number;
    readonly color?: string;
  }

  const cellTexts = (
    entry: CountSessionPrintEntry,
  ): ReadonlyArray<CellDraw> => {
    const flags: string[] = [];
    if (entry.isDisputed) flags.push('DISPUTADA');
    if (entry.isApproved) flags.push('APROBADA');
    return [
      {
        x: COLUMNS.position.x,
        width: COLUMNS.position.width,
        text: String(entry.position),
      },
      {
        x: COLUMNS.insumo.x,
        width: COLUMNS.insumo.width,
        text: entry.insumoName,
      },
      { x: COLUMNS.uom.x, width: COLUMNS.uom.width, text: entry.uom },
      {
        x: COLUMNS.theoretical.x,
        width: COLUMNS.theoretical.width,
        text: formatQuantity(entry.theoreticalQuantity),
        align: 'right',
      },
      {
        x: COLUMNS.counted.x,
        width: COLUMNS.counted.width,
        text: formatQuantity(entry.countedQuantity),
        align: 'right',
      },
      {
        x: COLUMNS.countedAt.x,
        width: COLUMNS.countedAt.width,
        text: formatInstant(entry.countedAtIso),
      },
      {
        x: COLUMNS.actor.x,
        width: COLUMNS.actor.width,
        text: evidenceText(entry.actorLabel),
      },
      ...(flags.length > 0
        ? [
            {
              x: COLUMNS.flags.x,
              width: COLUMNS.flags.width,
              text: flags.join('\n'),
              font: IDENTITY_TABLE_BOLD,
              size: 6.5,
              color: entry.isDisputed ? '#B91C1C' : '#6B7280',
            },
          ]
        : []),
    ];
  };

  /**
   * Height the entry's ROW band will occupy when drawn at the current
   * cursor: the tallest cell. Measured with the exact widths and styles the
   * draw uses, so measurement and drawing can never disagree.
   */
  const measureRowBand = (entry: CountSessionPrintEntry): number => {
    let height = 0;
    for (const cell of cellTexts(entry)) {
      doc.font(cell.font ?? IDENTITY_TABLE).fontSize(cell.size ?? 8);
      height = Math.max(
        height,
        doc.heightOfString(cell.text, {
          width: cell.width,
          align: cell.align ?? 'left',
        }),
      );
    }
    return height;
  };

  const measureNoteBlock = (
    entry: CountSessionPrintEntry,
    label: string,
  ): number => {
    doc.font(IDENTITY_TABLE_OBLIQUE).fontSize(7.5);
    return doc.heightOfString(label, {
      width: CONTENT_WIDTH - 12,
    });
  };

  const entryNoteLabel = (entry: CountSessionPrintEntry): string =>
    `Notas de la entrada "${entry.insumoName}": ${entry.notes?.trim()}`;

  /**
   * Draws one entry: the row cells at a shared y0, then — strictly BELOW
   * the row band — the entry's note, indented and labeled with the insumo
   * name so an entry's note can never be confused with the session's note
   * (and can never land on top of another element). Returns the block's
   * bottom edge.
   */
  const drawEntryBlock = (entry: CountSessionPrintEntry): number => {
    const y0 = doc.y;
    let bandHeight = 0;
    for (const cell of cellTexts(entry)) {
      if (cell.text === '') continue;
      bandHeight = Math.max(
        bandHeight,
        placeText('cell', cell.text, cell.x, y0, cell.width, {
          font: cell.font,
          size: cell.size,
          color: cell.color,
          align: cell.align,
        }),
      );
    }
    const rowBottom = y0 + bandHeight;

    // Light separator under the row so the eye keeps its place between
    // entries — the formality the owner asked for, not decoration.
    doc
      .moveTo(PAGE_MARGIN, rowBottom + 2)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, rowBottom + 2)
      .lineWidth(0.5)
      .strokeColor('#CCCCCC')
      .stroke();

    let bottom = rowBottom;
    const notes = entry.notes?.trim();
    if (notes) {
      const noteY = rowBottom + 7;
      const noteHeight = placeText(
        'entry-note',
        entryNoteLabel(entry),
        PAGE_MARGIN + 12,
        noteY,
        CONTENT_WIDTH - 12,
        { font: IDENTITY_TABLE_OBLIQUE, size: 7.5, color: '#555555' },
      );
      bottom = noteY + noteHeight;
    }
    return bottom;
  };

  /** Full height an entry block occupies: row band, note block and gap. */
  const measureEntryBlock = (entry: CountSessionPrintEntry): number => {
    const bandHeight = measureRowBand(entry);
    const notes = entry.notes?.trim();
    const noteHeight = notes
      ? 7 + measureNoteBlock(entry, entryNoteLabel(entry))
      : 0;
    // Inter-entry gap so adjacent entries never touch.
    return bandHeight + noteHeight + 8;
  };

  drawPageHeader();
  let pageStartY = doc.y;

  for (const entry of document.entries) {
    const blockHeight = measureEntryBlock(entry);
    // S15-bis: breaks land BETWEEN entries. The `pageStartY` guard also
    // keeps a block taller than a whole page from looping page breaks.
    if (doc.y + blockHeight > CONTENT_BOTTOM && doc.y > pageStartY) {
      doc.addPage();
      tracePageNumber += 1;
      drawPageHeader();
      pageStartY = doc.y;
    }
    drawEntryBlock(entry);
    doc.y += measureEntryBlock(entry);
  }

  const sessionNotes = document.notes?.trim();
  if (sessionNotes) {
    doc.y += 6;
    const label = `Notas de la sesión: ${sessionNotes}`;
    doc.font(IDENTITY_TABLE_OBLIQUE).fontSize(8);
    const height = doc.heightOfString(label, { width: CONTENT_WIDTH }) + 8;
    if (doc.y + height > CONTENT_BOTTOM && doc.y > pageStartY) {
      doc.addPage();
      tracePageNumber += 1;
      drawPageHeader();
      pageStartY = doc.y;
    }
    placeText('session-note', label, PAGE_MARGIN, doc.y, CONTENT_WIDTH, {
      font: IDENTITY_TABLE_OBLIQUE,
      size: 8,
      color: '#333333',
    });
    doc.y += height;
  }

  // Signature + date space and the repeated document identity go on EVERY
  // page (S15-bis / R-05). bufferedPages lets the footer be stamped after
  // the content is laid out, with the true total page count.
  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    const pageNumber = page - range.start + 1;
    tracePageNumber = pageNumber;

    placeText(
      'footer',
      'Firma de quien realizó el recuento físico (nombre y firma):',
      PAGE_MARGIN,
      634,
      264,
      { size: 7.5, color: '#333333' },
    );
    placeText('footer', 'Fecha de la firma:', PAGE_MARGIN + 282, 634, 222, {
      size: 7.5,
      color: '#333333',
    });

    doc
      .moveTo(PAGE_MARGIN, 672)
      .lineTo(PAGE_MARGIN + 264, 672)
      .lineWidth(0.75)
      .strokeColor('#111111')
      .stroke();
    doc
      .moveTo(PAGE_MARGIN + 282, 672)
      .lineTo(PAGE_MARGIN + 264 + 222, 672)
      .lineWidth(0.75)
      .strokeColor('#111111')
      .stroke();

    placeText(
      'footer',
      `Sesión: ${document.sessionId} · ${formatDay(document.cutoffDay)} · Página ${pageNumber} de ${range.count}`,
      PAGE_MARGIN,
      714,
      CONTENT_WIDTH,
      { size: 7, color: '#666666', align: 'center' },
    );
  }

  options.trace?.({ elements: traceElements });

  doc.end();
  return done;
};
