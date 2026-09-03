#!/usr/bin/env node

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDir, '../..');
export const defaultPaths = {
  proposal: resolve(repositoryRoot, 'docs/templates/proposal_client_v1.md'),
  annex: resolve(repositoryRoot, 'docs/templates/annex_support_backups_v1.md'),
  html: resolve(repositoryRoot, 'docs/proposals/OE-001OM-propuesta-SOHO.html'),
  pdf: resolve(repositoryRoot, 'dist/proposals/OE-001OM-propuesta-SOHO.pdf'),
};

const COLORS = {
  ink: '#1a1c1c',
  muted: '#546163',
  teal: '#3f6167',
  tealDark: '#294c52',
  tealPale: '#d7e5e8',
  paper: '#faf9f9',
  white: '#ffffff',
  line: '#c1c8c9',
  brown: '#79573f',
  brownPale: '#ffdcc5',
};

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const plainText = (value) => value
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`(.*?)`/g, '$1')
  .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

const inlineHtml = (value) => escapeHtml(value)
  .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  .replace(/`(.*?)`/g, '<code>$1</code>');

function parseTable(lines, index) {
  const rows = [];
  let cursor = index;
  while (cursor < lines.length && /^\s*\|.*\|\s*$/.test(lines[cursor])) {
    rows.push(lines[cursor].trim().slice(1, -1).split('|').map((cell) => cell.trim()));
    cursor += 1;
  }
  return {
    block: { type: 'table', headers: rows[0], rows: rows.slice(2) },
    next: cursor,
  };
}

