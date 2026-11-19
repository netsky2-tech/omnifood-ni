// Regression guards for the /software-pos/ hub artboard (06-software-pos.html).
// Run: node --test scripts/__tests__/nhilos-software-pos-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md §3 (binding) +
// odd/tasks/nhilos-web-software-pos.md (S1-S6).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/06-software-pos.html");
const MEDIA = path.join(ROOT, "design/nhilos-web-foundation");
const BUILD = path.join(ROOT, "scripts/build-nhilos-web.mjs");

const src = fs.readFileSync(ART, "utf8");
const body = src.split("<body>")[1];
const vis = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const txt = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const ld = JSON.parse(src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity;
const cells = [...vis.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [txt(m[1]), txt(m[2])]);

// S2 / brief §3.4: H1 exacto, una sola vez
test("S2: single h1 with brief §3.4 text", () => {
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(txt(h1[0][1]), "Sistema POS en Nicaragua: el control de tu venta, a la medida de tu negocio");
});

// S2 / brief §3.4: los dos modos se reconocen en la primera pantalla (hero)
test("S2: both operation shapes named in the hero, before the first scroll", () => {
  const hero = src.split('id="inicio"')[1].split("</section>")[0];
  assert.match(txt(hero), /¿Vendes lo que compras\?/i);
  assert.match(txt(hero), /¿Lo que vendes se cocina\?/i);
});

// S2 / brief §3.4: jerarquía H2 completa, verbatim y en orden
test("S2: H2 hierarchy matches brief §3.4 verbatim, in order", () => {
  const expected = [
    "¿De qué tipo es tu negocio? Dos formas de vender, un mismo sistema",
    "¿Qué es un sistema POS y qué hace por tu negocio?",
    "¿Cuánto control necesitas? Elige el nivel, no aceptes uno fijo",
    "Para qué negocios sirve: entra por el tuyo",
    "Las tres preguntas que deciden: sin internet, DGI e inventario",
    "¿Cuánto cuesta un sistema POS en Nicaragua?",
    "¿Necesito equipo especial?",
    "Preguntas frecuentes sobre sistemas POS en Nicaragua",
    "Solicita una demo con datos reales de tu operación",
  ];
  const actual = [...vis.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => txt(m[1]));
  assert.deepEqual(actual, expected);
});

// S2 / brief §3.4: los H3 del hub
test("S2: H3 sub-angles from brief §3.4 are present", () => {
  const h3s = [...vis.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => txt(m[1]));
  for (const h3 of [
    "Vendes lo que compras: reventa y mostrador sin recetas",
    "Lo que se cocina: recetas, insumos y costo por plato",
    "Los dos modos conviven: el caso food park",
    "Qué cambia frente al cuaderno, el Excel o un POS fiscal viejo",
    "Restaurantes de alta rotación",
    "Food parks y food courts",
    "Cafeterías y comercios de mostrador",
    "Operación diaria con facturación: caja, bar y comida rápida",
  ])
    assert.ok(h3s.includes(h3), h3);
});

// S3: claims vetados — cero apariciones en TODO el archivo (incluye comentarios, alt y JSON-LD)
test("S3: zero banned claims anywhere in the source", () => {
  for (const b of [
    "factura electrónica", "facturación electrónica", "cero multas",
    "sistema autorizado por la dgi", "con folio autorizado",
    "nunca pierdes", "100% sincronizado", "solución integral",
    "transformación digital", "ecosistema", "hardware real",
    "kds", "impresión", "impresora", "concurrencia lan",
    "caja compartida", "vista consolidada", "exportación contable",
    "multi-sucursal", "multisucursal",
  ])
    assert.equal((src.toLowerCase().match(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 0, b);
});

// S4: vocabulario interno y lenguaje de hoja de ruta
test("S4: no internal vocabulary or roadmap language (visible text and JSON-LD)", () => {
  const visible = txt(vis);
  const schema = JSON.stringify(ld);
  const insensitive = ["issue #", "entitlements", "go-live", "golive", "backlog", "sprint", "staging", "hotfix", "habilitan por parte", "puesta en marcha", "próximamente", "roadmap", "en producción", "cuando exista"];
  for (const term of insensitive) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.equal((visible.match(new RegExp(escaped, "gi")) || []).length, 0, `visible copy leaks "${term}"`);
    assert.equal((schema.match(new RegExp(escaped, "gi")) || []).length, 0, `JSON-LD leaks "${term}"`);
  }
  for (const term of ["TODO", "QA", "WIP"]) {
    const word = new RegExp(`\\b${term}\\b`);
    assert.equal((visible.match(word) || []).length, 0, `visible copy leaks "${term}"`);
    assert.equal((schema.match(word) || []).length, 0, `JSON-LD leaks "${term}"`);
  }
});

// S5: paridad GEO — respuestas visibles == schema, celda por celda
test("S5: FAQPage names and texts match visible accordion cells exactly", () => {
  assert.equal(cells.length, 6);
  assert.equal(faq.length, 6);
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

// S5: BreadcrumbList parity con la ruta visible
test("S5: BreadcrumbList names match the visible breadcrumb", () => {
  const bc = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList");
  const nav = vis.split('aria-label="Ruta de navegación"')[1].split("</nav>")[0];
  const visibleNames = bc.itemListElement.map((i) => i.name);
  for (const name of visibleNames) assert.match(txt(nav), new RegExp(name), name);
  assert.equal(bc.itemListElement[0].item, "https://www.nhilospos.com/");
  assert.equal(bc.itemListElement[1].item, "https://www.nhilospos.com/software-pos/");
});

// S5 / B3: integridad del schema — Organization visible en el footer, sin offers/ratings
test("S5: Organization contact + socials match visible footer; no offers or ratings", () => {
  const org = ld["@graph"].find((n) => n["@type"] === "Organization");
  assert.equal(org.address, undefined);
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

// Sin enlaces muertos: solo URLs reales publicadas; cero hrefs a hijos no publicados
test("links: no dead hrefs; hub children are never linked before they exist", () => {
  const allowedInternal = new Set(["/", "/precios/", "/facturacion-dgi/", "/inventario/", "/demo/"]);
  for (const m of vis.matchAll(/href="(\/[^"]*)"/g)) assert.ok(allowedInternal.has(m[1]), `unexpected internal href: ${m[1]}`);
  assert.equal(/href="\/software-pos\/(?!index)/.test(vis), false, "href to an unpublished hub child");
  const allowedExternal = new Set([
    "https://wa.me/50581948526",
    "https://www.instagram.com/nhilosapp/",
    "https://www.facebook.com/nhilosapp",
    "https://www.tiktok.com/@nhilosapp",
  ]);
  for (const m of vis.matchAll(/href="(https:\/\/[^"]+)"/g)) assert.ok(allowedExternal.has(m[1]), `unexpected external href: ${m[1]}`);
});

// Media: toda captura existe; etiqueta de demostración en cada sección con prueba;
// slots nombrados no simulan footage y nombran un clip real existente
test("C1/C2: media exist, videos muted+playsinline, demo label in every proof section", () => {
  for (const m of vis.matchAll(/<(video|img)\b[^>]*src="([^"]+)"[^>]*>/g)) {
    assert.ok(fs.existsSync(path.join(MEDIA, m[2].replace(/^\//, ""))), m[2]);
    if (m[1] === "video") {
      assert.match(m[0], /muted/);
      assert.match(m[0], /playsinline/);
    }
  }
  for (const s of vis.split(/<section\b/).slice(1)) {
    if (/class="capture-frame"|data-media-slot=|<video\b/.test(s)) assert.match(s, /datos de demostración/i);
  }
});
test("media slots: every slot carries an HTML comment naming a real, existing clip", () => {
  const slots = [...src.matchAll(/data-media-slot="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(slots.length >= 1, "at least one marked slot");
  for (const slot of slots) {
    const idx = src.indexOf(`data-media-slot="${slot}"`);
    const from = src.lastIndexOf("<!--", idx);
    const to = src.indexOf("-->", from);
    assert.ok(from !== -1 && to !== -1 && from < idx, `slot ${slot} has no preceding comment`);
    const comment = src.slice(from, to);
    assert.match(comment, /media-slot:/, slot);
    const clip = (comment.match(/media-slot:\s*([\w.\-]+\.mp4)/) || [])[1];
    assert.ok(clip, `slot ${slot} comment must name an intended .mp4 clip`);
    assert.ok(fs.existsSync(path.join(MEDIA, "media", clip)), `intended clip ${clip} must exist in media/`);
    assert.ok(comment.includes("datos de demostración"), slot);
  }
});

// B2: meta exacta del brief §3.8
test("B2: title/description match brief §3.8 and canonical is the hub URL", () => {
  assert.equal(src.match(/<title>([^<]+)<\/title>/)[1], "Sistema POS en Nicaragua · NHILOS POS, venta local-first");
  assert.equal(src.match(/<meta name="description" content="([^"]+)">/)[1], "Qué hace un sistema POS en Nicaragua y cómo elegir tu nivel de control: venta sin internet, mecánica DT 09-2007 y modo simple o recetas. NHILOS POS.");
  assert.ok(src.match(/<title>([^<]+)<\/title>/)[1].length <= 60);
  assert.ok(src.match(/<meta name="description" content="([^"]+)">/)[1].length <= 155);
  assert.equal(src.match(/<link rel="canonical" href="([^"]+)">/)[1], "https://www.nhilospos.com/software-pos/");
});

// B7: cero em-dashes
test("B7: zero em-dashes in visible copy and JSON-LD", () => {
  assert.equal(vis.includes("—"), false);
  assert.equal(JSON.stringify(ld).includes("—"), false);
});

// Interacción nueva: la bifurcación vive UNA vez, en el hero. Sin JS, las preguntas son anclas a
// #formas y la comparación completa queda visible y legible; con JS, el script las asciende a botones
// reales que anuncian estado (aria-pressed) y llevan #formas a la vista respetando reduced-motion.
test("interaction: the fork lives once, in the hero — no-JS anchors to #formas, JS promotes them to stateful buttons", () => {
  // 1. Las píldoras de #formas se eliminaron: un solo lugar para la misma decisión.
  assert.equal(src.includes("mode-switch"), false, "the #formas pills must be removed");
  assert.equal(src.includes("mode-btn"), false, "the #formas pills must be removed");
  // 2. Las dos preguntas del hero son anclas reales a #formas (fallback sin JS), antes de la banda.
  const hero = src.split('id="inicio"')[1].split("</section>")[0];
  const qs = [...hero.matchAll(/<a\b[^>]*class="hero-question"[^>]*>/g)].map((m) => m[0]);
  assert.equal(qs.length, 2, "two hero questions as anchors");
  for (const tag of qs) {
    assert.match(tag, /href="#formas"/, "no-JS fallback: plain anchor to #formas");
    assert.match(tag, /data-mode-target="[ab]"/, "each question carries its operation shape");
  }
  // 3. Fuente estática: nada preseleccionado, las dos columnas completas.
  const staticBody = body.split("<script")[0];
  assert.equal(/data-mode=/.test(staticBody), false, "no pre-applied mode: both columns visible without JS");
  const bandSec = src.split('id="compareBand"')[1].split("</section>")[0];
  assert.equal((bandSec.match(/class="compare-col"/g) || []).length, 2);
  // 4. El JS asciende las anclas a botones con aria-pressed y el scroll honra prefers-reduced-motion.
  const inlineJs = src.split('<script src="/assets/site.js"></script>')[1] || "";
  assert.match(inlineJs, /aria-pressed/, "state announced via aria-pressed");
  assert.match(inlineJs, /prefers-reduced-motion/, "smooth scroll gated by prefers-reduced-motion");
  assert.match(src, /<noscript>/);
  assert.match(src, /<script src="\/assets\/site\.js"><\/script>/);
});
test("interaction: FAQ accordion is native details (readable with JS off)", () => {
  assert.equal((src.match(/<details class="faq-item">/g) || []).length, 6);
  assert.equal((src.match(/<summary>/g) || []).length, 6);
});

// C3: WhatsApp oficial
test("C3: every WhatsApp link targets the official number", () => {
  for (const m of vis.matchAll(/wa\.me\/(\d+)/g)) assert.equal(m[1], "50581948526");
});

// C6: sin escombros
test("C6: no duplicated/stray script close tag", () => {
  assert.equal(/<\/script>\s*<\/script>/.test(src), false);
});

// Datos personales
test("no personal names in public copy", () => {
  assert.equal(src.includes("Octavio"), false);
});

// La página está registrada en el build multi-página
test("build: hub registered in PAGES with its canonical url", () => {
  const buildSrc = fs.readFileSync(BUILD, "utf8");
  assert.match(buildSrc, /source: "06-software-pos\.html", out: "software-pos\/index\.html", url: "\/software-pos\/"/);
});
