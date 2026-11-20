// Guardias de rendimiento para el sitio publicado NHILOS (T2 video, T3 logo).
// Run: node --test scripts/__tests__/nhilos-web-perf-video-logo.test.mjs
// Fuente: odd/tasks/nhilos-web-rendimiento.md (S2, S3).
//
// T2: ninguna página inicia la descarga de un video que no va a reproducirse.
//     preload="none" en todas las páginas publicadas, sin autoplay, y un gate
//     de conexión en assets/site.js (saveData / effectiveType) que decide el
//     arranque por intersección.
// T3: el isotipo no puede referenciarse con dimensiones muy superiores a su
//     tamaño de render ni pesar más de 4 KB.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SOURCE = path.join(ROOT, "design/nhilos-web-foundation");
const SITE_JS = path.join(SOURCE, "assets", "site.js");

// Las nueve artboards publicadas (PAGES en scripts/build-nhilos-web.mjs).
const PUBLISHED_PAGES = [
  "05-home-geo.html",
  "06-software-pos.html",
  "07-precios.html",
  "08-facturacion-dgi.html",
  "09-inventario.html",
  "10-demo.html",
  "11-sin-internet.html",
  "12-restaurantes.html",
  "13-food-parks.html",
];

function rasterDimensions(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 24 && buf.toString("ascii", 1, 4) === "PNG") {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      // Canvas size: 24 bits little-endian, menos 1.
      return {
        width: buf.readUIntLE(24, 3) + 1,
        height: buf.readUIntLE(27, 3) + 1,
      };
    }
    if (chunk === "VP8 ") {
      // Frame tag de 3 bytes + sync code 0x9d 0x01 0x2a + tamaño 14 bits LE.
      if (buf.toString("hex", 15, 18) !== "9d012a") {
        throw new Error(`webp VP8 inesperado en ${file}: falta el sync code`);
      }
      return { width: buf.readUInt16LE(18) & 0x3fff, height: buf.readUInt16LE(20) & 0x3fff };
    }
    throw new Error(`webp con chunk ${chunk} no soportado en ${file}`);
  }
  throw new Error(`formato de raster no soportado en ${file}`);
}

test("T2/S2: ninguna página publicada tiene un video con autoplay o preload distinto de none", () => {
  for (const page of PUBLISHED_PAGES) {
    const html = fs.readFileSync(path.join(SOURCE, page), "utf8");
    const tags = [...html.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]);
    for (const tag of tags) {
      assert.doesNotMatch(tag, /\bautoplay\b/i, `${page}: ningún video puede llevar autoplay`);
      const preload = tag.match(/\bpreload="([^"]*)"/);
      assert.ok(preload, `${page}: el video debe declarar preload de forma explícita`);
      assert.equal(preload[1], "none", `${page}: el video debe usar preload="none", no "${preload[1]}"`);
      assert.match(tag, /\bposter="/, `${page}: el video conserva su poster para que el marco nunca quede vacío`);
    }
  }
});

test("T2/S2: el gate de conexión en site.js respeta saveData y effectiveType", () => {
  const js = fs.readFileSync(SITE_JS, "utf8");
  const gateSrc = js.match(/\/\* nhilos-video-gate:start \*\/([\s\S]*?)\/\* nhilos-video-gate:end \*\//);
  assert.ok(gateSrc, "site.js debe definir el bloque del gate de conexión entre marcadores");
  const gate = new Function(`${gateSrc[1]}; return nhilosVideoGate;`)();
  // Sin información de conexión no se bloquea nada.
  assert.equal(gate(undefined), true, "sin navigator.connection el gate no bloquea");
  assert.equal(gate({}), true, "connection vacía no bloquea");
  // Redes rápidas o desconocidas pasan.
  assert.equal(gate({ effectiveType: "3g" }), true, "3g no se bloquea");
  assert.equal(gate({ effectiveType: "4g" }), true, "4g no se bloquea");
  // Ahorro de datos y redes lentas se bloquean.
  assert.equal(gate({ saveData: true }), false, "saveData activo debe bloquear el arranque");
  assert.equal(gate({ saveData: true, effectiveType: "4g" }), false, "saveData gana aunque la red sea rápida");
  assert.equal(gate({ effectiveType: "2g" }), false, "2g debe bloquear el arranque");
  assert.equal(gate({ effectiveType: "slow-2g" }), false, "slow-2g debe bloquear el arranque");
});

test("T2/S2: todo arranque de video en site.js pasa por el gate y por un IntersectionObserver", () => {
  const js = fs.readFileSync(SITE_JS, "utf8");
  // tryPlay es el único punto que llama a .play(): así ningún arranque futuro
  // puede colarse fuera del gate.
  const start = js.indexOf("function tryPlay(");
  assert.ok(start !== -1, "site.js debe definir tryPlay como único punto de arranque");
  let depth = 0;
  let end = -1;
  for (let i = js.indexOf("{", start); i < js.length; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end !== -1, "el cuerpo de tryPlay debe cerrar correctamente");
  const tryPlayBody = js.slice(start, end + 1);
  const playCalls = js.match(/\.play\(/g) || [];
  const playCallsInTryPlay = tryPlayBody.match(/\.play\(/g) || [];
  assert.ok(playCalls.length > 0, "site.js debe arrancar videos");
  assert.equal(
    playCalls.length,
    playCallsInTryPlay.length,
    "cada llamada a .play() en site.js debe vivir dentro de tryPlay, que consulta el gate",
  );
  assert.match(tryPlayBody, /videoGateOpen/, "tryPlay debe consultar el gate de conexión antes de arrancar");
  assert.match(tryPlayBody, /reduced/, "tryPlay debe respetar prefers-reduced-motion");
  // El arranque por intersección existe y pasa por tryPlay.
  const ioWindows = [...js.matchAll(/new IntersectionObserver\(/g)].map((m) => js.slice(m.index, m.index + 800));
  const ioVideo = ioWindows.filter((w) => w.includes("video") && w.includes("tryPlay"));
  assert.ok(ioVideo.length > 0, "el arranque de videos debe estar dentro de un IntersectionObserver que use tryPlay");
});

test("T3/S3: el isotipo no se referencia por encima de 256 px ni pesa más de 4 KB", () => {
  for (const page of PUBLISHED_PAGES) {
    const html = fs.readFileSync(path.join(SOURCE, page), "utf8");
    for (const m of html.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      const src = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
      if (!src) continue;
      const base = src.split("/").pop().toLowerCase();
      if (!base.startsWith("logo")) continue;
      const declared = parseInt((tag.match(/\bwidth="(\d+)"/) || [])[1], 10);
      if (!Number.isNaN(declared)) {
        assert.ok(declared <= 256, `${page}: el isotipo declara width=${declared} (> 256)`);
      }
      const file = path.join(SOURCE, src.replace(/^\//, ""));
      if (fs.existsSync(file) && /\.(png|webp|jpe?g)$/i.test(src)) {
        const dim = rasterDimensions(file);
        assert.ok(dim.width <= 256, `${page}: el raster del isotipo ${src} mide ${dim.width}px de ancho (> 256)`);
        const size = fs.statSync(file).size;
        assert.ok(size < 4096, `${page}: el isotipo ${src} pesa ${size} bytes (>= 4 KB)`);
      }
    }
  }
});
