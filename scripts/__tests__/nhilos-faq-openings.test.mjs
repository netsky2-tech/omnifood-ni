// Guard: FAQ openings must not repeat a formula.
// Site rule (founder): the FAQ answers must not all open with the same clause.
// 1) Within one page, no two answers may open with the same first two words.
// 2) Within one page, at most one answer may open with the country name
//    ("En Nicaragua," directly, or right after a "Sí:"/"No:"/"Sí,"/"No," lead).
// The guard reads both the JSON-LD FAQPage answers and the visible faq-cell
// paragraphs of the nine published artboards.
// Run: node --test scripts/__tests__/nhilos-faq-openings.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const PAGES = [
  "05-home-geo",
  "06-software-pos",
  "07-precios",
  "08-facturacion-dgi",
  "09-inventario",
  "10-demo",
  "11-sin-internet",
  "12-restaurantes",
  "13-food-parks",
];

const stripTags = (s) => s.replace(/<[^>]+>/g, "");
const normalize = (s) => stripTags(s).replace(/\s+/g, " ").trim();

// First two words of an answer, lowercased, punctuation kept attached so
// "Sí: NHILOS" and "Sí: en" are distinct openings.
function openingWords(answer) {
  const t = normalize(answer);
  const w = t.split(" ");
  return [w[0]?.toLowerCase() ?? "", w[1]?.toLowerCase() ?? ""].join(" ");
}

// True when the answer opens with "En Nicaragua" (case-insensitive), either
// directly or after a Sí/No affirmation prefix.
function opensWithCountry(answer) {
  const t = normalize(answer).replace(/^(sí|no)\s*[:.,]\s*/i, "");
  return /^en\s+nicaragua\b/i.test(t);
}

function loadFaq(file) {
  const src = fs.readFileSync(path.join(ROOT, "design/nhilos-web-foundation", `${file}.html`), "utf8");
  const ld = JSON.parse(src.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = ld["@graph"].find((n) => n["@type"] === "FAQPage").mainEntity;
  const body = src.split("<body>")[1];
  const vis = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const cells = [...vis.matchAll(/<div class="faq-cell"[^>]*>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((m) => ({
    q: normalize(m[1]),
    a: normalize(m[2]),
  }));
  return {
    jsonldQuestions: faq.map((q) => normalize(q.name)),
    visibleQuestions: cells.map((c) => c.q),
    jsonld: faq.map((q) => q.acceptedAnswer.text),
    visible: cells.map((c) => c.a),
  };
}

function checkOpenings(source, answers) {
  const seen = new Map();
  const dups = [];
  let countryCount = 0;
  answers.forEach((a, i) => {
    const key = openingWords(a);
    if (seen.has(key)) dups.push(`answer ${seen.get(key) + 1} and answer ${i + 1} open "${key}"`);
    else seen.set(key, i);
    if (opensWithCountry(a)) countryCount++;
  });
  return { dups, countryCount };
}

for (const page of PAGES) {
  test(`FAQ openings on /${page.replace(/^\d+-/, "")}/: no repeated two-word opening, at most one country opening`, () => {
    const { jsonld, visible } = loadFaq(page);
    assert.ok(jsonld.length > 0, "page must declare a FAQPage");
    assert.equal(visible.length, jsonld.length, "visible FAQ cells and JSON-LD answers must match in count");
    for (const [source, answers] of [["JSON-LD", jsonld], ["visible", visible]]) {
      const { dups, countryCount } = checkOpenings(source, answers);
      assert.deepEqual(dups, [], `${source}: repeated two-word openings on ${page}`);
      assert.ok(countryCount <= 1, `${source}: ${countryCount} answers on ${page} open with the country name (max 1)`);
    }
  });
}

// Site-wide SEO anti-cannibalization: no two pages may declare the same
// FAQPage Question.name (normalized), and no FAQ question may be a bare
// context-free pricing prompt ("¿Cuánto cuesta?" / "¿Cuánto cuesta al mes?").
test("FAQ cross-page uniqueness: zero duplicate Question.name across all 9 pages", () => {
  const seen = new Map();
  const dups = [];
  for (const page of PAGES) {
    const { jsonldQuestions, visibleQuestions } = loadFaq(page);
    assert.deepEqual(visibleQuestions, jsonldQuestions, `visible vs JSON-LD questions mismatch on ${page}`);
    for (const q of jsonldQuestions) {
      const key = q.toLowerCase().replace(/[¿?¡!.,:;]/g, "").replace(/\s+/g, " ").trim();
      if (seen.has(key)) dups.push(`"${q}" duplicated on ${seen.get(key)} and ${page}`);
      else seen.set(key, page);
    }
  }
  assert.deepEqual(dups, [], `Duplicate FAQ questions across pages:\n${dups.join("\n")}`);
});

test("FAQ question specificity: no bare context-free pricing question", () => {
  const bare = [];
  const bareRe = /^¿?\s*cu[aá]nto\s+cuesta(\s+al\s+mes)?\s*\??$/i;
  for (const page of PAGES) {
    const { jsonldQuestions } = loadFaq(page);
    for (const q of jsonldQuestions) {
      if (bareRe.test(q)) bare.push(`${page}: "${q}"`);
    }
  }
  assert.deepEqual(bare, [], `Bare context-free pricing FAQ questions:\n${bare.join("\n")}`);
});
