// Regression guards for the /precios/ artboard (07-precios.html).
// Run: node --test scripts/__tests__/nhilos-precios-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §2 (binding) +
// odd/tasks/nhilos-web-precios.md (S1-S8) + voice rule S7 of odd/tasks/nhilos-web-software-pos.md.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/07-precios.html");
const HOME = path.join(ROOT, "design/nhilos-web-foundation/05-home-geo.html");
const FINANCE = path.join(ROOT, "docs/finance/estrategia_precios_nhilos_pos_v1.md");
const BUILD = path.join(ROOT, "scripts/build-nhilos-web.mjs");

// Route registry, parsed from the PAGES array of the build script: a route is
// linkable exactly when it ships there. The parse is guarded (exactly nine
// routes) so a broken regex cannot silently empty the allowlists below.
const PUBLISHED_ROUTES = (() => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  const urls = [...buildSrc.matchAll(/source:\s*(?:"[^"]+"|\bENTRY\b)[\s\S]*?url:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(urls.length, 9, "the build script must declare exactly 9 published routes");
  return new Set(urls);
})();
const SITE_CSS = path.join(ROOT, "design/nhilos-web-foundation/assets/site.css");

const src = fs.readFileSync(ART, "utf8");
const body = src.split("<body>")[1];
const vis = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const txt = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const ld = JSON.parse(src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity;
const cells = [...vis.matchAll(/<div class="faq-cell">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [txt(m[1]), txt(m[2])]);

// S1 / brief §2.4: H1 exacto, una sola vez
test("S1: single h1 with brief §2.4 text", () => {
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(txt(h1[0][1]), "Precio de un sistema POS en Nicaragua: planes desde US$49 al mes");
});

// S1 / brief §2.4: jerarquía H2 completa, verbatim y en orden.
// Nota: el brief §2.4 contiene ONCE H2 (S1 los describe como "diez"); la fuente
// vinculante es la jerarquía verbatim del brief, así que se fijan los once.
test("S1: H2 hierarchy matches brief §2.4 verbatim, in order", () => {
  const expected = [
    "¿Cuánto cuesta NHILOS POS?",
    "Planes y precios: qué incluye cada uno",
    "Packs de capacidad: Retail y Cocina, US$39 al mes cada uno",
    "Add-ons: qué se cobra aparte de la mensualidad",
    "¿Por qué cuesta más que un POS barato?",
    "¿Qué pasa si dejo de pagar o quiero cancelar?",
    "¿Qué compra exactamente el setup?",
    "¿Necesito comprar equipo especial?",
    "¿Puedo empezar pequeño y crecer después?",
    "Preguntas frecuentes sobre los precios de NHILOS POS",
    "Cotiza NHILOS POS con tu operación real",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// S1 / brief §2.1: la respuesta rápida (los cuatro planes) vive en el hero, antes de cualquier H2
test("S1: quick answer with all four tiers lives in the hero, before the first h2", () => {
  const hero = src.split('id="inicio"')[1].split("</section>")[0];
  const heroTxt = txt(hero);
  for (const pair of ["US$49", "US$149", "US$89", "US$250", "US$450"])
    assert.ok(heroTxt.includes(pair), pair);
  assert.match(heroTxt, /Enterprise/);
  assert.match(heroTxt, /por cotización/i);
  assert.match(heroTxt, /Suscripción mensual por negocio/);
  assert.match(heroTxt, /hardware aparte/);
  assert.ok(src.indexOf("price-strip") < src.indexOf("<h2"), "the quick-answer strip precedes the first h2");
});

// S2 / brief §2.4: los H3 de los planes
test("S2: plan H3 sub-angles from brief §2.4 are present", () => {
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  for (const h3 of [
    "Esencial: US$49 al mes para empezar a vender y facturar",
    "Operación: US$89 al mes con un pack a elección",
    "Pro: US$149 al mes con ambos packs y dos terminales",
    "Enterprise: cotización con alcance validado",
  ])
    assert.ok(h3s.includes(h3), h3);
});

// S5: paridad numérica — el conjunto exacto de cifras US$ de la página contra la home (#precios)
// y docs/finance/estrategia_precios_nhilos_pos_v1.md §4. Si un número cambia, cambia en los tres
// documentos a la vez; una cifra fuera de este conjunto es una claim sin fuente y falla aquí.
test("S5: every US$ figure on the page belongs to the frozen price document and the home", () => {
  const pageNums = [...new Set([...src.matchAll(/US\$\s?(\d+(?:[.,]\d+)?)/g)].map((m) => m[1]))].sort();
  // Los totales de arranque (US$198/339/599) son aritmética derivada de las dos cifras
// congeladas de su propia tarjeta (setup + primer mes), decisión del fundador: no son cifras
// fuente, así que quedan exentos de la paridad con la home y el documento de precios, pero el
// guard G1 exige que cada total cuadre con las dos cifras de su tarjeta. US$88 (total de
// Esencial+pack) sigue retirado: un total compuesto distinto cai aquí.
  const DERIVED_STARTUP_TOTALS = new Set(["198", "339", "599"]);
  const expected = ["10", "149", "198", "250", "29", "339", "39", "40", "450", "49", "599", "75", "89"];
  assert.deepEqual(pageNums, expected);
  const homeSrc = fs.readFileSync(HOME, "utf8");
  const homeNums = new Set([...homeSrc.matchAll(/US\$\s?(\d+(?:[.,]\d+)?)/g)].map((m) => m[1]));
  const financeSrc = fs.readFileSync(FINANCE, "utf8");
  for (const n of pageNums) {
    if (DERIVED_STARTUP_TOTALS.has(n)) continue;
    assert.match(financeSrc, new RegExp(`US\\$\\s?${n}\\b`), `US$${n} must exist in the frozen price document`);
    if (n !== "75") assert.ok(homeNums.has(n), `US$${n} must also appear on the home pricing section`);
  }
  // US$75 (enrolamiento) vive solo en el documento de precios; la home lo nombra sin cifra.
  assert.ok(!homeNums.has("75"), "home does not publish the enrolment fee figure");
});

// S5: los pares plan/-setup exactos del documento de precios §4
test("S5: plan and setup pairs match the frozen price document", () => {
  for (const [plan, monthly, setup] of [
    ["Esencial", "US$49", "US$149"],
    ["Operación", "US$89", "US$250"],
    ["Pro", "US$149", "US$450"],
  ]) {
    const card = src.split(`>${plan}<`)[1] || "";
    const seg = src.slice(src.indexOf(`>${plan}<`), src.indexOf(`>${plan}<`) + 4000);
    assert.ok(seg.includes(monthly) && seg.includes(setup), `${plan}: ${monthly}/${setup}`);
  }
  assert.match(vis, /Enterprise[^.]*por cotización/i);
});

// S6: claims vetados del brief §2.5 — cero apariciones en texto visible y JSON-LD.
// "Impresora" integrada de la terminal física (Sunmi/iPOS) SÍ se puede nombrar: es
// el hardware vendido. Lo vetado es prometer impresión externa o a ticketeras (#983).
test("S6: zero banned claims in visible copy and JSON-LD", () => {
  const haystack = (txt(vis) + " " + JSON.stringify(ld)).toLowerCase();
  for (const b of [
    "factura electrónica", "facturación electrónica", "factura impresa",
    "cero multas", "autorizado por la dgi", "folio autorizado",
    "cancela cuando quieras", "sin permanencia", "permanencia mínima",
    "solo esta semana", "por tiempo limitado", "últimos cupos", "cuenta regresiva",
    "kds", "impresión externa", "imprime el ticket", "ticketera", "esc-pos", "esc/pos",
    "exportación contable", "multi-sucursal", "multisucursal", "consolidado",
    "integración bancaria", "gestión de rutas",
    "soho", "byod", "plan de catálogo", "hardware incluido",
    "descuento anual", "% de descuento",
  ])
    assert.ok(!haystack.includes(b), `banned claim present: ${b}`);
});

// S6: cifras de hardware y de servicios cotizables — el conjunto de números ya lo fija la prueba
// de paridad; aquí se fijan los tokens de precio que NUNCA pueden entrar al archivo (comentarios incluidos)
test("S6: hardware and quotable-service prices never enter the file at all", () => {
  const nums = new Set([...src.matchAll(/US\$\s?(\d+(?:[.,]\d+)?)/g)].map((m) => m[1]));
  for (const banned of ["25", "79", "99", "15", "19", "35", "50", "96", "200", "289", "299", "350", "749", "899"])
    assert.ok(!nums.has(banned), `US$${banned} must never be published`);
});

// S4 + S7 (regla de voz del hub): cero narración de sitio, cero jerga de ingeniería
test("S7 voice: el copy habla de la operación del lector, no del sitio; sin BOM ni vocabulario interno", () => {
  const spoken = txt(vis);
  for (const b of [/esta página/i, /esta sección/i, /este sitio/i, /esta web/i, /página dueña/i, /orienta y reparte/i, /página especializada/i, /el detalle de método vive/i])
    assert.doesNotMatch(spoken, b, `narración de sitio: ${b}`);
  assert.doesNotMatch(spoken, /\bBOM\b/);
  assert.doesNotMatch(JSON.stringify(ld), /\bBOM\b/);
  const schema = JSON.stringify(ld);
  for (const term of ["issue #", "entitlement", "go-live", "golive", "backlog", "sprint", "staging", "hotfix", "roadmap", "próximamente", "cuando exista", "owner", "funnel", "gating"]) {
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

// S7: paridad GEO — respuestas visibles == schema, celda por celda
test("S7: FAQPage names and texts match visible FAQ cells exactly", () => {
  assert.equal(cells.length, 7);
  assert.equal(faq.length, 7);
  assert.deepEqual(new Set(faq.map((q) => q.name)), new Set(cells.map((c) => c[0])));
  for (const c of cells) {
    const q = faq.find((x) => x.name === c[0]);
    assert.ok(q, q?.name ?? c[0]);
    assert.equal(c[1], q.acceptedAnswer.text.replace(/\s+/g, " ").trim(), q.name);
  }
});

// GEO regla 1: entidad + mercado en la primera frase de cada respuesta visible
test("GEO rule 1: first sentence names NHILOS POS + Nicaragua", () => {
  for (const [q, a] of cells) {
    const first = a.split(/(?<=[.!?])\s/)[0];
    assert.match(first, /NHILOS POS/, q);
    assert.match(first, /Nicaragua/, q);
  }
});

// S7: BreadcrumbList parity con la ruta visible
test("S7: BreadcrumbList names match the visible breadcrumb", () => {
  const bc = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList");
  const nav = vis.split('aria-label="Ruta de navegación"')[1].split("</nav>")[0];
  const visibleNames = bc.itemListElement.map((i) => i.name);
  for (const name of visibleNames) assert.match(txt(nav), new RegExp(name), name);
  assert.equal(bc.itemListElement[0].item, "https://www.nhilospos.com/");
  assert.equal(bc.itemListElement[1].item, "https://www.nhilospos.com/precios/");
});

// S7: integridad del schema — Organization visible en el footer, sin offers/ratings
test("S7: Organization contact + socials match visible footer; no offers or ratings", () => {
  const org = ld["@graph"].find((n) => n["@type"] === "Organization");
  assert.ok(org, "Organization node present");
  assert.match(vis, /50581948526/);
  assert.match(vis, /\+505 8194 8526/);
  for (const url of org.sameAs) assert.match(vis, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(/aggregateRating|"review"|"offers"|"price"/.test(JSON.stringify(ld)), false);
});

// Anchors internos resuelven
test("B5: all in-page anchors resolve", () => {
  const ids = new Set([...vis.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of vis.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
});

// Sin enlaces muertos: toda ruta interna debe existir en el registro del build
// (PUBLISHED_ROUTES). Pendiente (/software-pos/hardware/): texto plano + comentario, nunca href.
test("links: no dead hrefs; pending pages are plain text with a comment, never hrefs", () => {
  const allowedInternal = PUBLISHED_ROUTES;
  for (const m of vis.matchAll(/href="(\/[^"]*)"/g)) assert.ok(allowedInternal.has(m[1]), `unexpected internal href: ${m[1]}`);
  for (const pending of ["/software-pos/hardware/"]) {
    assert.equal(vis.includes(`href="${pending}"`), false, `href to unpublished page ${pending}`);
    assert.match(src, new RegExp(`<!--[^>]*${pending.replace(/\//g, "\\/")}[^>]*-->`), `${pending} must be declared pending in a comment`);
  }
  const allowedExternal = new Set([
    "https://wa.me/50581948526",
    "https://www.instagram.com/nhilosapp/",
    "https://www.facebook.com/nhilosapp",
    "https://www.tiktok.com/@nhilosapp",
  ]);
  for (const m of vis.matchAll(/href="(https:\/\/[^"]+)"/g)) assert.ok(allowedExternal.has(m[1]), `unexpected external href: ${m[1]}`);
});

// Media y fuentes en la página PUBLICADA: rutas absolutas (una página hija con
// ruta relativa da 404 en producción — así murieron los clips del hub). El
// ARTBOARD usa relativas porque se abre desde design/, donde media/ y fonts/ son
// hermanas. Esta suite lee el artboard: exige relativas y que la referencia
// exista; la absoluta publicada la garantiza el build (rewrite + guardia propia).
// Sin object-fit: cover: la evidencia nunca se recorta.
test("media/fonts: artboard-relative paths that resolve from design/, no object-fit: cover", () => {
  for (const m of src.matchAll(/(?:src|poster|href)="([^"]*(?:media|fonts)\/[^"]*)"/g)) {
    assert.ok(!m[1].startsWith("/"), `artboard must use relative media/fonts paths: ${m[1]}`);
    assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation", m[1])), m[1]);
  }
  const css = src.split("<style>")[1].split("</style>")[0];
  assert.doesNotMatch(css, /object-fit:\s*cover/);
});

// S2: tokens — todo var(--*) usado por la página existe en assets/site.css
test("S2: every var(--*) token referenced by the page is defined in assets/site.css", () => {
  const css = fs.readFileSync(SITE_CSS, "utf8");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...new Set([...src.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))];
  const missing = used.filter((t) => !defined.has(t));
  assert.deepEqual(missing, [], `tokens used but not defined in site.css: ${missing.join(", ")}`);
});

// S2: el shell del sitio — hoja y script compartidos, noscript presente, un solo JSON-LD
test("S2: shared shell (site.css + site.js + noscript), one JSON-LD block", () => {
  assert.match(src, /<link rel="stylesheet" href="assets\/site\.css">/);
  assert.match(src, /<script src="assets\/site\.js"><\/script>/);
  assert.match(src, /<noscript>/);
  assert.equal((src.match(/<script type="application\/ld\+json">/g) || []).length, 1);
  assert.equal(/<\/script>\s*<\/script>/.test(src), false, "no duplicated/stray script close tag");
  // El FAQ replica la retícula del home (componente de sistema, único reuse permitido)
  assert.match(src, /class="faq-wrap reveal"/);
  assert.match(src, /class="faq-cells stagger"/);
  // El menú ya no usa <details>/<summary>: es un grupo hover/focus (S7-S10,
  // enlazado interno, tercera ronda). La prohibición de acordeón vuelve a aplicar
  // a toda la página, sin exclusiones.
  assert.equal(src.includes("<details"), false);
  assert.equal(src.includes("<summary"), false);
});

// Patrones de sección propios: la página NO puede reciclar las composiciones del home ni del hub
test("S2: fresh section patterns — home and hub compositions stay out of this page", () => {
  const pageCss = src.split("<style>")[1].split("</style>")[0];
  for (const cls of ["plan-grid", "plan-card", "pack-grid", "pack-card", "addons-list", "fineprint", "compare-band", "compare-col", "ledger-row", "ledger-split", "map-grid", "map-item", "edu-grid", "control-grid", "control-level", "conditions-grid", "hero-question", "mode-btn", "hero-questions"]) {
    assert.ok(!pageCss.includes(cls), `page CSS reuses home/hub pattern class: ${cls}`);
    assert.ok(!body.includes(`class="${cls}`) && !body.includes(` ${cls}`), `body reuses home/hub pattern class: ${cls}`);
  }
});

// C3: WhatsApp oficial
test("C3: every WhatsApp link targets the official number", () => {
  for (const m of vis.matchAll(/wa\.me\/(\d+)/g)) assert.equal(m[1], "50581948526");
});

// B7: cero em-dashes
test("B7: zero em-dashes in visible copy and JSON-LD", () => {
  assert.equal(vis.includes("—"), false);
  assert.equal(JSON.stringify(ld).includes("—"), false);
});

// B2: meta exacta del brief §2.8 y canónica de la página
test("B2: title/description match brief §2.8 and canonical is /precios/", () => {
  const title = src.match(/<title>([^<]+)<\/title>/)[1];
  const desc = src.match(/<meta name="description" content="([^"]+)">/)[1];
  assert.equal(title, "Precios de NHILOS POS en Nicaragua · Planes desde US$49");
  assert.equal(desc, "Esencial US$49, Operación US$89 y Pro US$149 al mes. Setups desde US$149. Suscripción por negocio, hardware aparte. Cotiza tu NHILOS POS.");
  assert.ok(title.length <= 60);
  assert.ok(desc.length <= 155);
  assert.equal(src.match(/<link rel="canonical" href="([^"]+)">/)[1], "https://www.nhilospos.com/precios/");
});

// Datos personales
test("no personal names in public copy", () => {
  assert.equal(src.includes("Octavio"), false);
});

// S8: la página está registrada en el build multi-página con su URL canónica
test("S8: precios registered in PAGES with its canonical url", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.match(buildSrc, /source: "07-precios\.html", out: "precios\/index\.html", url: "\/precios\/"/);
});

// El IVA del cliente es un dato real de su operación: el módulo fiscal lo calcula,
// la pantalla lo muestra y el alt puede nombrarlo. Lo que no puede existir es una
// afirmación sobre NUESTROS precios — mientras NHILOS no esté inscrita no recauda
// IVA, así que "incluido", "aparte" y "se agrega" son falsos y verificables por el
// comprador. Tampoco "netos": es la misma promesa con otra palabra.
// Alcance: SOLO el IVA de nuestros precios. El IVA del cliente (app, capturas,
// régimen cuota fija o general) es un dato verdadero de su operación y no se toca.
test("S9: la página no afirma nada sobre IVA en sus precios", () => {
  const plain = vis.replace(/<[^>]+>/g, " ");
  assert.equal(/\bIVA\b/.test(plain), false, "el texto visible no puede hablar de IVA");
  const jsonLd = (src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1] || "";
  assert.equal(/\bIVA\b/.test(jsonLd), false, "el schema no puede hablar de IVA");
  assert.equal(
    /IVA\s+(incluido|aparte)|incluye(?:n)?\s+IVA|\bel\s+IVA\b|más\s+IVA/i.test(src),
    false,
    "ninguna afirmación de IVA sobre precios es verdadera hoy",
  );
  assert.equal(
    /(?:precios?|dólares|USD)\s+netos?\b/i.test(src),
    false,
    "'neto' promete un impuesto que no cobramos",
  );
});

// Voseo guard (site rule, founder): the site writes in tú throughout. A Nicaraguan
// reader hears voseo as somebody else's Spanish, so the whole class is banned, not a
// list of incidents. Same guard as G27 in the restaurant suite. Accented endings only,
// so the noun "cocinas" never trips it.
test("S18-voseo: zero voseo forms in visible copy", () => {
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

// G1 (precios, decisión del fundador): el costo de arranque es un número que el prospecto no
// tiene que computar. En cada tarjeta con precio publicado va una línea "Arrancar cuesta US$T"
// y el test NO confía en el total: lo recalcula como setup + primer mes leídos de la MISMA
// tarjeta (f-price) y cruza las tres cifras entre sí. Si alguien cambia el setup, la
// mensualidad o el total, el guard falla hasta que el número se actualice. Enterprise no
// publica precio: no lleva figura y nada debe implicarla.
const STARTUP_TOTAL = /Arrancar cuesta US\$(\d+): US\$(\d+) de setup y el primer mes de US\$(\d+)\. Después, solo US\$(\d+) cada mes\./;
test("G1: startup totals equal the sum of the two figures on the same card", () => {
  const fichas = src.split('<div class="plan-ficha">').slice(1);
  const withTotal = [];
  for (const chunk of fichas) {
    const price = chunk.match(/US\$(\d+)\/mes · setup US\$(\d+)/);
    const start = chunk.match(STARTUP_TOTAL);
    if (!price) {
      // Tarjeta sin precio publicado (Enterprise): ni total ni cifra.
      assert.equal(start, null, "Enterprise must not publish a startup total or any start figure");
      assert.doesNotMatch(chunk, /Arrancar cuesta/);
      continue;
    }
    const [, monthly, setup] = price;
    assert.ok(start, `card with price US$${monthly}/mes, setup US$${setup} is missing its startup-total line`);
    const [, total, startSetup, startFirst, startAfter] = start;
    assert.equal(startSetup, setup, `card setup US$${setup}: the startup line must show the same setup, saw US$${startSetup}`);
    assert.equal(startFirst, monthly, `card monthly US$${monthly}: the first month in the startup line must match, saw US$${startFirst}`);
    assert.equal(startAfter, monthly, `the "Después" figure must stay the monthly price, saw US$${startAfter}`);
    assert.equal(
      Number(total), Number(setup) + Number(monthly),
      `startup total US$${total} must equal setup US$${setup} + first month US$${monthly} on the same card`,
    );
    withTotal.push(chunk.match(/<h3[^>]*>([^<:]+)/)?.[1]);
  }
  assert.equal(fichas.length, 4, "the three priced plans plus Enterprise");
  assert.equal(withTotal.length, 3, "exactly the three priced plans carry a startup total");
});

// G2 (add-ons, decisión del fundador): la sección responde el miedo directo — nada de los
// add-ons es obligatorio para empezar — y mantiene la lista de cargos debajo.
test("G2: the add-ons section carries the not-obligatory sentence before the charge list", () => {
  const addons = vis.split('id="addons"')[1].split("</section>")[0];
  assert.match(
    addons,
    /Nada de esto es obligatorio para empezar: el plan que elijas ya incluye lo necesario para vender\. Se suma solo si tu operación lo pide\./,
    "the not-obligatory answer must appear in the add-ons section",
  );
  assert.doesNotMatch(
    addons,
    /los únicos cargos con precio publicado/,
    "the old lead framing every charge as unavoidable must stay gone",
  );
});

// G3 (claim guard /precios): la página no promete coordinación de terminales en tiempo real.
// La verdad publicable es la copia con sincronización por nube. Se revisa frase por frase para
// no cazar los usos legítimos de "real" ("primer turno real", "cronograma real") ni la
// referencia BCN (que no es una terminal ni una red). Prohibido, por frase visible y en el
// JSON-LD: "tiempo real" junto a terminal/red/juntas, y "red local" con verbos de
// coordinación o promesa de tiempo real. "Compartir una red local" es la verdad, no la claim.
test("G3: no real-time terminal coordination promise in visible copy or JSON-LD", () => {
  const coordinationNearRedLocal = /(juntas?|juntos?|sincroniz\w*|tiempo\s+real|trabaj\w+\s+(juntas|juntos))/;
  const sentences = txt(vis).split(/(?<=[.;!?])\s+/);
  for (const [i, s] of sentences.entries()) {
    const low = s.toLowerCase();
    if (/en\s+tiempo\s+real|tiempo\s+real/.test(low)) {
      assert.ok(
        !(/\bterminales?\b/.test(low) || /\bred\b/.test(low) || /\bjuntas?\b|\bjuntos\b/.test(low)),
        `real-time terminal coordination promise in visible sentence ${i}: "${s}"`,
      );
    }
    if (/red\s+local/.test(low)) {
      assert.ok(
        !coordinationNearRedLocal.test(low),
        `red-local coordination claim in visible sentence ${i}: "${s}"`,
      );
    }
  }
  // La misma vigilancia en el JSON-LD: el schema se publica tal cual. "Tiempo real" no tiene
  // ningún uso legítimo ahí; para "red local" se exige distancia con verbos de coordinación.
  const jsonLd = JSON.stringify(ld).toLowerCase();
  assert.equal(jsonLd.includes("tiempo real"), false, "JSON-LD carries a real-time promise");
  const redLocalCoordination = new RegExp(
    `(sincroniz\\w*|juntas?|juntos?)[^.]{0,80}?red\\s+local|red\\s+local[^.]{0,80}?(sincroniz\\w*|juntas?|juntos?)`,
  );
  assert.equal(redLocalCoordination.test(jsonLd), false, "JSON-LD carries a red-local coordination claim");
});
