import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  classifyReleaseGate,
  REQUIRED_BLOCKER_IDS,
  REQUIRED_REGRESSION_IDS,
  RELEASE_GATE_SCHEMA,
} from "../lib/loyalty-release-gate.mjs";

const REQUIRED = [...REQUIRED_BLOCKER_IDS];

const blocker = (id, result = "FAIL") => ({ id, kind: "blocker", result });
const regression = (id, result = "PASS") => ({ id, kind: "regression", result });
const control = (id, result = "PASS") => ({ id, kind: "control", result });
const doc = (probes, source = "jest-backend") => ({ schema: RELEASE_GATE_SCHEMA, source, probes });
const gate = (probes, mode = "baseline") => classifyReleaseGate(doc(probes), mode);
// Post-#876 shape: the blocker set is EMPTY (the transport backlog closed).
// Baseline means: every declared regression and every control observed PASS
// — the same all-PASS evidence final requires, so baseline stays meaningful
// as the standing main-branch scoreboard.
const baselineProbes = () => [
  ...REQUIRED.map((id) => blocker(id)),
  ...REQUIRED_REGRESSION_IDS.map((id) => regression(id)),
  control("control-smoke"),
];
const finalProbes = () => [
  ...REQUIRED.map((id) => blocker(id, "PASS")),
  ...REQUIRED_REGRESSION_IDS.map((id) => regression(id, "PASS")),
  control("control-smoke"),
];
const codesOf = (r) => r.errors.map((e) => e.code);

describe("contract constants", () => {
  it("declares no remaining blocker tags (transport backlog closed)", () => {
    // Repair lifecycle terminal state: B2/B3/B5 were closed by PR #876
    // (merged 2026-10-12, squash 0494056: T6 ledger transport, T7 tagged
    // config stream, T5 per-movement reversals) and moved to the regression
    // set. The blocker set stays open for future blockers (T10+).
    assert.deepEqual([...REQUIRED_BLOCKER_IDS], []);
  });

  it("declares exactly the required regression tags", () => {
    // Repaired blockers become regressions that must PASS in every mode:
    // B4-pg/B4-sqlite (T2b, commits 5709931, 4153511), B9-customer-code
    // (T2a), B1 + both B7 probes (re-triaged 2026-10-12 against b394df32),
    // and B2 + B3 + B5 (closed by PR #876, squash 0494056).
    assert.deepEqual([...REQUIRED_REGRESSION_IDS].sort(), [
      "B1", "B2", "B3", "B4-pg", "B4-sqlite", "B5",
      "B7-cross-tenant-read", "B7-rls-enforcement", "B9-customer-code",
    ]);
  });

  it("declares the release-gate schema identifier", () => {
    assert.equal(RELEASE_GATE_SCHEMA, "loyalty-release-gate/v1");
  });
});

