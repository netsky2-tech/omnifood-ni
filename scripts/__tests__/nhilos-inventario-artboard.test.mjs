// Regression guards for the /inventario/ artboard (09-inventario.html).
// Run: node --test scripts/__tests__/nhilos-inventario-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §8 (binding) +
// docs/inventario_marco_normativo.md + odd/tasks/nhilos-web-inventario.md (S1-S25).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/09-inventario.html");
const PRECIOS = path.join(ROOT, "design/nhilos-web-foundation/07-precios.html");
const BUILD = path.join(ROOT, "scripts/build-nhilos-web.mjs");

// Route registry, parsed from the PAGES array of the build script: a route is
// linkable exactly when it ships there. The parse is guarded (exactly nine
// routes) so a broken regex cannot silently empty the allowlist below.
const PUBLISHED_ROUTES = (() => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  const urls = [...buildSrc.matchAll(/source:\s*(?:"[^"]+"|\bENTRY\b)[\s\S]*?url:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(urls.length, 9, "the build script must declare exactly 9 published routes");
  return new Set(urls);
})();
const DESIGN_JSON = path.join(ROOT, "design/nhilos-web-foundation/design.json");
const SITE_CSS = path.join(ROOT, "design/nhilos-web-foundation/assets/site.css");

const txt = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

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

// 1. S5: H1 verbatim
test("G01 (S5): single h1 with verbatim brief §8.4 text", () => {
  const { src } = loadPage();
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(txt(h1[0][1]), "Sistema de inventario en Nicaragua: cada venta descuenta lo que consumió");
});

// 2. S6: 8 H2s verbatim and in order
test("G02 (S6): 8 H2 headings match brief §8.4 verbatim and in order", () => {
  const { vis } = loadPage();
  const expected = [
    "¿Qué es NHILOS POS para tu inventario?",
    "¿De dónde sale el costo? El kardex y el costo promedio ponderado",
    "Lo que la ley exige a tu inventario (y cómo se cumple)",
    "Merma teórica vs física, sin detener la operación",
    "¿Y la facturación? Cada venta descuenta y emite su comprobante",
    "¿Cuánto cuesta el control de inventario?",
    "Preguntas frecuentes sobre el sistema de inventario",
    "Solicita una demo con tu inventario real",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// 3. S6: 3 H3s verbatim
test("G03 (S6): all 3 H3 sub-angles match brief §8.4 verbatim", () => {
  const { vis } = loadPage();
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  for (const expected of [
    "Productos que se preparan: recetas e insumos",
    "Productos que se revenden: stock simple",
    "Qué hace el sistema y qué le corresponde a tu negocio y a tu contador",
  ]) {
    assert.ok(h3s.includes(expected), `missing H3: ${expected}`);
  }
});

// 4. S12b: Title and description verbatim with limits
test("G04 (S12b): title (<=60) and description (<=155) match brief §8.8 verbatim", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = src.match(/<meta name="description" content="([^"]+)">/)?.[1];
  assert.equal(title, "Sistema de inventario en Nicaragua · Kardex y merma | NHILOS");
  assert.equal(
    desc,
    "Cada venta descuenta lo que consumió: kardex con costo promedio ponderado, conteos y merma teórica vs física. El marco legal, explicado. Pide una demo.",
  );
  assert.ok(title.length <= 60, `title length ${title.length} > 60`);
  assert.ok(desc.length <= 155, `description length ${desc.length} > 155`);
});

// 5. S12b: Canonical + og:title + og:description mirror
test("G05 (S12b): canonical is https://nhilospos.com/inventario/ and og tags mirror meta", () => {
  const { src } = loadPage();
  const title = src.match(/<title>([^<]+)<\/title>/)?.[1];
  const desc = src.match(/<meta name="description" content="([^"]+)">/)?.[1];
  const ogTitle = src.match(/<meta property="og:title" content="([^"]+)">/)?.[1];
  const ogDesc = src.match(/<meta property="og:description" content="([^"]+)">/)?.[1];
  const canonical = src.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  assert.equal(canonical, "https://nhilospos.com/inventario/");
  assert.equal(ogTitle, title);
  assert.equal(ogDesc, desc);
});

