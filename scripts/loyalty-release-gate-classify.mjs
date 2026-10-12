#!/usr/bin/env node
/**
 * CLI adapter for the Loyalty V1 release-gate classifier.
 *
 * Usage: node scripts/loyalty-release-gate-classify.mjs --mode <baseline|final> <result.json> [...]
 *
 * Reads loyalty-release-gate/v1 probe-result documents, prints a
 * machine-readable JSON summary on stdout, and exits 0 gate_held,
 * 1 gate_failed, 2 usage error, 3 input_invalid. All contract and
 * classification logic lives in scripts/lib/loyalty-release-gate.mjs; this
 * module re-exports the core public API so existing imports stay compatible.
 */

import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  classifyReleaseGate,
  deriveGateStatus,
  GATE_MODES,
  RELEASE_GATE_SCHEMA,
  REQUIRED_BLOCKER_IDS,
} from "./lib/loyalty-release-gate.mjs";

export { classifyReleaseGate, RELEASE_GATE_SCHEMA, REQUIRED_BLOCKER_IDS };

function usage() {
  return [
    "Usage: node scripts/loyalty-release-gate-classify.mjs --mode <baseline|final> <result.json> [<result.json> ...]",
    "",
    "Classifies loyalty-release-gate/v1 probe-result documents.",
    "Exit codes: 0 gate_held, 1 gate_failed, 2 usage error, 3 input_invalid.",
    "Prints a machine-readable JSON summary on stdout.",
  ].join("\n");
}

function parseArgs(argv) {
  const files = [];
  let mode = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--mode") {
      mode = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
    } else if (arg.startsWith("--")) {
      return { error: `unknown option ${arg}` };
    } else {
      files.push(arg);
    }
  }
  if (mode === null || !GATE_MODES.includes(mode)) {
    return { error: `--mode must be baseline or final (got ${JSON.stringify(mode)})` };
  }
  if (files.length === 0) return { error: "missing at least one result file" };
  return { mode, files };
}

function readResultFile(path) {
  try {
    return { doc: JSON.parse(readFileSync(path, "utf8")), path };
  } catch (err) {
    return {
      doc: null,
      path,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${usage()}\nerror: ${parsed.error}\n`);
    return 2;
  }

  const documents = [];
  const inputErrors = [];
  for (const entry of parsed.files.map(readResultFile)) {
    if (entry.error !== undefined) {
      inputErrors.push({
        code: "unreadable_file",
        file: entry.path,
        message: `cannot read or parse result file: ${entry.error}`,
      });
    } else {
      // Preserve the parsed value's shape: spreading a scalar/array/null would
      // erase it, and diagnostics must explicitly say the document must be an
      // object. Only plain objects gain `file` provenance here.
      const parsed = entry.doc;
      documents.push(
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? { ...parsed, file: entry.path }
          : parsed,
      );
    }
  }

  const summary = classifyReleaseGate(documents, parsed.mode);
  summary.errors = [...inputErrors, ...summary.errors];
  summary.status = deriveGateStatus(summary.errors);
  summary.ok = summary.errors.length === 0;

  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.status === "gate_held") return 0;
  return summary.status === "input_invalid" ? 3 : 1;
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
