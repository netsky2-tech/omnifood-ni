// Regression guards for the /software-pos/food-parks/ artboard (13-food-parks.html).
// Run: node --test scripts/__tests__/nhilos-food-parks-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §6 (binding) +
// odd/tasks/nhilos-web-food-parks.md (S1-S20).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/13-food-parks.html");
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

// G01 (S5 / S16.1): Single H1 verbatim with segment primary keyword
test("G01 (S5): single h1 verbatim with segment primary keyword", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  const h1Text = txt(h1[0][1]);
  assert.equal(h1Text, "Software para food park: cada puesto con su catálogo y su cobro, en un solo sistema");
  assert.ok(h1Text.toLowerCase().includes("software para food park"), "primary keyword missing in H1");
});

// G02 (S6 / S16.2): All 8 H2 headings verbatim and in exact order
test("G02 (S6): 8 H2 headings match brief §6.4 and S6 verbatim and in order", () => {
  const { vis } = loadPage();
  const expected = [
    "¿Qué es NHILOS POS en un food park?",
    "¿Cómo opera el administrador del park?",
    "Puestos que revenden y cocinas que preparan, en el mismo park",
    "¿Qué pasa cuando se cae el internet en el park?",
    "Facturación por puesto conforme a la DT 09-2007",
    "¿Cuánto cuesta para todo el park?",
    "Preguntas frecuentes sobre el POS para food parks",
    "Solicita una demo con la operación de tu park",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// G03 (S6 / S16.3): All 3 required H3 headings verbatim and under their parent H2s
test("G03 (S6): all 3 H3 sub-angles match verbatim and sit under their parent H2s", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  const expectedH3s = [
    "Cada puesto: su catálogo, su cobro, su turno",
    "Tres puestos o veinte: el park también es pequeño",
    "Roles: el administrador administra, el locatario opera",
  ];
  for (const h of expectedH3s) {
    assert.ok(h3s.includes(h), `missing H3: ${h}`);
  }
  const idxH2_1 = vis.indexOf("¿Qué es NHILOS POS en un food park?");
  const idxH2_2 = vis.indexOf("¿Cómo opera el administrador del park?");
  const idxH2_3 = vis.indexOf("Puestos que revenden y cocinas que preparan, en el mismo park");
  const idxH3_1 = vis.indexOf("Cada puesto: su catálogo, su cobro, su turno");
  const idxH3_2 = vis.indexOf("Tres puestos o veinte: el park también es pequeño");
  const idxH3_3 = vis.indexOf("Roles: el administrador administra, el locatario opera");

  assert.ok(idxH3_1 > idxH2_1 && idxH3_1 < idxH2_2, "H3 puestos must be inside H2 1");
  assert.ok(idxH3_2 > idxH2_1 && idxH3_2 < idxH2_2, "H3 scale must be inside H2 1");
  assert.ok(idxH3_3 > idxH2_2 && idxH3_3 < idxH2_3, "H3 roles must be inside H2 2");
});

// G04 (S10 / S16.4): Title and meta description exact and within limits
test("G04 (S10): title <= 60 chars and meta description <= 155 chars verbatim", () => {
  const { src } = loadPage();
  const title = txt(src.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
  const desc = src.match(/<meta name="description" content="([^"]*)"/)?.[1] || "";
  assert.equal(title, "Software para food park en Nicaragua | NHILOS POS");
  assert.ok(title.length <= 60, `title too long: ${title.length}`);
  assert.equal(
    desc,
    "Un sistema para todo el food park: cada puesto con su catálogo y su cobro, y la operación visible en el panel web. Pide una demo. NHILOS POS.",
  );
  assert.ok(desc.length <= 155, `description too long: ${desc.length}`);
});

// G05 (S10 / S14 / S16.5): Canonical, og:title, Organization, 3-level BreadcrumbList
test("G05 (S10/S14): canonical, og:title, Organization and 3-level BreadcrumbList", () => {
  const { src, vis, ld } = loadPage();
  const title = txt(src.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
  const canonical = src.match(/<link rel="canonical" href="([^"]*)"/)?.[1] || "";
  const ogTitle = src.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || "";
  const ogUrl = src.match(/<meta property="og:url" content="([^"]*)"/)?.[1] || "";

  assert.equal(canonical, "https://nhilospos.com/software-pos/food-parks/");
  assert.equal(ogTitle, title);
  assert.equal(ogUrl, canonical);

  assert.ok(ld && Array.isArray(ld["@graph"]), "JSON-LD @graph missing");
  const org = ld["@graph"].find((n) => n["@type"] === "Organization");
  assert.ok(org && org.name === "NHILOS POS", "Organization node missing");

  const bc = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList");
  assert.ok(bc, "BreadcrumbList missing");
  assert.equal(bc.itemListElement.length, 3);
  assert.equal(bc.itemListElement[0].name, "Inicio");
  assert.equal(bc.itemListElement[0].item, "https://nhilospos.com/");
  assert.equal(bc.itemListElement[1].name, "Software POS");
  assert.equal(bc.itemListElement[1].item, "https://nhilospos.com/software-pos/");
  assert.equal(bc.itemListElement[2].name, "Food parks");
  assert.equal(bc.itemListElement[2].item, "https://nhilospos.com/software-pos/food-parks/");

  assert.match(vis, /<nav[^>]*class="breadcrumb"[^>]*>/, "visible breadcrumb nav missing");
  assert.match(vis, /href="\/software-pos\/"/, "breadcrumb must link to /software-pos/");
});

// G06 (S4 / S16.6): Verbatim quick answer in hero before first H2
test("G06 (S4): quick answer verbatim in hero before first H2", () => {
  const { vis } = loadPage();
  const beforeH2 = txt(vis.split(/<h2\b/i)[0] || "");
  const expected =
    "Un sistema para todo el park: cada puesto con su catálogo y su cobro, el administrador ve la operación desde el panel web. Puestos de reventa y cocinas con recetas conviven en el mismo sistema. Correlativo DT 09-2007.";
  assert.ok(beforeH2.includes(expected), "verbatim quick answer missing before first H2");
});

// G07 (S8 / S16.7): S8 prohibitions absent (cross-cutting, exports, locatario pricing, Managua case)
test("G07 (S8): all S8 prohibitions absent from visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const banned = [
    /facturaci[oó]n impresa/i,
    /factura electr[oó]nica/i,
    /sistema autorizado por la dgi/i,
    /autorizado por la dgi/i,
    /cero multas/i,
    /exportaci[oó]n contable/i,
    /libros exportables/i,
    /exportar libros/i,
    /precio por locatario/i,
    /suscripci[oó]n por puesto/i,
    /\bbyod\b/i,
    /en carretera a masaya/i,
    /en galer[ií]as/i,
    /en metrocentro/i,
    /pr[oó]ximamente/i,
    /en construcci[oó]n/i,
    /hoja de ruta/i,
    /\broadmap\b/i,
  ];
  for (const rx of banned) {
    assert.doesNotMatch(plain, rx, `forbidden S8 claim matched: ${rx}`);
  }
});

