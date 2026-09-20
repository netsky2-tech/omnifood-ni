/**
 * Pure collectors converting runner machine output into
 * loyalty-release-gate/v1 result documents, plus a thin CLI adapter.
 *
 * Sources: `jest-backend` consumes Jest `--json` output; `flutter-pos`
 * consumes Flutter `--reporter json` (one JSON event per line). A test is a
 * probe only when its title carries a `[TAG]` that is a declared probe id
 * (blocker, regression, or control); untagged tests are unrelated and
 * ignored.
 *
 * Fail-closed rules (any violation produces `errors` and the caller must
 * refuse to classify):
 *   - unparseable / wrong-shape runner output (`invalid_input`);
 *   - an observed `[TAG]` that is not a declared probe id
 *     (`unknown_probe_tag`);
 *   - the same tag observed twice (`duplicate_probe_tag`);
 *   - a result that cannot be mapped (Jest `skipped`/`pending`, Flutter
 *     `skipped`) (`unmappable_result`);
 *   - any tag expected for the runner's source that was not observed
 *     (`missing_expected_tag`) — every declared probe id must be produced by
 *     exactly one owning runner (RUNNER_SOURCES).
 *
 * All emitted messages are redacted: absolute paths never leave this module
 * (`<path>`), so provenance stays deterministic and machine-local paths never
 * leak into release evidence.
 */

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  DECLARED_CONTROL_IDS,
  RELEASE_GATE_SCHEMA,
  REQUIRED_BLOCKER_IDS,
  REQUIRED_REGRESSION_IDS,
} from "./loyalty-release-gate.mjs";

/**
 * The expected probe id set per runner source. Every declared probe id is
 * owned by exactly one runner; a runner that fails to observe any expected
 * tag is broken instrumentation, not gate evidence.
 */
export const RUNNER_SOURCES = Object.freeze({
  "jest-backend": Object.freeze([
    "CONTROL-pg-schema", "CONTROL-http",
    "B2", "B3", "B4-pg", "B7-rls-enforcement", "B7-cross-tenant-read",
  ]),
  "flutter-pos": Object.freeze([
    "CONTROL-sqlite-schema", "B9-customer-code", "B1", "B4-sqlite", "B5",
  ]),
});

const REQUIRED_BLOCKER_SET = new Set(REQUIRED_BLOCKER_IDS);
const REQUIRED_REGRESSION_SET = new Set(REQUIRED_REGRESSION_IDS);
const DECLARED_CONTROL_SET = new Set(DECLARED_CONTROL_IDS);
const SOURCES = new Set(Object.keys(RUNNER_SOURCES));

// Matches the first `[TAG]` in a test title. No nested brackets are allowed,
// matching the probe-title convention used by the T1 probe suites.
const TAG_RE = /\[([^\][]+)\]/;

const POSIX_ABS_PATH_RE = /\/(?:\/?[A-Za-z0-9._@+() -]+)*/g;
const WIN_ABS_PATH_RE = /[A-Za-z]:\\(?:[A-Za-z0-9._@+()-]+\\?)+/g;

/**
 * Replaces absolute POSIX/Windows paths with `<path>`. Applied to every
 * emitted message so release evidence never carries machine-local paths.
 *
 * The POSIX pattern is deliberately generous: it covers single-segment
 * paths (`/tmp`), multi-segment paths, and paths containing spaces or
 * parentheses. It may over-redact prose that follows a slash (e.g.
 * "and/or" -> "and<path>", or words following a path); determinism and
 * leak-safety beat diagnostic verbosity, and all messages originate in
 * this module. Windows paths are matched conservatively (no spaces)
 * because backslash separators already terminate the match.
 */
export function redactPaths(text) {
  return String(text)
    .replace(POSIX_ABS_PATH_RE, "<path>")
    .replace(WIN_ABS_PATH_RE, "<path>");
}

