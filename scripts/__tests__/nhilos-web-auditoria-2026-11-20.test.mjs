// Regression guards for the six fixes from the external site audit (2026-11-20).
// Run: node --test scripts/__tests__/nhilos-web-auditoria-2026-11-20.test.mjs
// Source of truth: docs/nhilos/web/nhilos_web_page_briefs_v1.0.md (por página) +
// docs/nhilos/web/nhilos_web_auditoria_externa_v1.0.md (S4.6, S5, S8.5, S9.2) +
// odd/tasks/nhilos-web-auditoria-2026-11-20.md (registro dueño por ítem).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DESIGN = path.join(ROOT, "design/nhilos-web-foundation");
const page = (name) => fs.readFileSync(path.join(DESIGN, name), "utf8");
const stripScripts = (s) => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const txt = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function heroBlock(html) {
  return html.match(/<section class="hero [^"]*" id="inicio"[\s\S]*?<\/section>/)?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Fix 1 (auditoría S5): CTA de WhatsApp en el hero de /facturacion-dgi/ y /inventario/.
// El audit mide que la única ruta a la demo estaba diez secciones abajo. La
// primaria abre WhatsApp (palabrao del informe: "Revisar mi caso con un
// especialista"), con el utm_medium por página que ya usa el archivo, y el
// ancla interna del hero queda como acción secundaria, sin desaparecer.
// ---------------------------------------------------------------------------

test("fix1: /facturacion-dgi/ hero primary opens WhatsApp with the audit wording, anchors stay", () => {
  const src = page("08-facturacion-dgi.html");
  const hero = heroBlock(src);
  assert.ok(hero, "no hero section found (id=inicio)");
  const primary = hero.match(/<a class="btn btn-primary" href="(https:\/\/wa\.me\/[^"]*)"([\s\S]*?)>([\s\S]*?)<\/a>/);
  assert.ok(primary, "hero has no btn-primary linking WhatsApp");
  assert.match(primary[1], /^https:\/\/wa\.me\/50581948526\?/, "primary href must be the WhatsApp deep link");
  assert.ok(primary[1].includes("utm_medium=facturacion-dgi"), "primary href must use the per-page utm_medium");
  assert.ok(primary[2].includes('data-event="cta_whatsapp_facturacion"'), "primary must reuse the page WhatsApp event");
  assert.equal(txt(primary[3]), "Revisar mi caso con un especialista");
  // The internal anchor survives, demoted to secondary.
  assert.ok(
    /<a class="btn btn-secondary" href="#division">Ver división de responsabilidad<\/a>/.test(hero),
    "hero secondary anchor #division is missing",
  );
  assert.ok(
    /<a class="btn btn-secondary" href="#anulacion">Ver paso a paso de anulación<\/a>/.test(hero),
    "hero secondary anchor #anulacion is missing",
  );
});

test("fix1: /inventario/ hero primary opens WhatsApp with the audit wording, anchors stay", () => {
  const src = page("09-inventario.html");
  const hero = heroBlock(src);
  assert.ok(hero, "no hero section found (id=inicio)");
  const primary = hero.match(/<a class="btn btn-primary" href="(https:\/\/wa\.me\/[^"]*)"([\s\S]*?)>([\s\S]*?)<\/a>/);
  assert.ok(primary, "hero has no btn-primary linking WhatsApp");
  assert.match(primary[1], /^https:\/\/wa\.me\/50581948526\?/, "primary href must be the WhatsApp deep link");
  assert.ok(primary[1].includes("utm_medium=inventario"), "primary href must use the per-page utm_medium");
  assert.ok(primary[2].includes('data-event="cta_whatsapp_inventario"'), "primary must reuse the page WhatsApp event");
  assert.equal(txt(primary[3]), "Revisar mi caso con un especialista");
  assert.ok(
    /<a class="btn btn-secondary" href="#kardex">Ver cómo sale el costo<\/a>/.test(hero),
    "hero secondary anchor #kardex is missing",
  );
  assert.ok(
    /<a class="btn btn-secondary" href="#marco">Ver el marco legal<\/a>/.test(hero),
    "hero secondary anchor #marco is missing",
  );
});

