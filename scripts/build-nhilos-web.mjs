#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "design/nhilos-web-foundation");
const ENTRY = "05-home-geo.html";
const ASSETS_DIR = "assets";
// Una página por artboard público. `out` es la ruta del archivo; `url` es la
// canónica, que además alimenta el sitemap.
const PAGES = [
  { source: ENTRY, out: "index.html", url: "/" },
  { source: "06-software-pos.html", out: "software-pos/index.html", url: "/software-pos/" },
];
const NOT_FOUND = "404.html";
const OUTPUT = path.join(ROOT, "dist/nhilos-web");
const PUBLIC_DIRS = ["media", "fonts"];
const INTERNAL_ENTRIES = [
  "01-claridad-comercial.html",
  "02-precision-ejecutiva.html",
  "03-narrativa-operativa.html",
  "comments.json",
  "design.json",
  ".screenshots",
];

function fail(message) {
  console.error(`[nhilos-web] ${message}`);
  process.exit(1);
}

function bytes(size) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "unit",
    unit: "megabyte",
  }).format(size / 1024 / 1024);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

if (!existsSync(path.join(SOURCE, ENTRY))) {
  fail(`missing source artboard: ${path.join(SOURCE, ENTRY)}`);
}
for (const page of PAGES) {
  if (!existsSync(path.join(SOURCE, page.source))) {
    fail(`missing source artboard: ${path.join(SOURCE, page.source)}`);
  }
}
if (!existsSync(path.join(SOURCE, ASSETS_DIR))) {
  fail(`missing shared asset directory: ${path.join(SOURCE, ASSETS_DIR)}`);
}
if (!existsSync(path.join(SOURCE, NOT_FOUND))) {
  fail(`missing 404 page: ${path.join(SOURCE, NOT_FOUND)}`);
}
for (const dir of PUBLIC_DIRS) {
  if (!existsSync(path.join(SOURCE, dir))) {
    fail(`missing public asset directory: ${path.join(SOURCE, dir)}`);
  }
}

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(OUTPUT, { recursive: true });

// Assets compartidos con nombre hasheado: si el CSS cambia, cambia la URL. Así la
// caché inmutable de _headers nunca puede servir una hoja vieja, y todas las
// páginas consumen la misma fuente de tokens.
const hashedAssets = new Map();
mkdirSync(path.join(OUTPUT, ASSETS_DIR), { recursive: true });
for (const file of walk(path.join(SOURCE, ASSETS_DIR))) {
  const rel = path.relative(path.join(SOURCE, ASSETS_DIR), file).split(path.sep).join("/");
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let content = readFileSync(file);
  // El CSS vive en /assets/, así que un url('fonts/...') relativo apunta a
  // /assets/fonts/ y da 404. Se reescribe a raíz absoluta. El artboard conserva
  // la ruta relativa para seguir abriéndose desde design/.
  if (ext === ".css") {
    content = Buffer.from(
      content
        .toString("utf8")
        .replaceAll("url('fonts/", "url('/fonts/")
        .replaceAll('url("fonts/', 'url("/fonts/'),
    );
  }
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 10);
  const hashed = `${base}.${hash}${ext}`;
  hashedAssets.set(`${ASSETS_DIR}/${rel}`, `${ASSETS_DIR}/${hashed}`);
  writeFileSync(path.join(OUTPUT, ASSETS_DIR, hashed), content);
}

