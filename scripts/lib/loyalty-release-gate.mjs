/**
 * Loyalty V1 release-gate contract and pure classifier.
 *
 * Contract `loyalty-release-gate/v1`: one JSON result document per runner
 * (Jest backend, Flutter POS); every document MUST declare the exact schema,
 * a non-empty `source`, and probes with explicit `id`, `kind`
 * ("blocker"|"control"), `result` ("PASS"|"FAIL"); optional `file` adds
 * provenance. Modes: baseline = every required blocker FAIL and every control
 * PASS; final = every probe PASS.
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
// producers can never silently widen the gate.
export const REQUIRED_BLOCKER_IDS = Object.freeze([
  "B1", "B2", "B3", "B4-pg", "B4-sqlite", "B5", "B7",
]);

export const GATE_MODES = Object.freeze(["baseline", "final"]);

const REQUIRED_BLOCKER_SET = new Set(REQUIRED_BLOCKER_IDS);
const PROBE_KINDS = new Set(["blocker", "control"]);
const PROBE_RESULTS = new Set(["PASS", "FAIL"]);
const MODES = new Set(GATE_MODES);

// Control probes guard the harness environment: a control FAIL is broken
// instrumentation (input_invalid), never gate evidence about the blockers.
const INPUT_INVALID_CODES = new Set([
  "invalid_mode", "unreadable_file", "invalid_document", "invalid_probe",
  "duplicate_probe", "unknown_blocker_tag", "missing_blocker",
  "missing_control_declaration", "control_fail",
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
          message: `probe ${id} must declare kind "blocker"|"control" and result "PASS"|"FAIL" (got kind ${JSON.stringify(kind ?? null)}, result ${JSON.stringify(result ?? null)})`,
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

  for (const probe of probes) {
    if (probe.kind === "control" && probe.result !== "PASS") {
      errors.push({
        code: "control_fail", probeId: probe.id, source: probe.source, file: probe.file,
        message: `control probe ${probe.id} observed ${probe.result}; controls must PASS in every mode`,
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
