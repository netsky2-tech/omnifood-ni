import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyReleaseGate,
  REQUIRED_BLOCKER_IDS,
  RELEASE_GATE_SCHEMA,
} from "../lib/loyalty-release-gate.mjs";

const REQUIRED = [...REQUIRED_BLOCKER_IDS];

const blocker = (id, result = "FAIL") => ({ id, kind: "blocker", result });
const control = (id, result = "PASS") => ({ id, kind: "control", result });
const doc = (probes, source = "jest-backend") => ({ schema: RELEASE_GATE_SCHEMA, source, probes });
const gate = (probes, mode = "baseline") => classifyReleaseGate(doc(probes), mode);
const baselineProbes = () => [...REQUIRED.map((id) => blocker(id)), control("control-smoke")];
const finalProbes = () => [...REQUIRED.map((id) => blocker(id, "PASS")), control("control-smoke")];
const codesOf = (r) => r.errors.map((e) => e.code);

describe("contract constants", () => {
  it("declares exactly the required blocker tags", () => {
    assert.deepEqual([...REQUIRED_BLOCKER_IDS].sort(), [
      "B1", "B2", "B3", "B4-pg", "B4-sqlite", "B5", "B7",
    ]);
  });

  it("declares the release-gate schema identifier", () => {
    assert.equal(RELEASE_GATE_SCHEMA, "loyalty-release-gate/v1");
  });
});

describe("baseline mode", () => {
  it("holds when every required blocker is FAIL and controls are PASS", () => {
    const result = gate(baselineProbes());
    assert.equal(result.ok, true);
    assert.equal(result.status, "gate_held");
    assert.equal(result.mode, "baseline");
    assert.deepEqual(result.errors, []);
    assert.equal(result.observed.length, 8);
  });

  it("reports gate_failed (not input_invalid) when an expected blocker passes", () => {
    const probes = baselineProbes().map((p) => (p.id === "B4-pg" ? blocker("B4-pg", "PASS") : p));
    const result = gate(probes);
    assert.equal(result.ok, false);
    assert.equal(result.status, "gate_failed");
    assert.ok(codesOf(result).includes("blocker_unexpected_pass"));
  });

  it("reports input_invalid when a required blocker is missing", () => {
    const result = gate(baselineProbes().filter((p) => p.id !== "B5"));
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("missing_blocker"));
  });

  it("reports input_invalid on duplicate probe ids", () => {
    const result = gate([...baselineProbes(), blocker("B7")]);
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("duplicate_probe"));
  });
  it("reports input_invalid on unknown blocker tags", () => {
    const result = gate([...baselineProbes(), blocker("B99")]);
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("unknown_blocker_tag"));
  });

  it("reports input_invalid when a control probe fails (broken instrumentation)", () => {
    const result = gate([...baselineProbes(), control("ctl", "FAIL")]);
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("control_fail"));
  });

  it("reports input_invalid when no control probe is declared", () => {
    const result = gate(REQUIRED.map((id) => blocker(id)));
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("missing_control_declaration"));
  });
});

describe("final mode", () => {
  it("holds only when every blocking and control probe passes", () => {
    const result = classifyReleaseGate(doc(finalProbes()), "final");
    assert.equal(result.ok, true);
    assert.equal(result.status, "gate_held");
  });

  it("fails closed with gate_failed on a blocker FAIL", () => {
    const probes = finalProbes().map((p) => (p.id === "B3" ? blocker("B3", "FAIL") : p));
    const result = classifyReleaseGate(doc(probes), "final");
    assert.equal(result.ok, false);
    assert.equal(result.status, "gate_failed");
    assert.ok(codesOf(result).includes("blocker_fail"));
  });

  it("fails closed with input_invalid on a control FAIL (broken environment)", () => {
    const result = classifyReleaseGate(doc([...finalProbes(), control("ctl-r", "FAIL")]), "final");
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("control_fail"));
  });

  it("fails closed with input_invalid on missing, duplicate, or unknown probes", () => {
    const missing = classifyReleaseGate(doc(finalProbes().filter((p) => p.id !== "B4-sqlite")), "final");
    assert.equal(missing.status, "input_invalid");
    const dup = classifyReleaseGate(doc([...finalProbes(), control("control-smoke")]), "final");
    assert.equal(dup.status, "input_invalid");
    const unknown = classifyReleaseGate(doc([...finalProbes(), blocker("B10")]), "final");
    assert.equal(unknown.status, "input_invalid");
  });

  it("fails closed when no control probe is declared", () => {
    const result = classifyReleaseGate(doc(REQUIRED.map((id) => blocker(id, "PASS"))), "final");
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
  });
});

