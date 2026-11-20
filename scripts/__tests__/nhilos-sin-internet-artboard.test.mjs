// Regression guards for the /software-pos/sin-internet/ artboard (11-sin-internet.html).
// Run: node --test scripts/__tests__/nhilos-sin-internet-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §7 (binding) +
// odd/tasks/nhilos-web-sin-internet.md (S1-S25).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/11-sin-internet.html");
const MEDIA_DIR = path.join(ROOT, "design/nhilos-web-foundation/media");
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

// 1. S5 / S18.1: H1 verbatim and segment-neutral
test("G01 (S5): single h1 verbatim and segment-neutral", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  const h1Text = txt(h1[0][1]);
  assert.equal(h1Text, "Sistema POS sin internet: qué pasa cuando la red se cae, paso a paso");
  for (const seg of ["restaurante", "cafetería", "cafeteria", "panadería", "food park", "mostrador"]) {
    assert.ok(!h1Text.toLowerCase().includes(seg), `segment "${seg}" leaked into <h1>`);
  }
});

// 2. S6 / S18.2: 8 H2 headings verbatim and in order
test("G02 (S6): 8 H2 headings match brief §7.4 verbatim and in order", () => {
  const { vis } = loadPage();
  const expected = [
    "Sistema POS sin internet para restaurante, cafetería, food park o mostrador",
    "¿Qué pasa cuando se cae el internet a media venta?",
    "¿Y la facturación sin internet? El correlativo no se rompe",
    "¿Se pierden las ventas mientras no hay internet?",
    "La condición honesta: la terminal quedó configurada con tu catálogo",
    "¿Y si se daña la terminal?",
    "Preguntas frecuentes sobre el POS sin internet",
    "Solicita una demo y mira la contingencia con tu operación",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// 3. S6 / S18.3: Both H3 headings verbatim under H2 2
test("G03 (S6): both H3 sub-angles match verbatim under H2 2", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  assert.ok(h3s.includes("Qué sigue funcionando sin conexión"), "missing H3: Qué sigue funcionando sin conexión");
  assert.ok(h3s.includes("Qué no es instantáneo (y cuándo llega)"), "missing H3: Qué no es instantáneo (y cuándo llega)");
  const h2Scene = vis.indexOf("¿Qué pasa cuando se cae el internet a media venta?");
  const h3Keep = vis.indexOf("Qué sigue funcionando sin conexión");
  const h3NotInstant = vis.indexOf("Qué no es instantáneo (y cuándo llega)");
  const h2Fiscal = vis.indexOf("¿Y la facturación sin internet? El correlativo no se rompe");
  assert.ok(h2Scene < h3Keep && h3Keep < h3NotInstant && h3NotInstant < h2Fiscal, "H3s must sit under H2 2 in order");
});

// 4. S10 / S18.4: Title (<=60, segment-neutral) and description (<=155)
test("G04 (S10): title (<=60, segment-neutral) and description (<=155) match S10", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = src.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.equal(title, "POS sin internet en Nicaragua: qué pasa cuando cae la red");
  assert.ok(title.length <= 60, `title too long (${title.length})`);
  for (const seg of ["restaurante", "cafetería", "cafeteria", "panadería", "food park", "mostrador"]) {
    assert.ok(!title.toLowerCase().includes(seg), `segment "${seg}" leaked into <title>`);
  }
  assert.equal(
    desc,
    "La venta se completa en la terminal: cobra, emite el ticket con su correlativo y sincroniza al reconectar, en orden. Mira cómo funciona sin internet.",
  );
  assert.ok(desc.length <= 155, `description too long (${desc.length})`);
});

// 5. S10 / S18.5: Canonical + og:title
test("G05 (S10): canonical is https://nhilospos.com/software-pos/sin-internet/ and og:title mirrors title", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.equal(src.match(/<link rel="canonical" href="([^"]+)">/)?.[1], "https://nhilospos.com/software-pos/sin-internet/");
  assert.equal(src.match(/<meta property="og:title" content="([^"]+)">/)?.[1], title);
  assert.equal(src.match(/<meta property="og:url" content="([^"]+)">/)?.[1], "https://nhilospos.com/software-pos/sin-internet/");
});

