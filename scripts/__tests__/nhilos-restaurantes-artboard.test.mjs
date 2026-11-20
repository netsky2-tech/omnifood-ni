// Regression guards for the /software-pos/restaurantes/ artboard (12-restaurantes.html).
// Run: node --test scripts/__tests__/nhilos-restaurantes-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §5 (binding) +
// odd/tasks/nhilos-web-restaurantes.md (S1-S23).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/12-restaurantes.html");
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

// G01 (S5 / S17.1): H1 verbatim WITH segment (this page owns "restaurante")
test("G01 (S5): single h1 verbatim with segment primary keyword", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  const h1Text = txt(h1[0][1]);
  assert.equal(h1Text, "Sistema POS para restaurante: cada plato vendido descuenta sus ingredientes");
  assert.ok(h1Text.toLowerCase().includes("sistema pos para restaurante"), "primary keyword missing in H1");
});

// G02 (S6 / S17.2): All 7 H2 headings verbatim and in order (brief §5.4 + S6 list)
test("G02 (S6): 7 H2 headings match brief §5.4 and S6 verbatim and in order", () => {
  const { vis } = loadPage();
  const expected = [
    "¿Qué es NHILOS POS para tu restaurante?",
    "El diferenciador: recetas que descuentan insumos por plato vendido",
    "¿Qué pasa cuando se cae el internet en hora pico?",
    "Facturación que cumple la DT 09-2007 en cada comprobante",
    "¿Cuánto cuesta un POS para tu restaurante?",
    "Preguntas frecuentes sobre el POS para restaurantes",
    "Solicita una demo con el menú de tu restaurante",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// G03 (S6 / S17.3): All 4 H3 headings verbatim and placed under their parent H2s
test("G03 (S6): all 4 H3 sub-angles match verbatim and sit under their parent H2s", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  const expectedH3s = [
    "Comidería, fritanga o comedor: si cocinas, es tu página",
    "Mesa y mostrador en la misma operación",
    "Qué pasa cuando cambia el precio de un insumo",
    "Modificadores sin romper la receta",
  ];
  for (const h of expectedH3s) {
    assert.ok(h3s.includes(h), `missing H3: ${h}`);
  }
  const iH2_1 = vis.indexOf("¿Qué es NHILOS POS para tu restaurante?");
  const iH3_1 = vis.indexOf(expectedH3s[0]);
  const iH3_2 = vis.indexOf(expectedH3s[1]);
  const iH2_2 = vis.indexOf("El diferenciador: recetas que descuentan insumos por plato vendido");
  const iH3_3 = vis.indexOf(expectedH3s[2]);
  const iH3_4 = vis.indexOf(expectedH3s[3]);
  const iH2_3 = vis.indexOf("¿Qué pasa cuando se cae el internet en hora pico?");
  assert.ok(iH2_1 < iH3_1 && iH3_1 < iH3_2 && iH3_2 < iH2_2, "H3 1 & 2 must sit under H2 1 before H2 2");
  assert.ok(iH2_2 < iH3_3 && iH3_3 < iH3_4 && iH3_4 < iH2_3, "H3 3 & 4 must sit under H2 2 before H2 3");
});

// G04 (S10 / S17.4): Title (<=60) and description (<=155), without comidería/fritanga
test("G04 (S10): title (<=60) and description (<=155) match S10 without comidería or fritanga", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = src.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.equal(title, "Sistema POS para restaurante en Nicaragua | NHILOS POS");
  assert.ok(title.length <= 60, `title too long (${title.length})`);
  assert.equal(
    desc,
    "POS para restaurante que sigue cobrando sin internet: cada plato vendido descuenta sus ingredientes, con costo por plato. Demo con tu menú. NHILOS POS.",
  );
  assert.ok(desc.length <= 155, `description too long (${desc.length})`);
  for (const banned of ["comidería", "comideria", "fritanga"]) {
    assert.ok(!title.toLowerCase().includes(banned), `meta title must not include "${banned}"`);
    assert.ok(!desc.toLowerCase().includes(banned), `meta description must not include "${banned}"`);
  }
});

// G05 (S10 / S17.5): Canonical + og:title + og:url
test("G05 (S10): canonical is https://nhilospos.com/software-pos/restaurantes/ and og:title mirrors title", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.equal(src.match(/<link rel="canonical" href="([^"]+)">/)?.[1], "https://nhilospos.com/software-pos/restaurantes/");
  assert.equal(src.match(/<meta property="og:title" content="([^"]+)">/)?.[1], title);
  assert.equal(src.match(/<meta property="og:url" content="([^"]+)">/)?.[1], "https://nhilospos.com/software-pos/restaurantes/");
});