// G08 (S5b / S16.8): Catalog precision present; banned isolated-catalog / per-puesto inventory absent
test("G08 (S5b): one catalog organized by puesto stated once; isolated catalog/inventory banned", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.match(
    plain,
    /cat[aá]logo es uno y se organiza por puesto/i,
    "S5b precision 'el catálogo es uno y se organiza por puesto' missing",
  );
  const banned = [
    /cat[aá]logo independiente/i,
    /cat[aá]logo aparte/i,
    /cat[aá]logo aislado/i,
    /inventario por puesto/i,
    /stock por puesto/i,
    /almac[eé]n por puesto/i,
  ];
  for (const rx of banned) {
    assert.doesNotMatch(plain, rx, `forbidden S5b claim matched: ${rx}`);
  }
});

// G09 (S5c / S16.9): At least 3 small/medium park formats named; corporate scale phrases banned
test("G09 (S5c): at least 3 park formats named and corporate scale phrases absent", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const formats = [
    /park de tres o cuatro puestos/i,
    /patio de comidas familiar/i,
    /plaza de comidas/i,
    /food court de centro comercial/i,
    /park con locatarios independientes/i,
    /park con un puesto que cocina y otro que revende/i,
  ];
  const matched = formats.filter((rx) => rx.test(plain));
  assert.ok(matched.length >= 3, `expected >= 3 S5c park formats, found ${matched.length}`);

  const banned = [
    // Class, not phrase: singular "cadena de parks" let "cadenas" through.
    /cadenas? de parks?/i,
    /multi-?parks?/i,
    /varios? parks?/i,
    /gerentes? de operaciones/i,
    /departamentos? de (sistemas|ti)\b/i,
    /contratos? de locaci[oó]n/i,
    /arrendamientos/i,
    /control de acceso/i,
    /flujo de visitantes/i,
    /\b(2\d|[3-9]\d|\d{3,})\s+puestos\b/i,
  ];
  for (const rx of banned) {
    assert.doesNotMatch(plain, rx, `forbidden S5c corporate scale phrase matched: ${rx}`);
  }
});

