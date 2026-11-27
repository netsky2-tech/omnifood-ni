import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  verifyManifestArtifacts,
  resolveRemoteDbConfig,
  connectAndAuditRemoteDb,
  verifyPublishedReleaseRow,
  publishRelease,
} from './publish-release';

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
    expect(match[1]).toBe('1.0.1');
    expect(parseInt(match[2], 10)).toBe(2);

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

describe('resolveRemoteDbConfig (fail-closed remote DB gate)', () => {
  it('throws when both DATABASE_URL and DATABASE_PUBLIC_URL are missing or blank', () => {
    expect(() => resolveRemoteDbConfig({})).toThrow(/DATABASE_URL/);
    expect(() =>
      resolveRemoteDbConfig({ DATABASE_URL: '   ', DATABASE_PUBLIC_URL: '' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('resolves host and port from DATABASE_URL or DATABASE_PUBLIC_URL', () => {
    const fromPrimary = resolveRemoteDbConfig({
      DATABASE_URL:
        'postgresql://postgres:supersecret@caboose.proxy.rlwy.net:12345/railway',
    });
    expect(fromPrimary).toEqual({
      connectionString:
        'postgresql://postgres:supersecret@caboose.proxy.rlwy.net:12345/railway',
      host: 'caboose.proxy.rlwy.net',
      port: '12345',
    });

    const fromPublic = resolveRemoteDbConfig({
      DATABASE_PUBLIC_URL: 'postgresql://user:pass@db.example.com/nhilos',
    });
    expect(fromPublic.host).toBe('db.example.com');
    expect(fromPublic.port).toBe('5432');
  });

  it('rejects localhost, 127.0.0.1, and ::1 unless explicit opt-in is supplied', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(() =>
        resolveRemoteDbConfig({
          DATABASE_URL: `postgresql://user:pass@${host}:5432/omnifood`,
        }),
      ).toThrow(/local database/i);
    }

    expect(() =>
      resolveRemoteDbConfig({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/omnifood',
        ALLOW_LOCAL_RELEASE_DB: '1',
      }),
    ).not.toThrow();

    expect(() =>
      resolveRemoteDbConfig(
        { DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/omnifood' },
        true,
      ),
    ).not.toThrow();
  });
});

describe('connectAndAuditRemoteDb', () => {
  it('logs sanitized host:port/db (schema=...) without leaking credentials', async () => {
    const logs: string[] = [];
    const mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValue({ rows: [{ db: 'railway', schema: 'public' }] }),
      end: jest.fn().mockResolvedValue(undefined),
    };

    const audit = await connectAndAuditRemoteDb(
      mockClient,
      {
        connectionString:
          'postgresql://postgres:SUPER_SECRET_PASS@caboose.proxy.rlwy.net:12345/railway',
        host: 'caboose.proxy.rlwy.net',
        port: '12345',
      },
      (msg) => logs.push(msg),
    );

    expect(audit).toEqual({
      host: 'caboose.proxy.rlwy.net',
      port: '12345',
      database: 'railway',
      schema: 'public',
    });
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('current_database()'),
    );
    const joined = logs.join('\n');
    expect(joined).toContain('caboose.proxy.rlwy.net:12345/railway');
    expect(joined).toContain('(schema=public)');
    expect(joined).not.toContain('SUPER_SECRET_PASS');
  });
});

describe('verifyPublishedReleaseRow (post-publish read-back verification)', () => {
  it('passes when row exists and sha256 + storage_key match', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            version_code: 2042,
            channel: 'production',
            abi: 'arm64-v8a',
            sha256: 'ab'.repeat(32),
            storage_key: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
          },
        ],
      }),
    };

    await expect(
      verifyPublishedReleaseRow(mockClient, {
        channel: 'production',
        abi: 'arm64-v8a',
        versionCode: 2042,
        sha256: 'AB'.repeat(32),
        storageKey: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
      }),
    ).resolves.toBeUndefined();
  });

  it('throws when row is missing', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(
      verifyPublishedReleaseRow(mockClient, {
        channel: 'production',
        abi: 'arm64-v8a',
        versionCode: 2042,
        sha256: 'ab'.repeat(32),
        storageKey: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
      }),
    ).rejects.toThrow(/no row found/i);
  });

  it('throws when sha256 or storage_key mismatches', async () => {
    const mockClientBadSha = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            version_code: 2042,
            channel: 'production',
            abi: 'arm64-v8a',
            sha256: '00'.repeat(32),
            storage_key: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
          },
        ],
      }),
    };

    await expect(
      verifyPublishedReleaseRow(mockClientBadSha, {
        channel: 'production',
        abi: 'arm64-v8a',
        versionCode: 2042,
        sha256: 'ab'.repeat(32),
        storageKey: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
      }),
    ).rejects.toThrow(/sha256 mismatch/i);

    const mockClientBadKey = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            version_code: 2042,
            channel: 'production',
            abi: 'arm64-v8a',
            sha256: 'ab'.repeat(32),
            storage_key: 'releases/pilot/wrong.apk',
          },
        ],
      }),
    };

    await expect(
      verifyPublishedReleaseRow(mockClientBadKey, {
        channel: 'production',
        abi: 'arm64-v8a',
        versionCode: 2042,
        sha256: 'ab'.repeat(32),
        storageKey: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
      }),
    ).rejects.toThrow(/storage_key mismatch/i);
  });
});

