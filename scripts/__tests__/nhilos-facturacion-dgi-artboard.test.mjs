// Regression guards for the /facturacion-dgi/ artboard (08-facturacion-dgi.html).
// Run: node --test scripts/__tests__/nhilos-facturacion-dgi-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §4 (binding) +
// odd/tasks/nhilos-web-facturacion-dgi.md (S1-S24).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/08-facturacion-dgi.html");
const BUILD = path.join(ROOT, "scripts/build-nhilos-web.mjs");
const DESIGN_JSON = path.join(ROOT, "design/nhilos-web-foundation/design.json");
const SITE_CSS = path.join(ROOT, "design/nhilos-web-foundation/assets/site.css");
const CLAIM_AUDIT = path.join(ROOT, "docs/nhilos/branding/claims/product_claim_audit_od02_v1.3.md");

const txt = (s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

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

// 1. S5: H1 verbatim, single h1
test("G01 (S5): single h1 with verbatim brief §4.4 text", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(txt(h1[0][1]), "Sistema de facturación DGI en Nicaragua: la mecánica que exige la DT 09-2007");
});

// 2. S6: 10 H2s verbatim and in order
test("G02 (S6): 10 H2 headings match brief §4.4 verbatim and in order", () => {
  const { vis } = loadPage();
  const expected = [
    "¿La factura que emite NHILOS POS es válida ante la DGI?",
    "¿Necesito autorización de la DGI? ¿Quién la tramita?",
    "¿Sirve mi numeración actual o hay que empezar de cero?",
    "¿Qué pasa cuando hay que anular una factura? Paso a paso",
    "Lo que la DT 09-2007 le pide a la facturación computarizada",
    "Qué garantiza NHILOS y qué le corresponde a tu negocio",
    "¿Y si llega una revisión de la DGI?",
    "¿Qué pasa si uso una impresora que NHILOS no soporta?",
    "Preguntas frecuentes sobre facturación DGI y DT 09-2007",
    "Solicita una demo con tu operación fiscal real",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// 3. S6: 2 H3s verbatim
test("G03 (S6): both H3 sub-angles match brief §4.4 verbatim", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  for (const expected of [
    "Qué es la carta de autorización, en palabras simples",
    "Por qué una anulación bien hecha protege tu numeración",
  ]) {
    assert.ok(h3s.includes(expected), `missing H3: ${expected}`);
  }
});

// 4. S11: Title and description verbatim with limits
test("G04 (S11): title (<=60) and description (<=155) match brief §4.8 without em-dash", () => {
  const { src } = loadPage();
  const titleMatch = src.match(/<title>([^<]+)<\/title>/);
  const descMatch = src.match(/<meta name="description" content="([^"]+)">/);
  assert.ok(titleMatch, "missing <title>");
  assert.ok(descMatch, "missing meta description");
  const title = titleMatch[1];
  const desc = descMatch[1];
  assert.equal(title, "Facturación DGI Nicaragua: mecánica DT 09-2007 | NHILOS");
  assert.equal(
    desc,
    "Facturación DGI Nicaragua: mecánica DT 09-2007, correlativo inalterable, anulación auditada y libros exportables. La autorización es de tu negocio.",
  );
  assert.ok(title.length <= 60, `title too long: ${title.length}`);
  assert.ok(desc.length <= 155, `description too long: ${desc.length}`);
});

// 5. S11: Canonical + og:title mirror
test("G05 (S11): canonical is https://nhilospos.com/facturacion-dgi/ and og:title mirrors title", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  const ogTitle = src.match(/<meta property="og:title" content="([^"]+)">/)?.[1];
  const canonical = src.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  assert.equal(canonical, "https://nhilospos.com/facturacion-dgi/");
  assert.equal(ogTitle, title);
});

// 6. S4: Quick answer verbatim in the hero, before the first H2
test("G06 (S4): quick answer appears verbatim in the hero, before the first h2", () => {
  const { vis } = loadPage();
  const hero = (vis.split('id="inicio"')[1] || "").split("</section>")[0] || "";
  const heroTxt = txt(hero);
  const expected =
    "NHILOS garantiza la mecánica que exige la DT 09-2007: consecutivo inalterable, anulación solo con motivo auditado y libros exportables. La autorización, carta, código y numeración, la posee tu negocio como contribuyente.";
  assert.ok(heroTxt.includes(expected), "verbatim quick answer missing from hero");
  assert.ok(vis.indexOf("NHILOS garantiza la mecánica que exige la DT 09-2007") < vis.indexOf("<h2"), "quick answer must precede first h2");
});