function parseBlocks(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (/^\|.*\|$/.test(line) && /^\s*\|?\s*:?-+/.test(lines[index + 1] ?? '')) {
      const parsed = parseTable(lines, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }
    const listMatch = line.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^([-*]|\d+\.)\s+(.+)$/);
        if (!match || /\d+\./.test(match[1]) !== ordered) break;
        items.push(match[2]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push({ type: 'callout', text: line.slice(2) });
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^([-*]|\d+\.)\s+/.test(next) || next.startsWith('> ') || /^\|.*\|$/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

export function parseMarkdown(source) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const titleLine = lines.find((line) => line.startsWith('# '));
  if (!titleLine) throw new Error('Markdown source must contain an H1 title');
  const titleIndex = lines.indexOf(titleLine);
  const sections = [];
  let current = { title: 'Datos de la propuesta', lines: [] };
  for (const line of lines.slice(titleIndex + 1)) {
    if (line.startsWith('## ')) {
      current.blocks = parseBlocks(current.lines);
      sections.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  current.blocks = parseBlocks(current.lines);
  sections.push(current);
  return { title: titleLine.slice(2).trim(), sections: sections.filter((section) => section.blocks.length) };
}

export function loadProposalModel(paths = defaultPaths) {
  const proposalSource = readFileSync(paths.proposal, 'utf8');
  const annexSource = readFileSync(paths.annex, 'utf8');
  const metadataValue = (label) => {
    const match = proposalSource.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^<\\n]+)`));
    if (!match) throw new Error(`Required proposal metadata not found: ${label}`);
    return plainText(match[1]);
  };
  const deliveryMatch = proposalSource.match(/>\s*\*\*Entrega y sesión de aceptación programadas:\*\*\s*([^\n]+)/);
  if (!deliveryMatch) throw new Error('Required delivery date was not found in the proposal source');
  return {
    reference: metadataValue('Referencia'),
    client: metadataValue('Cliente'),
    issueDate: metadataValue('Fecha de emisión'),
    validity: metadataValue('Vigencia de la propuesta'),
    deliveryDate: plainText(deliveryMatch[1]).replace(/\.$/, ''),
    proposal: parseMarkdown(proposalSource),
    annex: parseMarkdown(annexSource),
    sources: { proposal: proposalSource, annex: annexSource },
  };
}

function blockToHtml(block) {
  if (block.type === 'paragraph') return `<p>${inlineHtml(block.text)}</p>`;
  if (block.type === 'callout') return `<aside class="callout">${inlineHtml(block.text)}</aside>`;
  if (block.type === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    return `<${tag}>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join('')}</${tag}>`;
  }
  return `<div class="table-wrap"><table><thead><tr>${block.headers.map((cell) => `<th>${inlineHtml(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const sectionHtml = (section, className = '') => `
  <section class="content-section ${className}">
    <h2>${escapeHtml(section.title)}</h2>
    ${section.blocks.map(blockToHtml).join('\n')}
  </section>`;

const sectionGroupHtml = (document, titles) => titles
  .map((title) => sectionHtml(getSection(document, title), 'compact-section'))
  .join('\n');

function getSection(document, title) {
  const section = document.sections.find((candidate) => candidate.title === title);
  if (!section) throw new Error(`Required section not found: ${title}`);
  return section;
}

export function acceptanceParts(section) {
  const signatureIndexes = section.blocks
    .map((block, index) => block.type === 'paragraph' && /^\*\*Por (SOHO|OmniFood NI)\*\*/.test(block.text) ? index : -1)
    .filter((index) => index >= 0);
  if (signatureIndexes.length !== 2) throw new Error('Acceptance must contain exactly two signature blocks');
  const signatures = signatureIndexes.map((index) => {
    const lines = section.blocks[index].text.split(/<br\s*\/?>/i).map((line) => line.trim()).filter(Boolean);
    const party = plainText(lines.shift() ?? '');
    const fields = lines.map((line) => {
      const match = line.match(/^(Nombre|Cargo|Firma|Fecha):\s*(.*)$/);
      if (!match) throw new Error(`Invalid signature field: ${line}`);
      return { label: match[1], placeholder: match[2] };
    });
    if (fields.map((field) => field.label).join('|') !== 'Nombre|Cargo|Firma|Fecha') {
      throw new Error(`${party} signature must contain Nombre, Cargo, Firma and Fecha in order`);
    }
    return { party, fields };
  });
  return {
    introduction: section.blocks.slice(0, signatureIndexes[0]),
    signatures,
    closing: section.blocks.slice(signatureIndexes[1] + 1),
  };
}

function acceptanceHtml(section) {
  const parts = acceptanceParts(section);
  const signatures = parts.signatures.map((signature) => `<section class="signature-block">
      <h2>${escapeHtml(signature.party)}</h2>
      ${signature.fields.map((field) => `<div class="signature-field ${field.label === 'Firma' ? 'signature-line' : ''}"><span>${escapeHtml(field.label)}</span><i aria-hidden="true"></i></div>`).join('\n')}
    </section>`).join('\n');
  return `${parts.introduction.map(blockToHtml).join('\n')}<div class="signature-grid">${signatures}</div>${parts.closing.map(blockToHtml).join('\n')}`;
}

function brandHtml(logoPath) {
  if (logoPath) {
    const extension = extname(logoPath).slice(1).toLowerCase().replace('jpg', 'jpeg');
    const data = readFileSync(logoPath).toString('base64');
    return `<img class="official-logo" src="data:image/${extension};base64,${data}" alt="OmniFood NI">`;
  }
  return `<div class="brand" aria-label="OmniFood NI"><span class="monogram" aria-hidden="true"><i></i></span><span><b>OmniFood</b><small>NI</small></span></div>`;
}

function pageHtml({ reference, number, label, children, className = '' }) {
  return `<article class="page ${className}">
    <header class="running-head"><span>OmniFood NI</span><span>${escapeHtml(reference)}</span></header>
    <main>${children}</main>
    <footer><span>${escapeHtml(label)}</span><span>Página ${number} de {{TOTAL_PAGES}}</span></footer>
  </article>`;
}

export function renderHtml(model, { logoPath } = {}) {
  const proposal = model.proposal;
  const annex = model.annex;
  const decision = getSection(proposal, 'Decisión comercial');
  const investment = getSection(proposal, 'Alcance económico');
  const proposalMetadata = getSection(proposal, 'Datos de la propuesta');
  const annexMetadata = getSection(annex, 'Datos de la propuesta');
  const proposalGroups = [
    { label: 'Entrega y alcance', titles: ['Sesión programada de entrega y aceptación', 'Entregables incluidos al go-live'] },
    { label: 'Condiciones y exclusiones', titles: ['Hardware', 'Exclusiones'] },
    { label: 'Puesta en marcha y soporte', titles: ['Aceptación y puesta en marcha', 'Soporte y condiciones complementarias'] },
  ];
  const annexBody = annex.sections.filter((section) => section.title !== 'Datos de la propuesta');
  const annexGroups = [
    { label: 'Mantenimiento y asistencia', titles: ['1. Mantenimiento del producto incluido', '2. Soporte de plataforma incluido', '3. Asistencia facturable'] },
    { label: 'Capas de respaldo', titles: ['4. Capas de respaldo incluidas al go-live'] },
    { label: 'Archivo fiscal', titles: ['5. Archivo fiscal de largo plazo'] },
    { label: 'Recuperación e incidentes', titles: ['6. Objetivos seguros de recuperación', '7. Comunicación de incidentes'] },
    { label: 'Responsabilidades y exclusiones', titles: ['8. Exclusiones y responsabilidades del cliente'] },
  ];
  const pages = [];
  pages.push(pageHtml({
    reference: model.reference,
    number: 1,
    label: 'Propuesta técnico-económica',
    className: 'cover',
    children: `${brandHtml(logoPath)}<div class="cover-rule"></div><p class="eyebrow">Propuesta técnico-económica</p><h1>Operación confiable,<br>incluso sin internet.</h1><p class="cover-client">Preparada para <strong>${model.client}</strong></p><div class="editable-meta">${blockToHtml(proposalMetadata.blocks[0])}</div><div class="cover-meta"><div><span>Referencia</span><strong>${model.reference}</strong></div><div><span>Entrega, pruebas y capacitación</span><strong>${escapeHtml(model.deliveryDate)}</strong></div></div>`,
  }));
  pages.push(pageHtml({
    reference: model.reference,
    number: 2,
    label: 'Resumen ejecutivo e inversión',
    children: `<p class="eyebrow">Decisión comercial</p><h1>Una base clara para iniciar.</h1>${decision.blocks.map(blockToHtml).join('')}${sectionHtml(investment, 'investment')}`,
  }));
  let pageNumber = 3;
  for (const group of proposalGroups) {
    pages.push(pageHtml({ reference: model.reference, number: pageNumber, label: group.label, children: sectionGroupHtml(proposal, group.titles) }));
    pageNumber += 1;
  }
  pages.push(pageHtml({
    reference: model.reference,
    number: pageNumber,
    label: 'Anexo de soporte y respaldos',
    className: 'annex-cover',
    children: `${brandHtml(logoPath)}<p class="eyebrow">Anexo contractual · Versión 1.0</p><h1>Soporte, respaldos<br>y recuperación.</h1>${annexMetadata.blocks.map(blockToHtml).join('')}<div class="annex-index">${annexBody.map((section) => `<span>${escapeHtml(section.title)}</span>`).join('')}</div>`,
  }));
  pageNumber += 1;
  for (const group of annexGroups) {
    pages.push(pageHtml({ reference: model.reference, number: pageNumber, label: `Anexo · ${group.label}`, children: sectionGroupHtml(annex, group.titles) }));
    pageNumber += 1;
  }
  const proposalAcceptance = getSection(proposal, 'Aceptación de la propuesta');
  pages.push(pageHtml({
    reference: model.reference,
    number: pageNumber,
    label: 'Aceptación bilateral',
    className: 'acceptance',
    children: `<p class="eyebrow">Cierre contractual</p><h1>Aceptación bilateral</h1>${acceptanceHtml(proposalAcceptance)}`,
  }));
  const totalPages = pages.length;
  const finalPages = pages.map((page) => page.replace('{{TOTAL_PAGES}}', String(totalPages)));
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="document-reference" content="${model.reference}">
  <title>${model.reference} · Propuesta técnico-económica para ${model.client}</title>
  <style>${HTML_CSS}</style>
</head>
<body>${finalPages.join('\n')}</body>
</html>\n`;
}

const HTML_CSS = `
:root{--ink:${COLORS.ink};--muted:${COLORS.muted};--teal:${COLORS.teal};--teal-dark:${COLORS.tealDark};--teal-pale:${COLORS.tealPale};--paper:${COLORS.paper};--white:${COLORS.white};--line:${COLORS.line};--brown:${COLORS.brown};--brown-pale:${COLORS.brownPale}}
.editable-meta{position:absolute;left:20mm;top:183mm;color:#d7e5e8;font-size:8pt;line-height:1.7}.editable-meta strong{color:#fff}
.compact-section h2{font-size:17pt;margin-bottom:5mm}.compact-section+.compact-section{border-top:1px solid var(--line);margin-top:7mm;padding-top:6mm}.compact-section p{margin-bottom:3mm}.compact-section li{margin-bottom:1.4mm}
.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin:13mm 0 8mm;break-inside:avoid}.signature-block{border-top:2px solid var(--teal);padding-top:5mm;break-inside:avoid}.signature-block h2{font-family:Georgia,"Times New Roman",serif;font-size:15pt;margin:0 0 7mm}.signature-field{min-height:16mm;display:flex;flex-direction:column;justify-content:flex-end}.signature-field span{color:var(--muted);font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.signature-field i{display:block;border-bottom:1px solid var(--outline,#71787a);height:6mm}.signature-field.signature-line{min-height:27mm}.acceptance .signature-grid+p{margin-top:5mm;color:var(--muted)}
*{box-sizing:border-box}html{background:#d9dddd;color:var(--ink);font-family:"Aptos","Segoe UI",sans-serif;font-size:10.5pt;line-height:1.55}body{margin:0}.page{position:relative;width:210mm;min-height:297mm;margin:10mm auto;background:var(--paper);padding:22mm 20mm 20mm;break-after:page;overflow:hidden}.running-head,.page footer{position:absolute;left:20mm;right:20mm;display:flex;justify-content:space-between;color:var(--muted);font-size:7.5pt;letter-spacing:.09em;text-transform:uppercase}.running-head{top:11mm;border-bottom:1px solid var(--line);padding-bottom:3mm}.page footer{bottom:9mm;border-top:1px solid var(--line);padding-top:3mm}.cover{background:var(--teal-dark);color:var(--white);padding-top:28mm}.cover .running-head,.cover footer,.annex-cover .running-head,.annex-cover footer{color:#d7e5e8;border-color:#577a80}.brand{display:flex;align-items:center;gap:4mm;font-size:18pt;letter-spacing:-.035em}.brand small{display:block;font-size:7pt;letter-spacing:.32em;margin-top:-1mm}.monogram{position:relative;width:13mm;height:13mm;border:2px solid currentColor;transform:rotate(45deg);display:inline-block}.monogram:before,.monogram:after,.monogram i{content:"";position:absolute;border:2px solid currentColor}.monogram:before{inset:2mm}.monogram:after{left:50%;top:-2px;bottom:-2px;border-width:0 0 0 2px}.monogram i{top:50%;left:-2px;right:-2px;border-width:2px 0 0}.official-logo{display:block;max-width:52mm;max-height:18mm;object-fit:contain;object-position:left center}.cover-rule{height:1px;background:#a8cdd3;margin:30mm 0 15mm}.eyebrow{color:var(--teal);font-size:8pt;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.cover .eyebrow,.annex-cover .eyebrow{color:#a8cdd3}.page h1{font-family:Georgia,"Times New Roman",serif;font-size:29pt;line-height:1.08;letter-spacing:-.025em;margin:4mm 0 10mm}.cover h1{font-size:37pt;max-width:150mm}.cover-client{font-size:15pt;margin-top:16mm}.cover-meta{position:absolute;left:20mm;right:20mm;bottom:31mm;display:grid;grid-template-columns:1fr 1.6fr;gap:12mm;border-top:1px solid #577a80;padding-top:6mm}.cover-meta span{display:block;color:#a8cdd3;font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase}.cover-meta strong{display:block;margin-top:1.5mm}.cover>main>p:last-child{display:none}.content-section{max-width:166mm}.content-section h2,.annex-acceptance h2{font-family:Georgia,"Times New Roman",serif;font-size:22pt;line-height:1.2;margin:0 0 8mm;break-after:avoid-page}.content-section p{margin:0 0 4mm;orphans:3;widows:3}.content-section ul,.content-section ol{margin:2mm 0 5mm;padding-left:7mm}.content-section li{margin-bottom:2mm;break-inside:avoid}.callout{border-left:3px solid var(--brown);background:var(--brown-pale);padding:4mm 5mm;margin:6mm 0;font-weight:600;break-inside:avoid}.table-wrap{break-inside:avoid;margin:6mm 0 7mm}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th{background:var(--teal-dark);color:white;text-align:left;font-size:8pt;letter-spacing:.05em;text-transform:uppercase}th,td{padding:3.5mm;border-bottom:1px solid var(--line);vertical-align:top}th:nth-child(2),td:nth-child(2){text-align:right}.investment{margin-top:11mm;border-top:2px solid var(--teal);padding-top:7mm}.investment h2{font-size:15pt}.investment table td:nth-child(2){font-size:16pt;font-weight:700;color:var(--teal-dark)}strong{font-weight:700}code{font-family:inherit;background:#e8e8e8;padding:.2em}.annex-cover{background:#2f3131;color:#f1f1f0;padding-top:28mm}.annex-cover h1{font-size:34pt;margin-top:18mm}.annex-cover>main>p{max-width:115mm}.annex-index{display:grid;grid-template-columns:1fr 1fr;gap:3mm 10mm;margin-top:15mm;border-top:1px solid #546163;padding-top:7mm;color:#d7e5e8;font-size:8.5pt}.annex-index span{break-inside:avoid}.acceptance h1{margin-bottom:7mm}.acceptance p{white-space:normal}.acceptance .annex-acceptance{margin-top:12mm;border-top:2px solid var(--teal);padding-top:7mm}.acceptance .annex-acceptance h2{font-size:15pt}.acceptance p:has(br){font-family:"Courier New",monospace;line-height:2}.acceptance p:last-child{font-family:inherit;line-height:1.5}.acceptance .annex-acceptance p:first-of-type{font-family:inherit;line-height:1.5}
@media print{@page{size:A4;margin:0}html,body{background:white}.page{margin:0;width:210mm;height:297mm;min-height:297mm;page-break-after:always}.page:last-child{page-break-after:auto}}
@media screen and (max-width:800px){html{background:var(--paper)}.page{width:100%;min-height:auto;margin:0;padding:24mm 8vw}.running-head,.page footer{left:8vw;right:8vw}.cover-meta{position:static;margin-top:25mm;grid-template-columns:1fr}.cover{min-height:100vh}.annex-index{grid-template-columns:1fr}}
`;

function resolvePdfKit() {
  const backendPackage = resolve(repositoryRoot, 'apps/admin_backend/package.json');
  if (!existsSync(backendPackage)) throw new Error(`Cannot anchor PDFKit resolution: ${backendPackage} is missing`);
  const requireFromBackend = createRequire(backendPackage);
  try {
    return requireFromBackend('pdfkit');
  } catch (error) {
    throw new Error('PDFKit is unavailable from apps/admin_backend. Restore existing node_modules without installing new dependencies.', { cause: error });
  }
}

const PDF = {
  page: [595.28, 841.89],
  left: 56,
  right: 56,
  top: 76,
  bottom: 62,
};

class PdfRenderer {
  constructor(PDFDocument, outputPath, model, logoPath) {
    this.model = model;
    this.logoPath = logoPath;
    this.outputPath = outputPath;
    this.doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, bufferPages: true, compress: false, info: {
      Title: `${model.reference} - Propuesta técnico-económica para ${model.client}`,
      Author: 'OmniFood NI',
      Subject: 'Propuesta técnico-económica',
    } });
    this.cursor = PDF.top;
    this.pageLabel = '';
    this.pageDark = new Set();
  }

  addPage(label, dark = false) {
    this.doc.addPage({ size: 'A4', margin: 0 });
    if (dark) this.pageDark.add(this.doc.bufferedPageRange().count - 1);
    this.cursor = PDF.top;
    this.pageLabel = label;
    this.dark = dark;
    this.doc.rect(0, 0, ...PDF.page).fill(dark ? COLORS.tealDark : COLORS.paper);
  }

  ensureSpace(height) {
    if (this.cursor + height <= PDF.page[1] - PDF.bottom) return;
    this.addPage(`${this.pageLabel} · continuación`, this.dark);
  }

  brand(x = PDF.left, y = this.cursor, color = COLORS.ink) {
    if (this.logoPath) {
      this.doc.image(this.logoPath, x, y, { fit: [150, 48], align: 'left', valign: 'center' });
      return;
    }
    const size = 34;
    this.doc.save().translate(x + size / 2, y + size / 2).rotate(45).lineWidth(1.5).strokeColor(color)
      .rect(-size / 2, -size / 2, size, size).rect(-size / 2 + 6, -size / 2 + 6, size - 12, size - 12)
      .moveTo(0, -size / 2).lineTo(0, size / 2).moveTo(-size / 2, 0).lineTo(size / 2, 0).stroke().restore();
    this.doc.fillColor(color).font('Helvetica-Bold').fontSize(15).text('OmniFood', x + 48, y + 4, { lineBreak: false });
    this.doc.font('Helvetica').fontSize(6.5).text('NI', x + 49, y + 23, { lineBreak: false, characterSpacing: 2.2 });
  }

  heading(text, level = 2) {
    const sizes = { 1: 27, 2: 20, 3: 12 };
    const size = sizes[level];
    this.doc.font('Times-Bold').fontSize(size);
    const height = this.doc.heightOfString(text, { width: PDF.page[0] - PDF.left - PDF.right, lineGap: 2 });
    // Keep the heading with enough room for at least the first content block.
    this.ensureSpace(height + (level === 1 ? 86 : 72));
    this.doc.fillColor(this.dark ? COLORS.white : COLORS.ink).text(text, PDF.left, this.cursor, { width: PDF.page[0] - PDF.left - PDF.right, lineGap: 2 });
    this.cursor += height + (level === 1 ? 26 : 15);
  }

  paragraph(markdown, options = {}) {
    const text = plainText(markdown);
    const width = options.width ?? PDF.page[0] - PDF.left - PDF.right;
    const font = options.bold ? 'Helvetica-Bold' : 'Helvetica';
    const size = options.size ?? 9.2;
    this.doc.font(font).fontSize(size);
    const height = this.doc.heightOfString(text, { width, lineGap: 2.4 });
    this.ensureSpace(height + 10);
    this.doc.fillColor(options.color ?? (this.dark ? COLORS.white : COLORS.ink)).text(text, PDF.left, this.cursor, { width, lineGap: 2.4, align: options.align ?? 'left' });
    this.cursor += height + 10;
  }

  callout(text) {
    const content = plainText(text);
    this.doc.font('Helvetica-Bold').fontSize(9.3);
    const width = PDF.page[0] - PDF.left - PDF.right - 28;
    const height = this.doc.heightOfString(content, { width, lineGap: 2 }) + 24;
    this.ensureSpace(height + 12);
    this.doc.rect(PDF.left, this.cursor, width + 28, height).fill(this.dark ? COLORS.teal : COLORS.brownPale);
    this.doc.rect(PDF.left, this.cursor, 4, height).fill(this.dark ? COLORS.tealPale : COLORS.brown);
    this.doc.fillColor(this.dark ? COLORS.white : COLORS.ink).text(content, PDF.left + 16, this.cursor + 11, { width, lineGap: 2 });
    this.cursor += height + 12;
  }

  list(block) {
    block.items.forEach((item, index) => {
      const marker = block.ordered ? `${index + 1}.` : '•';
      const text = plainText(item);
      this.doc.font('Helvetica').fontSize(8.9);
      const height = this.doc.heightOfString(text, { width: 438, lineGap: 2 });
      this.ensureSpace(height + 8);
      this.doc.fillColor(this.dark ? COLORS.tealPale : COLORS.tealDark).font('Helvetica-Bold').text(marker, PDF.left, this.cursor, { width: 20 });
      this.doc.fillColor(this.dark ? COLORS.white : COLORS.ink).font('Helvetica').text(text, PDF.left + 26, this.cursor, { width: 438, lineGap: 2 });
      this.cursor += height + 7;
    });
    this.cursor += 4;
  }

  table(block) {
    const totalWidth = PDF.page[0] - PDF.left - PDF.right;
    const widths = block.headers.length === 3 ? [totalWidth * 0.45, totalWidth * 0.21, totalWidth * 0.34] : Array(block.headers.length).fill(totalWidth / block.headers.length);
    const rowHeight = (row, bold = false) => Math.max(...row.map((cell, index) => {
      this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 7.5 : 8.5);
      return this.doc.heightOfString(plainText(cell), { width: widths[index] - 16, lineGap: 1.5 });
    })) + 18;
    const drawRow = (row, header = false) => {
      const height = rowHeight(row, header);
      this.ensureSpace(height + 1);
      if (header) this.doc.rect(PDF.left, this.cursor, totalWidth, height).fill(COLORS.tealDark);
      let x = PDF.left;
      row.forEach((cell, index) => {
        this.doc.fillColor(header ? COLORS.white : COLORS.ink).font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.5 : 8.5)
          .text(plainText(cell), x + 8, this.cursor + 8, { width: widths[index] - 16, lineGap: 1.5, align: index === 1 ? 'right' : 'left' });
        x += widths[index];
      });
      if (!header) this.doc.moveTo(PDF.left, this.cursor + height).lineTo(PDF.left + totalWidth, this.cursor + height).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      this.cursor += height;
    };
    this.ensureSpace(rowHeight(block.headers, true) + rowHeight(block.rows[0] ?? [], false) + 1);
    drawRow(block.headers, true);
    block.rows.forEach((row) => drawRow(row));
    this.cursor += 14;
  }

  blocks(blocks) {
    for (const block of blocks) {
      if (block.type === 'paragraph') this.paragraph(block.text);
      else if (block.type === 'callout') this.callout(block.text);
      else if (block.type === 'list') this.list(block);
      else this.table(block);
    }
  }

  section(section, forceNewPage = false) {
    if (forceNewPage) this.addPage(section.title);
    else if (this.cursor > PDF.top + 12) {
      this.ensureSpace(110);
      this.doc.moveTo(PDF.left, this.cursor).lineTo(PDF.page[0] - PDF.right, this.cursor).lineWidth(0.5).strokeColor(COLORS.line).stroke();
      this.cursor += 16;
    }
    this.heading(section.title, 2);
    this.blocks(section.blocks);
  }

  cover(metadata) {
    this.addPage('Propuesta técnico-económica', true);
    this.brand(PDF.left, 72, COLORS.white);
    this.doc.moveTo(PDF.left, 190).lineTo(PDF.page[0] - PDF.right, 190).lineWidth(1).strokeColor(COLORS.tealPale).stroke();
    this.doc.fillColor(COLORS.tealPale).font('Helvetica-Bold').fontSize(8).text('PROPUESTA TÉCNICO-ECONÓMICA', PDF.left, 228, { characterSpacing: 1.5 });
    this.doc.fillColor(COLORS.white).font('Times-Bold').fontSize(35).text('Operación confiable,\nincluso sin internet.', PDF.left, 270, { width: 470, lineGap: 4 });
    this.doc.font('Helvetica').fontSize(15).text('Preparada para ', PDF.left, 430, { continued: true }).font('Helvetica-Bold').text(this.model.client);
    this.doc.fillColor(COLORS.tealPale).font('Helvetica').fontSize(7).text('FECHA DE EMISIÓN', PDF.left, 536, { characterSpacing: 1 }).text('VIGENCIA DE LA PROPUESTA', 270, 536, { characterSpacing: 1 });
    this.doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(10).text(this.model.issueDate, PDF.left, 552).text(this.model.validity, 270, 552);
    this.doc.moveTo(PDF.left, 650).lineTo(PDF.page[0] - PDF.right, 650).lineWidth(0.6).strokeColor(COLORS.teal).stroke();
    this.doc.fillColor(COLORS.tealPale).font('Helvetica').fontSize(7).text('REFERENCIA', PDF.left, 670, { characterSpacing: 1 }).text('ENTREGA, PRUEBAS Y CAPACITACIÓN', 270, 670, { characterSpacing: 1 });
    this.doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(10).text(this.model.reference, PDF.left, 686).text(this.model.deliveryDate, 270, 686, { width: 270 });
    this.cursor = 720;
    const metadataText = metadata.blocks.map((block) => block.text ?? '').join(' ');
    if (!metadataText.includes('[dd/mm/aaaa]') || !metadataText.includes('[número] días')) throw new Error('Editable issue date and validity placeholders must be preserved');
  }

  signatureColumns(signatures) {
    const gap = 30;
    const width = (PDF.page[0] - PDF.left - PDF.right - gap) / 2;
    const blockHeight = 246;
    this.ensureSpace(blockHeight);
    const startY = this.cursor + 8;
    signatures.forEach((signature, index) => {
      const x = PDF.left + index * (width + gap);
      this.doc.moveTo(x, startY).lineTo(x + width, startY).lineWidth(1.4).strokeColor(COLORS.teal).stroke();
      this.doc.fillColor(COLORS.ink).font('Times-Bold').fontSize(13).text(signature.party, x, startY + 13, { width });
      let fieldY = startY + 50;
      signature.fields.forEach((field) => {
        const writingSpace = field.label === 'Firma' ? 43 : 25;
        this.doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.8).text(field.label.toUpperCase(), x, fieldY, { width, characterSpacing: 0.8 });
        const lineY = fieldY + writingSpace;
        this.doc.moveTo(x, lineY).lineTo(x + width, lineY).lineWidth(0.65).strokeColor(COLORS.muted).stroke();
        fieldY = lineY + 14;
      });
    });
    this.cursor = startY + blockHeight;
  }

  acceptance(proposalSection) {
    const parts = acceptanceParts(proposalSection);
    this.addPage('Aceptación bilateral');
    this.heading('Aceptación bilateral', 1);
    this.blocks(parts.introduction);
    this.signatureColumns(parts.signatures);
    this.blocks(parts.closing);
  }

  finish() {
    const range = this.doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      this.doc.switchToPage(index);
      const isDark = this.pageDark.has(index);
      const color = isDark ? COLORS.tealPale : COLORS.muted;
      this.doc.moveTo(PDF.left, 42).lineTo(PDF.page[0] - PDF.right, 42).lineWidth(0.45).strokeColor(isDark ? COLORS.teal : COLORS.line).stroke();
      this.doc.fillColor(color).font('Helvetica').fontSize(6.8).text('OMNIFOOD NI', PDF.left, 29, { lineBreak: false, characterSpacing: 0.8 }).text(this.model.reference, PDF.page[0] - PDF.right - 65, 29, { width: 65, align: 'right', lineBreak: false, characterSpacing: 0.8 });
      this.doc.moveTo(PDF.left, PDF.page[1] - 39).lineTo(PDF.page[0] - PDF.right, PDF.page[1] - 39).lineWidth(0.45).strokeColor(isDark ? COLORS.teal : COLORS.line).stroke();
      this.doc.fillColor(color).font('Helvetica').fontSize(6.8).text(`Página ${index + 1} de ${range.count}`, PDF.page[0] - PDF.right - 90, PDF.page[1] - 29, { width: 90, align: 'right', lineBreak: false });
    }
    return new Promise((resolvePromise, reject) => {
      const chunks = [];
      this.doc.on('data', (chunk) => chunks.push(chunk));
      this.doc.on('error', reject);
      this.doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        writeFileSync(this.outputPath, buffer);
        resolvePromise({ buffer, pages: range.count });
      });
      this.doc.end();
    });
  }
}