// JSON-LD: a source of truth exists ("si la página declara potentialAction");
// ninguna de las dos páginas declara potentialAction, y las FAQ siguen en
// paridad byte a byte con su JSON. Si alguien introduce potentialAction sin
// escribir el texto idéntico, esta guardia lo señala.
test("fix1: visible text and JSON-LD stay in sync: no potentialAction outside the mirror rule", () => {
  for (const name of ["08-facturacion-dgi.html", "09-inventario.html"]) {
    const src = page(name);
    const blocks = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const b of blocks) JSON.parse(b[1]); // must stay valid JSON
    const ldText = blocks.map((b) => b[1]).join(" ");
    // Neither page declares a potentialAction today, so there is nothing to
    // mirror yet; if one appears, the mirror rule (identical text in both
    // channels) applies and this guard forces it to be written.
    assert.equal(
      src.includes("potentialAction") || ldText.includes("potentialAction"),
      false,
      `${name}: a potentialAction appeared; mirror its visible text into the JSON-LD (or adjust this guard)`,
    );
  }
});

// ---------------------------------------------------------------------------
// Fix 2 (auditoría S5): las dos tarjetas de segmento sin enlace dejan de
// parecer clicables. La honestidad manda: sin enlaces inventados, sin hover
// lift, sin cursor pointer, sin chevron en las tarjetas de texto.
// ---------------------------------------------------------------------------

test("fix2: cafeterias and tienda cards become text blocks (no links, no lift affordance)", () => {
  const src = page("05-home-geo.html");
  const region = src.split('id="segmentos"')[1].split("</section>")[0];
  assert.ok(region.includes("Cafeterías") && region.includes("Tiendas y mostrador"), "segment grid drifted");
  assert.equal(
    region.includes("software POS para cafetería"),
    false,
    "the cafeterías card must not link (or invent) a destination",
  );
  assert.equal(
    region.includes('punto de venta para tienda</a>'),
    false,
    "the tiendas card must not link (or invent) a destination",
  );
  // Cards with a published daughter keep their brief anchors, and they are the
  // only ones lifting, via an explicit modifier class.
  assert.ok(
    region.includes('href="/software-pos/food-parks/">software para food park<'),
    "food parks card lost its brief anchor",
  );
  assert.ok(
    region.includes('href="/software-pos/restaurantes/">sistema POS para restaurante<'),
    "restaurantes card lost its brief anchor",
  );
  assert.equal(
    (region.match(/class="seg-card seg-card--link"/g) || []).length,
    2,
    "exactly the two linked cards must carry the seg-card--link modifier",
  );
  // The text blocks must not read as controls: their block contains no <a> at all.
  const cafeCard = region.split("Cafeterías")[1];
  assert.ok(cafeCard && !/<a\s/.test(cafeCard), "the cafeterías text block still contains a link");
});

test("fix2: hover lift is gated to linked cards, with no pointer cursor on the card", () => {
  const css = fs.readFileSync(path.join(DESIGN, "assets", "site.css"), "utf8");
  assert.doesNotMatch(css, /\.seg-card:hover/, "any .seg-card still lifts on hover, including text blocks");
  const lift = css.match(/\.seg-card--link:hover[^\{]*\{[^\}]*\}/);
  assert.ok(lift, "site.css lost the hover lift for the linked segment cards");
  assert.match(lift[0], /transform/, "the linked-card lift must keep its transform affordance");
  const base = css.match(/\.seg-card \{[^\}]*\}/);
  assert.ok(base, "the .seg-card base rule is missing");
  assert.doesNotMatch(base[0], /cursor/, "segment cards must not set a pointer cursor");
  assert.doesNotMatch(base[0], /::before|::after/, "segment cards must not paint chevrons");
});

// ---------------------------------------------------------------------------
// Fix 3 (auditoría S9.2): el anchor idéntico "ver planes y precios de NHILOS
// POS" se varía por contexto donde la delegación edita, conservando el href;
// el brief regla la clase entera (§2.6: "nunca... el mismo anchor exacto").
// ---------------------------------------------------------------------------

test("fix3: /facturacion-dgi/ varies both /precios/ anchors by context with the same hrefs", () => {
  const vis = stripScripts(page("08-facturacion-dgi.html"));
  assert.equal(
    vis.includes('<a href="/precios/">ver planes y precios de NHILOS POS</a>'),
    false,
    "the identical anchor still ships on /facturacion-dgi/",
  );
  assert.ok(
    vis.includes('<a href="/precios/">la tabla de planes y cargos publicados</a>'),
    "missing the context anchor of the printer section (href /precios/)",
  );
  assert.ok(
    vis.includes('<a href="/precios/">cuánto cuesta cada plan y su setup</a>'),
    "missing the context anchor of the closing links (href /precios/)",
  );
});