// 6. S4: Quick answer verbatim in the hero, before the first H2
test("G06 (S4): quick answer appears verbatim in the hero, before the first h2", () => {
  const { vis } = loadPage();
  const hero = (vis.split('id="inicio"')[1] || "").split("</section>")[0] || "";
  const heroTxt = txt(hero);
  const expected =
    "Cada venta descuenta lo que consumió, el plato por su receta, el producto de reventa por su stock, con kardex y costo promedio ponderado, conteos y merma teórica vs física. El marco que exige la ley (Ley 822 art. 44, Reglamento art. 33, NIC 2) explicado; la valuación fiscal la cierra tu contador.";
  assert.ok(heroTxt.includes(expected), "verbatim quick answer missing from hero");
  assert.ok(vis.indexOf("Cada venta descuenta lo que consumió, el plato por su receta") < vis.indexOf("<h2"));
});

// 7. S8: All 10 prohibited inventory claims absent
test("G07 (S8): all 10 prohibited inventory claims are absent from visible copy and JSON-LD", () => {
  const { vis, ld } = loadPage();
  const haystack = (txt(vis) + " " + JSON.stringify(ld || {})).toLowerCase();

  // 1. "Cumple la Ley 822" only allowed inside FAQ #3 question
  for (const m of haystack.matchAll(/cumple (?:con )?la ley 822/g)) {
    const window = haystack.slice(Math.max(0, m.index - 25), m.index + 50);
    assert.match(window, /¿el sistema cumple la ley 822 para la valuación\?/, `S8.1 banned claim: "${window}"`);
  }
  for (const phrase of [
    "cumplimiento garantizado",
    "cumplimiento automático",
    "conforme a la ley 822",
    // 2. Cambio de método con autorización registrada en el sistema
    "autorización dgi registrada en el sistema",
    "registra la autorización de cambio de método",
    // 3. Listas de conteo firmadas como función del sistema
    "el conteo emite el artefacto",
    "emite listas de conteo firmadas",
    // 4. Entrega a la DGI / exportación para la Administración
    "entrega a la dgi los registros",
    "exportación para la administración",
    // 6. UEPS mal explicada
    "solo fifo y promedio son legales",
    "ofrece ueps",
    // 7. FEFO como obligación legal
    "fefo es obligatorio",
    "fefo es obligación legal",
    // 8. Merma cero / control total / inventario exacto siempre
    "merma cero",
    "control total de la merma",
    "inventario exacto siempre",
    // 9. Multi-sucursal / consolidación multi-local
    "tiempo real entre sucursales",
    "consolidación multi-local",
    "consolidación multisucursal",
    "multi-sucursal",
    "multisucursal",
  ]) {
    assert.ok(!haystack.includes(phrase), `S8 banned claim present: ${phrase}`);
  }
});

// 8. S8.10 + S19: Inherited site bans and NHILOS-price IVA claims absent
test("G08 (S8.10/S19): inherited site bans and NHILOS-price IVA claims are absent", () => {
  const { vis, ld } = loadPage();
  const haystack = (txt(vis) + " " + JSON.stringify(ld || {})).toLowerCase();
  for (const b of [
    "facturación impresa",
    "factura impresa",
    "factura electrónica",
    "facturación electrónica",
    "sistema autorizado por la dgi",
    "cero multas",
    "nunca pierdes",
    "100% sincronizado",
    "solución integral",
    "transformación digital",
    "ecosistema",
    "kds",
    "byod",
    "iva incluido",
    "iva aparte",
    "más iva",
    "precios netos",
    "dólares netos",
  ]) {
    assert.ok(!haystack.includes(b), `inherited banned phrase present: ${b}`);
  }
});