// 6. S4 / S18.6: Quick answer in first 150 px INCLUDING the condition
test("G06 (S4): quick answer appears verbatim in hero before first H2 and includes the condition", () => {
  const { vis } = loadPage();
  const beforeFirstH2 = txt(vis.split(/<h2\b/i)[0]);
  const expected =
    "Cuando la red se cae, la venta se completa en la terminal: cobra en córdobas o dólares, emite el ticket con su correlativo consecutivo y queda registrada. Al volver el internet, todo llega al panel web en orden, sin duplicar. La condición: la terminal quedó configurada con tu catálogo.";
  assert.ok(beforeFirstH2.includes(expected), "quick answer with condition missing verbatim before first H2");
});

// 7. S8 / S18.7: All 9 prohibitions absent
test("G07 (S8): all 9 offline claim prohibitions are absent from visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  const banned = [
    "funciona sin luz",
    "sin electricidad",
    "autonomía eléctrica",
    "horas de batería",
    "batería de larga duración",
    "facturación impresa",
    "cualquier ticketera",
    "cajas conectadas por red local",
    "coordinación en red local",
    "despacho a cocina",
    "la venta no se detiene",
  ];
  for (const term of banned) {
    assert.ok(!combined.includes(term), `prohibited S8 claim found: "${term}"`);
  }
});

// 8. S8 / S18.8: Inherited site bans absent
test("G08 (S8): inherited site bans and NHILOS-price IVA claims are absent", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  const banned = [
    "factura electrónica",
    "facturación electrónica",
    "autorizado por la dgi",
    "cero multas",
    "solución integral",
    "ecosistema",
    "transformación digital",
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

// 9. S8.1 / S18.9: Zero '100%', 'instantáneo' (outside negated H3), 'tiempo real', 'todo se sincroniza', or synonyms
test("G09 (S8.1): zero '100%', affirmative 'instantáneo', 'tiempo real', 'todo se sincroniza', or synonyms", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  // Strip ONLY the verbatim negated H3 heading before scanning for 'instantáneo'
  const withoutNegatedH3 = combined.replace(/qué no es instantáneo \(y cuándo llega\)/g, "");
  for (const term of [
    "100%",
    "todo se sincroniza",
    "instantáneo",
    "instantánea",
    "al instante",
    "al toque",
    "tiempo real",
  ]) {
    assert.ok(!withoutNegatedH3.includes(term), `forbidden real-time/100% claim found: "${term}"`);
  }
});

// 10. S8.2 / S18.10: Zero 'nunca pierdes', 'cero pérdida', 'no paras'
test("G10 (S8.2): zero 'nunca pierdes', 'cero pérdida', or 'no paras'", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  for (const term of ["nunca pierdes", "cero pérdida", "cero perdida", "no paras"]) {
    assert.ok(!combined.includes(term), `forbidden absolute continuity claim found: "${term}"`);
  }
});

// 11. S8.8 / S18.11: 'outbox' absent; 'cola de salida del dispositivo' present
test("G11 (S8.8): 'outbox' is absent from visible copy and JSON-LD; 'cola de salida del dispositivo' is present", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  assert.ok(!/\boutbox\b/i.test(combined), "internal term 'outbox' leaked into visible copy or JSON-LD");
  assert.ok(combined.includes("cola de salida del dispositivo"), "approved phrase 'cola de salida del dispositivo' missing");
});

// 12. S9 / S18.12: FAQPage parity + GEO Rule 1
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

