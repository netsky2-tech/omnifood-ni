import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  collectFromFlutterJson,
  collectFromJestJson,
  kindForProbeId,
  redactPaths,
  RUNNER_SOURCES,
} from "../lib/loyalty-release-gate-collect.mjs";
import {
  RELEASE_GATE_SCHEMA,
  REQUIRED_BLOCKER_IDS,
} from "../lib/loyalty-release-gate.mjs";

const codesOf = (errors) => errors.map((e) => e.code);

/** Minimal but structurally faithful Jest `--json` output. */
function jestDoc(assertions) {
  return JSON.stringify({
    numTotalTests: assertions.length,
    testResults: [
      {
        name: "/repo/apps/admin_backend/test/loyalty/release-probes/storage-baseline.db.probe.spec.ts",
        assertionResults: assertions.map(([fullName, status]) => ({
          ancestorTitles: ["T1 storage baseline (release probes)"],
          fullName,
          title: fullName.replace(/^.*?(?=\[)/, ""),
          status,
        })),
      },
    ],
  });
}

/** Minimal but structurally faithful Flutter `--reporter json` event stream. */
function flutterStream(events) {
  const lines = [
    JSON.stringify({ protocolVersion: "0.1.0", pid: 4242, type: "start", time: 0 }),
  ];
  for (const [type, payload] of events) {
    lines.push(JSON.stringify({ type, time: lines.length, ...payload }));
  }
  lines.push(JSON.stringify({ type: "done", success: false, time: lines.length }));
  return `${lines.join("\n")}\n`;
}

const flutterTestStartDone = (id, name, result, extra = {}) => [
  ["testStart", { test: { id, name, suiteID: 1 } }],
  ["testDone", { testID: id, result, hidden: false, ...extra }],
];

const conformingJestText = () => jestDoc([
  ["T1 storage baseline (release probes) [CONTROL-pg-schema] the full migration set builds the Loyalty storage surface", "passed"],
  ["T1 storage baseline (release probes) [B4-pg] PostgreSQL rejects a duplicate loyalty idempotency identity", "failed"],
  ["T1 storage baseline (release probes) [B7-rls-enforcement] every Loyalty tenant table is RLS ENABLE+FORCEd", "failed"],
  ["T1 storage baseline (release probes) [B7-cross-tenant-read] a restricted tenant-scoped session cannot read another tenant's loyalty rows", "failed"],
  ["T1 sync-boundary baseline (release probes) [CONTROL-http] the app/auth harness reaches the existing POST /api/v1/sync/batch", "passed"],
  ["T1 sync-boundary baseline (release probes) [B2] the generic inbound sync endpoint carries the tenant-scoped Loyalty configuration stream", "failed"],
  ["T1 sync-boundary baseline (release probes) [B3] the POST /api/v1/sync/batch envelope accepts and dispatches the LOYALTY_LEDGER flow", "failed"],
]);

const conformingFlutterText = () => flutterStream([
  ["suite", { suite: { id: 1, platform: "vm", path: "/repo/apps/pos_app/test/e2e/loyalty_release_isolation_e2e_test.dart" } }],
  ["group", { group: { id: 2, suiteID: 1, name: "Loyalty release harness — migrated file-backed SQLite baseline" } }],
  ...flutterTestStartDone(3, "Loyalty release harness — migrated file-backed SQLite baseline [CONTROL-sqlite-schema] migrations 10->54 build the Loyalty schema and it survives close/reopen", "success"),
  ...flutterTestStartDone(4, "Loyalty release harness — migrated file-backed SQLite baseline [B4-sqlite] migrated SQLite rejects two ledger movements with distinct ids sharing one idempotency key", "failure"),
  ...flutterTestStartDone(5, "Loyalty release harness — migrated file-backed SQLite baseline [B9-customer-code] migrated customers table supports real CustomerDao save/read by customer_code", "success"),
  ...flutterTestStartDone(6, "Loyalty release harness — B1 device-tenant evaluation baseline [B1] production evaluation path finds the program seeded under the device tenant, never under the customer id", "failure"),
  ["suite", { suite: { id: 7, platform: "vm", path: "/repo/apps/pos_app/test/e2e/loyalty_release_void_e2e_test.dart" } }],
  ...flutterTestStartDone(8, "[B5] real void appends exact append-only Loyalty reversals and keeps the invoice canceled, never deleted", "failure"),
]);

const expectedJestProbes = [
  { id: "CONTROL-pg-schema", kind: "control", result: "PASS" },
  { id: "B4-pg", kind: "blocker", result: "FAIL" },
  { id: "B7-rls-enforcement", kind: "blocker", result: "FAIL" },
  { id: "B7-cross-tenant-read", kind: "blocker", result: "FAIL" },
  { id: "CONTROL-http", kind: "control", result: "PASS" },
  { id: "B2", kind: "blocker", result: "FAIL" },
  { id: "B3", kind: "blocker", result: "FAIL" },
];

const expectedFlutterProbes = [
  { id: "CONTROL-sqlite-schema", kind: "control", result: "PASS" },
  { id: "B4-sqlite", kind: "blocker", result: "FAIL" },
  { id: "B9-customer-code", kind: "regression", result: "PASS" },
  { id: "B1", kind: "blocker", result: "FAIL" },
  { id: "B5", kind: "blocker", result: "FAIL" },
];

describe("runner source contract", () => {
  it("partitions every declared probe id across exactly two runners", () => {
    const all = [...RUNNER_SOURCES["jest-backend"], ...RUNNER_SOURCES["flutter-pos"]].sort();
    const declared = [...REQUIRED_BLOCKER_IDS, "B9-customer-code",
      "CONTROL-pg-schema", "CONTROL-http", "CONTROL-sqlite-schema"].sort();
    assert.deepEqual(all, declared);
  });
});

describe("kindForProbeId", () => {
  it("maps every declared id to its contract kind", () => {
    assert.equal(kindForProbeId("B1"), "blocker");
    assert.equal(kindForProbeId("B7-cross-tenant-read"), "blocker");
    assert.equal(kindForProbeId("B9-customer-code"), "regression");
    assert.equal(kindForProbeId("CONTROL-sqlite-schema"), "control");
  });

  it("returns null for undeclared ids", () => {
    assert.equal(kindForProbeId("B99"), null);
    assert.equal(kindForProbeId("B7"), null);
    assert.equal(kindForProbeId(""), null);
  });
});

describe("collectFromJestJson", () => {
  it("converts a conforming backend run into a contract document", () => {
    const { doc, errors } = collectFromJestJson(conformingJestText(), "jest-backend");
    assert.deepEqual(errors, []);
    assert.deepEqual(doc, {
      schema: RELEASE_GATE_SCHEMA,
      source: "jest-backend",
      probes: expectedJestProbes,
    });
  });

  it("ignores unrelated tests without a [TAG] title", () => {
    const parsed = JSON.parse(conformingJestText());
    parsed.testResults[0].assertionResults.push({
      ancestorTitles: [], fullName: "a completely unrelated unit test", title: "unrelated", status: "passed",
    });
    const { doc, errors } = collectFromJestJson(JSON.stringify(parsed), "jest-backend");
    assert.deepEqual(errors, []);
    assert.deepEqual(doc.probes, expectedJestProbes);
  });

  it("fails closed on an unknown probe tag", () => {
    const parsed = JSON.parse(conformingJestText());
    parsed.testResults[0].assertionResults.push({
      ancestorTitles: [], fullName: "[B99] not a declared probe", title: "[B99]", status: "failed",
    });
    const { doc, errors } = collectFromJestJson(JSON.stringify(parsed), "jest-backend");
    assert.ok(errors.length > 0);
    assert.ok(codesOf(errors).includes("unknown_probe_tag"));
    assert.ok(doc === null || doc.probes.length === expectedJestProbes.length);
  });

  it("fails closed when an expected backend tag is not observed", () => {
    const parsed = JSON.parse(conformingJestText());
    parsed.testResults[0].assertionResults = parsed.testResults[0].assertionResults
      .filter((a) => !a.fullName.includes("[B3]"));
    const { errors } = collectFromJestJson(JSON.stringify(parsed), "jest-backend");
    assert.ok(codesOf(collectErrs(errors)).includes("missing_expected_tag"));
  });

  it("fails closed on a duplicate probe tag", () => {
    const parsed = JSON.parse(conformingJestText());
    parsed.testResults[0].assertionResults.push({ ...parsed.testResults[0].assertionResults[1] });
    const { errors } = collectFromJestJson(JSON.stringify(parsed), "jest-backend");
    assert.ok(codesOf(collectErrs(errors)).includes("duplicate_probe_tag"));
  });

  it("fails closed on an unmappable status (skipped/pending probes are broken instrumentation)", () => {
    const parsed = JSON.parse(conformingJestText());
    parsed.testResults[0].assertionResults[1].status = "skipped";
    const { errors } = collectFromJestJson(JSON.stringify(parsed), "jest-backend");
    assert.ok(codesOf(collectErrs(errors)).includes("unmappable_result"));
  });

  it("fails closed on invalid or non-object Jest JSON", () => {
    for (const bad of ["{not-json", "42", "{}"]) {
      const { errors } = collectFromJestJson(bad, "jest-backend");
      assert.ok(errors.some((e) => e.code === "invalid_input"), bad);
    }
  });

  it("fails closed on an unknown source", () => {
    const { errors } = collectFromJestJson(conformingJestText(), "pytest");
    assert.ok(codesOf(collectErrs(errors)).includes("unknown_source"));
  });

  it("is deterministic for identical input", () => {
    const a = collectFromJestJson(conformingJestText(), "jest-backend");
    const b = collectFromJestJson(conformingJestText(), "jest-backend");
    assert.deepEqual(a, b);
  });
});

describe("collectFromFlutterJson", () => {
  it("converts a conforming POS run into a contract document", () => {
    const { doc, errors } = collectFromFlutterJson(conformingFlutterText(), "flutter-pos");
    assert.deepEqual(errors, []);
    assert.deepEqual(doc, {
      schema: RELEASE_GATE_SCHEMA,
      source: "flutter-pos",
      probes: expectedFlutterProbes,
    });
  });

  it("ignores reporter bookkeeping events and hidden done events", () => {
    const stream = flutterStream([
      ["suite", { suite: { id: 1, platform: "vm", path: "/repo/apps/pos_app/test/e2e/loyalty_release_isolation_e2e_test.dart" } }],
      ...flutterTestStartDone(2, "loading /repo/apps/pos_app/test/e2e/loyalty_release_isolation_e2e_test.dart", "success", { hidden: true }),
      ...flutterTestStartDone(3, "Loyalty release harness — B1 device-tenant evaluation baseline [B1] production evaluation path finds the program seeded under the device tenant, never under the customer id", "failure"),
      ["print", { message: "[B5] baseline: void does not write loyalty reversals" }],
      ["error", { error: "some suite-level noise", isFailure: false }],
    ]);
    const { doc, errors } = collectFromFlutterJson(stream, "flutter-pos");
    assert.deepEqual(doc.probes, [{ id: "B1", kind: "blocker", result: "FAIL" }]);
    // The only failures are the expected tags this trimmed stream never ran.
    assert.ok(errors.every((e) => e.code === "missing_expected_tag"));
    assert.equal(errors.length, RUNNER_SOURCES["flutter-pos"].length - 1);
  });

  it("fails closed on a skipped probe", () => {
    const stream = flutterStream(flutterTestStartDone(1, "[B5] real void appends exact append-only Loyalty reversals", "success", { skipped: true }));
    const { errors } = collectFromFlutterJson(stream, "flutter-pos");
    assert.ok(codesOf(collectErrs(errors)).includes("unmappable_result"));
  });

  it("fails closed on an unknown probe tag", () => {
    const stream = flutterStream(flutterTestStartDone(1, "[B42] bogus probe", "failure"));
    const { errors } = collectFromFlutterJson(stream, "flutter-pos");
    assert.ok(codesOf(collectErrs(errors)).includes("unknown_probe_tag"));
  });

  it("fails closed when an expected POS tag is not observed", () => {
    const { errors } = collectFromFlutterJson(flutterStream([
      ...flutterTestStartDone(1, "[B5] real void appends exact append-only Loyalty reversals", "failure"),
    ]), "flutter-pos");
    const codes = codesOf(collectErrs(errors));
    assert.ok(codes.includes("missing_expected_tag"));
    // One error per missing expected tag.
    assert.equal(codes.filter((c) => c === "missing_expected_tag").length,
      RUNNER_SOURCES["flutter-pos"].length - 1);
  });

  it("fails closed on a non-JSON line with a redacted path", () => {
    const text = `${conformingFlutterText()}flutter: warning: /home/dev/.pub-cache/some/thing.dart mentioned\n`;
    const { errors } = collectFromFlutterJson(text, "flutter-pos");
    assert.ok(errors.some((e) => e.code === "invalid_input"));
    const serialized = JSON.stringify(errors);
    assert.ok(!serialized.includes("/home/dev"), serialized);
    assert.ok(serialized.includes("<path>"), serialized);
  });

  it("fails closed on an unknown source", () => {
    const { errors } = collectFromFlutterJson(conformingFlutterText(), "gradle");
    assert.ok(codesOf(collectErrs(errors)).includes("unknown_source"));
  });

  it("is deterministic for identical input", () => {
    const a = collectFromFlutterJson(conformingFlutterText(), "flutter-pos");
    const b = collectFromFlutterJson(conformingFlutterText(), "flutter-pos");
    assert.deepEqual(a, b);
  });
});

describe("redactPaths", () => {
  it("redacts POSIX and Windows absolute paths", () => {
    assert.equal(redactPaths("failed in /home/dev/secret/probe.spec.ts:12"), "failed in <path>:12");
    assert.equal(redactPaths("C:\\Users\\dev\\test.dart broke"), "<path> broke");
    assert.equal(redactPaths("no paths here"), "no paths here");
  });

  it("redacts single-segment POSIX absolute paths", () => {
    assert.equal(redactPaths("wrote evidence to /tmp"), "wrote evidence to <path>");
    assert.equal(redactPaths("/"), "<path>");
  });

  it("redacts POSIX paths containing spaces and parentheses", () => {
    // Documented over-redaction: trailing prose after a path is swallowed.
    assert.equal(
      redactPaths("run in /tmp/My Folder (1)/result.json now"),
      "run in <path>",
    );
    assert.equal(redactPaths("/tmp/My Folder (1)"), "<path>");
  });

  it("redacts Windows paths containing parentheses", () => {
    assert.equal(redactPaths("C:\\Users\\Dev(1)\\a.json broke"), "<path> broke");
  });

  it("documents the deliberate over-redaction of prose slashes (leak-safety over verbosity)", () => {
    assert.equal(redactPaths("and/or"), "and<path>");
  });

  it("never leaks absolute paths into emitted error messages", () => {
    const parsed = JSON.parse(conformingJestText());
    parsed.testResults[0].assertionResults.push({
      ancestorTitles: [],
      fullName: "[B99] bogus probe run from /home/octavio/omnifood-ni-worktrees/loyalty-v1-readiness/apps/admin_backend",
      title: "[B99]",
      status: "failed",
    });
    const { errors } = collectFromJestJson(JSON.stringify(parsed), "jest-backend");
    const serialized = JSON.stringify(errors);
    assert.ok(!serialized.includes("/home/octavio"), serialized);
    assert.ok(serialized.includes("<path>"), serialized);
  });
});

// Small helper kept at the bottom so every assertion above reads as the
// contract, not the plumbing: errors are always an array of {code, message}.
function collectErrs(errors) {
  return Array.isArray(errors) ? errors : [];
}
