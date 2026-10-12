/**
 * Loyalty V1 release-gate contract and pure classifier.
 *
 * Contract `loyalty-release-gate/v1`: one JSON result document per runner
 * (Jest backend, Flutter POS); every document MUST declare the exact schema,
 * a non-empty `source`, and probes with explicit `id`, `kind`
 * ("blocker"|"regression"|"control"), `result` ("PASS"|"FAIL"); optional
 * `file` adds provenance. Modes: baseline = every required blocker FAIL and
 * every regression/control PASS; final = every probe PASS. A `regression`
 * probe guards a behavior that was fixed and must stay fixed: a regression
 * FAIL is valid (if contradicting) evidence, so it yields `gate_failed`
 * (code `regression_fail`) in either mode — unlike a control FAIL, which is
 * broken instrumentation (`input_invalid`).
 *
 * Status: `gate_held` (valid evidence satisfying the mode), `gate_failed`
 * (valid evidence contradicting the mode), `input_invalid` (broken
 * instrumentation: unreadable files, invalid JSON/schema/document/probe,
 * duplicates, unknown tags, missing blockers, no declared control, or a
 * FAILED CONTROL — a failed control means the harness environment itself
 * broke, so it can never count as gate evidence).
 */

export const RELEASE_GATE_SCHEMA = "loyalty-release-gate/v1";

// Versioned with the T1 probe-producer contract (docs/loyalty T1 batch, M0
// baseline-red gate). This closed set MUST be expanded for T10 (final-green
// gate) when new blockers land; unknown tags always fail closed so stale
// producers can never silently widen the gate. Repaired blockers move OUT of
// this set and into REQUIRED_REGRESSION_IDS so baseline keeps meaning "the
// remaining known blockers are still red". Repair history: B4-pg/B4-sqlite
// (T2b, commits 5709931/4153511), B1 + B7-rls-enforcement +
// B7-cross-tenant-read (closed on main by the device-tenant evaluation fix,
// the #286/#512 RLS work and the v71 ledger identity batch — re-triaged
// 2026-10-12 against main b394df32), and B2 + B3 + B5 (the loyalty transport
// backlog, closed by PR #876 — merged 2026-10-12, squash 0494056: T6
// LOYALTY_LEDGER dispatch, T7 tagged §13.5 config stream, T5 per-movement
// reversal contract). The blocker set is currently EMPTY: with no declared
// blockers, baseline and final both mean "every regression and control
// PASS" — the T10 terminal semantics. Future blockers re-populate this set
// and restore the red-blocker baseline semantics.
export const REQUIRED_BLOCKER_IDS = Object.freeze([]);

// Regression probes: fixed behaviors that must PASS in every mode (a FAIL is
// gate_failed evidence, never accepted). Repaired blockers move here (same
// lifecycle as B9-customer-code after T2a) so that baseline stays meaningful:
// baseline = remaining known blockers FAIL, final = everything PASS. Presence
// per runner is enforced by the collector's per-source expected-tag sets;
// this classifier-level set fails closed on unknown regression KINDS/tags.
export const REQUIRED_REGRESSION_IDS = Object.freeze([
  "B4-pg", "B4-sqlite", "B9-customer-code",
  "B1", "B7-rls-enforcement", "B7-cross-tenant-read",
  "B2", "B3", "B5",
]);

// Declared control probes guard the harness environment. The classifier
// requires at least one control and fails on a control FAIL; the collector
// requires each declared control to be observed by its owning runner.
export const DECLARED_CONTROL_IDS = Object.freeze([
  "CONTROL-pg-schema", "CONTROL-http", "CONTROL-sqlite-schema",
]);

export const GATE_MODES = Object.freeze(["baseline", "final"]);

const REQUIRED_BLOCKER_SET = new Set(REQUIRED_BLOCKER_IDS);
const REQUIRED_REGRESSION_SET = new Set(REQUIRED_REGRESSION_IDS);
const PROBE_KINDS = new Set(["blocker", "regression", "control"]);
const PROBE_RESULTS = new Set(["PASS", "FAIL"]);
const MODES = new Set(GATE_MODES);

// Control probes guard the harness environment: a control FAIL is broken
// instrumentation (input_invalid), never gate evidence about the blockers.
const INPUT_INVALID_CODES = new Set([
  "invalid_mode", "unreadable_file", "invalid_document", "invalid_probe",
  "duplicate_probe", "unknown_blocker_tag", "unknown_regression_tag",
  "missing_blocker", "missing_regression", "missing_control_declaration",
  "control_fail",
]);

