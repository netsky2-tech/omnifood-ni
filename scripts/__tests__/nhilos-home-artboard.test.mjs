// Regression guards for the NHILOS home artboard (05-home-geo.html).
// Run: node --test scripts/__tests__/nhilos-home-artboard.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_home_copy_v1.0.md (v1.5) +
// docs/nhilos/web/nhilos_web_seo_architecture_v1.0.md (v1.6) + odd/tasks/nhilos-home-redesign.md (S1-S8).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const ART = path.join(ROOT, "design/nhilos-web-foundation/05-home-geo.html");
const COPY = path.join(ROOT, "docs/nhilos/web/nhilos_web_home_copy_v1.0.md");

const src = fs.readFileSync(ART, "utf8");
const body = src.split("<body>")[1];
const vis = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const txt = (s) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const ld = JSON.parse(src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity;
const cells = [...vis.matchAll(/<div class="faq-cell">\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => [txt(m[1]), txt(m[2])]);

// S3 / v1.4 H1 decision
test("S3: single h1 with v1.4 text", () => {
  const h1 = [...src.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  assert.equal(h1.length, 1);
  assert.equal(txt(h1[0][1]), "Sistema POS en Nicaragua que sigue vendiendo sin internet");
});

// S6 banned claims
test("S6: no banned claims (factura electrónica only as documented denial)", () => {
  for (const b of ["cero multas", "sistema autorizado por la DGI", "nunca pierdes", "100% sincronizado", "solución integral", "transformación digital", "ecosistema"])
    assert.equal((src.match(new RegExp(b, "gi")) || []).length, 0, b);
  for (const m of src.matchAll(/factura electrónica/gi))
    assert.match(src.slice(Math.max(0, m.index - 60), m.index + 80), /sin llamar factura electrónica a una facturación computarizada/);
});

// v1.5 unified FAQ: one block, both anchors, 10 questions
test("v1.5: unified FAQ — one section with #faq and #faq-geo anchors, 10 cells", () => {
  assert.ok(src.includes('id="faq"'));
  assert.ok(src.includes('id="faq-geo"'));
  assert.equal(cells.length, 10);
  assert.equal(faq.length, 10);
  // the 6 former human questions are covered by the GEO superset
  for (const covered of ["sin internet", "cuánto cuesta", "DGI", "equipo especial", "tienda o miscelánea", "mis datos"])
    assert.ok(cells.some(([q]) => q.toLowerCase().includes(covered.toLowerCase())), covered);
});

// GEO parity: visible answers == schema text (rule h, v1.5)
test("GEO: FAQPage names and texts match visible cells exactly", () => {
  assert.deepEqual(new Set(faq.map((q) => q.name)), new Set(cells.map((c) => c[0])));
  for (const c of cells) {
    const q = faq.find((x) => x.name === c[0]);
    assert.ok(q, q?.name ?? c[0]);
    assert.equal(c[1], q.acceptedAnswer.text.replace(/\s+/g, " ").trim(), q.name);
  }
});

// GEO rule 1: entity + market in the first sentence of every visible answer
test("GEO rule 1: first sentence names NHILOS POS + Nicaragua", () => {
  for (const [q, a] of cells) {
    const first = a.split(/(?<=[.!?])\s/)[0];
    assert.match(first, /NHILOS POS/, q);
    assert.match(first, /Nicaragua/, q);
  }
});

// B2 meta limits
test("B2: title <=60 chars, description <=155 chars", () => {
  assert.ok(src.match(/<title>([^<]+)<\/title>/)[1].length <= 60);
  assert.ok(src.match(/<meta name="description" content="([^"]+)">/)[1].length <= 155);
});

// B3 schema integrity
test("B3: org has no postal address, no offers/ratings, phone and sameAs exact", () => {
  const org = ld["@graph"].find((n) => n["@type"] === "Organization");
  assert.equal(org.address, undefined);
  assert.equal(org.contactPoint.telephone, "+505 8194 8526");
  assert.deepEqual(org.sameAs, [
    "https://www.instagram.com/nhilosapp/",
    "https://www.facebook.com/nhilosapp",
    "https://www.tiktok.com/@nhilosapp",
  ]);
  assert.equal(/aggregateRating|"review"|"offers"|"price"/.test(JSON.stringify(ld)), false);
});

// B5 anchors + B7 em-dash sweep
test("B5: all in-page anchors resolve", () => {
  const ids = new Set([...vis.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of vis.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(m[1]), m[1]);
});
test("B7: zero em-dashes in visible copy and JSON-LD", () => {
  assert.equal(vis.includes("—"), false);
  assert.equal(JSON.stringify(ld).includes("—"), false);
});

// C1/C2/C3 media + contact
test("C1/C2: media exist, videos muted+playsinline, every video section carries demo label", () => {
  for (const m of vis.matchAll(/<(video|img)\b[^>]*src="([^"]+)"[^>]*>/g)) {
    assert.ok(fs.existsSync(path.join(ROOT, "design/nhilos-web-foundation", m[2])), m[2]);
    if (m[1] === "video") {
      assert.match(m[0], /muted/);
      assert.match(m[0], /playsinline/);
    }
  }
  for (const s of vis.split(/<section\b/).slice(1))
    if (/<video\b/.test(s)) assert.match(s, /datos de demostración/i);
});
test("C3: every WhatsApp link targets the official number", () => {
  for (const m of vis.matchAll(/wa\.me\/(\d+)/g)) assert.equal(m[1], "50581948526");
});

// C6 no debris
test("C6: no duplicated/stray script close tag", () => {
  assert.equal(/<\/script>\s*<\/script>/.test(src), false);
});

// Depth rule: body H2 sections <=120 words (FAQ exempt per v1.5; demo measured on copy column only)
test("copy depth rule: body sections <=120 words", () => {
  for (const s of vis.split(/<section\b/).slice(1)) {
    const id = (s.match(/id="([^"]+)"/) || [])[1];
    if (!id || id === "faq") continue;
    let measured = s;
    if (id === "demo") {
      const copy = s.match(/<div class="demo-copy[\s\S]*?<\/div>/);
      measured = copy ? copy[0] : s;
    }
    const w = txt(measured).split(" ").filter(Boolean).length;
    assert.ok(w <= 120, `${id} has ${w} words`);
  }
});

// Form: no default-selected segment (anti-encasillamiento), required groups validated
test("form: no pre-checked segment; group error slots exist", () => {
  assert.equal(/name="businessType"[^>]*checked/.test(src), false);
  assert.equal(/name="demoPriority"[^>]*checked/.test(src), false);
  assert.ok(src.includes('data-error-for="businessType"'));
  assert.ok(src.includes('data-error-for="demoPriority"'));
});

// Personal data rule
test("no personal names in public placeholders", () => {
  assert.equal(src.includes("Octavio"), false);
  assert.match(src, /Ej\. John Doe/);
});