export async function renderPdf(model, outputPath, { logoPath } = {}) {
  const PDFDocument = resolvePdfKit();
  const renderer = new PdfRenderer(PDFDocument, outputPath, model, logoPath);
  const proposal = model.proposal;
  const annex = model.annex;
  renderer.cover(getSection(proposal, 'Datos de la propuesta'));
  renderer.addPage('Resumen ejecutivo e inversión');
  renderer.heading('Resumen ejecutivo', 1);
  renderer.blocks(getSection(proposal, 'Decisión comercial').blocks);
  renderer.heading('Inversión', 2);
  renderer.blocks(getSection(proposal, 'Alcance económico').blocks);
  const renderGroup = (document, label, titles) => {
    renderer.addPage(label);
    for (const title of titles) renderer.section(getSection(document, title));
  };
  renderGroup(proposal, 'Entrega y alcance', ['Sesión programada de entrega y aceptación', 'Entregables incluidos al go-live']);
  renderGroup(proposal, 'Condiciones y exclusiones', ['Hardware', 'Exclusiones']);
  renderGroup(proposal, 'Puesta en marcha y soporte', ['Aceptación y puesta en marcha', 'Soporte y condiciones complementarias']);
  renderer.addPage('Anexo de soporte, respaldos y recuperación', true);
  renderer.brand(PDF.left, 78, COLORS.white);
  renderer.cursor = 200;
  renderer.heading(annex.title, 1);
  renderer.blocks(getSection(annex, 'Datos de la propuesta').blocks);
  renderGroup(annex, 'Mantenimiento y asistencia', ['1. Mantenimiento del producto incluido', '2. Soporte de plataforma incluido', '3. Asistencia facturable']);
  renderGroup(annex, 'Capas de respaldo', ['4. Capas de respaldo incluidas al go-live']);
  renderGroup(annex, 'Archivo fiscal', ['5. Archivo fiscal de largo plazo']);
  renderGroup(annex, 'Recuperación e incidentes', ['6. Objetivos seguros de recuperación', '7. Comunicación de incidentes']);
  renderGroup(annex, 'Responsabilidades y exclusiones', ['8. Exclusiones y responsabilidades del cliente']);
  renderer.acceptance(getSection(proposal, 'Aceptación de la propuesta'));
  return renderer.finish();
}

function parseArguments(argv) {
  const result = { ...defaultPaths, logoPath: undefined };
  const aliases = { '--proposal': 'proposal', '--annex': 'annex', '--html': 'html', '--pdf': 'pdf', '--logo': 'logoPath' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = aliases[argv[index]];
    if (!key || !argv[index + 1]) throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    result[key] = resolve(argv[index + 1]);
    index += 1;
  }
  if (result.logoPath && !/\.(png|jpe?g)$/i.test(result.logoPath)) throw new Error('Optional logo must be a local PNG or JPEG file');
  return result;
}

export async function generate(options = {}) {
  const paths = { ...defaultPaths, ...options };
  mkdirSync(dirname(paths.html), { recursive: true });
  mkdirSync(dirname(paths.pdf), { recursive: true });
  const model = loadProposalModel(paths);
  const html = renderHtml(model, { logoPath: paths.logoPath });
  writeFileSync(paths.html, html);
  const pdf = await renderPdf(model, paths.pdf, { logoPath: paths.logoPath });
  return { html: paths.html, pdf: paths.pdf, pages: pdf.pages, bytes: pdf.buffer.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generate(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`Generated ${result.html}\nGenerated ${result.pdf} (${result.pages} pages, ${result.bytes} bytes)\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