// G10 (S6.2 / S16.10): Exact admin ceiling formula verbatim
test("G10 (S6.2): exact admin formula verbatim without widening", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const formula =
    "el administrador del park ve su operación desde el panel web, y las ventas de los puestos llegan al panel cuando la conexión está disponible";
  assert.ok(plain.toLowerCase().includes(formula), "verbatim admin ceiling formula missing");
});

// G11 (S8.1 / S16.11): Zero shared/central register claims
test("G11 (S8.1): zero caja compartida / caja central / caja común", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  for (const rx of [/cajas? compartidas?/i, /caja central/i, /caja com[uú]n/i]) {
    assert.doesNotMatch(plain, rx, `forbidden S8.1 claim matched: ${rx}`);
  }
});

// G12 (S8.2 / S16.12): Zero consolidated view / chain dashboard claims
test("G12 (S8.2): zero vista consolidada / dashboard de cadena / todas las marcas juntas", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  for (const rx of [
    /vista consolidada/i,
    /consolidad[ao]/i,
    /dashboard de cadena/i,
    /todas las marcas juntas/i,
    /todos tus parks/i,
  ]) {
    assert.doesNotMatch(plain, rx, `forbidden S8.2 claim matched: ${rx}`);
  }
});

// G13 (S8.3 / S8.4 / S16.13): Zero KDS / kitchen screen / LAN coordination claims
test("G13 (S8.3/S8.4): zero KDS, kitchen screens, despacho, or LAN coordination", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  for (const rx of [
    /\bkds\b/i,
    /pantallas? de cocina/i,
    /despacho/i,
    /comandas? por red/i,
    /lan en tiempo real/i,
    /coordinaci[oó]n en tiempo real/i,
  ]) {
    assert.doesNotMatch(plain, rx, `forbidden S8.3/S8.4 claim matched: ${rx}`);
  }
});

// G14 (S7 / S16.14): Both supported fiscal structures present; third structure NOT as capability
test("G14 (S7): both supported fiscal structures present and third structure not published as capability", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.match(plain, /due[nñ]o de sus marcas/i, "first fiscal structure (park owns brands) missing");
  assert.match(plain, /locatario independiente/i, "second fiscal structure (independent locatario) missing");
  assert.match(plain, /una serie/i, "single series mention for first structure missing");
  assert.doesNotMatch(plain, /por cuenta de terceros/i, "third structure must not appear as capability");
});