/** Contract kind for a probe id, or null when the id is not declared. */
export function kindForProbeId(id) {
  if (REQUIRED_BLOCKER_SET.has(id)) return "blocker";
  if (REQUIRED_REGRESSION_SET.has(id)) return "regression";
  if (DECLARED_CONTROL_SET.has(id)) return "control";
  return null;
}

function unknownSourceError(source) {
  return [{
    code: "unknown_source",
    message: redactPaths(`source must be one of ${Object.keys(RUNNER_SOURCES).join(", ")} (got ${JSON.stringify(source)})`),
  }];
}

/**
 * Shared finalize step: builds the document from observed tags (in
 * observation order) and fails closed on missing expected tags.
 */
function finalizeDocument(source, observed, errors) {
  for (const id of RUNNER_SOURCES[source]) {
    if (!observed.has(id)) {
      errors.push({
        code: "missing_expected_tag",
        probeId: id,
        message: `${source} runner did not observe expected probe [${id}]`,
      });
    }
  }
  const doc = {
    schema: RELEASE_GATE_SCHEMA,
    source,
    probes: [...observed.entries()].map(([id, result]) => ({
      id,
      kind: kindForProbeId(id),
      result,
    })),
  };
  return { doc, errors };
}

/** Records an observed tag or pushes a fail-closed error; returns success. */
function observe(observed, errors, tag, result, origin, title) {
  if (!kindForProbeId(tag)) {
    errors.push({
      code: "unknown_probe_tag",
      message: redactPaths(`probe tag [${tag}] in ${origin} is not a declared release-gate probe id (title: ${title})`),
    });
    return false;
  }
  if (observed.has(tag)) {
    errors.push({
      code: "duplicate_probe_tag",
      probeId: tag,
      message: redactPaths(`probe tag [${tag}] was observed more than once in ${origin}`),
    });
    return false;
  }
  observed.set(tag, result);
  return true;
}

/**
 * Converts Jest `--json` output (JSON text or an already-parsed object) from
 * `source` into a result document. Returns { doc, errors }.
 */
export function collectFromJestJson(input, source) {
  if (!SOURCES.has(source)) {
    return { doc: null, errors: unknownSourceError(source) };
  }
  const errors = [];
  let parsed = input;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      return {
        doc: null,
        errors: [{
          code: "invalid_input",
          message: redactPaths(`cannot parse Jest --json output: ${err instanceof Error ? err.message : String(err)}`),
        }],
      };
    }
  }
  if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.testResults)) {
    return {
      doc: null,
      errors: [{ code: "invalid_input", message: "Jest --json output must be an object with a testResults array" }],
    };
  }

  const observed = new Map();
  for (const testResult of parsed.testResults) {
    const assertions = Array.isArray(testResult?.assertionResults) ? testResult.assertionResults : [];
    for (const assertion of assertions) {
      const name = typeof assertion?.fullName === "string" && assertion.fullName.trim() !== ""
        ? assertion.fullName
        : (typeof assertion?.title === "string" ? assertion.title : null);
      if (name === null) continue;
      const match = name.match(TAG_RE);
      if (!match) continue; // unrelated test without a probe tag
      let result;
      if (assertion.status === "passed") result = "PASS";
      else if (assertion.status === "failed") result = "FAIL";
      else {
        errors.push({
          code: "unmappable_result",
          message: redactPaths(`probe [${match[1]}] has unmappable Jest status ${JSON.stringify(assertion.status)} (skipped/pending probes are broken instrumentation)`),
        });
        continue;
      }
      observe(observed, errors, match[1], result, "Jest output", redactPaths(name));
    }
  }

  return finalizeDocument(source, observed, errors);
}

/**
 * Converts Flutter `--reporter json` output (one JSON event per line) from
 * `source` into a result document. Returns { doc, errors }.
 */
