// Differential verification for assets/site.js demo form handler (ODD S10, T7).
// Proves that extending site.js for /demo/ produces a BYTE-FOR-BYTE IDENTICAL
// WhatsApp message for the home form (05-home-geo.html), while cleanly handling
// /demo/'s fields (no contactEmail + businessSector + optional demoContextNote).
// Run: node --test scripts/__tests__/nhilos-site-js-demo-form.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const SITE_JS = path.join(ROOT, "design/nhilos-web-foundation/assets/site.js");

// Verbatim oracle of the original home message builder before /demo/ extension.
function originalHomeMessage(fields) {
  return (
    "Hola NHILOS, quiero solicitar una demo.\n" +
    "Negocio: " +
    fields.businessName +
    " (" +
    fields.businessType +
    ")\n" +
    "Terminales: " +
    (fields.terminalCount || "1 terminal") +
    "\n" +
    "Prioridad: " +
    fields.demoPriority +
    "\n" +
    "Nombre: " +
    fields.contactName +
    "\n" +
    "Teléfono: " +
    fields.contactPhone +
    (fields.contactEmail ? "\nCorreo: " + fields.contactEmail : "")
  );
}

function makeControl({ id, name, value = "", type = "text", required = false, checked = false, msgLabel = null }) {
  const classes = new Set();
  const attrs = new Map();
  if (msgLabel) attrs.set("data-msg-label", msgLabel);
  if (required) attrs.set("required", "");
  const listeners = {};
  return {
    id,
    name,
    type,
    value,
    required,
    checked,
    focused: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    hasAttribute: (k) => attrs.has(k),
    addEventListener: (ev, fn) => {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(fn);
    },
    focus() {
      this.focused = true;
    },
  };
}

function runSiteJsWithForm(controls) {
  const src = fs.readFileSync(SITE_JS, "utf8");
  const errorNodes = new Map();
  for (const c of controls) {
    const key = c.type === "radio" ? c.name : c.id;
    if (!errorNodes.has(key)) errorNodes.set(key, { hidden: true });
  }

  const formListeners = {};
  const form = {
    addEventListener: (ev, fn) => {
      formListeners[ev] = formListeners[ev] || [];
      formListeners[ev].push(fn);
    },
    querySelector: (sel) => {
      const errMatch = sel.match(/^\[data-error-for="([^"]+)"\]$/);
      if (errMatch) return errorNodes.get(errMatch[1]) || null;
      const radioChecked = sel.match(/^input\[name="([^"]+)"\]:checked$/);
      if (radioChecked) return controls.find((c) => c.type === "radio" && c.name === radioChecked[1] && c.checked) || null;
      const radioAny = sel.match(/^input\[name="([^"]+)"\]$/);
      if (radioAny) return controls.find((c) => c.type === "radio" && c.name === radioAny[1]) || null;
      if (sel === ".is-invalid") return controls.find((c) => c.classList.contains("is-invalid")) || null;
      const byName = sel.match(/^\[name="([^"]+)"\]$/);
      if (byName) return controls.find((c) => c.name === byName[1]) || null;
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === "[required]") return controls.filter((c) => c.required && c.type !== "radio");
      if (sel === "input, select, textarea") return controls;
      return [];
    },
    elements: controls,
  };

  for (const c of controls) {
    if (c.type !== "radio") form[c.name] = c;
  }

  class MockFormData {
    constructor() {
      this._entries = [];
      for (const c of controls) {
        if (c.type === "radio") {
          if (c.checked) this._entries.push([c.name, c.value]);
        } else {
          this._entries.push([c.name, c.value]);
        }
      }
    }
    get(key) {
      const found = this._entries.find(([k]) => k === key);
      return found ? found[1] : null;
    }
    entries() {
      return this._entries[Symbol.iterator]();
    }
    forEach(cb) {
      for (const [k, v] of this._entries) cb(v, k);
    }
  }

  const opened = [];
  const noopEl = {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: { setProperty() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    setAttribute() {},
  };

  const sandbox = {
    window: {
      matchMedia: () => ({ matches: true }),
      addEventListener() {},
      scrollY: 0,
      innerHeight: 900,
      innerWidth: 1440,
      scrollTo() {},
      open: (url, target, features) => opened.push({ url, target, features }),
    },
    document: {
      documentElement: { classList: { add() {} }, scrollHeight: 1800 },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => {
        if (id === "nhilosDemoForm") return form;
        if (id === "spineNav" || id === "backTop") return noopEl;
        return null;
      },
      addEventListener() {},
      hidden: false,
    },
    FormData: MockFormData,
    setTimeout,
    requestAnimationFrame: (fn) => fn(),
    encodeURIComponent,
  };

  vm.runInNewContext(src, sandbox);
  let prevented = false;
  for (const fn of formListeners.submit || []) {
    fn({ preventDefault: () => (prevented = true) });
  }
  return { opened, prevented, errorNodes, controls };
}

test("S10 differential: home form with email produces byte-for-byte identical WhatsApp message", () => {
  const fields = {
    businessType: "Restaurante / Bar",
    demoPriority: "Continuidad sin internet",
    terminalCount: "2-3 terminales",
    contactName: "Ana Pérez",
    businessName: "Comedor El Parque",
    contactPhone: "8888-1234",
    contactEmail: "gerencia@elparque.ni",
  };
  const controls = [
    makeControl({ id: "bt1", name: "businessType", value: fields.businessType, type: "radio", checked: true }),
    makeControl({ id: "dp1", name: "demoPriority", value: fields.demoPriority, type: "radio", checked: true }),
    makeControl({ id: "terminalCount", name: "terminalCount", value: fields.terminalCount }),
    makeControl({ id: "contactName", name: "contactName", value: fields.contactName, required: true }),
    makeControl({ id: "businessName", name: "businessName", value: fields.businessName, required: true }),
    makeControl({ id: "contactPhone", name: "contactPhone", value: fields.contactPhone, type: "tel", required: true }),
    makeControl({ id: "contactEmail", name: "contactEmail", value: fields.contactEmail, type: "email" }),
  ];

  const { opened } = runSiteJsWithForm(controls);
  assert.equal(opened.length, 1);
  const expectedUrl = "https://wa.me/50581948526?text=" + encodeURIComponent(originalHomeMessage(fields));
  assert.equal(opened[0].url, expectedUrl);
});

