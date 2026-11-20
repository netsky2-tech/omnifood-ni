// Regression guards for the /demo/ artboard (10-demo.html).
// Run: node --test scripts/__tests__/nhilos-demo-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §9 (binding) +
// odd/tasks/nhilos-web-demo.md (S1-S24).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/10-demo.html");
const BUILD = path.join(ROOT, "scripts/build-nhilos-web.mjs");
const DESIGN_JSON = path.join(ROOT, "design/nhilos-web-foundation/design.json");
const SITE_CSS = path.join(ROOT, "design/nhilos-web-foundation/assets/site.css");

const txt = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function loadPage() {
  assert.ok(fs.existsSync(ART), `missing artboard: ${ART}`);
  const src = fs.readFileSync(ART, "utf8");
  const body = src.split("<body>")[1] || "";
  assert.ok(body.length > 0, "artboard must have a <body>");
  const vis = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const ldMatch = src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const ld = ldMatch ? JSON.parse(ldMatch[1]) : null;
  const faqNode = ld?.["@graph"]?.find((n) => n["@type"] === "FAQPage") || null;
  const faq = faqNode ? faqNode.mainEntity : [];
  const cells = [...vis.matchAll(/<div class="faq-cell"[^>]*>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [
    txt(m[1]),
    txt(m[2]),
  ]);
  return { src, body, vis, ld, faq, cells };
}

// 1. S5: H1 verbatim (segment-neutral)
test("G01 (S5): single h1 with verbatim segment-neutral text", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(txt(h1[0][1]), "Demo de NHILOS POS: qué recibes y cómo se coordina");
});

// 2. S6: 8 H2s verbatim and in order
test("G02 (S6): 8 H2 headings match S6 / brief §9.4 verbatim and in order", () => {
  const { vis } = loadPage();
  const expected = [
    "¿Qué es la demo de NHILOS POS?",
    "Demo de sistema POS para restaurante, cafetería, food park o mostrador",
    "¿Cómo se coordina y cuánto hay que esperar?",
    "¿Qué necesito preparar?",
    "¿Con qué datos se muestra el sistema?",
    "¿Qué pasa después de la demo?",
    "Preguntas frecuentes sobre la demo",
    "Pide tu demo",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// 3. S6: 2 H3s verbatim under their declared parent H2s
test("G03 (S6): both H3 sub-angles match verbatim under their declared parent H2s", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  assert.ok(h3s.includes("Qué se muestra según tu tipo de negocio"), "missing H3: Qué se muestra según tu tipo de negocio");
  assert.ok(h3s.includes("¿Cuánto dura la demo?"), "missing H3: ¿Cuánto dura la demo?");

  const segIdx = vis.indexOf("Demo de sistema POS para restaurante, cafetería, food park o mostrador");
  const segH3Idx = vis.indexOf("Qué se muestra según tu tipo de negocio");
  const coordIdx = vis.indexOf("¿Cómo se coordina y cuánto hay que esperar?");
  const durH3Idx = vis.indexOf("¿Cuánto dura la demo?");
  const prepIdx = vis.indexOf("¿Qué necesito preparar?");
  assert.ok(segIdx < segH3Idx && segH3Idx < coordIdx, "H3 'Qué se muestra según tu tipo de negocio' must live under H2 2 (segments)");
  assert.ok(coordIdx < durH3Idx && durH3Idx < prepIdx, "H3 '¿Cuánto dura la demo?' must live under H2 3 (coordination)");
});

// 4. S23: Title <=60 and description <=155
test("G04 (S23): title (<=60) and description (<=155) match decided neutral meta", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = src.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.equal(title, "Demo de NHILOS POS: qué recibes y cómo se coordina");
  assert.ok(title.length <= 60, `title too long (${title.length})`);
  assert.ok(desc && desc.length > 0 && desc.length <= 155, `description invalid or too long (${desc?.length})`);
});

// 4b. S17.4b: No segment in H1 or title
test("G04b (S17.4b): zero segments in H1 or title", () => {
  const { src } = loadPage();
  const title = (src.match(/<title>([^<]+)<\/title>/)?.[1] || "").toLowerCase();
  const h1 = txt(src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || "").toLowerCase();
  const bannedSegments = ["restaurante", "cafetería", "cafeteria", "panadería", "panaderia", "food park", "mostrador"];
  for (const seg of bannedSegments) {
    assert.ok(!title.includes(seg), `segment "${seg}" leaked into <title>`);
    assert.ok(!h1.includes(seg), `segment "${seg}" leaked into <h1>`);
  }
});

// 4c. S17.4c: Primary query in an H2
test("G04c (S17.4c): query 'demo de sistema POS para restaurante' appears in an H2", () => {
  const { vis } = loadPage();
  const h2s = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]).toLowerCase());
  assert.ok(
    h2s.some((h) => h.includes("demo de sistema pos para restaurante")),
    "primary query must appear in an H2",
  );
});