for (const page of PAGES) {
  let html = readFileSync(path.join(SOURCE, page.source), "utf8");
  for (const [from, to] of hashedAssets) {
    html = html.replaceAll(`"${from}"`, `"${to}"`);
    // Las páginas que no viven en la raíz (p. ej. /software-pos/) referencian
    // assets con ruta absoluta; reescribir también esa forma con el nombre hasheado.
    html = html.replaceAll(`"/${from}"`, `"/${to}"`);
  }
  const target = path.join(OUTPUT, page.out);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html);
}
copyFileSync(path.join(SOURCE, NOT_FOUND), path.join(OUTPUT, NOT_FOUND));
// Solo se publica el media que alguna página referencia.
//
// El banco de capturas de `design/` es material de trabajo: versiones descartadas,
// loops de capacidades que todavía no vendemos y pruebas de cámara. Copiarlo
// entero al dominio público no cuesta ancho de banda por página, pero publica
// cosas que nadie decidió publicar — incluido un clip de KDS mientras el sitio
// afirma que el KDS no se vende.
const referenced = new Set();
const scan = (text) => {
  for (const match of text.matchAll(/(?:^|["'(/])((?:media|fonts)\/[^"')\s,]+)/g)) {
    referenced.add(match[1]);
  }
};
for (const page of PAGES) {
  scan(readFileSync(path.join(OUTPUT, page.out), "utf8"));
}
scan(readFileSync(path.join(OUTPUT, NOT_FOUND), "utf8"));
for (const hashed of hashedAssets.values()) {
  if (/\.(css|js)$/.test(hashed)) {
    scan(readFileSync(path.join(OUTPUT, hashed), "utf8"));
  }
}

let publishedAssets = 0;
for (const rel of [...referenced].sort()) {
  const from = path.join(SOURCE, rel);
  if (!existsSync(from)) {
    fail(`a page references an asset that does not exist: ${rel}`);
  }
  const to = path.join(OUTPUT, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  copyFileSync(from, to);
  publishedAssets += statSync(to).size;
}

const withheld = PUBLIC_DIRS.flatMap((dir) => walk(path.join(SOURCE, dir))).filter(
  (file) => !referenced.has(path.relative(SOURCE, file).split(path.sep).join("/")),
);

writeFileSync(
  path.join(OUTPUT, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=0, must-revalidate

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/media/*
  Cache-Control: public, max-age=604800
`,
);

writeFileSync(
  path.join(OUTPUT, "_redirects"),
  "/04-sintesis-hibrida.html / 301\n",
);
writeFileSync(
  path.join(OUTPUT, "robots.txt"),
  "User-agent: *\nAllow: /\n\nSitemap: https://nhilospos.com/sitemap.xml\n",
);

// El sitemap se genera en cada build para que `lastmod` no quede mintiendo:
// refleja cuándo se publicó el contenido, no cuándo alguien recordó actualizarlo.
// Las rutas internas del home viven en anclas; las páginas P0 se suman a PAGES
// cuando se publican, y cada una entra al sitemap con su URL canónica.
writeFileSync(
  path.join(OUTPUT, "sitemap.xml"),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...PAGES.flatMap((page) => [
      "  <url>",
      `    <loc>https://nhilospos.com${page.url}</loc>`,
      `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`,
      "  </url>",
    ]),
    "</urlset>",
    "",
  ].join("\n"),
);

for (const entry of INTERNAL_ENTRIES) {
  if (existsSync(path.join(OUTPUT, entry))) {
    fail(`internal entry leaked into public build: ${entry}`);
  }
}

const files = walk(OUTPUT);
const total = files.reduce((sum, file) => sum + statSync(file).size, 0);
const largest = files
  .map((file) => ({ file, size: statSync(file).size }))
  .sort((a, b) => b.size - a.size)[0];

for (const page of PAGES) {
  const built = readFileSync(path.join(OUTPUT, page.out), "utf8");
  if (!built.includes("NHILOS POS")) {
    fail(`${page.out} does not look like a NHILOS page`);
  }
  if (built.includes(`"${ASSETS_DIR}/site.css"`)) {
    fail(`${page.out} still links the unhashed stylesheet`);
  }
  for (const match of built.matchAll(/href="\/?(assets\/[^"?]+)[^"]*"/g)) {
    if (!existsSync(path.join(OUTPUT, match[1]))) {
      fail(`${page.out} references a missing asset: ${match[1]}`);
    }
  }
}

// Una hoja publicada bajo /assets/ no puede referenciar fuentes con ruta relativa:
// apuntarían a /assets/fonts/ y el sitio entero caería a fuentes del sistema sin
// decir una palabra. Ya pasó una vez; esto lo vuelve ruidoso.
for (const hashed of hashedAssets.values()) {
  if (!hashed.endsWith(".css")) continue;
  const css = readFileSync(path.join(OUTPUT, hashed), "utf8");
  if (/url\(['"]?fonts\//.test(css)) {
    fail(`${hashed} references fonts with a relative path and would 404 under /assets/`);
  }
}

console.log(`[nhilos-web] Source: ${path.relative(ROOT, SOURCE)} (${PAGES.length} page(s))`);
console.log(`[nhilos-web] Output: ${path.relative(ROOT, OUTPUT)} (${files.length} files, ${bytes(total)})`);
console.log(`[nhilos-web] Largest asset: ${path.relative(OUTPUT, largest.file)} (${bytes(largest.size)})`);
console.log(`[nhilos-web] Shared stylesheet: ${[...hashedAssets.values()].join(", ")}`);
console.log(
  `[nhilos-web] Media: ${referenced.size} referenced (${bytes(publishedAssets)}) published, ${withheld.length} unreferenced left in design/`,
);
console.log(`[nhilos-web] Pages: ${PAGES.map((page) => `${page.out} -> ${page.url}`).join(", ")}`);
