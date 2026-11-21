// Guardias de accesibilidad y privacidad del sitio NHILOS (auditoría externa v1.0, S8.1/S8.2/S8.3/S10.4).
// Fallan si: la etiqueta del menú de escritorio deja de ser un botón con estado,
// el riel lateral inactivo vuelve a ser enfocable, el formulario de demo recupera
// un control de envío nativo, o el botón del menú móvil pierde su selector de estado.
// Run: node --test scripts/__tests__/nhilos-web-a11y-fixes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SITE = path.join(ROOT, "design/nhilos-web-foundation");
const PAGES = [
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

const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

test("S8.1: en las 9 páginas cada nav-group-label es un botón con aria-expanded y aria-controls", () => {
  for (const page of PAGES) {
    const html = read(SITE, page);
    const labels = [...html.matchAll(/<button type="button" class="nav-group-label" aria-expanded="(?:true|false)" aria-controls="([^"]+)">([^<]+)<\/button>/g)];
    assert.equal(labels.length, 2, `${page}: debe tener exactamente 2 nav-group-label como botón con estado`);
    for (const [, controls, text] of labels) {
      assert.match(controls, /^nav-panel-/, `${page}: aria-controls debe apuntar al id del panel`);
      assert.match(text.trim(), /Producto|Segmentos/, `${page}: etiqueta inesperada`);
    }
    // Cada panel enlazado existe con ese id
    for (const [, controls] of labels) {
      assert.match(html, new RegExp(`<div class="nav-group-panel" id="${controls}">`), `${page}: el panel ${controls} no tiene ese id`);
    }
    assert.ok(!html.includes('<span class="nav-group-label">'), `${page}: todavía queda un span.nav-group-label`);
  }
});

test("S8.1: el panel del menú se abre con la clase de estado, no solo con :hover/:focus-within", () => {
  const css = read(SITE, "assets", "site.css");
  assert.match(css, /\.nav-group\.is-open \.nav-group-panel\s*\{[^}]*display:\s*flex/);
  // Y el chevron responde al estado abierto, no solo al hover
  assert.match(css, /\.nav-group\.is-open \.nav-group-label::after\s*\{[^}]*rotate\(225deg\)/);
});

test("S8.1: site.js alterna el estado del grupo con teclado y cierra con Escape devolviendo el foco", () => {
  const js = read(SITE, "assets", "site.js");
  assert.match(js, /nav-group-label/, "site.js debe seleccionar la etiqueta convertida en botón");
  assert.match(js, /aria-expanded/, "site.js debe sincronizar aria-expanded");
  assert.match(js, /Escape/, "site.js debe cerrar el grupo con Escape");
});

test("S8.2: el riel inactivo no es enfocable (visibility:hidden) y lo recupera al activarse", () => {
  const css = read(SITE, "assets", "site.css");
  const base = css.match(/\.spine\s*\{[^}]*\}/);
  assert.ok(base, "site.css debe declarar .spine");
  assert.match(base[0], /visibility:\s*hidden/, ".spine inactivo debe estar fuera del árbol de accesibilidad");
  const visible = css.match(/\.spine\.is-visible\s*\{[^}]*\}/);
  assert.ok(visible, "site.css debe declarar .spine.is-visible");
  assert.match(visible[0], /visibility:\s*visible/, ".spine activo debe volver a ser visible y enfocable");
});

test("S8.2: la etiqueta del riel también aparece con :focus-visible, no solo con :hover", () => {
  const css = read(SITE, "assets", "site.css");
  assert.match(css, /\.spine a:focus-visible::after\s*\{\s*display:\s*block/);
});

test("S8.3: el botón del menú móvil tiene selector de estado visible (icono cambiado por aria-expanded)", () => {
  const css = read(SITE, "assets", "site.css");
  assert.match(css, /\.mobile-menu-btn\[aria-expanded="true"\]/, "falta el selector de estado abierto del toggle móvil");
  for (const page of PAGES) {
    const html = read(SITE, page);
    assert.match(html, /class="menu-bar-1"/, `${page}: las barras del icono deben ser elementos separados para poder cruzarlas`);
  }
});

test("S8.3: site.js bloquea el scroll del body mientras el menú móvil está abierto y lo libera al cerrar", () => {
  const js = read(SITE, "assets", "site.js");
  assert.match(js, /is-menu-locked/, "site.js debe alternar una clase de bloqueo de scroll");
  const css = read(SITE, "assets", "site.css");
  assert.match(css, /body\.is-menu-locked/, "site.css debe definir el bloqueo de scroll");
});

test("S10.4: el control que envía el formulario de demo no es un botón de submit nativo", () => {
  for (const page of ["05-home-geo.html", "10-demo.html"]) {
    const html = read(SITE, page);
    const formMatch = html.match(/<form id="nhilosDemoForm"[\s\S]*?<\/form>/);
    assert.ok(formMatch, `${page}: falta el formulario de demo`);
    const form = formMatch[0];
    assert.ok(!/type="submit"/.test(form), `${page}: el formulario aún tiene un control de envío nativo`);
    assert.match(form, /<button type="button" class="btn btn-on-dark form-submit"/, `${page}: el remitente debe ser type="button"`);
  }
});

test("S10.4: con JS desactivado el formulario se oculta y solo queda el enlace directo de WhatsApp", () => {
  for (const page of ["05-home-geo.html", "10-demo.html"]) {
    const html = read(SITE, page);
    // El estilo sin JS oculta el formulario
    const noscriptStyles = [...html.matchAll(/<noscript>\s*<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
    assert.match(noscriptStyles, /#nhilosDemoForm\s*\{[^}]*display:\s*none/, `${page}: falta ocultar el formulario sin JS`);
    // La caja de WhatsApp sin JS existe FUERA del formulario (si vive dentro, se oculta junto con él)
    const formMatch = html.match(/<form id="nhilosDemoForm"[\s\S]*?<\/form>/);
    const afterForm = html.slice(html.indexOf(formMatch[0]) + formMatch[0].length, html.indexOf("</main>"));
    assert.match(afterForm, /<noscript>[\s\S]*wa\.me\/50581948526/, `${page}: falta la caja <noscript> con el enlace directo de WhatsApp fuera del formulario`);
  }
});

test("S10.4: site.js escucha el clic del remitente y sigue abriendo WhatsApp con el mensaje completo", () => {
  const js = read(SITE, "assets", "site.js");
  assert.match(js, /form-submit/, "site.js debe enlazar el clic del botón remitente");
  assert.match(js, /wa\.me\/50581948526/, "el handoff a WhatsApp debe seguir existiendo");
  assert.match(js, /preventDefault/, "el envío nativo debe seguir bloqueado con JS activo");
});