// 5. S15/S17.5: Canonical + og:title
test("G05 (S15): canonical is https://nhilospos.com/demo/ and og:title mirrors title", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.equal(src.match(/<link rel="canonical" href="([^"]+)">/)?.[1], "https://nhilospos.com/demo/");
  assert.equal(src.match(/<meta property="og:title" content="([^"]+)">/)?.[1], title);
  assert.equal(src.match(/<meta property="og:url" content="([^"]+)">/)?.[1], "https://nhilospos.com/demo/");
});

// 6. S4: Quick answer in first 150 px (hero, before first H2)
test("G06 (S4): quick answer appears verbatim in hero before first H2 and names WhatsApp", () => {
  const { vis } = loadPage();
  const beforeFirstH2 = txt(vis.split(/<h2\b/i)[0]);
  const expected =
    "Pides la demo y te escribimos por WhatsApp. Ves NHILOS POS en un escenario armado según tu tipo de negocio y tu prioridad, con datos de demostración etiquetados. La cotización con cronograma real sale al finalizar. Te confirmamos en menos de 24 horas hábiles.";
  assert.ok(beforeFirstH2.includes(expected), "quick answer verbatim missing before first H2");
  assert.ok(!txt(vis).toLowerCase().includes("por el canal que elegiste"), "outdated 'por el canal que elegiste' phrase must not appear");
});

// 6b. S6b: Both approved home v1.5 bullets verbatim
test("G06b (S6b): both approved home v1.5 bullets appear verbatim", () => {
  const { vis } = loadPage();
  const visible = txt(vis);
  assert.ok(
    visible.includes("Escenario armado según tu tipo de negocio y tu prioridad."),
    "approved bullet 1 missing verbatim",
  );
  assert.ok(
    visible.includes("Cotización con cronograma real al finalizar la demo."),
    "approved bullet 2 missing verbatim",
  );
});

// 7. S8: All 10 prohibitions absent
test("G07 (S8): all S8 prohibited demo claims are absent from visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  const banned = [
    "últimos cupos",
    "ultimos cupos",
    "cupos limitados",
    "solo esta semana",
    "cuenta regresiva",
    "cuentas regresivas",
    "descuento por pedir hoy",
    "antes de que suba",
    "sin datos de tarjeta",
    "sin tarjeta",
    "la demo incluye tu catálogo real",
    "migración de datos en la demo",
    "sin permanencia",
    "te inscribes ahí mismo",
  ];
  for (const term of banned) {
    assert.ok(!combined.includes(term), `prohibited S8 claim found: "${term}"`);
  }
});

// 8. S8.10: Inherited site bans absent
test("G08 (S8.10): inherited site bans and IVA claims are absent", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  const banned = [
    "facturación impresa",
    "factura electrónica",
    "facturación electrónica",
    "autorizado por la dgi",
    "cero multas",
    "nunca pierdes una venta",
    "100% sincronizado",
    "exportación contable",
    "byod",
    "iva incluido",
    "iva aparte",
    "precios netos",
  ];
  for (const term of banned) {
    assert.ok(!combined.includes(term), `inherited banned claim found: "${term}"`);
  }
  assert.ok(!/\bkds\b/i.test(combined), "banned term KDS found");
});