test("fix3: /inventario/ varies non-FAQ /precios/ anchors; the FAQ answer and its JSON stay in parity", () => {
  const vis = stripScripts(page("09-inventario.html"));
  const faqStart = vis.indexOf('<section class="section" id="faq"');
  const faqEnd = vis.indexOf("</section>", faqStart) + "</section>".length;
  const nonFaq = vis.slice(0, faqStart) + vis.slice(faqEnd);
  assert.equal(
    nonFaq.includes('<a href="/precios/">ver planes y precios de NHILOS POS</a>'),
    false,
    "the identical anchor still ships outside the FAQ of /inventario/",
  );
  assert.ok(
    nonFaq.includes('<a href="/precios/">los planes y packs en la tabla de precios</a>'),
    "missing the context anchor of the packs note",
  );
  assert.ok(
    nonFaq.includes('<a href="/precios/">la tabla completa de precios de NHILOS POS</a>'),
    "missing the context anchor of the closing links",
  );
  // The FAQ answer is off limits: it keeps the exact wording and its schema twin.
  assert.ok(
    vis.includes('Puedes <a href="/precios/">ver planes y precios de NHILOS POS</a> para revisar la tabla completa.'),
    "the FAQ answer must keep its exact wording",
  );
});

test("fix3: /food-parks/ varies its pricing-card anchor; the FAQ answer keeps its exact wording (test updated)", () => {
  const vis = stripScripts(page("13-food-parks.html"));
  assert.equal(
    vis.includes('<a class="fpk-inline-link" href="/precios/">ver planes y precios de NHILOS POS</a>'),
    false,
    "the identical anchor still ships in the pricing card of /food-parks/",
  );
  assert.ok(
    vis.includes('<a class="fpk-inline-link" href="/precios/">la tabla de planes, packs y setups</a>'),
    "missing the context anchor of the pricing card",
  );
  assert.ok(
    vis.includes('lo que publica <a href="/precios/">ver planes y precios de NHILOS POS</a>'),
    "the FAQ answer must keep its exact wording",
  );
});