// 9. S8.10 / S18.9: R-01..R-07 absent from visible text and JSON-LD
test("G09 (S8.10): R-01..R-07 identifiers never appear in visible text or JSON-LD", () => {
  const { vis, ld } = loadPage();
  assert.doesNotMatch(txt(vis), /\bR-0[1-7]\b/, "R-nn identifier leaked in visible copy");
  assert.doesNotMatch(JSON.stringify(ld || {}), /\bR-0[1-7]\b/, "R-nn identifier leaked in JSON-LD");
});

// 10. S8.10 / S18.10: CPP absent (must write 'costo promedio ponderado')
test("G10 (S8.10): 'CPP' abbreviation is absent from visible text and JSON-LD", () => {
  const { vis, ld } = loadPage();
  assert.doesNotMatch(txt(vis), /\bCPP\b/, "untranslated CPP leaked in visible copy");
  assert.doesNotMatch(JSON.stringify(ld || {}), /\bCPP\b/, "untranslated CPP leaked in JSON-LD");
});

// 11. S10: FAQPage parity cell-by-cell + GEO rule 1
test("G11 (S10): FAQPage JSON-LD matches visible FAQ cells character-for-character + GEO rule 1", () => {
  const { faq, cells } = loadPage();
  assert.equal(cells.length, 7, `expected 7 visible FAQ cells, got ${cells.length}`);
  assert.equal(faq.length, 7, `expected 7 FAQPage entries, got ${faq.length}`);
  assert.deepEqual(
    faq.map((q) => q.name),
    cells.map((c) => c[0]),
  );
  for (let i = 0; i < cells.length; i++) {
    assert.equal(cells[i][1], faq[i].acceptedAnswer.text.replace(/\s+/g, " ").trim(), `mismatch on FAQ #${i + 1}`);
  }
  for (const [q, a] of cells) {
    const first = a.split(/(?<=[.!?])\s/)[0];
    assert.match(first, /NHILOS POS/, `GEO rule 1 missing NHILOS POS in first sentence: ${q}`);
    assert.match(first, /Nicaragua/, `GEO rule 1 missing Nicaragua in first sentence: ${q}`);
  }
});

// 12. S10: All 7 FAQ questions verbatim and in order
test("G12 (S10): all 7 FAQ questions are present verbatim and in order", () => {
  const { cells } = loadPage();
  const expected = [
    "¿Cómo descuenta el inventario al vender?",
    "¿De dónde sale el costo?",
    "¿El sistema cumple la Ley 822 para la valuación?",
    "¿Puedo cambiar de método de valuación en el sistema?",
    "¿Qué es la merma teórica vs física?",
    "¿Sirve si no tengo recetas?",
    "¿Cuánto cuesta?",
  ];
  assert.deepEqual(
    cells.map((c) => c[0]),
    expected,
  );
});

// 13. S9: Responsibility division table with two columns (sistema vs negocio/contador)
test("G13 (S9): responsibility division table has both columns with verified operational items", () => {
  const { vis } = loadPage();
  const marcoSec = (vis.split('id="marco"')[1] || "").split("</section>")[0] || "";
  const leftCol = (marcoSec.split('data-col="sistema"')[1] || "").split('data-col="negocio"')[0] || "";
  const rightCol = marcoSec.split('data-col="negocio"')[1] || "";
  const leftItems = [...leftCol.matchAll(/<li[^>]*>/g)];
  const rightItems = [...rightCol.matchAll(/<li[^>]*>/g)];
  assert.ok(leftItems.length >= 5, `expected >=5 system items, got ${leftItems.length}`);
  assert.ok(rightItems.length >= 4, `expected >=4 business/accountant items, got ${rightItems.length}`);
});

