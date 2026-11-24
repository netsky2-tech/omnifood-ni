// Guards for la legibilidad de capturas reales (auditoría externa §6.3, 2026-11-20).
// Run: node --test scripts/__tests__/nhilos-web-capturas-legibles.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_auditoria_externa_v1.0.md §6.3 +
// design/nhilos-web-foundation/assets/site.css (patrón .shot del home).
// Tres reglas medibles:
//   1. Ninguna figura de captura fuerza UN ratio para todas las orientaciones: el ratio
//      vive en los atributos width/height de la imagen que contiene.
//   2. Toda captura real tiene una forma de abrirla a tamaño completo, con etiqueta
//      visible y honesta (nombra lo que abre).
//   3. La vía sin JavaScript no puede desaparecer: el caminos es un <a href> que apunta
//      al archivo de la imagen (el visor del navegador), no un diálogo que dependa de JS.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DESIGN = path.join(ROOT, "design/nhilos-web-foundation");
const SITE_CSS = path.join(DESIGN, "assets/site.css");

// Artboards publicados con figuras de captura estática que la auditoría midió.
// /demo/, /precios/ y /restaurantes/ no muestran capturas estáticas de producto;
// el home (05) ya lleva el patrón .shot y se guarda aparte al final.
const CAPTURE_PAGES = [
  "06-software-pos.html",
  "08-facturacion-dgi.html",
  "09-inventario.html",
  "11-sin-internet.html",
  "13-food-parks.html",
];

const pageSrc = (name) => fs.readFileSync(path.join(DESIGN, name), "utf8");
const pageCss = (src) => (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] ?? "";
const stripTags = (s) => s.replace(/<[^>]+>/g, "");

