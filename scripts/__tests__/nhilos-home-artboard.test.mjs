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

// Internal vocabulary must never reach a customer.
// Two leaks shipped on 2026-11-18: "entitlements (issue #984)" in the service
// conditions and "(según go-live)" in the plan list. Both were caught by the
// founder, not by a test, so this guards the class instead of the instance.
// Case-insensitive terms cannot collide with Spanish words; TODO and QA are
// matched as uppercase words because "todo" is ordinary Spanish.
test("public copy carries no internal vocabulary (visible text and JSON-LD)", () => {
  const visible = txt(vis);
  const schema = JSON.stringify(ld);
  const insensitive = ["issue #", "entitlements", "go-live", "golive", "backlog", "sprint", "staging", "hotfix"];
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

// Depth rule: body H2 sections <=120 words (FAQ exempt per v1.5; demo measured on copy column only;
// T10 figcaptions exempt — the capture caption "Captura real de la terminal · datos de demostración"
// is media apparatus mandated verbatim by odd/tasks/nhilos-home-redesign.md T10 S1, not copy)
test("copy depth rule: body sections <=120 words", () => {
  for (const s of vis.split(/<section\b/).slice(1)) {
    const id = (s.match(/id="([^"]+)"/) || [])[1];
    if (!id || id === "faq") continue;
    let measured = s.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/g, "");
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

// T10: the turno, with the real screen of each step (odd/tasks/nhilos-home-redesign.md, S1-S6)
const HILO_CAPTURES = [
  "media/pos_04_carrito_barra.webp",
  "media/pos_10_historial_ventas.webp",
  "media/pos_07_cobro_efectivo_vuelto.webp",
  "media/pos_16_cierre_turno_corte_z.webp",
];
const HILO_LABEL = "Captura real de la terminal · datos de demostración";
const comoSec = vis.split('id="como-funciona"')[1].split("</section>")[0];
const hiloSteps = comoSec.split('<div class="hilo-step">').slice(1);

test("T10 S1/S4: every hilo step carries its capture, in order, still 4 numbered steps", () => {
  assert.equal(hiloSteps.length, 4);
  assert.ok(src.includes("CLAIM GUARD (#993/#983)"), "step 02 claim guard comment");
  for (const [i, cap] of HILO_CAPTURES.entries()) {
    const step = hiloSteps[i];
    const imgs = [...step.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/g)];
    assert.equal(imgs.length, 1, `step ${i + 1} has exactly one capture`);
    assert.equal(imgs[0][1], cap, `step ${i + 1} capture`);
    assert.match(step, /<div class="device" style="width: 100%; aspect-ratio: \d+ \/ \d+;">/, `step ${i + 1} framed`);
  }
});

test("T10 S1: each capture carries the real-terminal demo label", () => {
  for (const [i, step] of hiloSteps.entries()) assert.ok(step.includes(HILO_LABEL), `step ${i + 1} label`);
});

// S2: no cropping. Dimensions are read from the real files (webp header), the
// img attributes must match them exactly, the frame must use the same aspect
// ratio so the capture is shown complete, and .device img must keep
// object-fit: contain in site.css.
function webpSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WEBP");
  const fourcc = buf.toString("ascii", 12, 16);
  if (fourcc === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (fourcc === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1 }; }
  if (fourcc === "VP8X") return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
  throw new Error("unsupported webp chunk: " + fourcc);
}
test("T10 S2: captures shown complete at their real file dimensions", () => {
  const css = fs.readFileSync(path.join(ROOT, "design/nhilos-web-foundation/assets/site.css"), "utf8");
  assert.match(css, /\.device video, \.device img \{[^}]*object-fit: contain/);
  for (const [i, cap] of HILO_CAPTURES.entries()) {
    const { w, h } = webpSize(path.join(ROOT, "design/nhilos-web-foundation", cap));
    const img = hiloSteps[i].match(/<img\b[^>]*>/)[0];
    assert.match(img, new RegExp(`width="${w}" height="${h}"`), cap);
    const ar = hiloSteps[i].match(/aspect-ratio: (\d+) \/ (\d+)/);
    assert.equal(Number(ar[1]), w, cap + " frame aspect");
    assert.equal(Number(ar[2]), h, cap + " frame aspect");
  }
});

// T10b (S7-S11): on mobile the four steps become a CSS-only horizontal snap rail
// (~78vw cards so the next one peeks), while desktop (min-width: 1280px) stays a
// single row of four. The rule is page-local in the artboard (site.css is out of
// scope for this task) and must not depend on site.js. Every var(--*) the rule
// names must exist in assets/site.css: a missing token fails silently.
test("T10b S7-S10: page-local CSS-only snap rail under 768px; desktop stays a row", () => {
  const block = src.match(/\/\* T10b[\s\S]*?<\/style>/);
  assert.ok(block, "T10b page-local style block exists in 05-home-geo.html");
  const rail = block[0];
  // S8/S9/S10: the mobile rail rule — overflow-x + scroll-snap, no JS involved
  assert.match(rail, /@media \(max-width: 767\.98px\)/);
  assert.match(rail, /\.hilo \{[^}]*overflow-x: auto[^}]*scroll-snap-type:/, "rail scrolls itself with snap");
  assert.match(rail, /\.hilo-step \{[^}]*scroll-snap-align:/, "cards snap");
  assert.match(rail, /78vw/, "card width ~78vw so the next capture peeks");
  assert.equal(rail.includes("<script"), false, "rail is pure CSS, works if site.js never loads");
  // S7: desktop pinned as a row of four from 768px up (site.css collapses to
  // 2 columns at <=900px, which contradicts S7's min-width: 1280px contract)
  assert.match(rail, /@media \(min-width: 1280px\) \{[\s\S]*?\.hilo \{[^}]*grid-template-columns: repeat\(4, 1fr\)/);
  // every token the rail rule names must be defined in site.css
  const css = fs.readFileSync(path.join(ROOT, "design/nhilos-web-foundation/assets/site.css"), "utf8");
  for (const m of rail.matchAll(/var\((--[a-z0-9-]+)\)/g))
    assert.ok(css.includes(`${m[1]}:`), `token ${m[1]} must exist in site.css`);
});