// G06 (S4 / S17.6): Quick answer verbatim in hero before first H2
test("G06 (S4): quick answer appears verbatim in hero before first H2", () => {
  const { vis } = loadPage();
  const beforeFirstH2 = txt(vis.split(/<h2\b/i)[0]);
  const expected =
    "POS táctil local-first para restaurante: sigue cobrando sin internet y cada plato vendido descuenta sus ingredientes, receta por receta, con costo por plato. Bimoneda y correlativo DT 09-2007.";
  assert.ok(beforeFirstH2.includes(expected), "quick answer missing verbatim before first H2");
});

// G07 (S8 / S17.7): All 10 prohibitions of S8 absent
test("G07 (S8): all 10 claim prohibitions absent from visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const banned = [
    /\bKDS\b/i,
    /pantalla(s)?\s+de\s+cocina/i,
    /\bdespacho\b/i,
    /facturaci[oó]n\s+impresa/i,
    /cualquier\s+ticketera/i,
    /factur(a|aci[oó]n)\s+electr[oó]nica/i,
    /autorizado\s+por\s+la\s+DGI/i,
    /certificado\s+por\s+la\s+DGI/i,
    /cero\s+multas/i,
    /evita\s+multas/i,
    /nunca\s+pierdes/i,
    /\b100\s*%/i,
    /propinas?/i,
    /costo\s+promedio\s+ponderado/i,
    /\bCPP\b/,
    /merma\s+te[oó]rica/i,
    /Ley\s+822/i,
    /\bNIC\s*2\b/i,
    /\bBYOD\b/i,
    /exportaci[oó]n\s+contable/i,
    /consolidaci[oó]n\s+multi-?sucursal/i,
    /integraci[oó]n\s+bancaria/i,
    /gesti[oó]n\s+de\s+rutas/i,
    /\$\s*\d+\s*\/\s*mes/i,
  ];
  for (const re of banned) {
    assert.ok(!re.test(plain), `prohibited claim matched: ${re}`);
  }
  assert.ok(!/<table\b/i.test(vis), "price or plan comparison <table> must not be duplicated here (S8.7)");
});

// G08 (S5b / S17.8): Anti-scale guard — never assume large restaurant
test("G08 (S5b): anti-scale guard rejects big-restaurant assumptions", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const bannedScale = [
    /\bsucursales\b/i,
    /\bfranquicia(s)?\b/i,
    /varios\s+salones/i,
    /sal[oó]n\s+VIP/i,
    /m[uú]ltiples\s+[aá]reas/i,
    /equipo\s+de\s+meseros/i,
    /\bsommelier\b/i,
    /carta\s+de\s+vinos/i,
    /\b([3-9]\d|\d{3,})\s+mesas\b/i,
  ];
  for (const re of bannedScale) {
    assert.ok(!re.test(plain), `large-scale assumption leaked into copy: ${re}`);
  }
});

// G09 (S5b / S17.9): Recognition block names >= 4 small formats BEFORE the differentiator
test("G09 (S5b): at least 4 small kitchen formats appear before H2 2 (differentiator)", () => {
  const { vis } = loadPage();
  const beforeDiff = txt(vis.split("El diferenciador: recetas que descuentan insumos por plato vendido")[0]).toLowerCase();
  const formats = [
    "comidería",
    "fritanga",
    "comedor",
    "puesto de comida",
    "cafetería con cocina",
    "food park con cocina",
    "cocina en casa",
    "restaurante pequeño",
  ];
  const matched = formats.filter((f) => beforeDiff.includes(f));
  assert.ok(matched.length >= 4, `expected >= 4 small formats before differentiator, found ${matched.length}: ${matched.join(", ")}`);
});