// G15 (S9 / S16.15): FAQPage JSON-LD parity cell-for-cell + GEO Rule 1
test("G15 (S9): FAQPage JSON-LD parity cell-for-cell and GEO Rule 1", () => {
  const { faq, cells } = loadPage();
  assert.equal(cells.length, 6, `expected 6 visible faq-cell items, got ${cells.length}`);
  assert.equal(faq.length, 6, `expected 6 JSON-LD FAQ items, got ${faq.length}`);
  for (let i = 0; i < cells.length; i++) {
    assert.equal(cells[i][0], faq[i].name, `FAQ question mismatch at index ${i}`);
    assert.equal(cells[i][1], faq[i].acceptedAnswer.text, `FAQ answer mismatch at index ${i}`);
    const firstSentence = cells[i][1].split(/\.\s/)[0] || cells[i][1];
    assert.ok(firstSentence.includes("NHILOS POS"), `FAQ ${i + 1} first sentence missing NHILOS POS`);
    assert.ok(firstSentence.includes("Nicaragua"), `FAQ ${i + 1} first sentence missing Nicaragua`);
  }
});

// G16 (S9 / S16.16): Exact 6 FAQ questions in brief order
test("G16 (S9): 6 FAQ questions verbatim and in brief §6.4 order", () => {
  const { cells } = loadPage();
  const expected = [
    "¿Cada puesto necesita su propio sistema?",
    "¿Puede el administrador ver la operación del park?",
    "¿Un puesto que revende y una cocina pueden usar el mismo sistema?",
    "¿Qué pasa con la facturación de cada puesto?",
    "¿Funciona sin internet?",
    "¿Cuánto cuesta para el park?",
  ];
  assert.deepEqual(
    cells.map((c) => c[0]),
    expected,
  );
});

// G17 (S8.8 / S16.17): Zero absolute continuity claims
test("G17 (S8.8): zero nunca pierdes / 100% / instantáneo", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  for (const rx of [/nunca pierdes/i, /100%/, /instant[aá]ne[ao]/i]) {
    assert.doesNotMatch(plain, rx, `forbidden absolute claim matched: ${rx}`);
  }
});

// G18 (S16.18 / S17): Zero catálogo hidratado, outbox, or visible BOM
test("G18 (S16.18): zero catálogo hidratado, outbox, or visible BOM", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  for (const rx of [/cat[aá]logo hidratado/i, /\boutbox\b/i, /\bbom\b/i]) {
    assert.doesNotMatch(plain, rx, `forbidden technical term in visible text: ${rx}`);
  }
});

