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

// G01 (S6.0 / S16.1): Single H1 verbatim with segment primary keyword
const H1_EXPECTED = "Software para food park: tu puesto con su catálogo, su cobro y su factura";
test("G01 (S6.0): single h1 verbatim with segment primary keyword", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  const h1Text = txt(h1[0][1]);
  assert.equal(h1Text, H1_EXPECTED);
  assert.ok(h1Text.toLowerCase().includes("software para food park"), "primary keyword missing in H1");
});

// G02 (S6.0 / S16.2): All 8 H2 headings verbatim and in exact order (brief §6.0 corrected map)
const H2_EXPECTED = [
  "¿Qué es NHILOS POS para tu puesto en un food park?",
  "Lo que no tienes que compartir con el park",
  "Puestos que revenden y cocinas que preparan, en el mismo patio",
  "¿Qué pasa cuando se cae el internet en el park?",
  "Facturación por puesto conforme a la DT 09-2007",
  "¿Cuánto cuesta si estás en un food park?",
  "Preguntas frecuentes sobre el software para food park",
  "Solicita una demo con el menú de tu puesto",
];
test("G02 (S6.0): 8 H2 headings match brief §6.0 corrected map verbatim and in order", () => {
  const { vis } = loadPage();
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, H2_EXPECTED);
});

// G03 (S6.0 / S16.3): All 3 required H3 headings verbatim and under their parent H2s
const H3_1 = "Tu puesto es el negocio: catálogo, cobro y turno propios";
const H3_2 = "Tres puestos o veinte: el park también es pequeño";
const H3_3 = "Tu cajero responde a ti, no a la administración del patio";
test("G03 (S6.0): all 3 H3 sub-angles match verbatim and sit under their parent H2s", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  for (const h of [H3_1, H3_2, H3_3]) {
    assert.ok(h3s.includes(h), `missing H3: ${h}`);
  }
  const h2Pos = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
    .map((m) => ({ text: txt(m[1]), pos: m.index }))
    .filter((h) => H2_EXPECTED.includes(h.text));
  const h3Pos = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)]
    .map((m) => ({ text: txt(m[1]), pos: m.index }))
    .filter((h) => [H3_1, H3_2, H3_3].includes(h.text));
  const byText = (arr, t) => arr.find((x) => x.text === t)?.pos ?? -1;
  const idxH2_1 = byText(h2Pos, H2_EXPECTED[0]);
  const idxH2_2 = byText(h2Pos, H2_EXPECTED[1]);
  const idxH2_3 = byText(h2Pos, H2_EXPECTED[2]);
  const idxH3_1 = byText(h3Pos, H3_1);
  const idxH3_2 = byText(h3Pos, H3_2);
  const idxH3_3 = byText(h3Pos, H3_3);

  assert.ok(idxH2_1 > -1 && idxH2_2 > -1 && idxH2_3 > -1, "parent H2s missing from markup");
  assert.ok(idxH3_1 > idxH2_1 && idxH3_1 < idxH2_2, "H3 puesto-es-el-negocio must be inside H2 1");
  assert.ok(idxH3_2 > idxH2_1 && idxH3_2 < idxH2_2, "H3 scale must be inside H2 1");
  assert.ok(idxH3_3 > idxH2_2 && idxH3_3 < idxH2_3, "H3 cajero must be inside H2 2");
});

