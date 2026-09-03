import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  acceptanceParts,
  defaultPaths,
  generate,
  loadProposalModel,
  renderHtml,
} from '../generate-proposal.mjs';

const requiredContent = [
  'OE-001OM',
  'SOHO',
  'US$200',
  'US$79',
  '24 meses',
  'un Sunmi V2s',
  'portal para propietarios',
  'sábado, 5 de septiembre de 2026',
  'recibos simples no fiscales, sin desglose de IVA',
  'no constituye ni demuestra una exención fiscal',
  'US$40/hora',
  'US$50/hora',
  'Mínimo de dos horas',
  'US$99/mes',
  'Facturación electrónica DGI',
  'objetivos operativos, no garantías, SLA ni certificaciones',
  'Contacto: +505 8194 8526',
  '[dd/mm/aaaa]',
  '[número] días',
];

test('loads approved Markdown as the contractual source of truth', () => {
  const model = loadProposalModel();
  const combinedSource = `${model.sources.proposal}\n${model.sources.annex}`;
  assert.equal(model.reference, 'OE-001OM');
  assert.equal(model.client, 'SOHO');
  assert.equal(model.deliveryDate, 'sábado, 5 de septiembre de 2026');
  assert.doesNotMatch(combinedSource, /annex_support_backups_v1\.md|## 9\. Aceptación/);
  assert.equal((combinedSource.match(/\*\*Por SOHO\*\*/g) ?? []).length, 1);
  assert.equal((combinedSource.match(/\*\*Por OmniFood NI\*\*/g) ?? []).length, 1);
  for (const phrase of requiredContent) assert.ok(combinedSource.includes(phrase), `missing approved content: ${phrase}`);
});

test('renders print-ready HTML with identity, pagination, and no Flutter logo', () => {
  const model = loadProposalModel();
  const html = renderHtml(model);
  const count = (pattern) => (html.match(pattern) ?? []).length;
  const acceptance = model.proposal.sections.find((section) => section.title === 'Aceptación de la propuesta');
  const parts = acceptanceParts(acceptance);
  assert.match(html, /@media print/);
  assert.match(html, /size:A4/);
  assert.match(html, /class="monogram"/);
  assert.match(html, /Página 1 de \d+/);
  assert.equal(count(/<article class="page /g), 12);
  assert.equal(count(/<h1>Aceptación bilateral<\/h1>/g), 1);
  assert.equal(count(/<section class="signature-block">/g), 2);
  assert.equal(count(/<h2>Por SOHO<\/h2>/g), 1);
  assert.equal(count(/<h2>Por OmniFood NI<\/h2>/g), 1);
  assert.equal(count(/<div class="signature-field/g), 8);
  assert.equal(count(/<span>Firma<\/span>/g), 2);
  assert.deepEqual(parts.signatures.map((signature) => signature.party), ['Por SOHO', 'Por OmniFood NI']);
  for (const signature of parts.signatures) {
    assert.deepEqual(signature.fields.map((field) => field.label), ['Nombre', 'Cargo', 'Firma', 'Fecha']);
    assert.ok(signature.fields.every((field) => /^_+$/.test(field.placeholder)), `${signature.party} fields must preserve writable placeholders`);
  }
  assert.match(html, /Soporte, respaldos<br>y recuperación/);
  assert.doesNotMatch(html, /annex_support_backups_v1\.md|9\. Aceptación|Icon-512\.png|Flutter/i);
  for (const phrase of requiredContent) assert.ok(html.includes(phrase), `HTML is missing: ${phrase}`);
});

test('changes in Markdown flow into HTML instead of a duplicated contract model', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omnifood-proposal-source-'));
  try {
    const proposal = join(directory, 'proposal.md');
    const annex = join(directory, 'annex.md');
    writeFileSync(proposal, readFileSync(defaultPaths.proposal, 'utf8').replaceAll('US$79', 'US$78'));
    writeFileSync(annex, readFileSync(defaultPaths.annex, 'utf8'));
    const html = renderHtml(loadProposalModel({ proposal, annex }));
    assert.match(html, /US\$78/);
    assert.doesNotMatch(html, /US\$79/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('generates a structurally valid, non-trivial A4 PDF', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'omnifood-proposal-output-'));
  try {
    const htmlPath = join(directory, 'proposal.html');
    const pdfPath = join(directory, 'proposal.pdf');
    const result = await generate({ html: htmlPath, pdf: pdfPath });
    const pdf = readFileSync(pdfPath);
    const declaredPages = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdf.length > 50_000, `PDF is unexpectedly small: ${pdf.length} bytes`);
    assert.equal(declaredPages, result.pages);
    assert.ok(result.pages >= 10 && result.pages <= 12, `unexpected page count: ${result.pages}`);
    const html = readFileSync(htmlPath, 'utf8');
    assert.match(html, /go-live/i);
    assert.doesNotMatch(html, /annex_support_backups_v1\.md|9\. Aceptación/);
    assert.doesNotMatch(pdf.toString('latin1'), /annex_support_backups_v1\.md/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