// G19 (S11 / S16.19): Audited media exist on disk with dimensions, poster, no autoplay, demo-tag
test("G19 (S11): audited media exist with dimensions, poster, preload=metadata, no autoplay, demo-tag", () => {
  const { vis } = loadPage();
  const requiredFiles = [
    "dsh_bom_recetas.13330051.mp4",
    "dsh_bom_recetas_poster.7fa0d248.webp",
    "dsh_16_recetas_bom.webp",
    "pos_offline_cola_sync_poster.cf458b78.webp",
  ];
  for (const f of requiredFiles) {
    assert.ok(fs.existsSync(path.join(MEDIA_DIR, f)), `missing media file on disk: ${f}`);
    assert.ok(vis.includes(`media/${f}`), `media/${f} not referenced in artboard`);
  }

  const videoTags = [...vis.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(videoTags.length, 1, "expected exactly 1 audited video element");
  assert.match(videoTags[0], /poster="media\/dsh_bom_recetas_poster\.7fa0d248\.webp"/);
  assert.match(videoTags[0], /preload="metadata"/);
  assert.match(videoTags[0], /width="\d+"/);
  assert.match(videoTags[0], /height="\d+"/);
  assert.doesNotMatch(videoTags[0], /\bautoplay\b/i, "video must not autoplay");

  const imgTags = [...vis.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(imgTags.length >= 2, "expected at least 2 audited img elements");
  for (const img of imgTags) {
    assert.match(img, /width="\d+"/, `img missing width: ${img}`);
    assert.match(img, /height="\d+"/, `img missing height: ${img}`);
    assert.match(img, /alt="[^"]+"/, `img missing alt: ${img}`);
  }

  const demoTags = [...vis.matchAll(/class="demo-tag"[^>]*>([\s\S]*?)<\//g)].map((m) => txt(m[1]));
  assert.ok(demoTags.length >= 3, "expected demo-tag on all 3 audited media pieces");
  for (const tag of demoTags) {
    assert.match(tag, /datos de demostraci[oó]n/i, `demo-tag missing 'datos de demostración': ${tag}`);
  }
});

// G20 (S11 / S16.20): Documented media-slot for two puestos and zero invented images
test("G20 (S11): dos-puestos media-slot documented and every referenced media file exists", () => {
  const { body } = loadPage();
  assert.ok(
    body.includes(
      "<!-- media-slot: dos-puestos — falta captura de dos terminales o del panel con ventas de dos puestos -->",
    ),
    "required dos-puestos media-slot comment missing",
  );
  const mediaRefs = [...body.matchAll(/(?:src|poster)="media\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(mediaRefs.length >= 4, "expected audited media references");
  for (const f of mediaRefs) {
    assert.ok(fs.existsSync(path.join(MEDIA_DIR, f)), `referenced media file does not exist: media/${f}`);
  }
});

// G21 (S1 / S16.21): Source artboard uses relative paths for assets and media
test("G21 (S1): source artboard keeps relative paths for assets/ and media/", () => {
  const { src } = loadPage();
  assert.match(src, /href="assets\/site\.css"/);
  assert.match(src, /src="assets\/site\.js"/);
  assert.doesNotMatch(src, /(?:href|src|poster)="\/assets\//, "source artboard must not hardcode /assets/");
  assert.doesNotMatch(src, /(?:href|src|poster)="\/media\//, "source artboard must not hardcode /media/");
});

// G22 (S14 / S15 / S16.22): Shared shell reused without repeating sibling pattern classes
test("G22 (S14/S15): reuses shared shell classes without repeating sibling patterns", () => {
  const { vis, src } = loadPage();
  assert.match(vis, /class="spine"/);
  assert.match(vis, /class="breadcrumb"/);
  assert.match(vis, /class="faq-cell"/);
  assert.match(vis, /class="demo-tag"/);

  const forbiddenSiblingPatterns = [
    /class="[^"]*\b(?:fork-card|ledger-row|price-ribbon|rate-line|risk-band|void-seq|merma-pair|rst-format-dict|rst-dish-anatomy|off-timeline)\b/,
  ];
  for (const rx of forbiddenSiblingPatterns) {
    assert.doesNotMatch(src, rx, `repeated sibling pattern class matched: ${rx}`);
  }
});

// G23 (S14 / S16.23): Every CSS var(--*) used in <style> exists in site.css or local <style>
test("G23 (S14): every CSS custom property var(--*) is defined in site.css or locally", () => {
  const { src } = loadPage();
  const siteCss = fs.readFileSync(SITE_CSS, "utf8");
  const styleBlock = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const defined = new Set([
    ...[...siteCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
    ...[...styleBlock.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
  ]);
  const used = [...new Set([...styleBlock.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))];
  const missing = used.filter((v) => !defined.has(v));
  assert.deepEqual(missing, [], `undefined CSS variables: ${missing.join(", ")}`);
});

// G24 (S16.24 / S17): Zero em-dashes in visible copy, zero internal vocabulary, zero personal names, zero IVA on NHILOS price
test("G24 (S17): zero visible em-dashes, internal vocabulary, personal names, or own IVA", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.ok(!plain.includes("—"), "visible text must not contain em-dash (—)");
  const banned = [
    /\bentitlements\b/i,
    /\bm[oó]dulo\b/i,
    /\bgo-live\b/i,
    /\btenant\b/i,
    /#983|#993|#994/,
    /\b(?:octavio|sof[ií]a|carlos|mar[ií]a)\b/i,
    /m[aá]s iva/i,
    /iva incluido/i,
  ];
  for (const rx of banned) {
    assert.doesNotMatch(plain, rx, `forbidden S17 token matched: ${rx}`);
  }
});

// G25 (S1 / S16.25): Registered in build-nhilos-web.mjs (PAGES) and design.json
test("G25 (S1): 13-food-parks.html registered in build-nhilos-web.mjs and design.json", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.ok(buildSrc.includes("13-food-parks.html"), "build-nhilos-web.mjs missing 13-food-parks.html");
  assert.ok(buildSrc.includes("software-pos/food-parks/index.html"), "build-nhilos-web.mjs missing output path");
  assert.ok(buildSrc.includes('"/software-pos/food-parks/"'), "build-nhilos-web.mjs missing canonical url");

  const designJson = JSON.parse(fs.readFileSync(DESIGN_JSON, "utf8"));
  const entry = designJson.artboards.find((a) => a.file === "13-food-parks.html");
  assert.ok(entry, "design.json missing 13-food-parks.html");
});

// G26 (S16.26 / S17): Zero voseo in visible copy
test("G26 (S17): zero voseo in visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const voseo = [
    /\bvos\b/i,
    /\bus[aá]s\b/i.source && /\busás\b/i,
    /\bempezás\b/i,
    /\bactivás\b/i,
    /\bcobrás\b/i,
    /\bvendés\b/i,
    /\bcerrás\b/i,
    /\btenés\b/i,
    /\bpodés\b/i,
    /\bquerés\b/i,
    /\bsabés\b/i,
    /\bmirá\b/i,
    /\bvenís\b/i,
    /\bverificá\b/i,
    /\barreglá\b/i,
    /\bcalcen\b/i,
    /\belegís\b/i,
    /\bpedís\b/i,
    /\bnecesitás\b/i,
  ];
  for (const rx of voseo) {
    assert.doesNotMatch(plain, rx, `voseo detected: ${rx}`);
  }
});

// G27 (S12 / S13): Exact measurement events, outgoing anchors, and pending routes unlinked
test("G27 (S12/S13): 5 measurement hooks, required outgoing anchors, and pending routes unlinked", () => {
  const { vis } = loadPage();
  const events = [
    "foodpark_llega_puestos",
    "foodpark_admin_lee",
    "faq_foodpark_abre",
    "cta_demo_foodpark",
    "cta_whatsapp_foodpark",
  ];
  for (const ev of events) {
    assert.ok(vis.includes(`data-event="${ev}"`), `missing data-event="${ev}"`);
  }
  assert.ok(vis.includes("utm_medium=food-parks"), "WhatsApp link missing utm_medium=food-parks");

  assert.ok(
    vis.includes('href="/inventario/">control de inventario y kardex: recetas, insumos y merma</a>'),
    "missing /inventario/ link with required anchor",
  );
  assert.ok(
    vis.includes('href="/precios/">ver planes y precios de NHILOS POS</a>'),
    "missing /precios/ link with required anchor",
  );
  assert.ok(
    vis.includes('href="/facturacion-dgi/">mecánica de facturación DT 09-2007: qué garantiza el sistema y qué te corresponde a ti</a>'),
    "missing /facturacion-dgi/ link with required anchor",
  );
  assert.ok(
    vis.includes('href="/software-pos/sin-internet/">cómo sigue la venta sin internet: POS sin conexión</a>'),
    "missing /software-pos/sin-internet/ link with required anchor",
  );
  assert.ok(vis.includes('href="/demo/"'), "missing /demo/ CTA link");

  for (const pending of [
    "/inventario/food-parks/",
    "/software-pos/comida-rapida/",
    "/software-pos/multisucursal/",
  ]) {
    assert.ok(!vis.includes(`href="${pending}"`), `pending route must not be linked: ${pending}`);
  }
});