// 7. S5: Regime clarifier near H1, before the first H2
test("G07 (S5): clarifier 'facturación computarizada, no factura electrónica' appears in hero near H1", () => {
  const { vis } = loadPage();
  const hero = (vis.split('id="inicio"')[1] || "").split("</section>")[0] || "";
  assert.match(txt(hero), /facturación computarizada, no factura electrónica/i);
});

// 8. S9: All 11 prohibited claims absent
test("G08 (S9): all 11 prohibited fiscal claims are absent from visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const spoken = txt(vis);
  const schema = JSON.stringify(ld || {});
  const haystack = (spoken + " " + schema).toLowerCase();

  // 1. Sistema autorizado / certificado / aprobado por la DGI
  for (const phrase of [
    "sistema autorizado por la dgi",
    "autorizado por la dgi.",
    "certificado por la dgi",
    "aprobado por la dgi",
  ]) {
    assert.ok(!haystack.includes(phrase), `S9.1 banned claim: ${phrase}`);
  }
  // 2. Facturación electrónica / XML firmado / CUFE; "factura electrónica" only as explicit denial or FAQ question
  for (const phrase of ["facturación electrónica", "xml firmado", "cufe"]) {
    assert.ok(!haystack.includes(phrase), `S9.2 banned claim: ${phrase}`);
  }
  for (const m of haystack.matchAll(/factura electrónica/g)) {
    const window = haystack.slice(Math.max(0, m.index - 65), m.index + 85);
    assert.match(
      window,
      /no factura electrónica|no pretende ser factura electrónica|no como factura electrónica|¿nhilos pos es factura electrónica\?|no existe validación en línea de factura electrónica/,
      `S9.2 unguarded 'factura electrónica' occurrence: "${window}"`,
    );
  }
  // 3. Cero multas / evita multas / protege de sanciones / pasa cualquier inspección
  for (const phrase of ["cero multas", "evita multas", "protege de sanciones", "pasa cualquier inspección", "multas"]) {
    assert.ok(!haystack.includes(phrase), `S9.3 banned claim: ${phrase}`);
  }
  // 4. Facturación impresa / imprime tu factura DGI en cualquier impresora
  for (const phrase of ["facturación impresa", "factura impresa", "en cualquier impresora"]) {
    assert.ok(!haystack.includes(phrase), `S9.4 banned claim: ${phrase}`);
  }
  // 5. Validación de RUC en línea contra el padrón de la DGI
  for (const phrase of ["validación de ruc en línea", "consulta al padrón de la dgi en línea", "consulta en vivo al padrón"]) {
    assert.ok(!haystack.includes(phrase), `S9.5 banned claim: ${phrase}`);
  }
  // 6. Cumplimiento total DGI / 100% conforme
  for (const phrase of ["cumplimiento total", "100% conforme"]) {
    assert.ok(!haystack.includes(phrase), `S9.6 banned claim: ${phrase}`);
  }
  // 7. Hacemos el trámite ante la DGI por ti / te conseguimos la autorización
  for (const phrase of ["hacemos el trámite", "te conseguimos la autorización"]) {
    assert.ok(!haystack.includes(phrase), `S9.7 banned claim: ${phrase}`);
  }
  // 8. Plazos legales de retención con años o número de artículo
  assert.doesNotMatch(haystack, /\b\d+\s+años\b[^.]{0,40}(?:retención|conservar|conservación|archivo)/, "S9.8 unverified retention years");
  // 9. Continuamos o migramos tu numeración anterior
  for (const phrase of ["continuamos tu numeración", "migramos tu numeración", "continuamos o migramos"]) {
    assert.ok(!haystack.includes(phrase), `S9.9 banned claim: ${phrase}`);
  }
  // 10. Anulación automática o sin autorización
  for (const phrase of ["anulación automática", "sin autorización de supervisor", "de un clic sin permisos"]) {
    assert.ok(!haystack.includes(phrase), `S9.10 banned claim: ${phrase}`);
  }
  // 11. Cómo anular una factura en la VET como contenido de esta página
  assert.ok(!haystack.includes("cómo anular una factura en la vet"), "S9.11 VET procedure belongs to child page");
});