function collectProbes(documents) {
  const probes = [];
  const errors = [];

  documents.forEach((doc, docIndex) => {
    const at = (extra) => ({ docIndex: docIndex + 1, ...extra });
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
      errors.push(at({ code: "invalid_document", message: `result document #${docIndex + 1} is not a JSON object` }));
      return;
    }
    if (doc.schema !== RELEASE_GATE_SCHEMA) {
      errors.push(at({
        code: "invalid_document",
        message: `result document #${docIndex + 1} must declare schema ${JSON.stringify(RELEASE_GATE_SCHEMA)} (got ${JSON.stringify(doc.schema ?? null)})`,
      }));
      return;
    }
    if (typeof doc.source !== "string" || doc.source.trim() === "") {
      errors.push(at({
        code: "invalid_document",
        message: `result document #${docIndex + 1} must declare a non-empty "source" (got ${JSON.stringify(doc.source ?? null)})`,
      }));
      return;
    }
    if (!Array.isArray(doc.probes)) {
      errors.push(at({ code: "invalid_document", message: `result document #${docIndex + 1} has no probes array` }));
      return;
    }
    const origin = { source: doc.source, file: typeof doc.file === "string" ? doc.file : undefined };
    doc.probes.forEach((probe, probeIndex) => {
      const where = `document #${docIndex + 1} (${origin.source}${origin.file ? `, ${origin.file}` : ""}) probe #${probeIndex + 1}`;
      if (typeof probe !== "object" || probe === null || Array.isArray(probe)) {
        errors.push(at({ code: "invalid_probe", ...origin, message: `${where} is not an object` }));
        return;
      }
      const { id, kind, result } = probe;
      if (typeof id !== "string" || id.trim() === "") {
        errors.push(at({ code: "invalid_probe", ...origin, message: `${where} has no probe id` }));
        return;
      }
      if (!PROBE_KINDS.has(kind) || !PROBE_RESULTS.has(result)) {
        errors.push(at({
          code: "invalid_probe",
          probeId: id,
          ...origin,
          message: `probe ${id} must declare kind "blocker"|"regression"|"control" and result "PASS"|"FAIL" (got kind ${JSON.stringify(kind ?? null)}, result ${JSON.stringify(result ?? null)})`,
        }));
        return;
      }
      probes.push({ id, kind, result, ...origin });
    });
  });

  return { probes, errors };
}

function structuralErrors(probes) {
  const errors = [];
  const seen = new Set();
  let controls = 0;

  for (const probe of probes) {
    if (seen.has(probe.id)) {
      errors.push({
        code: "duplicate_probe", probeId: probe.id, source: probe.source, file: probe.file,
        message: `probe ${probe.id} is declared more than once`,
      });
      continue;
    }
    seen.add(probe.id);
    if (probe.kind === "control") controls += 1;
    if (probe.kind === "blocker" && !REQUIRED_BLOCKER_SET.has(probe.id)) {
      errors.push({
        code: "unknown_blocker_tag", probeId: probe.id, source: probe.source, file: probe.file,
        message: `probe ${probe.id} is not a declared blocker tag (${REQUIRED_BLOCKER_IDS.join(", ")})`,
      });
    }
    if (probe.kind === "regression" && !REQUIRED_REGRESSION_SET.has(probe.id)) {
      errors.push({
        code: "unknown_regression_tag", probeId: probe.id, source: probe.source, file: probe.file,
        message: `probe ${probe.id} is not a declared regression tag (${REQUIRED_REGRESSION_IDS.join(", ")})`,
      });
    }
  }

  if (controls === 0) {
    errors.push({
      code: "missing_control_declaration",
      message: `no control probe was explicitly declared; the contract requires at least one probe with kind "control"`,
    });
  }

  return errors;
}

function modeErrors(mode, probes) {
  const errors = [];
  const observed = new Map(probes.map((p) => [p.id, p]));
  for (const id of REQUIRED_BLOCKER_IDS) {
    if (!observed.has(id)) {
      errors.push({ code: "missing_blocker", probeId: id, message: `required blocker ${id} was not observed` });
    }
  }
  for (const id of REQUIRED_REGRESSION_IDS) {
    if (!observed.has(id)) {
      errors.push({
        code: "missing_regression", probeId: id,
        message: `required regression ${id} was not observed (incomplete instrumentation)`,
      });
    }
  }

  for (const probe of probes) {
    if (probe.kind === "control" && probe.result !== "PASS") {
      errors.push({
        code: "control_fail", probeId: probe.id, source: probe.source, file: probe.file,
        message: `control probe ${probe.id} observed ${probe.result}; controls must PASS in every mode`,
      });
      continue;
    }
    if (probe.kind === "regression" && probe.result !== "PASS") {
      errors.push({
        code: "regression_fail", probeId: probe.id, source: probe.source, file: probe.file,
        message: `regression probe ${probe.id} observed ${probe.result}; regressions must PASS in every mode (the fixed behavior broke again)`,
      });
      continue;
    }
    if (probe.kind !== "blocker" || !REQUIRED_BLOCKER_SET.has(probe.id)) continue;
    if (mode === "baseline" && probe.result !== "FAIL") {
      errors.push({
        code: "blocker_unexpected_pass", probeId: probe.id, source: probe.source, file: probe.file,
        message: `baseline gate: blocker ${probe.id} unexpectedly PASSed (baseline requires FAIL)`,
      });
    }
    if (mode === "final" && probe.result !== "PASS") {
      errors.push({
        code: "blocker_fail", probeId: probe.id, source: probe.source, file: probe.file,
        message: `final gate: blocker ${probe.id} observed FAIL`,
      });
    }
  }

  return errors;
}

export function deriveGateStatus(errors) {
  if (errors.length === 0) return "gate_held";
  return errors.some((e) => INPUT_INVALID_CODES.has(e.code)) ? "input_invalid" : "gate_failed";
}

/**
 * Pure classifier. `documents` accepts one parsed result document, an array
 * of them, or null/undefined (fails closed). Returns a JSON-serializable
 * summary: { ok, status, mode, errors, observed }.
 */
export function classifyReleaseGate(documents, mode) {
  if (!MODES.has(mode)) {
    return {
      ok: false,
      status: "input_invalid",
      mode: mode ?? null,
      errors: [{ code: "invalid_mode", message: `mode must be "baseline" or "final" (got ${JSON.stringify(mode ?? null)})` }],
      observed: [],
    };
  }

  const docList = Array.isArray(documents) ? documents : [documents];
  const { probes, errors } = collectProbes(docList);
  errors.push(...structuralErrors(probes));
  errors.push(...modeErrors(mode, probes));

  return {
    ok: errors.length === 0,
    status: deriveGateStatus(errors),
    mode,
    errors,
    observed: probes.map(({ id, kind, result, source, file }) => ({ id, kind, result, source, file })),
  };
}