// 13. S9 / S18.13: All 7 FAQ questions verbatim and in order
test("G13 (S9): all 7 FAQ questions match S9 verbatim and in order", () => {
  const { cells } = loadPage();
  const expected = [
    "¿Cómo funciona un POS offline?",
    "¿Se pierden las ventas sin internet?",
    "¿Puedo facturar sin conexión?",
    "¿Cuándo veo las ventas en mi panel?",
    "¿Funciona con varias terminales al mismo tiempo sin internet?",
    "¿Y si se va la luz?",
    "¿Qué necesito para que funcione sin internet?",
  ];
  assert.deepEqual(
    cells.map((c) => c[0]),
    expected,
  );
});

// 14. S8.3 / S18.14: Multi-terminal FAQ explicitly answers 'no, hoy'
test("G14 (S8.3): multi-terminal offline FAQ explicitly states 'no, hoy' and never 'sí'", () => {
  const { cells } = loadPage();
  const multi = cells.find((c) => c[0] === "¿Funciona con varias terminales al mismo tiempo sin internet?");
  assert.ok(multi, "missing multi-terminal FAQ");
  const ans = multi[1].toLowerCase();
  assert.ok(ans.startsWith("no, hoy"), `multi-terminal answer must begin with 'No, hoy': got "${multi[1]}"`);
  assert.ok(!ans.startsWith("sí"), "multi-terminal answer must never start with 'sí'");
});

// 15. S8.4 / S18.15: Power outage distinction present (apagón eléctrico vs apagón de red)
test("G15 (S8.4): distinguishes power outage from network outage without promising battery autonomy", () => {
  const { vis } = loadPage();
  const lower = txt(vis).toLowerCase();
  assert.ok(lower.includes("apagón eléctrico") && lower.includes("apagón de red"), "must distinguish apagón eléctrico from apagón de red");
  assert.ok(lower.includes("necesita energía"), "must state terminal needs electrical power");
});

// 16. S13 / S18.16: Sale clip alt/caption describes queue badge + success bar, NEVER 'sin señal' from status bar
test("G16 (S13): sale clip metadata describes queue badge '2' and success bar, never claims 'sin señal'", () => {
  const { vis } = loadPage();
  const videoBlock = vis.match(/<figure\b[^>]*data-proof="venta-offline"[\s\S]*?<\/figure>/);
  assert.ok(videoBlock, 'missing <figure data-proof="venta-offline">');
  const blockLower = videoBlock[0].toLowerCase();
  assert.ok(blockLower.includes("pos_offline_venta_exitosa.30ccc3cc.mp4"), "must use audited sale video");
  assert.ok(blockLower.includes("pos_offline_venta_exitosa_poster.ea6487ab.webp"), "must use audited sale poster");
  assert.ok(!blockLower.includes("autoplay"), "video must not use autoplay attribute (S20)");
  assert.ok(blockLower.includes('preload="metadata"'), "video must use preload='metadata' (S20)");
  assert.ok(blockLower.includes("muted") && blockLower.includes("playsinline"), "video must be muted and playsinline");
  assert.ok(blockLower.includes("venta procesada con éxito"), "caption/label must reference 'Venta procesada con éxito'");
  assert.ok(blockLower.includes("cola") && blockLower.includes("2"), "caption/label must reference queue badge '2'");
  assert.ok(!blockLower.includes("sin señal") && !blockLower.includes("barra de estado"), "must NOT claim 'sin señal' or status bar proof");
});