describe('publishRelease (fail-closed end-to-end orchestration)', () => {
  function setupManifest(): string {
    const apkName = 'app-arm64-v8a-release.apk';
    writeArtifactFile(apkName, 'fake-apk-bytes');
    const sha = sha256Of(path.join(tempDir, apkName));
    const manifestPath = path.join(tempDir, 'release_manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        project: 'omnifood-pos',
        version: '1.2.3+42',
        git_commit: 'deadbeef',
        build_timestamp: '2026-01-01T00:00:00Z',
        artifacts: [makeArtifact(apkName, sha)],
      }),
      'utf8',
    );
    return manifestPath;
  }

  const baseEnv = {
    R2_ENDPOINT: 'https://r2.example.com',
    R2_BUCKET_NAME: 'nhilos-pos',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
  };

  it('aborts with zero R2 uploads and zero DB writes when DATABASE_URL/DATABASE_PUBLIC_URL is missing', async () => {
    const manifestPath = setupManifest();
    const uploadToR2 = jest.fn();
    const createPgClient = jest.fn();
    const logs: string[] = [];

    await expect(
      publishRelease(
        {
          manifestPath,
          channel: 'production',
          minFromVersionCode: 1,
          mandatory: false,
          allowLocalDb: false,
        },
        {
          env: { ...baseEnv },
          createPgClient,
          uploadToR2,
          log: (m) => logs.push(m),
        },
      ),
    ).rejects.toThrow(/DATABASE_URL/);

    expect(uploadToR2).not.toHaveBeenCalled();
    expect(createPgClient).not.toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain(
      'ALL RELEASE ARTIFACTS PUBLISHED SUCCESSFULLY',
    );
  });

  it('aborts with zero R2 uploads and no local fallback when remote DB connection fails', async () => {
    const manifestPath = setupManifest();
    const uploadToR2 = jest.fn();
    const mockClient = {
      connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      query: jest.fn(),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const logs: string[] = [];

    await expect(
      publishRelease(
        {
          manifestPath,
          channel: 'production',
          minFromVersionCode: 1,
          mandatory: false,
          allowLocalDb: false,
        },
        {
          env: {
            ...baseEnv,
            DATABASE_URL: 'postgresql://user:pass@remote.db:5432/railway',
          },
          createPgClient: () => mockClient,
          uploadToR2,
          log: (m) => logs.push(m),
        },
      ),
    ).rejects.toThrow(/ECONNREFUSED/);

    expect(uploadToR2).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(mockClient.end).toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain(
      'ALL RELEASE ARTIFACTS PUBLISHED SUCCESSFULLY',
    );
  });

  it('aborts without printing success banner when post-publish read-back verification fails', async () => {
    const manifestPath = setupManifest();
    const uploadToR2 = jest.fn().mockResolvedValue(undefined);
    const mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        // 1. audit query
        .mockResolvedValueOnce({ rows: [{ db: 'railway', schema: 'public' }] })
        // 2. upsert query
        .mockResolvedValueOnce({ rows: [] })
        // 3. read-back SELECT returns empty (missing row!)
        .mockResolvedValueOnce({ rows: [] }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const logs: string[] = [];

    await expect(
      publishRelease(
        {
          manifestPath,
          channel: 'production',
          minFromVersionCode: 1,
          mandatory: false,
          allowLocalDb: false,
        },
        {
          env: {
            ...baseEnv,
            DATABASE_URL: 'postgresql://user:pass@remote.db:5432/railway',
          },
          createPgClient: () => mockClient,
          uploadToR2,
          log: (m) => logs.push(m),
        },
      ),
    ).rejects.toThrow(/no row found/i);

    expect(uploadToR2).toHaveBeenCalledTimes(1);
    expect(mockClient.end).toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain(
      'ALL RELEASE ARTIFACTS PUBLISHED SUCCESSFULLY',
    );
  });

  it('prints success banner only after upload, upsert, and read-back verification succeed', async () => {
    const manifestPath = setupManifest();
    const expectedSha = sha256Of(
      path.join(tempDir, 'app-arm64-v8a-release.apk'),
    );
    const uploadToR2 = jest.fn().mockResolvedValue(undefined);
    const mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ db: 'railway', schema: 'public' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              version_code: 2042,
              channel: 'production',
              abi: 'arm64-v8a',
              sha256: expectedSha,
              storage_key: 'releases/production/nhilos-pos-arm64-v8a-2042.apk',
            },
          ],
        }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const logs: string[] = [];

    await publishRelease(
      {
        manifestPath,
        channel: 'production',
        minFromVersionCode: 1,
        mandatory: false,
        allowLocalDb: false,
      },
      {
        env: {
          ...baseEnv,
          DATABASE_URL: 'postgresql://user:pass@remote.db:5432/railway',
        },
        createPgClient: () => mockClient,
        uploadToR2,
        log: (m) => logs.push(m),
      },
    );

    expect(uploadToR2).toHaveBeenCalledTimes(1);
    expect(mockClient.end).toHaveBeenCalled();
    expect(logs.join('\n')).toContain(
      'ALL RELEASE ARTIFACTS PUBLISHED SUCCESSFULLY',
    );
  });
});