// G10 (S5b / S17.10): Control ladder (modo simple -> recetas) stated as option
test("G10 (S5b): control ladder (modo simple -> recetas) is stated explicitly", () => {
  const { vis } = loadPage();
  const plain = txt(vis).toLowerCase();
  assert.ok(plain.includes("modo simple"), "missing 'modo simple' in control ladder");
  assert.ok(/activa(s|r)?\s+(las\s+)?recetas/.test(plain), "missing activation of recetas as option");
});

// G11 (S8.1 / S17.11): Orders formulation "el pedido queda registrado", zero despacho, zero KDS
test("G11 (S8.1): orders use 'el pedido queda registrado' with zero 'despacho' and zero KDS", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.ok(/el pedido queda registrado/i.test(plain), "missing mandatory formulation 'el pedido queda registrado'");
  assert.ok(!/\bdespacho\b/i.test(plain), "forbidden word 'despacho' present");
  assert.ok(!/\bKDS\b/i.test(plain), "forbidden word 'KDS' present");
});

// G12 (S9 / S17.12): FAQPage JSON-LD parity cell by cell + GEO Rule 1
test("G12 (S9): FAQPage JSON-LD matches visible faq-cell items verbatim + GEO Rule 1", () => {
  const { faq, cells } = loadPage();
  assert.equal(faq.length, 7, "JSON-LD FAQPage must have 7 questions");
  assert.equal(cells.length, 7, "visible page must have 7 faq-cell items");
  for (let i = 0; i < 7; i++) {
    assert.equal(cells[i][0], faq[i].name, `FAQ Q${i + 1} mismatch`);
    assert.equal(cells[i][1], faq[i].acceptedAnswer.text, `FAQ A${i + 1} mismatch`);
    const firstSentence = cells[i][1].split(/[.!?]/)[0];
    assert.ok(firstSentence.includes("NHILOS POS"), `FAQ A${i + 1} first sentence must name NHILOS POS`);
    assert.ok(firstSentence.includes("Nicaragua"), `FAQ A${i + 1} first sentence must name Nicaragua`);
  }
});

// G13 (S9 / S17.13): The 7 FAQ questions verbatim and in order
test("G13 (S9): 7 FAQ questions match S9 verbatim and in order", () => {
  const { cells } = loadPage();
  const expected = [
    "¿Sirve para un restaurante con mesas y para llevar?",
    "¿Cada plato descuenta sus ingredientes de verdad?",
    "¿Qué pasa si cambia el precio de un insumo?",
    "¿Y si se cae el internet en hora pico?",
    "¿Sirve para la DGI?",
    "¿Mis muchachos lo aprenden rápido?",
    "¿Cuánto cuesta al mes?",
  ];
  assert.deepEqual(cells.map((c) => c[0]), expected);
});

// G14 (S8.4 / S17.14): Zero "nunca pierdes", "100%", "instantáneo", "tiempo real", "todo se sincroniza"
test("G14 (S8.4): zero absolute continuity or instant-sync claims", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  for (const re of [/nunca\s+pierdes/i, /\b100\s*%/i, /instant[aá]ne[oa]s?/i, /tiempo\s+real/i, /todo\s+se\s+sincroniza/i]) {
    assert.ok(!re.test(plain), `forbidden absolute continuity phrase matched: ${re}`);
  }
});

// G15 (S8.10 / S17.15): Zero "catálogo hidratado" or "outbox", uses owner translation
test("G15 (S8.10): zero 'catálogo hidratado' or 'outbox' and uses owner translation", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.ok(!/cat[aá]logo\s+hidratado/i.test(plain), "internal term 'catálogo hidratado' leaked");
  assert.ok(!/\boutbox\b/i.test(plain), "internal term 'outbox' leaked");
  assert.ok(plain.includes("la terminal quedó configurada con tu catálogo"), "missing owner translation for hydrated catalog");
});

