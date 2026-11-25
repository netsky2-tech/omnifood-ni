#!/usr/bin/env node
// Variantes AVIF/WebP de las imágenes que publica el sitio.
//
// El original de cada captura se queda como fallback del <img>; las variantes
// existen para que el navegador descargue lo que de verdad va a pintar. Los
// anchos salen del ancho real de despliegue medido a 390 y 1440 (no del nativo):
// generar 1440 px de una captura que se pinta a 258 es tirar datos de un móvil.
//
// Se ejecuta a mano (`node scripts/web-images.mjs`) y cachea por fecha: si el
// derivado es más nuevo que el original, no se regenera. El build solo copia y
// valida, así que desplegar no depende de que ffmpeg esté instalado.
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = path.join(ROOT, "design/nhilos-web-foundation");
export const DERIVED = "media/derived";
const DERIVED_DIR = path.join(SOURCE, DERIVED);

// widths: lo que se ofrece en el srcset. sizes: el ancho de pintado por tramo,
// para que el navegador no elija la variante grande en un móvil.
export const IMAGE_VARIANTS = {
  // ffmpeg 7 + libaom escriben el AVIF en yuv420p aunque se pida yuva420p: el
  // muxer avif no transporta el canal alfa, y sin él el recorte del dispositivo
  // sale como un rectángulo negro. Esta imagen va solo en WebP, que sí conserva
  // la transparencia.
  "pos_hand_device_transparent.webp": {
    widths: [340, 402],
    sizes: "(max-width: 640px) 312px, 340px",
    alpha: true,
  },
  "pos_comideria_05_mostrador_mano.webp": {
    widths: [380, 760, 896],
    sizes: "(max-width: 640px) 84vw, 380px",
  },
  "pos_04_carrito_barra.webp": { widths: [268, 536], sizes: "(max-width: 900px) 268px, 258px" },
  "pos_10_historial_ventas.webp": { widths: [268, 536], sizes: "(max-width: 900px) 268px, 258px" },
  "pos_07_cobro_efectivo_vuelto.webp": {
    widths: [268, 536],
    sizes: "(max-width: 900px) 268px, 258px",
  },
  "pos_16_cierre_turno_corte_z.webp": {
    widths: [268, 536],
    sizes: "(max-width: 900px) 268px, 258px",
  },
  "dsh_06_fiscal.webp": { widths: [348, 696, 1150], sizes: "(max-width: 640px) 348px, 1150px" },
  "dsh_23_kardex_movimientos.webp": {
    widths: [348, 696, 1150],
    sizes: "(max-width: 640px) 348px, 1150px",
  },
  "pos_06_pantalla_cobro.webp": { widths: [220, 440], sizes: "220px" },
  "pos_03_catalogo_soho.webp": { widths: [282, 564, 974], sizes: "(max-width: 640px) 282px, 487px" },
  "pos_pulperia_01_catalogo.webp": { widths: [282, 564, 974], sizes: "(max-width: 640px) 282px, 487px" },
  "dsh_16_recetas_bom.webp": { widths: [282, 564, 974], sizes: "(max-width: 640px) 282px, 487px" },
  "dsh_02_kpis_ventas.webp": { widths: [348, 696, 1014], sizes: "(max-width: 640px) 348px, 507px" },
  "dsh_15_inventario.webp": { widths: [324, 648, 1158], sizes: "(max-width: 640px) 324px, 1158px" },
};

export function variantName(file, width, ext) {
  return `${file.replace(/\.[^.]+$/, "")}-${width}.${ext}`;
}

// `webp` a secas funciona en Ubuntu y macOS; el binario estático de nhilos-audio
// cubre la máquina de desarrollo cuando no está en PATH.
function ffmpeg() {
  const candidates = [process.env.FFMPEG_BIN, path.join(homedir(), ".local/opt/nhilos-audio/bin/ffmpeg")];
  for (const candidate of candidates.filter(Boolean)) {
    if (candidate !== "ffmpeg" && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-version"], { stdio: "ignore" });
    if (probe.status === 0) return candidate;
  }
  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (probe.status === 0) return "ffmpeg";
  return null;
}

function stale(source, out) {
  return !existsSync(out) || statSync(out).mtimeMs < statSync(source).mtimeMs;
}

function encode(bin, source, width, format, out) {
  const args =
    format === "avif"
      ? ["-y", "-loglevel", "error", "-i", source, "-vf", `scale=${width}:-1`, "-c:v", "libaom-av1", "-crf", "32", "-b:v", "0", "-still-picture", "1", "-frames:v", "1", "-f", "avif", out]
      : ["-y", "-loglevel", "error", "-i", source, "-vf", `scale=${width}:-1`, "-c:v", "libwebp", "-quality", "82", out];
  const run = spawnSync(bin, args, { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(`ffmpeg falló con ${path.basename(out)}: ${run.stderr || run.error}`);
  }
}

function main() {
  const bin = ffmpeg();
  if (!bin) {
    console.error("[web-images] no hay ffmpeg. Instala uno o define FFMPEG_BIN.");
    process.exit(1);
  }
  mkdirSync(DERIVED_DIR, { recursive: true });
  let made = 0;
  let bytes = 0;
  for (const [file, variant] of Object.entries(IMAGE_VARIANTS)) {
    const source = path.join(SOURCE, "media", file);
    if (!existsSync(source)) {
      console.error(`[web-images] falta el original ${file}`);
      process.exit(1);
    }
    for (const width of variant.widths) {
      for (const format of variant.alpha ? ["webp"] : ["avif", "webp"]) {
        const out = path.join(DERIVED_DIR, variantName(file, width, format));
        if (!stale(source, out)) continue;
        encode(bin, source, width, format, out);
        made += 1;
        bytes += statSync(out).size;
      }
    }
  }
  const total = readdirSync(DERIVED_DIR).length;
  console.log(
    `[web-images] ${made} variantes generadas (${(bytes / 1024 / 1024).toFixed(2)} MB), ${total} en ${DERIVED}/`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