// 17. S13 / S18.17: Honesty demo-tag on both pieces, with 'editada' on the sync poster
test("G17 (S13): both audited pieces exist on disk and carry exact honesty labels including 'editada'", () => {
  const { vis } = loadPage();
  for (const f of [
    "pos_offline_venta_exitosa.30ccc3cc.mp4",
    "pos_offline_venta_exitosa_poster.ea6487ab.webp",
    "pos_offline_cola_sync_poster.cf458b78.webp",
  ]) {
    assert.ok(fs.existsSync(path.join(MEDIA_DIR, f)), `missing audited media file: ${f}`);
  }
  assert.ok(vis.includes("Grabación real de la terminal · datos de demostración"), "missing raw recording honesty label");
  assert.ok(vis.includes("Grabación real editada · datos de demostración"), "missing edited recording honesty label");
  const syncBlock = vis.match(/<figure\b[^>]*data-proof="cola-sync"[\s\S]*?<\/figure>/);
  assert.ok(syncBlock, 'missing <figure data-proof="cola-sync">');
  assert.ok(syncBlock[0].includes("pos_offline_cola_sync_poster.cf458b78.webp"), "must use audited sync poster");
  assert.ok(syncBlock[0].includes('width="720"') && syncBlock[0].includes('height="1544"'), "sync poster must declare real 720x1544 dims");
});

// 18. S11 / S18.18: Unaudited loops never referenced
test("G18 (S11): unaudited offline loops are never referenced", () => {
  const { src } = loadPage();
  assert.ok(!src.includes("pos_offline_live_loop"), "unaudited pos_offline_live_loop referenced");
  assert.ok(!src.includes("pos_offline_narrative_loop"), "unaudited pos_offline_narrative_loop referenced");
});

// 19. S1 / S18.19: Relative asset paths in artboard
test("G19 (S1): artboard uses relative paths for assets/, media/, and fonts/", () => {
  const { src } = loadPage();
  assert.ok(src.includes('href="assets/site.css"'), "missing relative assets/site.css");
  assert.ok(src.includes('src="assets/site.js"'), "missing relative assets/site.js");
  assert.ok(!/\s(?:src|href|poster)="\/(?:assets|media|fonts)\//.test(src), "absolute /assets, /media, or /fonts path found in artboard");
});

// 20. S17 / S18.20: faq-cell and demo-tag reused; no repeated sibling patterns
test("G20 (S17): faq-cell and demo-tag reused and no sibling section patterns repeated", () => {
  const { src, vis } = loadPage();
  assert.ok(vis.includes('class="faq-cell"'), "must reuse faq-cell");
  assert.ok(vis.includes('class="demo-tag"'), "must reuse demo-tag");
  for (const pat of [
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
    "dm-",
  ]) {
    assert.ok(!src.includes(pat), `repeated sibling pattern found: "${pat}"`);
  }
});

// 21. S16 / S18.21: Every var(--*) exists in site.css
test("G21 (S16): every var(--*) token used in artboard is defined in assets/site.css", () => {
  const { src } = loadPage();
  const css = fs.readFileSync(SITE_CSS, "utf8");
  const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);
  const used = new Set([...src.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
  const missing = [...used].filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `undefined CSS tokens: ${missing.join(", ")}`);
});

// 22. S19 / S18.22: Zero em-dashes anywhere
test("G22 (S19): zero em-dashes (—) anywhere in the artboard file", () => {
  const { src } = loadPage();
  assert.ok(!src.includes("—"), "em-dash (—) found in artboard");
});

// 23. S19 / S18.23: Voice — zero site narration
test("G23 (S19): copy speaks about the reader's operation, never narrates the site", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  for (const phrase of [
    "esta página",
    "este sitio",
    "en esta sección",
    "orienta y reparte",
    "dicho tal cual",
    "como ves arriba",
    "más abajo en esta",
  ]) {
    assert.ok(!combined.includes(phrase), `site narration phrase found: "${phrase}"`);
  }
});

// 24. S19 / S18.24: Zero internal vocabulary or roadmap language
test("G24 (S19): zero internal vocabulary or roadmap language in visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const combined = `${txt(vis)} ${JSON.stringify(ld || {})}`.toLowerCase();
  for (const term of [
    "omnifood",
    "entitlements",
    "go-live",
    "multi-tenant",
    "#983",
    "#993",
    "#994",
    "roadmap",
    "hoja de ruta",
    "próximamente",
    "hidratado",
  ]) {
    assert.ok(!combined.includes(term), `internal vocabulary found: "${term}"`);
  }
  assert.ok(!/\b(bom|cpp|r-0[1-7]|pc-[a-z]+-\d+)\b/i.test(combined), "internal acronym/ID found");
});