// 9. S8.2 / S17.9: Zero duration in minutes or hours
test("G09 (S8.2): zero demo duration published in minutes or hours", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  // Strip the single approved response SLA before scanning for time durations
  const withoutSla = combined.replace(/menos de 24 horas hábiles/g, "");
  assert.ok(
    !/\b\d+\s*(min|mins|minuto|minutos|hora|horas)\b/.test(withoutSla),
    "numeric duration in minutes/hours found outside approved response SLA",
  );
  for (const phrase of ["media hora", "una hora", "dos horas", "quince minutos", "treinta minutos", "cuarenta y cinco minutos"]) {
    assert.ok(!withoutSla.includes(phrase), `duration phrase found: "${phrase}"`);
  }
});

// 10. S8.4 / S17.10: Zero 'gratis'/'gratuita'
test("G10 (S8.4): zero 'gratis' or 'gratuita' anywhere; 'se coordina sin compromiso' present", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  assert.ok(!/\bgrat(is|uita|uito|uitas|uitos)\b/.test(combined), "forbidden 'gratis/gratuita' found");
  assert.ok(combined.includes("se coordina sin compromiso"), "approved phrase 'se coordina sin compromiso' missing");
});

// 11. S8.5 / S17.11: Exact SLA 'menos de 24 horas hábiles' and no faster variant or bare '24 horas'
test("G11 (S8.5): exact SLA 'menos de 24 horas hábiles' present with no faster variant or bare '24 horas'", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  assert.ok(combined.includes("menos de 24 horas hábiles"), "missing approved SLA 'menos de 24 horas hábiles'");
  const faster = [
    "en 15 minutos",
    "en 30 minutos",
    "de inmediato",
    "inmediatamente",
    "al instante",
    "el mismo día",
    "en pocas horas",
    "en minutos",
  ];
  for (const term of faster) {
    assert.ok(!combined.includes(term), `faster-than-approved SLA found: "${term}"`);
  }
  const withoutApproved = combined.replace(/menos de 24 horas hábiles/g, "");
  assert.ok(!/\b24\s*horas\b/.test(withoutApproved), "bare '24 horas' without 'menos de 24 horas hábiles' found");
});

// 12. S9 / S17.12: FAQPage parity + GEO Rule 1
test("G12 (S9): FAQPage JSON-LD matches visible faq-cell items character-for-character and obeys GEO Rule 1", () => {
  const { faq, cells } = loadPage();
  assert.equal(cells.length, 7, `expected 7 visible FAQ cells, got ${cells.length}`);
  assert.equal(faq.length, 7, `expected 7 JSON-LD FAQ items, got ${faq.length}`);
  for (let i = 0; i < 7; i++) {
    assert.equal(faq[i].name, cells[i][0], `FAQ Q${i + 1} mismatch between JSON-LD and DOM`);
    assert.equal(faq[i].acceptedAnswer.text, cells[i][1], `FAQ A${i + 1} mismatch between JSON-LD and DOM`);
    const firstSentence = cells[i][1].split(/(?<=[.!?])\s/)[0];
    assert.ok(firstSentence.includes("NHILOS POS"), `GEO Rule 1: FAQ A${i + 1} first sentence missing 'NHILOS POS'`);
    assert.ok(firstSentence.includes("Nicaragua"), `GEO Rule 1: FAQ A${i + 1} first sentence missing 'Nicaragua'`);
  }
});

// 13. S9 / S17.13: All 7 FAQ questions verbatim and in order
test("G13 (S9): all 7 FAQ questions match S9 verbatim and in order", () => {
  const { cells } = loadPage();
  const expected = [
    "¿La demo tiene costo?",
    "¿Cuándo me contactan?",
    "¿Cuánto dura?",
    "¿Necesito preparar algo?",
    "¿Veo el sistema con mi tipo de negocio?",
    "¿Los datos de la demo son reales?",
    "¿Qué pasa después?",
  ];
  assert.deepEqual(
    cells.map((c) => c[0]),
    expected,
  );
});