// G16 (S12 / S17.16): Audited recipes clip exists with dimensions/poster and demo-tag
test("G16 (S12): audited recipes clip exists on disk with poster, dimensions, and demo label", () => {
  const { src, vis } = loadPage();
  const clip = "dsh_bom_recetas.13330051.mp4";
  const poster = "dsh_bom_recetas_poster.7fa0d248.webp";
  assert.ok(fs.existsSync(path.join(MEDIA_DIR, clip)), `missing clip on disk: ${clip}`);
  assert.ok(fs.existsSync(path.join(MEDIA_DIR, poster)), `missing poster on disk: ${poster}`);
  const videoTag = src.match(/<video\b[^>]*>/)?.[0] || "";
  assert.ok(videoTag.includes(`src="media/${clip}"`), "video tag must reference audited recipes clip");
  assert.ok(videoTag.includes(`poster="media/${poster}"`), "video tag must reference audited poster");
  assert.ok(/width="1440"/.test(videoTag) && /height="900"/.test(videoTag), "video tag must declare width=1440 height=900");
  assert.ok(/preload="metadata"/.test(videoTag), "video tag must use preload=metadata");
  assert.ok(!/\bautoplay\b/i.test(videoTag), "video tag must not autoplay");
  assert.ok(txt(vis).includes("Grabación real del panel web · datos de demostración"), "missing mandatory demo-tag text");
});

// G17 (S11, S12 / S17.17): Control de Mesas slot documented with media-slot comment, no fake image
test("G17 (S12): Control de Mesas slot documented with media-slot comment and no fake image", () => {
  const { body } = loadPage();
  assert.ok(
    /<!--\s*media-slot:\s*control-mesas\b[\s\S]*?-->/i.test(body),
    "missing documented media-slot: control-mesas comment",
  );
  // Check the Mesa y mostrador section has zero <img> or <video> pretending to be Control de Mesas
  const mesaStart = body.indexOf("Mesa y mostrador en la misma operación");
  const diffStart = body.indexOf("El diferenciador: recetas que descuentan insumos por plato vendido");
  assert.ok(mesaStart > 0 && diffStart > mesaStart, "could not slice Mesa y mostrador section");
  const mesaSlice = body.slice(mesaStart, diffStart);
  assert.ok(!/<img\b/i.test(mesaSlice), "Mesa y mostrador section must not contain a fake <img>");
  assert.ok(!/<video\b/i.test(mesaSlice), "Mesa y mostrador section must not contain a fake <video>");
});