export function collectFromFlutterJson(text, source) {
  if (!SOURCES.has(source)) {
    return { doc: null, errors: unknownSourceError(source) };
  }
  const errors = [];
  const namesById = new Map();
  const observed = new Map();

  for (const line of String(text).split("\n")) {
    if (line.trim() === "") continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      errors.push({
        code: "invalid_input",
        message: redactPaths(`Flutter --reporter json emitted a non-JSON line: ${line.slice(0, 120)}`),
      });
      continue;
    }
    if (event?.type === "testStart" && event.test && Number.isInteger(event.test.id)) {
      namesById.set(event.test.id, typeof event.test.name === "string" ? event.test.name : null);
      continue;
    }
    if (event?.type === "testDone" && Number.isInteger(event.testID)) {
      if (event.hidden === true) continue; // loading/bookkeeping probes
      const name = namesById.get(event.testID) ?? null;
      const match = name === null ? null : name.match(TAG_RE);
      if (!match) continue; // unrelated test without a probe tag
      if (event.skipped === true) {
        errors.push({
          code: "unmappable_result",
          message: `probe [${match[1]}] was skipped by the Flutter runner (skipped probes are broken instrumentation)`,
        });
        continue;
      }
      let result;
      if (event.result === "success") result = "PASS";
      else if (event.result === "failure" || event.result === "error") result = "FAIL";
      else {
        errors.push({
          code: "unmappable_result",
          message: `probe [${match[1]}] has unmappable Flutter result ${JSON.stringify(event.result)}`,
        });
        continue;
      }
      observe(observed, errors, match[1], result, "Flutter output", redactPaths(name));
    }
    // Every other event type (start, suite, group, print, error, done, ...)
    // is reporter bookkeeping and is ignored.
  }

  return finalizeDocument(source, observed, errors);
}

/* ------------------------------- CLI adapter ------------------------------ */

function usage() {
  return [
    "Usage: node scripts/lib/loyalty-release-gate-collect.mjs --source <jest-backend|flutter-pos> --input <runner-output> --output <result.json>",
    "",
    "Converts Jest --json or Flutter --reporter json output into a",
    "loyalty-release-gate/v1 result document. Exit codes: 0 converted,",
    "2 usage error, 3 conversion failed closed (errors printed, no output written).",
  ].join("\n");
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg.startsWith("--")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[i + 1];
      if (value === undefined) return { error: redactPaths(`missing value for ${arg}`) };
      if (!arg.includes("=")) i += 1;
      args[arg.slice(2, arg.indexOf("=") === -1 ? undefined : arg.indexOf("="))] = value;
    } else {
      return { error: redactPaths(`unexpected positional argument ${arg}`) };
    }
  }
  if (!SOURCES.has(args.source)) return { error: `--source must be one of ${Object.keys(RUNNER_SOURCES).join(", ")}` };
  if (!args.input || !args.output) return { error: "--input and --output are required" };
  return { ...args };
}

export function main(argv) {
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${usage()}\nerror: ${parsed.error}\n`);
    return 2;
  }

  let text;
  try {
    text = readFileSync(parsed.input, "utf8");
  } catch (err) {
    process.stderr.write(`${redactPaths(`cannot read runner output ${parsed.input}: ${err instanceof Error ? err.message : String(err)}`)}\n`);
    return 3;
  }

  const { doc, errors } = parsed.source === "flutter-pos"
    ? collectFromFlutterJson(text, parsed.source)
    : collectFromJestJson(text, parsed.source);

  if (errors.length > 0) {
    process.stderr.write(`${JSON.stringify({ source: parsed.source, errors }, null, 2)}\n`);
    return 3;
  }
  writeFileSync(parsed.output, `${JSON.stringify(doc)}\n`);
  process.stderr.write(redactPaths(`converted ${doc.probes.length} probes from ${parsed.source} into ${parsed.output}\n`));
  return 0;
}

function isMainEntry() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isMainEntry()) {
  process.exitCode = main(process.argv.slice(2));
}