// 14. S10 / S8.8 / S17.14: Exact required form fields; no RUC, mandatory email, or budget; honest send mechanics
test("G14 (S10/S8.8/S11): exact form fields present, forbidden fields absent, honest WhatsApp send copy", () => {
  const { vis } = loadPage();
  const formMatch = vis.match(/<form\b[^>]*id="nhilosDemoForm"[\s\S]*?<\/form>/);
  assert.ok(formMatch, "missing form#nhilosDemoForm");
  const formHtml = formMatch[0];

  for (const fieldName of [
    "contactName",
    "businessName",
    "businessType",
    "contactPhone",
    "businessSector",
    "demoPriority",
    "terminalCount",
    "demoContextNote",
  ]) {
    assert.ok(new RegExp(`name="${fieldName}"`).test(formHtml), `missing form field name="${fieldName}"`);
  }

  // Forbidden fields
  assert.ok(!/name="[^"]*ruc[^"]*"/i.test(formHtml) && !/\bRUC\b/.test(txt(formHtml)), "forbidden RUC field found");
  assert.ok(!/type="email"/i.test(formHtml) && !/name="contactEmail"/i.test(formHtml), "forbidden email field found");
  assert.ok(!/presupuesto|budget/i.test(formHtml), "forbidden budget field found");

  // Honest mechanics (S11)
  const visible = txt(vis).toLowerCase();
  assert.ok(!visible.includes("enviamos tu solicitud"), "dishonest 'enviamos tu solicitud' found");
  assert.ok(!visible.includes("recibimos tus datos"), "dishonest 'recibimos tus datos' found");
});

// 15. S10 / S17.15: terminalCount reused, no parallel field
test("G15 (S10): terminalCount is reused for box count with no parallel field", () => {
  const { vis } = loadPage();
  assert.ok(/id="terminalCount"/.test(vis) && /name="terminalCount"/.test(vis), "terminalCount must be reused");
  assert.ok(!/name="(?:cajaCount|cajasCount|cantidadCajas|numCajas|boxesCount)"/i.test(vis), "parallel box-count field forbidden");
});

