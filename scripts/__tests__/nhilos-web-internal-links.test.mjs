// Class guard for internal linking across the nine published NHILOS artboards.
// Run: node --test scripts/__tests__/nhilos-web-internal-links.test.mjs
// Source of truth: odd/tasks/nhilos-web-enlazado-interno.md (S1-S9).
// S7-S9: el menú superior único, con la arquitectura del footer, en las nueve páginas.
// The route registry is parsed from the PAGES array of scripts/build-nhilos-web.mjs:
// the guard never invents a route, so a page added there is guarded and a route
// removed there stops being demanded.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DESIGN = path.join(ROOT, "design/nhilos-web-foundation");
const BUILD = path.join(ROOT, "scripts/build-nhilos-web.mjs");

// Route registry: the PAGES array of the build script, parsed, never duplicated.
const buildSrc = fs.readFileSync(BUILD, "utf8");
const entryConst = buildSrc.match(/^const ENTRY = "([^"]+)";/m)?.[1] ?? "";
const PAGES = [...buildSrc.matchAll(/source:\s*(?:"([^"]+)"|\bENTRY\b)[\s\S]*?url:\s*"([^"]+)"/g)].map(
  (m) => ({ source: m[1] ?? entryConst, url: m[2] }),
);
// The build script owns the list of published pages; the guard reads it, it does not restate it.
assert.equal(PAGES.length, 9, "the build script must still declare nine published pages");

const pages = PAGES.map((p) => ({ ...p, html: fs.readFileSync(path.join(DESIGN, p.source), "utf8") }));
const byUrl = new Map(pages.map((p) => [p.url, p]));

function internalHrefs(html) {
  // Only hrefs a visitor can navigate: skip page anchors, external URLs and the
  // asset namespaces (media/, fonts/, assets/ — absolute or relative, the build
  // rewrites those separately).
  return [...html.matchAll(/href="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((href) => !/^(#|https?:\/\/|mailto:|tel:)/.test(href))
    .filter((href) => !/^\/?(media|fonts|assets)\//.test(href))
    .map((href) => (href.startsWith("/") ? href : null))
    .filter((href) => href !== null);
}

const HOME = "/";
const HUB = "/software-pos/";

// S5(a): every published artboard only carries internal hrefs that resolve to a published route.
test("S5a: every internal href in a published artboard resolves to a published route", () => {
  for (const p of pages) {
    for (const href of internalHrefs(p.html)) {
      assert.ok(
        byUrl.has(href),
        `${p.source}: internal href "${href}" does not resolve to a published route`,
      );
    }
  }
});

// S5(b): the footer of each page contains every published route.
test("S5b: every footer links all published routes", () => {
  for (const p of pages) {
    const footer = p.html.match(/<footer[\s\S]*?<\/footer>/);
    assert.ok(footer, `${p.source}: no footer found`);
    const hrefs = new Set([...footer[0].matchAll(/href="([^"]*)"/g)].map((m) => m[1]));
    for (const route of byUrl.keys()) {
      assert.ok(
        hrefs.has(route),
        `${p.source}: footer is missing published route ${route}`,
      );
    }
  }
});

// S5(c): no route is an orphan — at least one inbound link from the home and one
// from the hub (the home and the hub are the two doors of the site).
test("S5c: every route except / has an inbound link from the home and from the hub", () => {
  const home = byUrl.get(HOME);
  const hub = byUrl.get(HUB);
  for (const [route, p] of byUrl) {
    if (route === HOME) continue;
    const needle = `href="${route}"`;
    assert.ok(
      home.html.includes(needle),
      `${p.source}: published route ${route} has no inbound link from the home (${HOME})`,
    );
    assert.ok(
      hub.html.includes(needle),
      `${p.source}: published route ${route} has no inbound link from the hub (${HUB})`,
    );
  }
});

// ---------------------------------------------------------------------------
// S9: el menú superior único en las nueve páginas (segunda ronda).
// ---------------------------------------------------------------------------

function siteNavBlock(html) {
  return html.match(/<nav class="site-nav" id="siteNav"[\s\S]*?<\/nav>/)?.[0] ?? null;
}

// Normalizado: sin comentarios, sin atributos por página (data-event) y con el
// espacio colapsado. Lo que queda debe ser byte a byte igual en las nueve páginas.
function normalisedNav(html) {
  const block = siteNavBlock(html);
  if (block === null) return null;
  return block
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\sdata-event="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headerBlock(html) {
  return html.match(/<header class="site-header"[^>]*>[\s\S]*?<\/header>/)?.[0] ?? null;
}

// S9(a): las nueve páginas comparten el mismo menú, comparado normalizado.
test("S9a: the top menu is identical on all nine published pages", () => {
  const navs = pages.map((p) => ({ source: p.source, nav: normalisedNav(p.html) }));
  for (const { source, nav } of navs) {
    assert.ok(nav !== null, `${source}: no site-nav block found`);
  }
  const reference = navs[0].nav;
  for (const { source, nav } of navs.slice(1)) {
    assert.equal(
      nav,
      reference,
      `${source}: top menu differs from ${navs[0].source} (normalised comparison)`,
    );
  }
});

// S9(b): el menú contiene las nueve rutas publicadas. El logo aporta "/" y el
// CTA "/demo/"; los dos grupos aportan las otras siete.
test("S9b: the top menu carries all nine published routes", () => {
  for (const p of pages) {
    const header = headerBlock(p.html);
    assert.ok(header, `${p.source}: no site-header found`);
    const hrefs = new Set([...header.matchAll(/href="([^"]*)"/g)].map((m) => m[1]));
    for (const route of byUrl.keys()) {
      assert.ok(
        hrefs.has(route),
        `${p.source}: top menu is missing published route ${route}`,
      );
    }
  }
});

// S9(c): ninguna página usa anclas locales en el menú superior. La home y el
// hub eran las dos que las tenían; el CTA del hub de precios también.
test("S9c: no page uses local anchors in the top menu", () => {
  for (const p of pages) {
    const nav = siteNavBlock(p.html);
    assert.ok(nav, `${p.source}: no site-nav block found`);
    const anchors = [...nav.matchAll(/href="#([^"]*)"/g)].map((m) => `#${m[1]}`);
    assert.deepEqual(
      anchors,
      [],
      `${p.source}: top menu still uses local anchors: ${anchors.join(", ")}`,
    );
  }
});

// S9(d): el botón móvil y el panel #siteNav siguen presentes en todas las páginas.
test("S9d: mobile menu button and siteNav panel still exist on every page", () => {
  for (const p of pages) {
    assert.ok(
      p.html.includes('class="mobile-menu-btn"'),
      `${p.source}: .mobile-menu-btn is missing`,
    );
    assert.ok(
      p.html.includes('id="siteNav"'),
      `${p.source}: #siteNav is missing`,
    );
  }
});

// S2: the home segment cards link the two published daughters with the brief anchors.
test("S2: home segment cards carry the brief anchors to the published daughters", () => {
  const home = byUrl.get(HOME).html;
  assert.ok(
    home.includes('href="/software-pos/food-parks/">software para food park<'),
    'home: missing anchor "software para food park" to /software-pos/food-parks/',
  );
  assert.ok(
    home.includes('href="/software-pos/restaurantes/">sistema POS para restaurante<'),
    'home: missing anchor "sistema POS para restaurante" to /software-pos/restaurantes/',
  );
});

// S3: the hub block of segments links both published daughters with the anchors of
// its brief (§3.6); unpublished segments never become links.
test("S3: hub segments block carries the brief anchors to the published daughters", () => {
  const hub = byUrl.get(HUB).html;
  assert.ok(
    hub.includes('href="/software-pos/restaurantes/">sistema POS para restaurante<'),
    'hub: missing anchor "sistema POS para restaurante" to /software-pos/restaurantes/',
  );
  assert.ok(
    hub.includes('href="/software-pos/food-parks/">software para food park y food court<'),
    'hub: missing anchor "software para food park y food court" to /software-pos/food-parks/',
  );
});
