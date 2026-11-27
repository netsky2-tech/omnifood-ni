import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../publish_pos_release.sh", import.meta.url));
const ROOT_DIR = path.resolve(path.dirname(SCRIPT), "..");
const BACKEND_ENV = path.join(ROOT_DIR, "apps", "admin_backend", ".env");

let tmpRoot;
function makeTmpDir() {
  tmpRoot ??= mkdtempSync(path.join(tmpdir(), "publish-pos-release-test-"));
  return tmpRoot;
}

after(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

function createStubBin(name, body) {
  const binDir = mkdtempSync(path.join(makeTmpDir(), `${name}-bin-`));
  const stubPath = path.join(binDir, name);
  writeFileSync(stubPath, `#!/usr/bin/env bash\n${body}\n`, "utf8");
  chmodSync(stubPath, 0o755);
  return binDir;
}

function createDistFixture() {
  const distDir = mkdtempSync(path.join(makeTmpDir(), "dist-"));
  writeFileSync(
    path.join(distDir, "release_manifest.json"),
    JSON.stringify({
      project: "omnifood-pos",
      version: "1.0.0+1",
      git_commit: "abc123",
      build_timestamp: "2026-01-01T00:00:00Z",
      artifacts: [],
    }),
    "utf8",
  );
  return distDir;
}

function buildCleanEnv(extraBinDirs = [], overrides = {}) {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_PUBLIC_URL;
  env.PATH = [...extraBinDirs, env.PATH || "/usr/local/bin:/usr/bin:/bin"].join(":");
  return { ...env, ...overrides };
}

describe("scripts/publish_pos_release.sh (fail-closed DB resolution)", () => {
  it("exits non-zero with clear error when DATABASE_URL/DATABASE_PUBLIC_URL unset and railway fails/unauthenticated (never invokes npx)", (t) => {
    if (!existsSync(BACKEND_ENV)) {
      t.skip("apps/admin_backend/.env not present in workspace");
      return;
    }

    const distDir = createDistFixture();
    const markerFile = path.join(makeTmpDir(), "npx-called-fail.marker");
    const railwayBin = createStubBin(
      "railway",
      'echo "Unauthorized. Please login" >&2\nexit 1',
    );
    const npxBin = createStubBin(
      "npx",
      `touch "${markerFile}"\nexit 0`,
    );

    const res = spawnSync("bash", [SCRIPT, "--dist-dir", distDir], {
      env: buildCleanEnv([railwayBin, npxBin]),
      encoding: "utf8",
    });

    assert.notEqual(res.status, 0, "expected non-zero exit when railway fails");
    assert.match(
      res.stderr,
      /DATABASE_URL|DATABASE_PUBLIC_URL/,
      "expected stderr to explain DATABASE_URL or DATABASE_PUBLIC_URL must be exported",
    );
    assert.equal(
      existsSync(markerFile),
      false,
      "npx publish-release.ts must NOT be invoked when DB resolution fails",
    );
  });

  it("exits non-zero with clear error when railway returns empty DATABASE_PUBLIC_URL (never invokes npx)", (t) => {
    if (!existsSync(BACKEND_ENV)) {
      t.skip("apps/admin_backend/.env not present in workspace");
      return;
    }

    const distDir = createDistFixture();
    const markerFile = path.join(makeTmpDir(), "npx-called-empty.marker");
    const railwayBin = createStubBin("railway", 'echo "{}"\nexit 0');
    const npxBin = createStubBin(
      "npx",
      `touch "${markerFile}"\nexit 0`,
    );

    const res = spawnSync("bash", [SCRIPT, "--dist-dir", distDir], {
      env: buildCleanEnv([railwayBin, npxBin]),
      encoding: "utf8",
    });

    assert.notEqual(res.status, 0, "expected non-zero exit when railway yields empty URL");
    assert.match(res.stderr, /DATABASE_URL|DATABASE_PUBLIC_URL/);
    assert.equal(
      existsSync(markerFile),
      false,
      "npx publish-release.ts must NOT be invoked when railway yields empty URL",
    );
  });

  it("exits non-zero with clear error when DATABASE_URL/DATABASE_PUBLIC_URL unset and railway is missing", (t) => {
    if (!existsSync(BACKEND_ENV)) {
      t.skip("apps/admin_backend/.env not present in workspace");
      return;
    }

    const distDir = createDistFixture();
    const markerFile = path.join(makeTmpDir(), "npx-called-missing.marker");
    // Shadow railway with a non-executable/absent command? Better: construct a minimal PATH with symlinks to needed tools except railway.
    const minimalBin = mkdtempSync(path.join(makeTmpDir(), "minimal-bin-"));
    const npxStub = path.join(minimalBin, "npx");
    writeFileSync(npxStub, `#!/usr/bin/env bash\ntouch "${markerFile}"\nexit 0\n`, "utf8");
    chmodSync(npxStub, 0o755);

    // Check if railway exists in /usr/bin or /usr/local/bin; if not, standard PATH works.
    // To be deterministic even if railway is installed globally, only include dirs that don't have railway or use a sub-test if railway is in /usr/bin.
    const whichRailway = spawnSync("which", ["railway"], { encoding: "utf8" });
    if (whichRailway.status === 0) {
      // Create a wrapper PATH with symlinks to standard /usr/bin & /bin commands excluding railway
      mkdirSync(minimalBin, { recursive: true });
      for (const tool of ["bash", "dirname", "realpath", "sed", "cat"]) {
        const loc = spawnSync("which", [tool], { encoding: "utf8" });
        if (loc.status === 0) {
          const target = loc.stdout.trim();
          spawnSync("ln", ["-sf", target, path.join(minimalBin, tool)]);
        }
      }
      const res = spawnSync("bash", [SCRIPT, "--dist-dir", distDir], {
        env: buildCleanEnv([], { PATH: minimalBin }),
        encoding: "utf8",
      });
      assert.notEqual(res.status, 0);
      assert.match(res.stderr, /DATABASE_URL|DATABASE_PUBLIC_URL/);
      assert.equal(existsSync(markerFile), false);
    } else {
      const res = spawnSync("bash", [SCRIPT, "--dist-dir", distDir], {
        env: buildCleanEnv([minimalBin]),
        encoding: "utf8",
      });
      assert.notEqual(res.status, 0);
      assert.match(res.stderr, /DATABASE_URL|DATABASE_PUBLIC_URL/);
      assert.equal(existsSync(markerFile), false);
    }
  });
});