describe("provenance attribution", () => {
  it("records per-probe source in observed output", () => {
    const docs = [
      doc([blocker("B1"), blocker("B2")], "jest-backend"),
      doc([blocker("B3")], "flutter-pos"),
      doc([...REQUIRED.filter((id) => !["B1", "B2", "B3"].includes(id)).map((id) => blocker(id)), control("ctl")], "jest-backend"),
    ];
    const result = classifyReleaseGate(docs, "baseline");
    assert.equal(result.ok, true);
    const b3 = result.observed.find((p) => p.id === "B3");
    assert.equal(b3.source, "flutter-pos");
    const b1 = result.observed.find((p) => p.id === "B1");
    assert.equal(b1.source, "jest-backend");
    assert.equal(result.observed.length, 8);
  });

  it("attributes errors to the declaring source and file", () => {
    const bad = { schema: RELEASE_GATE_SCHEMA, source: "flutter-pos", file: "/tmp/pos.json", probes: [{ id: "x", result: "PASS" }] };
    const result = classifyReleaseGate([bad], "baseline");
    assert.equal(result.ok, false);
    const err = result.errors.find((e) => e.code === "invalid_probe");
    assert.equal(err.source, "flutter-pos");
    assert.equal(err.file, "/tmp/pos.json");
  });
});

describe("fail-closed document and probe validation", () => {
  it("rejects documents without the exact schema", () => {
    for (const d of [{ source: "s", probes: [] }, { schema: "other/v9", source: "s", probes: [] }]) {
      const result = classifyReleaseGate(d, "baseline");
      assert.equal(result.ok, false);
      assert.equal(result.status, "input_invalid");
      assert.ok(codesOf(result).includes("invalid_document"));
    }
  });

  it("rejects documents without a non-empty source", () => {
    for (const source of [undefined, "", "   "]) {
      const result = classifyReleaseGate({ schema: RELEASE_GATE_SCHEMA, source, probes: [control("c")] }, "baseline");
      assert.equal(result.ok, false);
      assert.ok(codesOf(result).includes("invalid_document"));
    }
  });

  it("rejects non-object documents and documents without a probes array", () => {
    for (const d of [null, 42, "scalar", [1, 2], { schema: RELEASE_GATE_SCHEMA, source: "s" }]) {
      const result = classifyReleaseGate(d, "baseline");
      assert.equal(result.ok, false);
      assert.ok(codesOf(result).includes("invalid_document"));
    }
    const arr = classifyReleaseGate([[1, 2]], "baseline");
    assert.match(arr.errors[0].message, /not a JSON object/);
  });

  it("rejects probes with invalid result, kind, or id", () => {
    const d = doc([...baselineProbes(), { id: "p1", kind: "blocker", result: "SKIP" }, { id: "p2", result: "PASS" }, { kind: "control", result: "PASS" }]);
    const result = classifyReleaseGate(d, "baseline");
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.equal(codesOf(result).filter((c) => c === "invalid_probe").length, 3);
  });

  it("rejects an invalid mode with input_invalid", () => {
    const result = classifyReleaseGate(doc(baselineProbes()), "green");
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("invalid_mode"));
  });

  it("aggregates multiple distinct failures in one classification", () => {
    const result = classifyReleaseGate(doc([...baselineProbes(), blocker("B99"), control("dup"), control("dup")]), "baseline");
    assert.equal(result.ok, false);
    const codes = new Set(codesOf(result));
    for (const c of ["unknown_blocker_tag", "duplicate_probe"]) assert.ok(codes.has(c));
  });
});
