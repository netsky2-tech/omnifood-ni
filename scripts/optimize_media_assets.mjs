#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const IMAGES_DIR = path.resolve(ROOT, "docs/nhilos/manuals/images");

console.log(`[optimize-media] Scanning images in: ${IMAGES_DIR}`);

const files = fs.readdirSync(IMAGES_DIR).filter((f) => f.endsWith(".png"));

console.log(`[optimize-media] Found ${files.length} PNG files to process`);

for (const file of files) {
  const pngPath = path.join(IMAGES_DIR, file);
  const baseName = file.replace(/\.png$/, "");
  const webpPath = path.join(IMAGES_DIR, `${baseName}.webp`);
  const avifPath = path.join(IMAGES_DIR, `${baseName}.avif`);

  // Convert to WebP if missing or older than PNG
  const pngStat = fs.statSync(pngPath);
  const needWebp =
    !fs.existsSync(webpPath) || fs.statSync(webpPath).mtimeMs < pngStat.mtimeMs;
  const needAvif =
    !fs.existsSync(avifPath) || fs.statSync(avifPath).mtimeMs < pngStat.mtimeMs;

  if (needWebp) {
    console.log(`  -> Converting ${file} to WebP...`);
    execSync(
      `pnpm dlx sharp-cli -i "${pngPath}" -o "${IMAGES_DIR}" -f webp -q 85`,
      { stdio: "inherit" },
    );
  }

  if (needAvif) {
    console.log(`  -> Converting ${file} to AVIF...`);
    execSync(
      `pnpm dlx sharp-cli -i "${pngPath}" -o "${IMAGES_DIR}" -f avif -q 80`,
      { stdio: "inherit" },
    );
  }
}

console.log("[optimize-media] Done! All images optimized.");