// 16. S11 / S17.16: utm_medium=demo on all WhatsApp links
test("G16 (S11): every WhatsApp link targets official number and includes utm_medium=demo", () => {
  const { vis } = loadPage();
  const waLinks = [...vis.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(waLinks.length >= 2, "expected at least 2 WhatsApp links");
  for (const href of waLinks) {
    assert.ok(href.startsWith("https://wa.me/50581948526"), `unexpected WhatsApp number: ${href}`);
    assert.ok(href.includes("utm_medium=demo"), `WhatsApp link missing utm_medium=demo: ${href}`);
  }
});

// 17. S12 / S17.17: Provenance label in demo-tag and zero captures by default
test("G17 (S12): approved demo provenance label in .demo-tag and zero product captures", () => {
  const { vis } = loadPage();
  assert.ok(
    /class="[^"]*\bdemo-tag\b[^"]*"[^>]*>[\s\S]*?Operación real capturada de NHILOS Market &amp; Café · datos de demostración|class="[^"]*\bdemo-tag\b[^"]*"[^>]*>[\s\S]*?Operación real capturada de NHILOS Market & Café · datos de demostración/.test(
      vis,
    ),
    "approved provenance label missing inside .demo-tag",
  );
  const mainMatch = vis.match(/<main[\s\S]*?<\/main>/);
  assert.ok(mainMatch, "missing <main>");
  const mainImgs = [...mainMatch[0].matchAll(/<img\b/gi)];
  assert.equal(mainImgs.length, 0, "S12: /demo/ must not include product captures inside <main>");
});

// 18. S1 / S17.18: Relative asset paths in artboard
test("G18 (S1): artboard uses relative paths for assets/, media/, and fonts/", () => {
  const { src } = loadPage();
  assert.ok(src.includes('href="assets/site.css"'), "missing relative assets/site.css");
  assert.ok(src.includes('src="assets/site.js"'), "missing relative assets/site.js");
  assert.ok(!/\s(?:src|href|poster)="\/(?:assets|media|fonts)\//.test(src), "absolute /assets, /media, or /fonts path found in artboard");
});

// 19. S16 / S17.19: faq-cell and demo-tag reused; no repeated section patterns from other pages
test("G19 (S16): faq-cell and demo-tag reused and no section patterns repeated from sibling pages", () => {
  const { src, vis } = loadPage();
  assert.ok(vis.includes('class="faq-cell"'), "must reuse faq-cell");
  assert.ok(vis.includes('class="demo-tag"'), "must reuse demo-tag");
  const forbiddenPatterns = [
    "hero-fork",
    "ledger-row",
    "compare-band",
    "price-ribbon",
    "plan-card",
    "risk-band",
    "setup-strip",
    "growth-ladder",
    "fisc-",
    "inv-",
  ];
  for (const pat of forbiddenPatterns) {
    assert.ok(!src.includes(pat), `repeated sibling pattern found: "${pat}"`);
  }
});

// 20. S15 / S17.20: Every var(--*) exists in site.css
test("G20 (S15): every var(--*) token used in artboard is defined in assets/site.css", () => {
  const { src } = loadPage();
  const css = fs.readFileSync(SITE_CSS, "utf8");
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  // Also allow local custom properties defined in the artboard's own <style>
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
  const used = new Set([...src.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
  const missing = [...used].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `undefined CSS tokens: ${missing.join(", ")}`);
});

// 21. S17.21: Zero em-dashes anywhere
test("G21 (S17.21): zero em-dashes (—) anywhere in the artboard file", () => {
  const { src } = loadPage();
  assert.ok(!src.includes("—"), "em-dash (—) found in artboard");
});

// 22. S17.22: Voice — zero site narration
test("G22 (S17.22): copy speaks about the reader's process, never narrates the site", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  const banned = [
    "esta página",
    "este sitio",
    "en esta sección",
    "orienta y reparte",
    "dicho tal cual",
    "como ves arriba",
    "más abajo en esta",
  ];
  for (const phrase of banned) {
    assert.ok(!combined.includes(phrase), `site narration phrase found: "${phrase}"`);
  }
});

// 23. S17.23: Zero internal vocabulary
test("G23 (S17.23): zero internal vocabulary or roadmap language in visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  const banned = [
    "omnifood",
    "entitlements",
    "go-live",
    "multi-tenant",
    "outbox",
    "catálogo hidratado",
    "#983",
    "#993",
    "#994",
    "roadmap",
    "hoja de ruta",
    "próximamente",
  ];
  for (const term of banned) {
    assert.ok(!combined.includes(term), `internal vocabulary found: "${term}"`);
  }
  assert.ok(!/\b(bom|cpp|r-0[1-7])\b/i.test(combined), "internal acronym (BOM/CPP/R-0x) found");
});

// 24. S1 / S17.24: PAGES + design.json + WhatsApp + no personal names
test("G24 (S1/S17.24): registered in build-nhilos-web.mjs PAGES and design.json; official WhatsApp; no personal names", () => {
  const { vis } = loadPage();
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.ok(buildSrc.includes("10-demo.html") && buildSrc.includes('url: "/demo/"'), "not registered in PAGES");
  const design = JSON.parse(fs.readFileSync(DESIGN_JSON, "utf8"));
  assert.ok(
    design.artboards.some((a) => a.file === "10-demo.html"),
    "not registered in design.json",
  );
  assert.ok(vis.includes("+505 8194 8526"), "official WhatsApp number missing from visible copy");
  const lower = txt(vis).toLowerCase();
  for (const person of ["octavio", "morales", "john doe", "maría", "carlos"]) {
    assert.ok(!lower.includes(person), `personal name found: "${person}"`);
  }
});