// G18 (S1, S17.18): Relative asset/media paths in artboard + valid internal links (no broken pending routes)
test("G18 (S1, S13): artboard uses relative assets/ and media/ paths and links only published routes", () => {
  const { src, vis } = loadPage();
  assert.ok(src.includes('href="assets/site.css"'), "artboard must reference relative assets/site.css");
  assert.ok(src.includes('src="assets/site.js"'), "artboard must reference relative assets/site.js");
  assert.ok(!/(?:src|href|poster)="\/(assets|media|fonts)\//.test(src), "artboard must not hardcode root-absolute /assets/ or /media/ paths");

  // Required outgoing links
  for (const href of ["/software-pos/", "/inventario/", "/facturacion-dgi/", "/software-pos/sin-internet/", "/precios/", "/demo/"]) {
    assert.ok(vis.includes(`href="${href}"`), `missing required outgoing link: ${href}`);
  }
  // Pending routes must NOT be live hrefs
  for (const pending of ["/inventario/restaurantes/", "/facturacion-dgi/restaurantes/", "/software-pos/caja/", "/software-pos/multisucursal/"]) {
    assert.ok(!vis.includes(`href="${pending}"`), `pending route must not be a live link: ${pending}`);
  }
});

// G19 (S16 / S17.19): Reuses faq-cell & demo-tag; does not repeat forbidden section patterns from S16
test("G19 (S16): reuses faq-cell and demo-tag without repeating S16 patterns", () => {
  const { src } = loadPage();
  assert.ok(src.includes('class="faq-cell"'), "must reuse faq-cell");
  assert.ok(src.includes('class="demo-tag"'), "must reuse demo-tag");
  const forbiddenClasses = [
    "hero-fork",
    "ab-band",
    "price-ribbon",
    "tier-line",
    "plan-table",
    "risk-band",
    "assured-pair",
    "setup-strip",
    "void-seq",
    "norm-layer",
    "split-table",
    "cost-formula",
    "merma-pair",
    "pack-table",
    "dm-steps-horiz",
    "dm-segment-rows",
    "dm-expect-split",
    "off-honesty-pair",
    "off-timeline",
  ];
  for (const cls of forbiddenClasses) {
    assert.ok(!src.includes(cls), `must not repeat previous page pattern class "${cls}"`);
  }
});

// G20 (S15 / S17.20): Every CSS var(--*) referenced exists in site.css or page :root
test("G20 (S15): every var(--*) used in page styles exists in site.css or page style", () => {
  const { src } = loadPage();
  const css = fs.readFileSync(SITE_CSS, "utf8");
  const pageStyle = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  const defined = new Set([
    ...[...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
    ...[...pageStyle.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]),
  ]);
  const used = [...pageStyle.matchAll(/var\((--[a-z0-9-]+)(?:,[^)]+)?\)/gi)].map((m) => m[1]);
  const missing = [...new Set(used.filter((v) => !defined.has(v)))];
  assert.deepEqual(missing, [], `undefined CSS custom properties: ${missing.join(", ")}`);
});

// G21 (S18 / S17.21): Zero em-dashes in visible text
test("G21 (S18): zero em-dashes (—) in visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  assert.ok(!plain.includes("—"), "em-dash (—) found in visible copy");
});

// G22 (S18 / S17.22): Voice — zero site narration
test("G22 (S18): voice talks about reader operation, zero site narration", () => {
  const { vis } = loadPage();
  // Remove the verbatim S6 H3 ("Comidería, fritanga o comedor: si cocinas, es tu página") before checking narration
  const plain = txt(vis).replace("Comidería, fritanga o comedor: si cocinas, es tu página", "");
  const narration = [
    /en\s+esta\s+p[aá]gina/i,
    /en\s+esta\s+secci[oó]n/i,
    /en\s+nuestro\s+sitio/i,
    /como\s+ver[aá]s\s+m[aá]s\s+abajo/i,
    /m[aá]s\s+abajo\s+te\s+mostramos/i,
  ];
  for (const re of narration) {
    assert.ok(!re.test(plain), `site-narration phrase found: ${re}`);
  }
});

// G23 (S8.10, S18 / S17.23): Zero internal vocabulary in visible text (including BOM)
test("G23 (S8.10): zero internal vocabulary or issue numbers in visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const internal = [
    /\bentitlements?\b/i,
    /\bgo-live\b/i,
    /\bmulti-tenant\b/i,
    /\boutbox\b/i,
    /\bBOM\b/,
    /#983\b/,
    /#993\b/,
    /#994\b/,
    /\bPC-[A-Z]+-\d+\b/,
  ];
  for (const re of internal) {
    assert.ok(!re.test(plain), `internal vocabulary leaked: ${re}`);
  }
});