// 25. S1 / S18.25: Registered in PAGES (3-level route) and design.json
test("G25 (S1): registered in build-nhilos-web.mjs PAGES at 3-level route and in design.json", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.ok(
    buildSrc.includes("11-sin-internet.html") &&
      buildSrc.includes('out: "software-pos/sin-internet/index.html"') &&
      buildSrc.includes('url: "/software-pos/sin-internet/"'),
    "not registered in PAGES at 3-level route",
  );
  const design = JSON.parse(fs.readFileSync(DESIGN_JSON, "utf8"));
  assert.ok(
    design.artboards.some((a) => a.file === "11-sin-internet.html"),
    "not registered in design.json",
  );
});

// 26. S14 / S15 / S16 / S18.26: Outbound links, 3-level BreadcrumbList, 5 data-event hooks, WhatsApp UTM, no personal names
test("G26 (S14/S15/S16): outbound links, 3-level BreadcrumbList, 5 events, WhatsApp UTM, no personal names", () => {
  const { src, vis, ld } = loadPage();
  for (const route of ['href="/"', 'href="/software-pos/"', 'href="/facturacion-dgi/"', 'href="/precios/"', 'href="/demo/"']) {
    assert.ok(vis.includes(route), `missing outbound link ${route}`);
  }
  for (const pending of ["/software-pos/restaurantes/", "/software-pos/food-parks/", "/software-pos/hardware/"]) {
    assert.ok(!new RegExp(`href="${pending.replace(/\//g, "\\/")}"`).test(vis), `pending route ${pending} must not be a live link`);
    assert.ok(src.includes(pending), `pending route ${pending} must be documented as comment/plain text`);
  }
  for (const evt of ["offline_llega_escena", "offline_listas_lee", "faq_offline_abre", "cta_demo_offline", "cta_whatsapp_offline"]) {
    assert.ok(vis.includes(`data-event="${evt}"`), `missing measurement hook data-event="${evt}"`);
  }
  const waLinks = [...vis.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(waLinks.length >= 2, "expected at least 2 WhatsApp links");
  for (const href of waLinks) {
    assert.ok(href.startsWith("https://wa.me/50581948526"), `unexpected WhatsApp number: ${href}`);
    assert.ok(href.includes("utm_medium=sin-internet"), `WhatsApp link missing utm_medium=sin-internet: ${href}`);
  }

  const graph = ld?.["@graph"] || [];
  const bc = graph.find((n) => n["@type"] === "BreadcrumbList");
  const org = graph.find((n) => n["@type"] === "Organization");
  assert.ok(bc && bc.itemListElement?.length === 3, "BreadcrumbList must have 3 levels");
  assert.equal(bc.itemListElement[0].name, "Inicio");
  assert.equal(bc.itemListElement[1].name, "Software POS");
  assert.equal(bc.itemListElement[2].name, "Sin internet");
  assert.ok(org, "missing Organization JSON-LD");

  const ids = new Set([...vis.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of vis.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(m[1]), `broken in-page anchor: #${m[1]}`);
  }

  const lower = txt(vis).toLowerCase();
  for (const person of ["octavio", "morales", "john doe", "maría", "carlos"]) {
    assert.ok(!lower.includes(person), `personal name found: "${person}"`);
  }
});

// 27. S16 / S20: Noscript reveal fallback and responsive mobile CSS
test("G27 (S16/S20): noscript reveal fallback and responsive mobile CSS present", () => {
  const { src } = loadPage();
  assert.ok(src.includes("<noscript>") && src.includes(".reveal"), "missing <noscript> reveal fallback");
  assert.ok(/@media\s*\(max-width:\s*(?:640|768|900)px\)/.test(src), "missing responsive mobile CSS");
});