// 14. S12: Price parity with /precios/ (exact subset)
test("G14 (S12): every US$ figure on the page is an exact subset of /precios/", () => {
  const { src } = loadPage();
  const preciosSrc = fs.readFileSync(PRECIOS, "utf8");
  const preciosNums = new Set([...preciosSrc.matchAll(/US\$\s?(\d+(?:[.,]\d+)?)/g)].map((m) => m[1]));
  const pageNums = [...new Set([...src.matchAll(/US\$\s?(\d+(?:[.,]\d+)?)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(pageNums, ["39"], `expected only US$39 pack price, got ${JSON.stringify(pageNums)}`);
  for (const n of pageNums) {
    assert.ok(preciosNums.has(n), `US$${n} is not published in 07-precios.html`);
  }
});

// 15. S8.5 / S12: "kardex valorizado" ONLY in Pro context, never in Retail/Esencial
test("G15 (S8.5/S12): 'kardex valorizado' appears only in plan Pro context, never attributed to Retail or Esencial", () => {
  const { vis, ld } = loadPage();
  const text = (txt(vis) + " " + JSON.stringify(ld || {})).toLowerCase();
  const matches = [...text.matchAll(/kardex valorizado/g)];
  assert.ok(matches.length >= 1, "expected 'kardex valorizado' attributed to plan Pro");
  for (const m of matches) {
    const window = text.slice(Math.max(0, m.index - 40), m.index + 90);
    assert.match(window, /plan pro/, `'kardex valorizado' must be tied to plan Pro: "${window}"`);
    assert.doesNotMatch(window, /pack retail[^.]*kardex valorizado|esencial[^.]*kardex valorizado/, `wrong plan attribution: "${window}"`);
  }
});

// 16. S13: Referenced captures and video exist with exact real dimensions
test("G16 (S13): referenced captures and recipe video exist with exact real dimensions", () => {
  const { vis } = loadPage();
  for (const cap of [
    { file: "media/dsh_15_inventario.webp", width: "1440", height: "900" },
    { file: "media/dsh_23_kardex_movimientos.webp", width: "1440", height: "900" },
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation", cap.file)), `missing ${cap.file}`);
    const tag = vis.match(new RegExp(`<img[^>]*src="${cap.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`))?.[0];
    assert.ok(tag, `missing <img> for ${cap.file}`);
    assert.match(tag, new RegExp(`width="${cap.width}"`));
    assert.match(tag, new RegExp(`height="${cap.height}"`));
  }
  // Video clip reused from hub (muted, playsinline, poster, no autoplay)
  const videoTag = vis.match(/<video[^>]*src="media\/dsh_bom_recetas\.13330051\.mp4"[^>]*>/)?.[0];
  assert.ok(videoTag, "missing recipe recalculation <video>");
  assert.match(videoTag, /poster="media\/dsh_bom_recetas_poster\.7fa0d248\.webp"/);
  assert.match(videoTag, /\bmuted\b/);
  assert.match(videoTag, /\bplaysinline\b/);
  assert.doesNotMatch(videoTag, /\bautoplay\b/);
  assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation/media/dsh_bom_recetas.13330051.mp4")));
  assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation/media/dsh_bom_recetas_poster.7fa0d248.webp")));
});

// 17. S13: Every capture/video figure carries 'datos de demostración' label
test("G17 (S13): every capture and video carries the 'datos de demostración' honesty label", () => {
  const { vis } = loadPage();
  const figures = [...vis.matchAll(/<figure[^>]*>([\s\S]*?)<\/figure>/g)].map((m) => m[1]);
  assert.equal(figures.length, 3, `expected 3 proof figures (1 video + 2 captures), got ${figures.length}`);
  for (const fig of figures) {
    assert.match(fig, /class="demo-tag"/, "figure missing .demo-tag");
    assert.match(txt(fig).toLowerCase(), /datos de demostración/, "figure missing 'datos de demostración'");
  }
});

// 18. S13: Kardex alt/caption does NOT claim executed writedown or market price
test("G18 (S13): kardex alt and caption do not claim an executed writedown or market price", () => {
  const { vis } = loadPage();
  const figMatch = vis.match(/<figure[^>]*>[\s\S]*?dsh_23_kardex_movimientos\.webp[\s\S]*?<\/figure>/);
  assert.ok(figMatch, "missing kardex figure");
  const fig = figMatch[0];
  assert.doesNotMatch(fig, /castigo ejecutado|castigo aplicado|precio de mercado/i, "kardex figure overclaims writedown/market price");
});

// 19. S13: No capture cited as a count session; documented media-slot comment present in H2 4
test("G19 (S13): shrinkage section has no invented count-session capture and documents media-slot", () => {
  const { src, vis } = loadPage();
  const mermaSec = (vis.split('id="merma"')[1] || "").split("</section>")[0] || "";
  assert.doesNotMatch(mermaSec, /<img\b|<video\b/, "merma section must not include an invented count-session capture");
  assert.match(src, /<!--\s*media-slot:\s*conteo-sesion[^>]*-->/, "missing media-slot: conteo-sesion comment");
});

// 20. S1: Relative paths for assets/, media/, and fonts/ in the artboard
test("G20 (S1): artboard uses relative paths for assets/, media/, and fonts/", () => {
  const { src } = loadPage();
  assert.match(src, /<link rel="stylesheet" href="assets\/site\.css">/);
  assert.match(src, /<script src="assets\/site\.js"><\/script>/);
  for (const m of src.matchAll(/(?:src|poster|href)="([^"]*(?:assets|media|fonts)\/[^"]*)"/g)) {
    assert.ok(!m[1].startsWith("/"), `artboard must use relative path: ${m[1]}`);
    assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation", m[1])), `missing asset: ${m[1]}`);
  }
});

// 21. S17: faq-cell reused; no repeated patterns from home, hub, precios, or fiscal
test("G21 (S17): faq-cell is reused and no patterns from other pages are repeated", () => {
  const { src, body } = loadPage();
  assert.match(src, /class="faq-wrap reveal"/);
  assert.match(src, /class="faq-cells stagger"/);
  const pageCss = (src.split("<style>")[1] || "").split("</style>")[0] || "";
  const bannedPatterns = [
    "hero-question", "mode-btn", "ledger-row", "compare-band", "price-strip",
    "rate-rows", "compare-table", "plan-fichas", "pack-items", "charge-list",
    "risk-band-grid", "assure-pair", "steps-strip", "hw-rule", "ladder",
    "fisc-void-steps", "fisc-layers", "fisc-division-grid", "fisc-inspect-grid",
  ];
  for (const cls of bannedPatterns) {
    assert.ok(!pageCss.includes(`.${cls}`), `page CSS repeats pattern class: .${cls}`);
    assert.ok(!body.includes(`class="${cls}`) && !body.includes(` ${cls}"`), `body repeats pattern class: ${cls}`);
  }
  assert.doesNotMatch(pageCss, /object-fit:\s*cover/, "evidence must never be cropped with object-fit: cover");
});

// 22. S16: Every var(--*) token used exists in assets/site.css
test("G22 (S16): every var(--*) token used in the artboard is defined in assets/site.css", () => {
  const { src } = loadPage();
  const css = fs.readFileSync(SITE_CSS, "utf8");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...new Set([...src.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
  const missing = used.filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `undefined CSS tokens: ${missing.join(", ")}`);
});

// 23. S19: Zero em-dashes anywhere in the file
test("G23 (S19): zero em-dashes (—) anywhere in the artboard file", () => {
  const { src } = loadPage();
  assert.equal(src.includes("—"), false, "artboard contains forbidden em-dash (—)");
});

// 24. S19: Voice — zero site self-narration, BOM absent from visible text and JSON-LD
test("G24 (S19): zero site self-narration and zero BOM in visible text or JSON-LD", () => {
  const { vis, ld } = loadPage();
  const spoken = txt(vis);
  const schema = JSON.stringify(ld || {});
  for (const re of [
    /esta página/i,
    /esta sección/i,
    /este sitio/i,
    /esta web/i,
    /página dueña/i,
    /enunciada aquí/i,
    /mantenida en un solo lugar/i,
    /dicho tal cual/i,
  ]) {
    assert.doesNotMatch(spoken, re, `site self-narration in visible copy: ${re}`);
    assert.doesNotMatch(schema, re, `site self-narration in JSON-LD: ${re}`);
  }
  assert.doesNotMatch(spoken, /\bBOM\b/, "BOM must not appear in visible copy (only alt/title of real screen)");
  assert.doesNotMatch(schema, /\bBOM\b/, "BOM must not appear in JSON-LD");
});

// 25. S19: Zero internal vocabulary in visible copy and JSON-LD
test("G25 (S19): zero internal vocabulary or old project names in visible copy and JSON-LD", () => {
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

// 26. S1/S14/S15/S16: Registered in PAGES & design.json, WhatsApp, events, schema, links, no personal names
test("G26 (S1/S14/S15/S16): PAGES, design.json, WhatsApp, events, BreadcrumbList, Organization, safe links, no personal names", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.match(buildSrc, /source:\s*"09-inventario\.html",\s*out:\s*"inventario\/index\.html",\s*url:\s*"\/inventario\/"/);
  const design = JSON.parse(fs.readFileSync(DESIGN_JSON, "utf8"));
  assert.ok(design.artboards.some((a) => a.file === "09-inventario.html"), "09-inventario.html missing from design.json");

  const { src, vis, ld } = loadPage();
  assert.equal(src.includes("Octavio"), false, "no personal names");
  assert.match(src, /<noscript>/, "missing noscript fallback");
  assert.match(src, /<nav class="spine"/, "missing shared spine");

  // WhatsApp official number + utm_medium=inventario
  const waLinks = [...vis.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(waLinks.length >= 2, "expected WhatsApp CTA links");
  for (const url of waLinks) assert.match(url, /^https:\/\/wa\.me\/50581948526/);
  assert.ok(waLinks.some((u) => u.includes("utm_medium=inventario")), "missing utm_medium=inventario");

  // S15 data-event hooks
  for (const ev of [
    "inventario_llega_kardex",
    "inventario_marco_lee",
    "faq_inventario_abre",
    "cta_demo_inventario",
    "cta_whatsapp_inventario",
  ]) {
    assert.ok(src.includes(`data-event="${ev}"`), `missing data-event="${ev}"`);
  }

  // BreadcrumbList + Organization
  const bc = ld?.["@graph"]?.find((n) => n["@type"] === "BreadcrumbList");
  const org = ld?.["@graph"]?.find((n) => n["@type"] === "Organization");
  assert.ok(bc, "missing BreadcrumbList");
  assert.ok(org, "missing Organization");
  assert.equal(bc.itemListElement[0].name, "Inicio");
  assert.equal(bc.itemListElement[1].name, "Inventario");

  // Internal links: only routes in the build registry (PUBLISHED_ROUTES); pending pages never href
  const allowedInternal = PUBLISHED_ROUTES;
  for (const m of vis.matchAll(/href="(\/[^"]*)"/g)) {
    assert.ok(allowedInternal.has(m[1]), `unexpected internal href: ${m[1]}`);
  }
  assert.ok(vis.includes('href="/facturacion-dgi/"'), "missing link to /facturacion-dgi/");
  assert.ok(vis.includes('href="/software-pos/"'), "missing link to /software-pos/");
  assert.ok(vis.includes('href="/precios/"'), "missing link to /precios/");
  for (const pending of ["/inventario/restaurantes/", "/inventario/food-parks/", "/recursos/merma/", "/recursos/costeo-recetas/"]) {
    assert.equal(vis.includes(`href="${pending}"`), false, `dead href to unpublished page: ${pending}`);
    assert.match(src, new RegExp(`<!--[^>]*${pending.replace(/\//g, "\\/")}[^>]*-->`), `pending page ${pending} must be declared in comment`);
  }

  // In-page anchors resolve
  const ids = new Set([...vis.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of vis.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(m[1]), `broken in-page anchor: #${m[1]}`);
  }
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