describe("baseline mode", () => {
  it("holds when every required blocker is FAIL and regressions/controls are PASS", () => {
    const result = gate(baselineProbes());
    assert.equal(result.ok, true);
    assert.equal(result.status, "gate_held");
    assert.equal(result.mode, "baseline");
    assert.deepEqual(result.errors, []);
    assert.equal(result.observed.length, REQUIRED.length + REQUIRED_REGRESSION_IDS.length + 1);
  });

  it("reports gate_failed when a repaired blocker (B2) regresses", () => {
    // B2 moved to the regression set (PR #876): a FAIL is real evidence the
    // fixed transport broke again — gate_failed, never accepted.
    const probes = baselineProbes().map((p) => (p.id === "B2" ? regression("B2", "FAIL") : p));
    const result = gate(probes);
    assert.equal(result.ok, false);
    assert.equal(result.status, "gate_failed");
    assert.ok(codesOf(result).includes("regression_fail"));
  });

  it("reports gate_failed (not input_invalid) when a regression probe fails", () => {
    // Regression rule: a regression must PASS in every mode. Its FAIL is real
    // (valid) evidence that a fixed behavior broke again, so it fails the
    // gate (gate_failed) exactly like any other contradicting evidence; it is
    // NOT broken instrumentation (input_invalid).
    const probes = baselineProbes().map((p) => (p.id === "B9-customer-code" ? regression("B9-customer-code", "FAIL") : p));
    const result = gate(probes);
    assert.equal(result.ok, false);
    assert.equal(result.status, "gate_failed");
    assert.ok(codesOf(result).includes("regression_fail"));
  });

  it("reports input_invalid when a required regression is missing (baseline)", () => {
    // With the blocker set empty, a missing declared probe is always a
    // regression absence (there are no declared blockers left to miss).
    const result = gate(baselineProbes().filter((p) => p.id !== "B5"));
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("missing_regression"));
  });

  it("reports input_invalid on duplicate probe ids", () => {
    const result = gate([...baselineProbes(), blocker("B7-rls-enforcement")]);
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

  it("reports input_invalid on an unknown regression tag", () => {
    const result = gate([...baselineProbes(), regression("B9-legacy")]);
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("unknown_regression_tag"));
  });

  it("reports input_invalid when a control probe fails (broken instrumentation)", () => {
    const result = gate([...baselineProbes(), control("ctl", "FAIL")]);
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("control_fail"));
  });

  it("reports input_invalid when no control probe is declared", () => {
    const result = gate([
      ...REQUIRED.map((id) => blocker(id)),
      ...REQUIRED_REGRESSION_IDS.map((id) => regression(id)),
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("missing_control_declaration"));
  });
});

describe("final mode", () => {
  it("holds only when every blocking, regression, and control probe passes", () => {
    const result = classifyReleaseGate(doc(finalProbes()), "final");
    assert.equal(result.ok, true);
    assert.equal(result.status, "gate_held");
  });

  it("fails closed with gate_failed on a regression FAIL (repaired B3)", () => {
    const probes = finalProbes().map((p) => (p.id === "B3" ? regression("B3", "FAIL") : p));
    const result = classifyReleaseGate(doc(probes), "final");
    assert.equal(result.ok, false);
    assert.equal(result.status, "gate_failed");
    assert.ok(codesOf(result).includes("regression_fail"));
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

  it("fails closed with input_invalid when a required regression is missing (final)", () => {
    const result = classifyReleaseGate(doc(finalProbes().filter((p) => p.id !== "B9-customer-code")), "final");
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
    assert.ok(codesOf(result).includes("missing_regression"));
  });

  it("fails closed when no control probe is declared", () => {
    const result = classifyReleaseGate(doc([
      ...REQUIRED.map((id) => blocker(id, "PASS")),
      ...REQUIRED_REGRESSION_IDS.map((id) => regression(id, "PASS")),
    ]), "final");
    assert.equal(result.ok, false);
    assert.equal(result.status, "input_invalid");
  });
});

describe("provenance attribution", () => {
  it("records per-probe source in observed output", () => {
    const docs = [
      doc([regression("B2")], "jest-backend"),
      doc([regression("B3"), regression("B5")], "flutter-pos"),
      doc([
        ...REQUIRED_REGRESSION_IDS.filter((id) => id !== "B2" && id !== "B3" && id !== "B5").map((id) => regression(id)),
        control("ctl"),
      ], "jest-backend"),
    ];
    const result = classifyReleaseGate(docs, "baseline");
    assert.equal(result.ok, true);
    const b3 = result.observed.find((p) => p.id === "B3");
    assert.equal(b3.source, "flutter-pos");
    const b5 = result.observed.find((p) => p.id === "B5");
    assert.equal(b5.source, "flutter-pos");
    const b2 = result.observed.find((p) => p.id === "B2");
    assert.equal(b2.source, "jest-backend");
    assert.equal(result.observed.length, REQUIRED_REGRESSION_IDS.length + 1);
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