// G04 (S6.0 / S16.4): Title and meta description exact and within limits (puesto as subject)
test("G04 (S6.0): title <= 60 chars and meta description <= 155 chars verbatim, puesto as subject", () => {
  const { src } = loadPage();
  const title = txt(src.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
  const desc = src.match(/<meta name="description" content="([^"]*)"/)?.[1] || "";
  assert.equal(title, "Software para food park: tu puesto, tu sistema | NHILOS POS");
  assert.ok(title.length <= 60, `title too long: ${title.length}`);
  assert.ok(!/administrador|gestiona/i.test(title), "title must not use administrador/gestiona");
  assert.equal(
    desc,
    "Software para food park para el negocio que opera un puesto: tu catálogo, tu cobro, tu factura DT 09-2007 y tus reportes son tuyos. Pide una demo.",
  );
  assert.ok(desc.length <= 155, `description too long: ${desc.length}`);
  assert.ok(!/administrador|gestiona/i.test(desc), "description must not use administrador/gestiona");
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

// G06 (S6.0 / S16.6): Model-first quick answer verbatim in hero before first H2
const QUICK_ANSWER =
  "En Nicaragua, NHILOS POS le vende al negocio que opera cada puesto del park: el puesto es el negocio, y el park es el lugar donde vendes. Tu catálogo, tu cobro, tu factura y tus reportes son tuyos; nadie de la administración del patio tiene que comprar nada por ti. Correlativo DT 09-2007.";
test("G06 (S6.0): model-first quick answer verbatim in hero before first H2", () => {
  const { vis } = loadPage();
  const beforeH2 = txt(vis.split(/<h2\b/i)[0] || "");
  assert.ok(beforeH2.includes(QUICK_ANSWER), "verbatim model-first quick answer missing before first H2");
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

// G08 (S5b / S16.8): Catalog precision present (restated for the puesto as owner); banned isolated-catalog / per-puesto inventory absent
test("G08 (S5b): one catalog per business organized by categories stated once; isolated catalog/inventory banned", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.match(
    plain,
    /cat[aá]logo es de tu negocio, uno solo, y se organiza por categor[ií]as/i,
    "S5b precision 'el catálogo es de tu negocio, uno solo, y se organiza por categorías' missing",
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

// G10 (S6.0): Model statement required: the puesto is the business, the park is the place
// (replaces the old admin-ceiling-formula guard, derogated by brief §6.0)
test("G10 (S6.0): model statement present: puesto is the business, park is the place, nobody buys for you", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.match(plain, /el puesto es el negocio/i, "model statement 'el puesto es el negocio' missing");
  assert.match(plain, /el park es el lugar donde vendes/i, "model statement 'el park es el lugar donde vendes' missing");
  assert.match(
    plain,
    /nadie de la administraci[oó]n del patio tiene que comprar nada por ti/i,
    "statement 'nadie del park tiene que comprar nada por ti' missing",
  );
});

// G28 (S6.0): Class guard on the old, wrong model: banned phrases absent (attributes included)
test("G28 (S6.0): old park-as-customer model phrases absent everywhere in the page", () => {
  const { vis } = loadPage();
  const banned = [
    "administrador del park",
    "el park contrata",
    "suscripci[oó]n por park",
    "los puestos del park",
    "vista del park",
    "gesti[oó]n de locatarios",
    "consolidado del patio",
  ];
  for (const phrase of banned) {
    const rx = new RegExp(phrase, "i");
    assert.ok(!rx.test(vis), `old-model phrase detected in page: ${phrase}`);
  }
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

// G14 (S6.0 / S16.14): Each business in the patio emits its own documents; park-as-emitter absent
test("G14 (S6.0): cada negocio emite lo suyo present and park-as-emitter structure absent", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.match(plain, /cada negocio emite lo suyo/i, "'cada negocio emite lo suyo' missing");
  assert.match(plain, /contribuyente que emite/i, "'contribuyente que emite' missing");
  assert.match(plain, /emite sus propios (documentos|comprobantes)/i, "own-documents statement missing");
  for (const rx of [
    /due[nñ]o de sus marcas/i,
    /factura todo bajo su ruc/i,
    /el park, con su autorizaci/i,
  ]) {
    assert.doesNotMatch(plain, rx, `park-as-emitter structure matched: ${rx}`);
  }
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
    // Site rule: the country name may not be the repeated opening formula of
    // every answer. Opening diversity is guarded by
    // scripts/__tests__/nhilos-faq-openings.test.mjs; here only entity + market
    // presence in the first sentence is enforced.
  }
});

// G16 (S9 / S16.16): Exact 6 FAQ questions in order, reframed to the stall owner
const FAQ_QUESTIONS = [
  "¿Necesito mi propio sistema para mi puesto?",
  "¿La administración del patio ve mis ventas?",
  "¿Un puesto que revende y una cocina pueden usar el mismo sistema?",
  "¿Qué pasa con la facturación de cada puesto?",
  "¿Sigue cobrando mi puesto si se cae el wifi del food park?",
  "¿Cuánto cuesta para un puesto en un food park?",
];
test("G16 (S9): 6 FAQ questions verbatim, stall-owner framing, in order", () => {
  const { cells } = loadPage();
  assert.deepEqual(
    cells.map((c) => c[0]),
    FAQ_QUESTIONS,
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
test("G19 (S11): audited media exist with dimensions, poster, preload=none, no autoplay, demo-tag", () => {
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
  assert.match(videoTags[0], /preload="none"/, "video must ship preload=none: site.js starts it on intersection");
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

// G29 (S11 / S6.0): Declared media limit line states one business's panel, not several stalls
test("G29 (S11): media limit line keeps the honest one-business scope", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.match(
    plain,
    /corresponde al panel de un solo negocio/i,
    "media limit line 'panel de un solo negocio' missing",
  );
  assert.match(
    plain,
    /no muestra los paneles de varios negocios del patio/i,
    "media limit line 'no muestra los paneles de varios negocios del patio' missing",
  );
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
  // El evento del H2 de lo que no compartes con el park se renombra con el
  // reencadre de §6.0 (el administrador del park ya no es el cliente): su viejo
  // nombre, foodpark_admin_lee, describe una sección que ya no existe.
  const events = [
    "foodpark_llega_puestos",
    "foodpark_llega_independencia",
    "faq_foodpark_abre",
    "cta_demo_foodpark",
    "cta_whatsapp_foodpark",
  ];
  for (const ev of events) {
    assert.ok(vis.includes(`data-event="${ev}"`), `missing data-event="${ev}"`);
  }
  assert.ok(!vis.includes("foodpark_admin_lee"), "the obsolete foodpark_admin_lee event still ships");
  assert.ok(vis.includes("utm_medium=food-parks"), "WhatsApp link missing utm_medium=food-parks");

  assert.ok(
    vis.includes('href="/inventario/">control de inventario y kardex: recetas, insumos y merma</a>'),
    "missing /inventario/ link with required anchor",
  );
  // El anchor a /precios/ se varía por contexto (audit externa S9.2 y regla del
  // brief §2.6: nunca el mismo anchor exacto desde muchas páginas); el href no
  // cambia y la respuesta del FAQ, que es texto plano y no enlace, queda igual.
  assert.ok(
    vis.includes('href="/precios/">la tabla de planes, packs y setups</a>'),
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