// G24 (S1, S15 / S17.24): Registered in PAGES (build-nhilos-web.mjs) and design.json + 3-level BreadcrumbList
test("G24 (S1, S15): registered in PAGES and design.json with 3-level BreadcrumbList schema", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.ok(buildSrc.includes('"12-restaurantes.html"'), "12-restaurantes.html missing in build-nhilos-web.mjs PAGES");
  assert.ok(buildSrc.includes('"software-pos/restaurantes/index.html"'), "3-level output path missing in PAGES");
  assert.ok(buildSrc.includes('"/software-pos/restaurantes/"'), "3-level canonical url missing in PAGES");

  const design = JSON.parse(fs.readFileSync(DESIGN_JSON, "utf8"));
  assert.ok(
    design.artboards.some((a) => a.file === "12-restaurantes.html"),
    "12-restaurantes.html missing in design.json",
  );

  const { ld } = loadPage();
  const bc = ld?.["@graph"]?.find((n) => n["@type"] === "BreadcrumbList");
  assert.ok(bc, "BreadcrumbList missing in JSON-LD");
  assert.equal(bc.itemListElement.length, 3, "BreadcrumbList must have 3 levels");
  assert.deepEqual(
    bc.itemListElement.map((i) => i.name),
    ["Inicio", "Software POS", "Restaurantes"],
  );
  assert.equal(bc.itemListElement[2].item, "https://nhilospos.com/software-pos/restaurantes/");
});

// G25 (S17.25): Zero personal names
test("G25 (S17.25): zero personal names in artboard", () => {
  const { src } = loadPage();
  for (const name of [/\bOctavio\b/i, /\bMorales\b/i]) {
    assert.ok(!name.test(src), `personal name found: ${name}`);
  }
});

// G26 (S14 / S17.26): WhatsApp UTM + all 5 measurement data-event hooks
test("G26 (S14): WhatsApp links carry utm_medium=restaurantes and all 5 data-event hooks exist", () => {
  const { src } = loadPage();
  assert.ok(src.includes("wa.me/50581948526"), "missing NHILOS WhatsApp number");
  assert.ok(src.includes("utm_medium=restaurantes"), "missing utm_medium=restaurantes");
  for (const ev of [
    "restaurante_llega_recetas",
    "restaurante_clip_costo",
    "faq_restaurante_abre",
    "cta_demo_restaurante",
    "cta_whatsapp_restaurante",
  ]) {
    assert.ok(src.includes(`data-event="${ev}"`), `missing data-event="${ev}"`);
  }
});

// G27 (S17.27, S18): Zero voseo — site speaks in neutral "tú"
test("G27 (S17.27): zero voseo in visible copy", () => {
  const { vis } = loadPage();
  const plain = txt(vis);
  const voseo = [
    /\bvos\b/i,
    /\btenés\b/i,
    /\bpodés\b/i,
    /\bcalcen\b/i,
    /\bquerés\b/i,
    /\bsabés\b/i,
    /\bmirá\b/i,
    /\busás\b/i,
    /\bvenís\b/i,
    /\bempezás\b/i,
    /\bactivás\b/i,
    /\bcobrás\b/i,
    /\bvendés\b/i,
    /\bcerrás\b/i,
    /\bverificá\b/i,
    /\barreglá\b/i,
  ];
  for (const re of voseo) {
    assert.ok(!re.test(plain), `voseo form detected: ${re}`);
  }
});

test("G28 (S5b): no separate-inventory promise per kitchen or branch", () => {
  // The data model anticipates warehouses (Warehouse entity, Product.warehouse_id),
  // but onboarding creates a single default warehouse and no controller or screen
  // lets the operator create another one. A schema capability nobody can activate is
  // not a claim the page may make, so the class is banned, not just the phrase.
  const { vis } = loadPage();
  const plain = txt(vis);
  const banned = [
    /sin\s+mezclar\s+inventarios/i,
    /inventarios?\s+(?:aparte|separad[oa]s?|independientes?)/i,
    /inventarios?\s+por\s+(?:puesto|cocina|sucursal|local|marca)/i,
    /(?:almac[eé]n|almacenes|bodega|bodegas)\s+(?:aparte|separad[oa]s?|independientes?|propi[oa]s?)/i,
    /stock\s+(?:aparte|separado|independiente)/i,
    /cada\s+(?:puesto|cocina|local|sucursal)\s+(?:con\s+)?(?:su|sus)\s+(?:propio\s+)?inventario/i,
  ];
  for (const re of banned) {
    assert.ok(!re.test(plain), `separate-inventory claim leaked into copy: ${re}`);
  }
});
