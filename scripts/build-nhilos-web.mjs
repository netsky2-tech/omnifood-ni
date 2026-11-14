#!/usr/bin/env node
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "design/nhilos-web-foundation");
const ENTRY = "04-sintesis-hibrida.html";
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

copyFileSync(path.join(SOURCE, ENTRY), path.join(OUTPUT, "index.html"));
copyFileSync(path.join(SOURCE, NOT_FOUND), path.join(OUTPUT, NOT_FOUND));
for (const dir of PUBLIC_DIRS) {
  cpSync(path.join(SOURCE, dir), path.join(OUTPUT, dir), { recursive: true });
}

writeFileSync(
  path.join(OUTPUT, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: public, max-age=0, must-revalidate

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/media/*
  Cache-Control: public, max-age=604800
`,
);

writeFileSync(
  path.join(OUTPUT, "_redirects"),
  "/04-sintesis-hibrida.html / 301\n",
);
writeFileSync(path.join(OUTPUT, "robots.txt"), "User-agent: *\nAllow: /\n");

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
const html = readFileSync(path.join(OUTPUT, "index.html"), "utf8");

if (!html.includes("NHILOS POS")) {
  fail("index.html does not look like the NHILOS landing");
}

console.log(`[nhilos-web] Source: ${path.relative(ROOT, SOURCE)}/${ENTRY}`);
console.log(`[nhilos-web] Output: ${path.relative(ROOT, OUTPUT)} (${files.length} files, ${bytes(total)})`);
console.log(`[nhilos-web] Largest asset: ${path.relative(OUTPUT, largest.file)} (${bytes(largest.size)})`);
console.log("[nhilos-web] Public build contains index.html, 404.html, media/, fonts/, _headers, _redirects and robots.txt only.");