// Captura = figura publicada con una imagen real del banco media/. En 05 el patrón .shot
// ya envuelve la imagen; aquí se exige en las páginas que la auditoría midió sin él.
function captureFigures(name) {
  const src = pageSrc(name);
  return [...src.matchAll(/<figure\b[^>]*class="([^"]*)"[^>]*>[\s\S]*?<\/figure>/g)]
    .map((m) => m[0])
    .filter((f) => /<img\b[^>]*src="(?:\/)?media\//.test(f) && !/<video\b/.test(f));
}

// Regla 1: el CSS (de página y compartido) no declara ratio para las cajas de captura.
// Se mira línea por línea: una regla cuyo selector nombra capture- (cjąja de captura real)
// y que lleve aspect-ratio vuelve a meter el cuadrado forzado que la auditoría midió.
function cssLinesThatForceCaptureRatio(name) {
  const css = pageCss(pageSrc(name)) + "\n" + fs.readFileSync(SITE_CSS, "utf8");
  return css
    .split("\n")
    .filter((line) => /capture(?![a-z])/.test(line) && /aspect-ratio\s*:/.test(line));
}

test("regla 1: ninguna caja de captura declara aspect-ratio propio (el ratio nace de la imagen)", () => {
  const offenders = [];
  for (const name of CAPTURE_PAGES) {
    for (const line of cssLinesThatForceCaptureRatio(name)) {
      offenders.push(`${name}: ${line.trim().slice(0, 160)}`);
    }
  }
  assert.deepEqual(offenders, [], "siendo el ratio de la imagen, ninguna regla CSS la encierra");
});

test("regla 1: cada captura declara sus dimensiones intrínsecas (width y height reales)", () => {
  const offenders = [];
  for (const name of CAPTURE_PAGES) {
    for (const fig of captureFigures(name)) {
      const img = fig.match(/<img\b[^>]*>/)[0];
      if (!/\bwidth="[0-9]+"/.test(img) || !/\bheight="[0-9]+"/.test(img)) {
        offenders.push(`${name}: ${img.slice(0, 120)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "sin width/height la caja no sabe qué ratio pintar antes de cargar");
});

test("regla 2: toda captura se abre a tamaño completo con una etiqueta visible y honesta", () => {
  const offenders = [];
  for (const name of CAPTURE_PAGES) {
    for (const fig of captureFigures(name)) {
      const imgFile = (fig.match(/<img\b[^>]*src="(?:\/)?media\/([^"?]+)"/) || [])[1];
      const a = fig.match(/<a\b[^>]*class="shot capture-shot"[\s\S]*?<\/a>/);
      if (!a) {
        offenders.push(`${name}: capture sin <a class="shot capture-shot"> (${imgFile})`);
        continue;
      }
      const openTag = a[0].match(/<a\b[^>]*>/)[0];
      const href = (openTag.match(/href="([^"]+)"/) || [])[1];
      if (!href || !href.endsWith(imgFile)) {
        offenders.push(`${name}: ${imgFile} no está en el href del enlace (${href})`);
      }
      if (!/aria-label="Ampliar captura/.test(openTag)) {
        offenders.push(`${name}: el enlace de ${imgFile} no anuncia que amplía`);
      }
      if (!/data-shot="/.test(openTag)) {
        offenders.push(`${name}: el enlace de ${imgFile} no nombra la captura para el lightbox`);
      }
      const cta = a[0].match(/<span class="shot-cta">([\s\S]*?)<\/span>/);
      const ctaText = cta ? stripTags(cta[1]).replace(/\s+/g, " ").trim() : "";
      if (!ctaText.startsWith("Ampliar captura") || ctaText.length <= "Ampliar captura".length) {
        offenders.push(`${name}: la etiqueta visible de ${imgFile} no nombra qué abre ("${ctaText}")`);
      }
    }
  }
  assert.deepEqual(offenders, [], "una captura que no se puede abrir no prueba nada");
});

test("regla 3: la vía sin JavaScript es un <a href> contra el archivo, sin manejadores inline", () => {
  for (const name of CAPTURE_PAGES) {
    const src = pageSrc(name);
    assert.equal(/onclick=|onmouseover=|onfocus=/.test(src), false, `${name}: manejador inline`);
    for (const fig of captureFigures(name)) {
      const imgFile = (fig.match(/<img\b[^>]*src="(?:\/)?media\/([^"?]+)"/) || [])[1];
      const a = fig.match(/<a\b[^>]*class="shot capture-shot"[^>]*>/);
      assert.ok(a, `${name}: ${imgFile} perdió su enlace`);
      const href = (a[0].match(/href="(\/?media\/[^"]+)"/) || [])[1];
      assert.ok(href, `${name}: el enlace de ${imgFile} no apunta a un archivo media/`);
    }
  }
  // El camino de siempre en el home también se vigila: los .shot del hilo y del panel.
  const home = pageSrc("05-home-geo.html");
  const shots = [...home.matchAll(/<a\b[^>]*class="shot"[\s\S]*?data-shot="([^"]+)"[\s\S]*?<img\b[^>]*src="media\/([^"?]+)"/g)];
  assert.equal(shots.length, 6, "el home pierde sus 6 capturas ampliables sin JavaScript");
});

test("regla 2: la etiqueta de demostración sobrevive en cada figura de captura", () => {
  const offenders = [];
  for (const name of CAPTURE_PAGES) {
    for (const fig of captureFigures(name)) {
      if (!/datos de demostración/.test(fig)) offenders.push(name);
    }
  }
  assert.deepEqual(offenders, [], "la honestidad de la captura (datos de demostración) no es negociable");
});

test("móvil: el teléfono vertical se acota a su ancho de lectura y no estira la tarjeta", () => {
  const css = pageCss(pageSrc("06-software-pos.html"));
  const rule = css.match(/\.capture-frame--phone\s*\{[^}]*\}/);
  assert.ok(rule, "06-software-pos: falta la clase que acota el teléfono");
  const max = (rule[0].match(/max-width:\s*([0-9]+)px/) || [])[1];
  assert.ok(max && Number(max) <= 320, `el teléfono debe quedar acotado a un ancho legible, no ${max}px`);
});