// 9. S9 (last paragraph) + S18 IVA pricing guard: inherited site bans absent
test("G09 (S9/S18): inherited site bans and NHILOS-price IVA claims are absent", () => {
  const { vis, ld } = loadPage();
  const haystack = (txt(vis) + " " + JSON.stringify(ld || {})).toLowerCase();
  for (const b of [
    "nunca pierdes",
    "100% sincronizado",
    "solución integral",
    "transformación digital",
    "ecosistema",
    "hardware real",
    "kds",
    "caja compartida",
    "multi-marca",
    "concurrencia de red",
    "iva incluido",
    "iva aparte",
    "más iva",
    "precios netos",
    "dólares netos",
  ]) {
    assert.ok(!haystack.includes(b), `inherited banned phrase present: ${b}`);
  }
});

// 10. S10: FAQPage parity cell-by-cell
test("G10 (S10): FAQPage JSON-LD matches visible FAQ cells character-for-character", () => {
  const { faq, cells } = loadPage();
  assert.equal(cells.length, 7, `expected 7 visible FAQ cells, got ${cells.length}`);
  assert.equal(faq.length, 7, `expected 7 FAQPage items, got ${faq.length}`);
  assert.deepEqual(
    faq.map((q) => q.name),
    cells.map((c) => c[0]),
  );
  for (let i = 0; i < cells.length; i++) {
    assert.equal(cells[i][1], faq[i].acceptedAnswer.text.replace(/\s+/g, " ").trim(), `mismatch on FAQ #${i + 1}`);
  }
  // GEO rule 1: entity + market in first sentence
  for (const [q, a] of cells) {
    const first = a.split(/(?<=[.!?])\s/)[0];
    assert.match(first, /NHILOS POS/, `GEO rule 1 missing entity in first sentence: ${q}`);
    assert.match(first, /Nicaragua/, `GEO rule 1 missing market in first sentence: ${q}`);
  }
});

// 11. S10: 7 FAQ questions verbatim and in order
test("G11 (S10): all 7 FAQ questions are present verbatim and in order", () => {
  const { cells } = loadPage();
  const expected = [
    "¿NHILOS POS está autorizado por la DGI?",
    "¿Necesito carta de autorización para facturar con sistema computarizado?",
    "¿Puedo anular una factura en NHILOS POS?",
    "¿NHILOS POS es factura electrónica?",
    "¿Qué pasa con mi facturación si se cae el internet?",
    "¿NHILOS POS imprime la factura en mi impresora?",
    "¿Qué le entrego a mi contador?",
  ];
  assert.deepEqual(
    cells.map((c) => c[0]),
    expected,
  );
});

// 12. S8: Responsibility division table exists with 8 left / 6 right and PC-* in HTML comment
test("G12 (S8): responsibility division has 8 NHILOS items, 6 business items, and PC-* IDs in HTML comment only", () => {
  const { src, vis } = loadPage();
  const divSec = (vis.split('id="division"')[1] || "").split("</section>")[0] || "";
  const leftCol = (divSec.split('data-col="nhilos"')[1] || "").split('data-col="negocio"')[0] || "";
  const rightCol = divSec.split('data-col="negocio"')[1] || "";
  const leftItems = [...leftCol.matchAll(/<li[^>]*>/g)];
  const rightItems = [...rightCol.matchAll(/<li[^>]*>/g)];
  assert.equal(leftItems.length, 8, `expected 8 NHILOS guarantees, got ${leftItems.length}`);
  assert.equal(rightItems.length, 6, `expected 6 business responsibilities, got ${rightItems.length}`);

  // PC-* IDs must not appear in visible copy, but must be cited in an HTML comment
  assert.doesNotMatch(txt(vis), /\bPC-[A-Z]+-\d+\b/, "PC-* IDs must stay in HTML comments, not visible copy");
  const commentMatch = src.match(/<!--[\s\S]*?product_claim_audit_od02_v1\.3\.md[\s\S]*?-->/);
  assert.ok(commentMatch, "missing HTML comment citing product_claim_audit_od02_v1.3.md");
  for (const id of ["PC-FISC-01", "PC-FISC-02", "PC-FISC-03", "PC-FISC-05", "PC-SEC-03", "PC-DASH-04", "PC-OFF-01", "PC-OFF-02", "PC-OFF-03"]) {
    assert.ok(commentMatch[0].includes(id), `claim audit comment missing ${id}`);
  }
});