// 25. S13 / S14 / S15: Outbound links, pending /implementacion/, measurement events, JSON-LD graph, anchors
test("G25 (S13/S14/S15): outbound links, pending /implementacion/ comment, 5 data-event hooks, schema graph, valid anchors", () => {
  const { src, vis, ld } = loadPage();
  for (const route of ['href="/"', 'href="/precios/"', 'href="/software-pos/"', 'href="/facturacion-dgi/"', 'href="/inventario/"']) {
    assert.ok(vis.includes(route), `missing outbound link ${route}`);
  }
  assert.ok(!/href="\/implementacion\/?"/.test(vis), "/implementacion/ must not be a live link before it exists");
  assert.ok(src.includes("/implementacion/"), "/implementacion/ must be documented as pending comment + plain text");

  for (const evt of ["demo_form_inicia", "demo_form_envia", "demo_whatsapp_clic", "demo_prepara_lee", "faq_demo_abre"]) {
    assert.ok(vis.includes(`data-event="${evt}"`), `missing measurement hook data-event="${evt}"`);
  }

  const graph = ld?.["@graph"] || [];
  const bc = graph.find((n) => n["@type"] === "BreadcrumbList");
  const org = graph.find((n) => n["@type"] === "Organization");
  assert.ok(bc, "missing BreadcrumbList JSON-LD");
  assert.equal(bc.itemListElement?.[0]?.name, "Inicio");
  assert.equal(bc.itemListElement?.[1]?.name, "Demo");
  assert.ok(org, "missing Organization JSON-LD");

  // All in-page anchors resolve
  const ids = new Set([...vis.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of vis.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(m[1]), `broken in-page anchor: #${m[1]}`);
  }
});

// 26. S18 / S19: Form accessibility, no-JS fallback, reveal fallback, mobile CSS
test("G26 (S18/S19): form accessibility, no-JS WhatsApp fallback, reveal noscript fallback, mobile CSS", () => {
  const { src, vis } = loadPage();
  for (const id of ["contactName", "businessName", "contactPhone", "businessSector", "terminalCount", "demoContextNote"]) {
    assert.ok(new RegExp(`<label[^>]*for="${id}"`).test(vis), `missing <label for="${id}">`);
  }
  assert.ok(/<fieldset[\s\S]*?<legend[\s\S]*?businessType/.test(vis), "businessType must be inside fieldset/legend");
  assert.ok(/<fieldset[\s\S]*?<legend[\s\S]*?demoPriority/.test(vis), "demoPriority must be inside fieldset/legend");
  for (const errKey of ["contactName", "businessName", "businessType", "contactPhone", "businessSector", "demoPriority"]) {
    assert.ok(new RegExp(`data-error-for="${errKey}"`).test(vis), `missing error slot data-error-for="${errKey}"`);
  }
  // No-JS fallback inside form section (S18)
  assert.ok(
    /<noscript>[\s\S]*?https:\/\/wa\.me\/50581948526\?utm_medium=demo[\s\S]*?<\/noscript>/.test(vis),
    "missing <noscript> WhatsApp fallback inside form section",
  );
  // Reveal without JS (S15)
  assert.ok(src.includes("<noscript>") && src.includes(".reveal"), "missing <noscript> reveal visibility fallback");
  // Mobile rules (S19)
  assert.ok(/@media\s*\(max-width:\s*(?:640|768|900)px\)/.test(src), "missing responsive mobile CSS");
});

// Voseo guard (site rule, founder): the site writes in tú throughout. A Nicaraguan
// reader hears voseo as somebody else's Spanish, so the whole class is banned, not a
// list of incidents. Same guard as G27 in the restaurant suite. Accented endings only,
// so the noun "cocinas" never trips it.
test("S18-voseo: zero voseo forms in visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const voseo = [
    /\bvos\b/i,
    /\btenés\b/i,
    /\bpodés\b/i,
    /\bsabés\b/i,
    /\bquerés\b/i,
    /\bhacés\b/i,
    /\bcocinás\b/i,
    /\bvendés\b/i,
    /\bcobrás\b/i,
    /\bactivás\b/i,
    /\bempezás\b/i,
    /\bcerrás\b/i,
    /\bvenís\b/i,
    /\bpodrías\b/i,
    /\bcalcen\b/i,
    /\bcontanos\b/i,
    /\bdecime\b/i,
    /\bfijate\b/i,
    /\bmirá\b/i,
    /\bverificá\b/i,
    /\barreglá\b/i,
  ];
  for (const re of voseo) {
    assert.ok(!re.test(plain), `voseo form detected: ${re}`);
  }
});
