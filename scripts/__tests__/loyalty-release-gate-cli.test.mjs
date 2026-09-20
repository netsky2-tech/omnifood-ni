import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as core from "../lib/loyalty-release-gate.mjs";
import * as entrypoint from "../loyalty-release-gate-classify.mjs";

const SCRIPT = fileURLToPath(new URL("../loyalty-release-gate-classify.mjs", import.meta.url));
const CORE = fileURLToPath(new URL("../lib/loyalty-release-gate.mjs", import.meta.url));
const REQUIRED = [...core.REQUIRED_BLOCKER_IDS];

const blocker = (id, result = "FAIL") => ({ id, kind: "blocker", result });
const control = (id, result = "PASS") => ({ id, kind: "control", result });
const doc = (probes, source = "jest-backend") => ({ schema: core.RELEASE_GATE_SCHEMA, source, probes });
const baselineProbes = () => [...REQUIRED.map((id) => blocker(id)), control("control-smoke")];

let tmpRoot;
function tmpDir() {
  tmpRoot ??= mkdtempSync(path.join(tmpdir(), "loyalty-gate-cli-test-"));
  return tmpRoot;
}
function fixture(name, content) {
  const p = path.join(tmpDir(), name);
  writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  return p;
}
function run(args, script = SCRIPT) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}
after(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

describe("CLI entrypoint API compatibility", () => {
  it("re-exports the core public API unchanged", () => {
    assert.equal(entrypoint.classifyReleaseGate, core.classifyReleaseGate);
    assert.equal(entrypoint.REQUIRED_BLOCKER_IDS, core.REQUIRED_BLOCKER_IDS);
    assert.equal(entrypoint.RELEASE_GATE_SCHEMA, core.RELEASE_GATE_SCHEMA);
  });
});

describe("CLI", () => {
  it("exits 0 with gate_held JSON on a conforming baseline run", () => {
    const res = run(["--mode", "baseline", fixture("held.json", doc(baselineProbes()))]);
    assert.equal(res.status, 0);
    const summary = JSON.parse(res.stdout);
    assert.equal(summary.status, "gate_held");
    assert.equal(summary.ok, true);
  });

  it("exits 1 with gate_failed JSON on valid evidence against the mode", () => {
    const probes = baselineProbes().map((p) => (p.id === "B1" ? blocker("B1", "PASS") : p));
    const res = run(["--mode", "baseline", fixture("red.json", doc(probes))]);
    assert.equal(res.status, 1);
    assert.equal(JSON.parse(res.stdout).status, "gate_failed");
  });

  it("exits 3 with input_invalid JSON on unreadable and malformed inputs", () => {
    const cases = [
      ["unreadable", () => run(["--mode", "baseline", path.join(tmpDir(), "nope.json")])],
      ["invalid-json", () => run(["--mode", "baseline", fixture("bad.json", "{not-json")])],
      ["unknown-tag", () => run(["--mode", "baseline", fixture("unknown.json", doc([...baselineProbes(), blocker("B99")]))])],
      ["duplicate", () => run(["--mode", "baseline", fixture("dup.json", doc([...baselineProbes(), control("control-smoke")]))])],
      ["control-fail", () => run(["--mode", "baseline", fixture("ctl.json", doc([...baselineProbes(), control("ctl", "FAIL")]))])],
    ];
    for (const [name, fn] of cases) {
      const res = fn();
      assert.equal(res.status, 3, `${name} must exit 3`);
      assert.equal(JSON.parse(res.stdout).status, "input_invalid", name);
    }
  });

  it("exits 2 with usage on stderr for operator errors and prints help on stdout", () => {
    const usage = /Usage:/;
    for (const args of [[], ["--mode", "baseline"], ["--mode", "bogus", "f.json"], ["--bogus", "f.json"]]) {
      const res = run(args);
      assert.equal(res.status, 2, `args ${JSON.stringify(args)}`);
      assert.match(res.stderr, usage);
    }
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, usage);
  });

  it("preserves non-object parsed JSON so diagnostics name the shape problem", () => {
    const res = run(["--mode", "baseline", fixture("scalar.json", "42")]);
    assert.equal(res.status, 3);
    const summary = JSON.parse(res.stdout);
    const err = summary.errors.find((e) => e.code === "invalid_document");
    assert.ok(err, "expected an invalid_document error");
    assert.match(err.message, /not a JSON object/);
  });

  it("executes from parent directories containing %, #, ?, and spaces without silent success", () => {
    const red = fixture("red-special.json", doc(baselineProbes().map((p) => (p.id === "B1" ? blocker("B1", "PASS") : p))));
    for (const name of ["dir%20enc", "dir#enc", "dir?enc", "dir with space"]) {
      const dir = path.join(tmpDir(), name);
      mkdirSync(path.join(dir, "lib"), { recursive: true });
      copyFileSync(SCRIPT, path.join(dir, "classifier.mjs"));
      copyFileSync(CORE, path.join(dir, "lib", "loyalty-release-gate.mjs"));
      const res = run(["--mode", "baseline", red], path.join(dir, "classifier.mjs"));
      assert.equal(res.status, 1, `${name}: a baseline failure must never silently exit 0`);
      assert.equal(JSON.parse(res.stdout).status, "gate_failed", name);
    }
  });
});
