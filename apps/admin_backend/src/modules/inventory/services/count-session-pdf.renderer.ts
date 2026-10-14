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

export interface RenderCountSessionPdfOptions {
  /** Defaults to true (production); the spec renders uncompressed to verify content. */
  readonly compress?: boolean;
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
  position: { x: PAGE_MARGIN, width: 22 },
  insumo: { x: 72, width: 140 },
  uom: { x: 214, width: 34 },
  theoretical: { x: 250, width: 54, align: 'right' as const },
  counted: { x: 306, width: 54, align: 'right' as const },
  countedAt: { x: 362, width: 72 },
  actor: { x: 436, width: 82 },
  flags: { x: 520, width: 44 },
} as const;

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

/** Prints an ISO instant as the calendar day and clock time it carries. */
const formatInstant = (iso: string | null): string => {
  if (!iso) return MISSING_EVIDENCE_MARKER;
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time)
    ? `${day} ${time}`
    : MISSING_EVIDENCE_MARKER;
};

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

    // S5/S15: the logo original, embedded as-is, repeated on every page so a
    // loose sheet stays attributable. A logo that cannot be decoded or
    // rendered is skipped — and that throw must never reach the document;
    // the header then renders exactly as it does for a tenant with no logo.
    if (logoImage && logoImage.width > 0 && logoImage.height > 0) {
      const scale = Math.min(
        1,
        MAX_LOGO_WIDTH / logoImage.width,
        MAX_LOGO_HEIGHT / logoImage.height,
      );
      const drawWidth = logoImage.width * scale;
      const drawHeight = logoImage.height * scale;
      doc.image(
        logoImage as unknown as Parameters<PDFKit.PDFDocument['image']>[0],
        (612 - drawWidth) / 2,
        doc.y,
        { width: drawWidth, height: drawHeight },
      );
      doc.y += drawHeight + 10;
    }

    doc
      .font(IDENTITY_TABLE_BOLD)
      .fontSize(13)
      .fillColor('#111111')
      .text(identityText(identity.name), { align: 'center' });

    doc.font(IDENTITY_TABLE).fontSize(9).fillColor('#333333');
    for (const { label, field } of IDENTITY_LINES) {
      doc.text(`${label}: ${identityText(identity[field])}`, {
        align: 'center',
      });
    }

    doc.y += 6;
    rule();

    doc
      .font(IDENTITY_TABLE_BOLD)
      .fontSize(12)
      .fillColor('#111111')
      .text('LISTA DE CONTEO FÍSICO DE INVENTARIO', { align: 'center' });
    doc.moveDown(0.4);

    doc.font(IDENTITY_TABLE).fontSize(9.5).fillColor('#222222');
    doc.text(`Sesión: ${document.sessionId}`, { align: 'center' });
    doc.text(`Depósito: ${document.warehouseName}`, { align: 'center' });
    const metaParts = [`Fecha del conteo: ${document.cutoffDay}`];
    if (document.postedDay) {
      metaParts.push(`Registrado: ${document.postedDay}`);
    }
    metaParts.push(`Estado: ${document.status}`);
    doc.text(metaParts.join(' · '), { align: 'center' });
    doc.text(
      `Entradas registradas: ${document.totalEntries} · Emitido: ${document.generatedAtIso.slice(0, 10)}`,
      { align: 'center' },
    );

    doc.y += 6;
    rule();

    doc.font(IDENTITY_TABLE_BOLD).fontSize(7.5).fillColor('#111111');
    for (const column of COLUMN_LABELS) {
      doc.text(column.label, column.x, doc.y, {
        width: column.width,
        align: column.align ?? 'left',
      });
    }
    doc.y += 4;
    rule();
    doc.y += 4;
  };

  const cellTexts = (
    entry: CountSessionPrintEntry,
  ): ReadonlyArray<{
    readonly x: number;
    readonly width: number;
    readonly text: string;
    readonly align?: 'right';
    readonly font?: string;
    readonly size?: number;
    readonly color?: string;
  }> => {
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
              size: 7,
              color: entry.isDisputed ? '#B91C1C' : '#6B7280',
            },
          ]
        : []),
    ];
  };

  /** Height the entry block will occupy when drawn at the current cursor. */
  const measureEntryBlock = (entry: CountSessionPrintEntry): number => {
    doc.font(IDENTITY_TABLE).fontSize(8);
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
    const notes = entry.notes?.trim();
    if (notes) {
      doc.font(IDENTITY_TABLE_OBLIQUE).fontSize(7.5);
      height = Math.max(
        height,
        doc.heightOfString(`Notas: ${notes}`, { width: CONTENT_WIDTH }),
      );
    }
    // Inter-entry gap so adjacent entries never touch.
    return height + 6;
  };

  const drawEntryBlock = (entry: CountSessionPrintEntry): void => {
    const y0 = doc.y;
    for (const cell of cellTexts(entry)) {
      if (cell.text === '') continue;
      doc
        .font(cell.font ?? IDENTITY_TABLE)
        .fontSize(cell.size ?? 8)
        .fillColor(cell.color ?? '#111111')
        .text(cell.text, cell.x, y0, {
          width: cell.width,
          align: cell.align ?? 'left',
        });
    }
    const notes = entry.notes?.trim();
    if (notes) {
      doc
        .font(IDENTITY_TABLE_OBLIQUE)
        .fontSize(7.5)
        .fillColor('#555555')
        .text(`Notas: ${notes}`, PAGE_MARGIN, y0, { width: CONTENT_WIDTH });
    }
  };

  drawPageHeader();
  let pageStartY = doc.y;

  for (const entry of document.entries) {
    const blockHeight = measureEntryBlock(entry);
    // S15-bis: breaks land BETWEEN entries. The `pageStartY` guard also
    // keeps a block taller than a whole page from looping page breaks.
    if (doc.y + blockHeight > CONTENT_BOTTOM && doc.y > pageStartY) {
      doc.addPage();
      drawPageHeader();
      pageStartY = doc.y;
    }
    drawEntryBlock(entry);
    doc.y += blockHeight;
  }

  const sessionNotes = document.notes?.trim();
  if (sessionNotes) {
    doc.font(IDENTITY_TABLE_OBLIQUE).fontSize(8);
    const height =
      doc.heightOfString(`Notas de la sesión: ${sessionNotes}`, {
        width: CONTENT_WIDTH,
      }) + 10;
    if (doc.y + height > CONTENT_BOTTOM && doc.y > pageStartY) {
      doc.addPage();
      drawPageHeader();
      pageStartY = doc.y;
    }
    doc
      .font(IDENTITY_TABLE_OBLIQUE)
      .fontSize(8)
      .fillColor('#333333')
      .text(`Notas de la sesión: ${sessionNotes}`, PAGE_MARGIN, doc.y, {
        width: CONTENT_WIDTH,
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

    doc
      .font(IDENTITY_TABLE)
      .fontSize(7.5)
      .fillColor('#333333')
      .text(
        'Firma de quien realizó el recuento físico (nombre y firma):',
        PAGE_MARGIN,
        634,
      );
    doc.text('Fecha de la firma:', PAGE_MARGIN + 282, 634);

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

    doc
      .font(IDENTITY_TABLE)
      .fontSize(7)
      .fillColor('#666666')
      .text(
        `Sesión: ${document.sessionId} · ${document.cutoffDay} · Página ${pageNumber} de ${range.count}`,
        PAGE_MARGIN,
        714,
        { width: CONTENT_WIDTH, align: 'center' },
      );
  }

  doc.end();
  return done;
};