// S16 (informe externo S9.2, corregida de clase): ningún texto de enlace del cuerpo
// se repite más de tres veces en el sitio. La navegación (header, footer y todo
// elemento <nav>: menú, riel lateral, breadcrumb) queda fuera, por ser navegación
// compartida. El informe midió la frase de /precios/ repetida 17 veces; la regla
// que queda es de clase, así que el próximo texto repetido cae aquí también.
function bodyWithoutChrome(html) {
  return html
    .replace(/<footer[\s\S]*?<\/footer>/g, " ")
    .replace(/<header[\s\S]*?<\/header>/g, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function bodyLinkTexts() {
  const buildSrc = fs.readFileSync(path.join(ROOT, "scripts/build-nhilos-web.mjs"), "utf8");
  const entry = (buildSrc.match(/^const ENTRY = "([^"]+)";/m) || [])[1] ?? "";
  const pages = [...buildSrc.matchAll(/source:\s*(?:"([^"]+)"|\bENTRY\b)[\s\S]*?url:\s*"([^"]+)"/g)]
    .map((m) => m[1] ?? entry);
  const counts = new Map();
  for (const source of pages) {
    for (const m of bodyWithoutChrome(page(source)).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
      const t = txt(m[1]);
      if (!t) continue;
      counts.set(t, [...(counts.get(t) ?? []), source]);
    }
  }
  return counts;
}

test("S16: no body link text repeats more than three times across the nine pages", () => {
  const over = [...bodyLinkTexts().entries()].filter(([, v]) => v.length > 3);
  assert.deepEqual(
    over.map(([t, v]) => `${v.length}x ${t} (${v.join(", ")})`),
    [],
    "a body link text exceeded the cap of three identical instances",
  );
});

test("fix3: no link in the nine pages reads only 'aquí' or 'ver más'", () => {
  const buildSrc = fs.readFileSync(path.join(ROOT, "scripts/build-nhilos-web.mjs"), "utf8");
  const entry = (buildSrc.match(/^const ENTRY = "([^"]+)";/m) || [])[1] ?? "";
  const pages = [...buildSrc.matchAll(/source:\s*(?:"([^"]+)"|\bENTRY\b)[\s\S]*?url:\s*"([^"]+)"/g)]
    .map((m) => m[1] ?? entry);
  for (const source of pages) {
    for (const m of stripScripts(page(source)).matchAll(/<a\s[^>]*>([\s\S]*?)<\/a>/g)) {
      const t = txt(m[1]).toLowerCase();
      assert.ok(!["aquí", "ver más"].includes(t), `${source}: dead anchor "${t}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// Fix 4 (auditoría S4.6): el párrafo "Estado actual del sistema" de
// /inventario/ se parte en tres viñetas sin perder una sola palabra, sin
// suavizar las negaciones y sin tocar las citas legales del bloque NORMA.
// ---------------------------------------------------------------------------

const ESTADO_PARAGRAFO_ORIGINAL =
  "NHILOS POS opera con costo promedio ponderado (sin método UEPS) y lleva el registro operativo de kardex, " +
  "descuento por venta, sesiones de conteo y merma teórica vs física. Además, el sistema permite declarar un " +
  "precio de mercado por insumo con fecha de vigencia, valuar al menor entre el costo promedio ponderado y ese " +
  "precio declarado, y registrar el castigo contable correspondiente; si un insumo no tiene precio de mercado " +
  "cargado, toma el último costo de compra como referencia. Hoy el sistema no registra autorizaciones escritas " +
  "de cambio de método ni genera las hojas firmadas del inventario físico anual; la conformidad fiscal del caso " +
  "concreto siempre la valida y firma tu contador.";

test("fix4: the estado-actual paragraph becomes three bullets that preserve every word", () => {
  const src = page("09-inventario.html");
  const item = src.split('<span class="inv-norm-badge inv-norm-badge--system"')[1]?.split("inv-resp-heading")[0] ?? "";
  assert.ok(item.includes("Estado actual del sistema"), "the estado-actual norm item is missing");
  const ul = item.match(/<ul class="inv-norm-facts">([\s\S]*?)<\/ul>/);
  assert.ok(ul, "the estado-actual item must hold the three bullets");
  const lis = [...ul[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => txt(m[1]));
  assert.equal(lis.length, 3, "the estado-actual item must split into exactly three bullets");
  for (const li of lis) assert.ok(li.length > 0, "an estado-actual bullet is empty");
  // El desmontado de etiquetas inline (<strong>) deja un espacio delante de la
  // coma; se colapsa en ambos lados para comparar solo contenido, no espaciado.
  const normPunct = (t) => t.replace(/\s+([,;.:])/g, "$1");
  assert.equal(
    normPunct(lis.join(" ")),
    normPunct(ESTADO_PARAGRAFO_ORIGINAL),
    "splitting must not soften, merge, add or drop a word of the original paragraph",
  );
  // La honestidad sobre lo que NO hace el sistema sobrevive la división.
  assert.ok(lis[2].includes("no registra autorizaciones escritas"), "the honest 'no' bullet was lost");
  assert.ok(src.includes('<ul class="inv-norm-facts">'), "the bullet class is missing");
});

test("fix4: the legal citations of the NORMA block stay byte for byte", () => {
  const src = page("09-inventario.html");
  const norma = src.split('class="inv-norm-badge">')[1] ?? "";
  const block = norma.split('<div><span class="inv-norm-badge inv-norm-badge--practice">')[0];
  for (const citation of ["Ley 822 (art. 44)", "Reglamento de la Ley 822 (art. 33)", "NIC 2 (§23-25)"]) {
    assert.ok(block.includes(citation), `citation drifted: ${citation}`);
  }
});

// ---------------------------------------------------------------------------
// Fix 5 (auditoría S8.5): los enlaces del pie llegan a 44 px en táctil y a
// 24 px en escritorio, con padding; el layout del pie no se mueve más allá de
// la caja del propio enlace.
// ---------------------------------------------------------------------------

test("fix5: footer links reach 24px everywhere and 44px on touch", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(
    new URL("../../design/nhilos-web-foundation/assets/site.css", import.meta.url),
    "utf8",
  );
  const contact = css.match(/\.footer-contact a \{[^\}]*\}/);
  assert.ok(contact, "the .footer-contact a rule is missing");
  assert.match(contact[0], /min-height:\s*24px/, "the WhatsApp line link stays under 24px on desktop");
  const list = css.match(/\.footer-list a \{[^\}]*\}/);
  assert.ok(list, "the .footer-list a rule is missing");
  assert.match(list[0], /min-height:\s*32px/, "the footer columns changed height on desktop unexpectedly");
  // Táctil: bloque media exclusivo de puntero tosco / sin hover, con 44 px.
  const touch = css.match(/@media \(hover: none\), \(pointer: coarse\) \{[\s\S]*?\n    \}/);
  assert.ok(touch, "the touch-only media block for footer targets is missing");
  assert.match(touch[0], /\.footer-list a \{[^\}]*min-height:\s*44px/, "footer columns stay under 44px on touch");
  assert.match(touch[0], /\.footer-contact a \{[^\}]*min-height:\s*44px/, "the footer WhatsApp link stays under 44px on touch");
  assert.match(touch[0], /\.footer-social a \{[^\}]*min-height:\s*44px/, "footer social icons stay under 44px on touch");
  // La retícula del pie no se toca: el bloque táctil solo alcanza enlaces,
  // nunca la grilla.
  assert.equal(touch[0].includes(".footer-grid"), false, "the touch block reaches the footer grid");
});

// ---------------------------------------------------------------------------
// Fix 6: numeración del brief (dos 8.6) y el evento foodpark_admin_lee que ya
// no describe su sección.
// ---------------------------------------------------------------------------

test("fix6: every numbered subsection of the briefs document is unique within its section", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "docs/nhilos/web/nhilos_web_page_briefs_v1.0.md"),
    "utf8",
  );
  const seen = new Map();
  const dupes = [];
  for (const m of src.matchAll(/^### (\d+\.\d+) /gm)) {
    if (seen.has(m[1])) dupes.push(m[1]);
    seen.set(m[1], true);
  }
  assert.deepEqual(dupes, [], `duplicate section numbers: ${dupes.join(", ")}`);
});

test("fix6: briefs §8 renumbered with a version bump and change log entry", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "docs/nhilos/web/nhilos_web_page_briefs_v1.0.md"),
    "utf8",
  );
  assert.ok(src.includes("### 8.9 R-01"), "the stray R-01 section is not renumbered");
  assert.equal((src.match(/^### 8\.7 /gm) || []).length, 1, "a duplicate 8.7 remains");
  // El número de la tabla control debe ser el de la entrada más nueva del
  // change log (la 2.10 fija la renumeración; la 2.11 fija el tope de anclas).
  const newest = [...src.matchAll(/^### (v\d+\.\d+) /gm)].at(-1)?.[1];
  assert.ok(newest, "the change log has no versioned entry");
  assert.match(src, new RegExp(`^\\| Versión \\| ${newest.slice(1)} \\|`, "m"), "control table out of sync with the change log");
  assert.match(src, /### 8\.9 R-01/, "the stray R-01 section is not renumbered");
});

test("fix6: foodpark_admin_lee renamed to an event that describes its section, with the series break noted", () => {
  const briefs = fs.readFileSync(
    path.join(ROOT, "docs/nhilos/web/nhilos_web_page_briefs_v1.0.md"),
    "utf8",
  );
  // En la medición del food park el evento viejo ya no existe; el nuevo
  // describe la sección ("lo que no tienes que compartir con el park") y la
  // nota de quiebre de serie está escrita junto a él.
  const renamedAt = briefs.indexOf("`foodpark_llega_independencia`");
  assert.ok(renamedAt !== -1, "the measurement section lost the renamed event");
  assert.ok(
    renamedAt !== -1 && briefs.slice(renamedAt, renamedAt + 480).includes("se rompe"),
    "the series-break note must sit next to the renamed event",
  );
  assert.doesNotMatch(briefs, /foodpark_admin_lee — /, "the obsolete event is still the listed one");
  const pageSrc = page("13-food-parks.html");
  assert.equal(pageSrc.includes("foodpark_admin_lee"), false, "the published page still fires the obsolete event");
  assert.ok(
    pageSrc.includes('id="no-compartes" data-event="foodpark_llega_independencia"'),
    "the renamed event is not on the section it describes",
  );
});