test("S10 differential: home form without email produces byte-for-byte identical WhatsApp message", () => {
  const fields = {
    businessType: "Comercio / Retail de Mostrador",
    demoPriority: "Rapidez y vuelto bimoneda",
    terminalCount: "1 terminal",
    contactName: "Luis Gómez",
    businessName: "Pulpería San José",
    contactPhone: "8777-4321",
    contactEmail: "",
  };
  const controls = [
    makeControl({ id: "bt1", name: "businessType", value: fields.businessType, type: "radio", checked: true }),
    makeControl({ id: "dp1", name: "demoPriority", value: fields.demoPriority, type: "radio", checked: true }),
    makeControl({ id: "terminalCount", name: "terminalCount", value: fields.terminalCount }),
    makeControl({ id: "contactName", name: "contactName", value: fields.contactName, required: true }),
    makeControl({ id: "businessName", name: "businessName", value: fields.businessName, required: true }),
    makeControl({ id: "contactPhone", name: "contactPhone", value: fields.contactPhone, type: "tel", required: true }),
    makeControl({ id: "contactEmail", name: "contactEmail", value: fields.contactEmail, type: "email" }),
  ];

  const { opened } = runSiteJsWithForm(controls);
  assert.equal(opened.length, 1);
  const expectedUrl = "https://wa.me/50581948526?text=" + encodeURIComponent(originalHomeMessage(fields));
  assert.equal(opened[0].url, expectedUrl);
});

test("S10 /demo/ extension: works without contactEmail and appends Rubro and optional Detalle", () => {
  const controls = [
    makeControl({ id: "bt1", name: "businessType", value: "Cafetería / Panadería", type: "radio", checked: true }),
    makeControl({ id: "dp1", name: "demoPriority", value: "Inventario, recetas y merma", type: "radio", checked: true }),
    makeControl({ id: "terminalCount", name: "terminalCount", value: "2-3 terminales" }),
    makeControl({ id: "contactName", name: "contactName", value: "Sofía Ruiz", required: true }),
    makeControl({ id: "businessName", name: "businessName", value: "Café Central", required: true }),
    makeControl({ id: "contactPhone", name: "contactPhone", value: "8123-4567", type: "tel", required: true }),
    makeControl({ id: "businessSector", name: "businessSector", value: "Café de especialidad y panadería", required: true, msgLabel: "Rubro" }),
    makeControl({ id: "demoContextNote", name: "demoContextNote", value: "Abrimos segundo turno los fines de semana", msgLabel: "Detalle" }),
  ];

  const { opened } = runSiteJsWithForm(controls);
  assert.equal(opened.length, 1);
  const decoded = decodeURIComponent(opened[0].url.split("text=")[1]);
  assert.ok(decoded.includes("Negocio: Café Central (Cafetería / Panadería)"));
  assert.ok(decoded.includes("Terminales: 2-3 terminales"));
  assert.ok(decoded.includes("Rubro: Café de especialidad y panadería"));
  assert.ok(decoded.includes("Detalle: Abrimos segundo turno los fines de semana"));
  assert.ok(!decoded.includes("Correo:"));
});

test("S10 /demo/ extension: omits empty optional field and blocks submit when required businessSector is blank", () => {
  const badControls = [
    makeControl({ id: "bt1", name: "businessType", value: "Food Park / Comida Rápida", type: "radio", checked: true }),
    makeControl({ id: "dp1", name: "demoPriority", value: "Control remoto de dueño", type: "radio", checked: true }),
    makeControl({ id: "terminalCount", name: "terminalCount", value: "4+ terminales" }),
    makeControl({ id: "contactName", name: "contactName", value: "Sofía Ruiz", required: true }),
    makeControl({ id: "businessName", name: "businessName", value: "Parque Gastronómico", required: true }),
    makeControl({ id: "contactPhone", name: "contactPhone", value: "8123-4567", type: "tel", required: true }),
    makeControl({ id: "businessSector", name: "businessSector", value: "   ", required: true, msgLabel: "Rubro" }),
    makeControl({ id: "demoContextNote", name: "demoContextNote", value: "", msgLabel: "Detalle" }),
  ];

  const badRun = runSiteJsWithForm(badControls);
  assert.equal(badRun.opened.length, 0, "must not open WhatsApp when required businessSector is blank");
  assert.equal(badRun.errorNodes.get("businessSector").hidden, false);
  assert.equal(badControls.find((c) => c.id === "businessSector").focused, true);

  // Now fill businessSector and leave optional note empty
  badControls.find((c) => c.id === "businessSector").value = "Food park con 6 puestos";
  const goodRun = runSiteJsWithForm(badControls);
  assert.equal(goodRun.opened.length, 1);
  const decoded = decodeURIComponent(goodRun.opened[0].url.split("text=")[1]);
  assert.ok(decoded.includes("Rubro: Food park con 6 puestos"));
  assert.ok(!decoded.includes("Detalle:"));
});