// 13. S8: Every PC-* ID cited in the division table comment is verified APPROVED_WEBSITE in the claim audit doc
test("G13 (S8): every PC-* ID cited for the division table is APPROVED_WEBSITE in product_claim_audit_od02_v1.3.md", () => {
  const { src } = loadPage();
  const auditDoc = fs.readFileSync(CLAIM_AUDIT, "utf8");
  const commentMatch = src.match(/<!--[\s\S]*?product_claim_audit_od02_v1\.3\.md[\s\S]*?-->/);
  assert.ok(commentMatch, "missing claim audit comment");
  const ids = [...new Set([...commentMatch[0].matchAll(/\bPC-[A-Z]+-\d+\b/g)].map((m) => m[0]))];
  assert.ok(ids.length >= 9, `expected at least 9 verified PC-* IDs, found ${ids.length}`);
  for (const id of ids) {
    const rowRe = new RegExp(`\\|\\s*\\*\\*${id}\\*\\*\\s*\\|[^\\n]+APPROVED_WEBSITE`);
    assert.match(auditDoc, rowRe, `${id} is not APPROVED_WEBSITE in claim audit`);
  }
});

// 14. S12/S20: Real captures exist on disk with exact real dimensions and stay under 200 KB total
test("G14 (S12/S20): real captures exist, declare exact real dimensions, and stay under 200 KB total", () => {
  const { vis } = loadPage();
  const required = [
    { file: "media/pos_10_historial_ventas.webp", width: "1080", height: "2316" },
    { file: "media/pos_13_dialogo_anular_factura.webp", width: "800", height: "1280" },
    { file: "media/dsh_06_fiscal.webp", width: "1440", height: "900" },
  ];
  let totalBytes = 0;
  for (const cap of required) {
    const fullPath = path.join(ROOT, "design/nhilos-web-foundation", cap.file);
    assert.ok(fs.existsSync(fullPath), `missing file: ${cap.file}`);
    totalBytes += fs.statSync(fullPath).size;
    const imgRe = new RegExp(`<img[^>]*src="${cap.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
    const tag = vis.match(imgRe)?.[0];
    assert.ok(tag, `missing <img> for ${cap.file}`);
    assert.match(tag, new RegExp(`width="${cap.width}"`), `${cap.file} width must be ${cap.width}`);
    assert.match(tag, new RegExp(`height="${cap.height}"`), `${cap.file} height must be ${cap.height}`);
  }
  assert.ok(totalBytes < 200 * 1024, `captures exceed 200 KB budget: ${totalBytes} bytes`);
});

// 15. S12: 'datos de demostración' label next to each capture
test("G15 (S12): each capture carries the 'datos de demostración' honesty label", () => {
  const { vis } = loadPage();
  const figures = [...vis.matchAll(/<figure[^>]*>([\s\S]*?)<\/figure>/g)].map((m) => m[1]);
  assert.ok(figures.length >= 2, `expected at least 2 <figure> proof blocks, got ${figures.length}`);
  for (const fig of figures) {
    assert.match(fig, /class="demo-tag"/, "figure missing .demo-tag");
    assert.match(txt(fig).toLowerCase(), /datos de demostración/, "figure missing 'datos de demostración'");
  }
});

// 16. S12: Dialog alt must NOT mention PIN or supervisor
test("G16 (S12): pos_13_dialogo_anular_factura alt does not claim PIN or supervisor", () => {
  const { vis } = loadPage();
  const tag = vis.match(/<img[^>]*src="media\/pos_13_dialogo_anular_factura\.webp"[^>]*>/)?.[0];
  assert.ok(tag, "missing dialog <img>");
  const alt = tag.match(/alt="([^"]+)"/)?.[1] || "";
  assert.ok(alt.length > 20, "alt must describe what the screen shows");
  assert.doesNotMatch(alt, /\bpin\b|supervisor/i, `dialog alt falsely claims PIN/supervisor: ${alt}`);
});

// 17. S1/S17.17: Artboard uses relative media/, fonts/, assets/ paths
test("G17 (S1): artboard uses relative paths for assets/, media/, and fonts/", () => {
  const { src } = loadPage();
  assert.match(src, /<link rel="stylesheet" href="assets\/site\.css">/);
  assert.match(src, /<script src="assets\/site\.js"><\/script>/);
  for (const m of src.matchAll(/(?:src|poster|href)="([^"]*(?:assets|media|fonts)\/[^"]*)"/g)) {
    assert.ok(!m[1].startsWith("/"), `artboard must use relative path: ${m[1]}`);
    assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation", m[1])), `missing asset: ${m[1]}`);
  }
});

// 18. S16: faq-cell reused; no repeated patterns from home, hub, or precios
test("G18 (S16): faq-cell is reused and no home/hub/precios section patterns are repeated", () => {
  const { src, body } = loadPage();
  assert.match(src, /class="faq-wrap reveal"/);
  assert.match(src, /class="faq-cells stagger"/);
  const pageCss = (src.split("<style>")[1] || "").split("</style>")[0] || "";
  const bannedPatterns = [
    "hero-question", "hero-questions", "mode-btn", "ledger-row", "ledger-split",
    "compare-band", "compare-col", "price-strip", "rate-rows", "rate-row",
    "compare-table", "plan-fichas", "plan-ficha", "pack-items", "charge-list",
    "risk-band-grid", "assure-pair", "steps-strip", "hw-rule", "ladder", "rung",
    "plan-grid", "plan-card", "pack-grid", "pack-card", "addons-list", "fineprint",
  ];
  for (const cls of bannedPatterns) {
    assert.ok(!pageCss.includes(`.${cls}`), `page CSS repeats pattern class: .${cls}`);
    assert.ok(!body.includes(`class="${cls}`) && !body.includes(` ${cls}"`), `body repeats pattern class: ${cls}`);
  }
  assert.doesNotMatch(pageCss, /object-fit:\s*cover/, "evidence must never be cropped with object-fit: cover");
});

// 19. S15: Every var(--*) token used in the page exists in assets/site.css
test("G19 (S15): every var(--*) token used in the artboard is defined in assets/site.css", () => {
  const { src } = loadPage();
  const css = fs.readFileSync(SITE_CSS, "utf8");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...new Set([...src.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
  const missing = used.filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `undefined CSS tokens: ${missing.join(", ")}`);
});

// 20. S18: Zero em-dashes anywhere in the file
test("G20 (S18): zero em-dashes (—) anywhere in the artboard file", () => {
  const { src } = loadPage();
  assert.equal(src.includes("—"), false, "artboard contains forbidden em-dash (—)");
});

// 21. S18: Voice — zero site self-narration
test("G21 (S18): copy talks about the reader's operation, never narrates the site", () => {
  const { vis, ld } = loadPage();
  const spoken = txt(vis) + " " + JSON.stringify(ld || {});
  for (const re of [
    /esta página/i,
    /esta sección/i,
    /este sitio/i,
    /esta web/i,
    /página dueña/i,
    /enunciada aquí/i,
    /mantenida en un solo lugar/i,
    /dicho tal cual/i,
    /La regla, publicada:/i,
  ]) {
    assert.doesNotMatch(spoken, re, `site self-narration found: ${re}`);
  }
});

// 22. S18: Zero internal vocabulary in visible copy and JSON-LD
test("G22 (S18): zero internal vocabulary or old project names in visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const spoken = txt(vis);
  const schema = JSON.stringify(ld || {});
  for (const term of [
    "issue #",
    "#983",
    "entitlement",
    "go-live",
    "golive",
    "staging",
    "backlog",
    "sprint",
    "hotfix",
    "omnifood",
    "roadmap",
    "próximamente",
    "cuando exista",
  ]) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal((spoken.match(new RegExp(escaped, "gi")) || []).length, 0, `visible copy leaks "${term}"`);
    assert.equal((schema.match(new RegExp(escaped, "gi")) || []).length, 0, `JSON-LD leaks "${term}"`);
  }
  for (const term of ["TODO", "QA", "WIP"]) {
    const word = new RegExp(`\\b${term}\\b`);
    assert.equal((spoken.match(word) || []).length, 0, `visible copy leaks "${term}"`);
    assert.equal((schema.match(word) || []).length, 0, `JSON-LD leaks "${term}"`);
  }
});

// 23. S18: BOM absent from visible text and JSON-LD
test("G23 (S18): BOM is absent from visible text and JSON-LD", () => {
  const { vis, ld } = loadPage();
  assert.doesNotMatch(txt(vis), /\bBOM\b/);
  assert.doesNotMatch(JSON.stringify(ld || {}), /\bBOM\b/);
});

// 24. S1: Registered in PAGES and design.json
test("G24 (S1): registered in build-nhilos-web.mjs PAGES and design.json", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.match(buildSrc, /source:\s*"08-facturacion-dgi\.html",\s*out:\s*"facturacion-dgi\/index\.html",\s*url:\s*"\/facturacion-dgi\/"/);
  const design = JSON.parse(fs.readFileSync(DESIGN_JSON, "utf8"));
  assert.ok(
    design.artboards.some((a) => a.file === "08-facturacion-dgi.html"),
    "08-facturacion-dgi.html missing from design.json",
  );
});

// 25. S13/S14/S15: WhatsApp, primary CTA, measurement events, BreadcrumbList, Organization, and safe links
test("G25 (S13/S14/S15): WhatsApp, measurement events, BreadcrumbList, Organization, and no dead links", () => {
  const { src, vis, ld } = loadPage();
  // WhatsApp official number + utm_medium=facturacion-dgi
  const waLinks = [...vis.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(waLinks.length >= 2, "expected WhatsApp CTA links");
  for (const url of waLinks) assert.match(url, /^https:\/\/wa\.me\/50581948526/);
  assert.ok(waLinks.some((u) => u.includes("utm_medium=facturacion-dgi")), "missing utm_medium=facturacion-dgi on WhatsApp CTA");

  // S14 data-event hooks
  for (const ev of [
    "facturacion_llega_division",
    "facturacion_anulacion_lee",
    "faq_facturacion_abre",
    "cta_demo_facturacion",
    "cta_whatsapp_facturacion",
  ]) {
    assert.ok(src.includes(`data-event="${ev}"`), `missing data-event="${ev}"`);
  }

  // BreadcrumbList + Organization
  const bc = ld?.["@graph"]?.find((n) => n["@type"] === "BreadcrumbList");
  const org = ld?.["@graph"]?.find((n) => n["@type"] === "Organization");
  assert.ok(bc, "missing BreadcrumbList in JSON-LD");
  assert.ok(org, "missing Organization in JSON-LD");
  assert.equal(bc.itemListElement[0].name, "Inicio");
  assert.equal(bc.itemListElement[1].name, "Facturación DGI");

  // Internal links: only published pages (/, /software-pos/, /precios/); pending pages never href
  const allowedInternal = new Set(["/", "/software-pos/", "/precios/"]);
  for (const m of vis.matchAll(/href="(\/[^"]*)"/g)) {
    assert.ok(allowedInternal.has(m[1]), `unexpected internal href: ${m[1]}`);
  }
  assert.ok(vis.includes('href="/precios/"'), "missing link to /precios/");
  assert.ok(vis.includes('href="/software-pos/"'), "missing link to /software-pos/");
  for (const pending of ["/inventario/", "/demo/", "/software-pos/sin-internet/", "/facturacion-dgi/restaurantes/", "/facturacion-dgi/como-anular-factura-vet/"]) {
    assert.equal(vis.includes(`href="${pending}"`), false, `dead href to unpublished page: ${pending}`);
    assert.match(src, new RegExp(`<!--[^>]*${pending.replace(/\//g, "\\/")}[^>]*-->`), `pending page ${pending} must be noted in HTML comment`);
  }

  // All in-page anchors resolve
  const ids = new Set([...vis.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of vis.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(m[1]), `broken in-page anchor: #${m[1]}`);
  }
});

// 26. S17.26: No real personal names
test("G26 (S17): no personal names in public copy", () => {
  const { src } = loadPage();
  assert.equal(src.includes("Octavio"), false);
});

// 27. S15/S19: Noscript fallback + mobile responsive media queries (no fixed wide grids without breakpoints)
test("G27 (S15/S19): noscript reveal fallback present and responsive mobile rules included", () => {
  const { src } = loadPage();
  assert.match(src, /<noscript>/);
  const pageCss = (src.split("<style>")[1] || "").split("</style>")[0] || "";
  assert.match(pageCss, /@media\s*\(max-width:/, "missing mobile responsive media queries");
  assert.match(src, /<nav class="spine"/, "missing shared spine navigation");
  assert.match(src, /<button type="button" class="back-top"/, "missing back-to-top button");
});
