import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifyManifestArtifacts } from './publish-release';

describe('publish-release ABI and version derivation', () => {
  function deriveAbiAndVersionCode(
    filename: string,
    baseBuildNumber: number,
  ): { abi: string; versionCode: number } {
    if (filename.includes('arm64-v8a')) {
      return { abi: 'arm64-v8a', versionCode: 2000 + baseBuildNumber };
    } else if (filename.includes('armeabi-v7a')) {
      return { abi: 'armeabi-v7a', versionCode: 1000 + baseBuildNumber };
    } else if (filename.includes('x86_64')) {
      return { abi: 'x86_64', versionCode: 4000 + baseBuildNumber };
    } else {
      return { abi: 'universal', versionCode: baseBuildNumber };
    }
  }

  it('correctly maps arm64-v8a APK to 2000 + buildNumber (Q80 terminal target)', () => {
    const result = deriveAbiAndVersionCode('app-arm64-v8a-release.apk', 2);
    expect(result.abi).toBe('arm64-v8a');
    expect(result.versionCode).toBe(2002);
  });

  it('correctly maps armeabi-v7a APK to 1000 + buildNumber', () => {
    const result = deriveAbiAndVersionCode('app-armeabi-v7a-release.apk', 2);
    expect(result.abi).toBe('armeabi-v7a');
    expect(result.versionCode).toBe(1002);
  });

  it('correctly maps x86_64 APK to 4000 + buildNumber', () => {
    const result = deriveAbiAndVersionCode('app-x86_64-release.apk', 2);
    expect(result.abi).toBe('x86_64');
    expect(result.versionCode).toBe(4002);
  });

  it('maps universal APK to base buildNumber', () => {
    const result = deriveAbiAndVersionCode('app-release.apk', 2);
    expect(result.abi).toBe('universal');
    expect(result.versionCode).toBe(2);
  });

  it('validates standard Flutter pubspec version regex', () => {
    const valid = '1.0.1+2';
    const match = valid.match(/^([0-9.]+)\+([0-9]+)$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('1.0.1');
    expect(parseInt(match![2], 10)).toBe(2);

    const invalid = '1.0.1';
    expect(invalid.match(/^([0-9.]+)\+([0-9]+)$/)).toBeNull();
  });
});

interface SpecArtifact {
  file: string;
  size_bytes: number;
  size_human: string;
  sha256: string;
}

let tempDir: string;

function sha256Of(filePath: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

function writeArtifactFile(fileName: string, content: string): void {
  fs.writeFileSync(path.join(tempDir, fileName), content, 'utf8');
}

function makeArtifact(fileName: string, sha256: string): SpecArtifact {
  return {
    file: fileName,
    size_bytes: Buffer.byteLength(
      fs.readFileSync(path.join(tempDir, fileName)),
    ),
    size_human: '1.0 KB',
    sha256,
  };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-release-spec-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('verifyManifestArtifacts (fail-closed manifest digest gate)', () => {
  it('resolves when every artifact exists and its sha256 matches the manifest', () => {
    writeArtifactFile('app-arm64.apk', 'fresh-bytes-arm64');
    writeArtifactFile('app-armv7.apk', 'fresh-bytes-armv7');
    const artifacts: SpecArtifact[] = [
      makeArtifact(
        'app-arm64.apk',
        sha256Of(path.join(tempDir, 'app-arm64.apk')),
      ),
      makeArtifact(
        'app-armv7.apk',
        sha256Of(path.join(tempDir, 'app-armv7.apk')),
      ),
    ];

    expect(() => verifyManifestArtifacts(tempDir, artifacts)).not.toThrow();
  });

  it('throws mentioning the file, both digest prefixes and staleness when the sha256 mismatches', () => {
    // Simulates the incident: file rebuilt after the manifest was generated.
    writeArtifactFile('app-arm64.apk', 'rebuilt-bytes-that-no-longer-match');
    const artifacts: SpecArtifact[] = [
      makeArtifact('app-arm64.apk', 'a'.repeat(64)),
    ];

    expect(() => verifyManifestArtifacts(tempDir, artifacts)).toThrow(
      /app-arm64\.apk/,
    );
    expect(() => verifyManifestArtifacts(tempDir, artifacts)).toThrow(
      /Manifest sha256 prefix: a{8}/,
    );
    expect(() => verifyManifestArtifacts(tempDir, artifacts)).toThrow(
      /actual sha256 prefix: [0-9a-f]{8}/,
    );
    expect(() => verifyManifestArtifacts(tempDir, artifacts)).toThrow(/stale/);
  });

  it('throws mentioning the file when the artifact is missing on disk', () => {
    const artifacts: SpecArtifact[] = [
      {
        file: 'app-x86_64.apk',
        size_bytes: 123,
        size_human: '123 B',
        sha256: 'b'.repeat(64),
      },
    ];

    expect(() => verifyManifestArtifacts(tempDir, artifacts)).toThrow(
      /app-x86_64\.apk/,
    );
  });

  it('compares digests case-insensitively (uppercase manifest digest still passes)', () => {
    writeArtifactFile('app-arm64.apk', 'case-insensitive-bytes');
    const lower = sha256Of(path.join(tempDir, 'app-arm64.apk'));
    const artifacts: SpecArtifact[] = [
      makeArtifact('app-arm64.apk', lower.toUpperCase()),
    ];

    expect(() => verifyManifestArtifacts(tempDir, artifacts)).not.toThrow();
  });

  it('checks every artifact before resolving, failing on the first bad entry', () => {
    writeArtifactFile('good.apk', 'good-bytes');
    const artifacts: SpecArtifact[] = [
      makeArtifact('good.apk', sha256Of(path.join(tempDir, 'good.apk'))),
      {
        file: 'missing.apk',
        size_bytes: 0,
        size_human: '0 B',
        sha256: 'c'.repeat(64),
      },
    ];

    expect(() => verifyManifestArtifacts(tempDir, artifacts)).toThrow(
      /missing\.apk/,
    );
  });
});
