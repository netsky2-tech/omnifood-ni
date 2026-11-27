/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-base-to-string */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import { Client } from 'pg';

export interface ManifestArtifact {
  file: string;
  size_bytes: number;
  size_human: string;
  sha256: string;
}

export interface ReleaseManifestJson {
  project: string;
  version: string;
  git_commit: string;
  build_timestamp: string;
  artifacts: ManifestArtifact[];
}

export interface PublishCliOptions {
  manifestPath: string;
  channel: string;
  minFromVersionCode: number;
  notes?: string;
  mandatory: boolean;
  allowLocalDb: boolean;
}

export interface RemoteDbTarget {
  connectionString: string;
  host: string;
  port: string;
}

export interface RemoteDbAuditInfo {
  host: string;
  port: string;
  database: string;
  schema: string;
}

export interface PgClientLike {
  connect(): Promise<void>;
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export interface PublishReleaseDeps {
  env?: Record<string, string | undefined>;
  createPgClient?: (connectionString: string) => PgClientLike;
  uploadToR2?: (params: {
    endpoint: string;
    bucket: string;
    key: string;
    accessKeyId: string;
    secretAccessKey: string;
    filePath: string;
  }) => Promise<void>;
  log?: (message: string) => void;
}

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function resolveRemoteDbConfig(
  env: Record<string, string | undefined>,
  allowLocalDb = false,
): RemoteDbTarget {
  const rawUrl =
    env.DATABASE_URL?.trim() || env.DATABASE_PUBLIC_URL?.trim() || '';

  if (!rawUrl) {
    throw new Error(
      'Missing remote database URL: set DATABASE_URL or DATABASE_PUBLIC_URL (local .env fallback is disabled).',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      'Invalid DATABASE_URL / DATABASE_PUBLIC_URL format: unable to parse connection URL.',
    );
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = parsed.port || '5432';

  if (!host) {
    throw new Error(
      'Invalid DATABASE_URL / DATABASE_PUBLIC_URL: missing database host.',
    );
  }

  const localOptIn = allowLocalDb || env.ALLOW_LOCAL_RELEASE_DB === '1';
  if (LOCAL_DB_HOSTS.has(host) && !localOptIn) {
    throw new Error(
      `Refusing to publish release to local database host "${host}". ` +
        'Set ALLOW_LOCAL_RELEASE_DB=1 or pass --allow-local-db for controlled local testing.',
    );
  }

  return {
    connectionString: rawUrl,
    host,
    port,
  };
}

export async function connectAndAuditRemoteDb(
  client: PgClientLike,
  target: RemoteDbTarget,
  logFn: (message: string) => void = console.log,
): Promise<RemoteDbAuditInfo> {
  await client.connect();
  const res = await client.query(
    'SELECT current_database() AS db, current_schema() AS schema',
  );
  const row = res.rows[0] ?? {};
  const database = String(row.db ?? '');
  const schema = String(row.schema ?? '');

  logFn(
    `✓ Connected to remote database: ${target.host}:${target.port}/${database} (schema=${schema})`,
  );

  return {
    host: target.host,
    port: target.port,
    database,
    schema,
  };
}

export async function verifyPublishedReleaseRow(
  client: Pick<PgClientLike, 'query'>,
  expected: {
    channel: string;
    abi: string;
    versionCode: number;
    sha256: string;
    storageKey: string;
  },
): Promise<void> {
  const selectSql = `
    SELECT version_code, channel, abi, sha256, storage_key
    FROM app_releases
    WHERE channel = $1 AND abi = $2 AND version_code = $3
  `;
  const res = await client.query(selectSql, [
    expected.channel,
    expected.abi,
    expected.versionCode,
  ]);

  if (!res.rows || res.rows.length === 0) {
    throw new Error(
      `Post-publish verification failed: no row found in app_releases for ` +
        `channel=${expected.channel}, abi=${expected.abi}, version_code=${expected.versionCode}.`,
    );
  }

  const row = res.rows[0];
  const actualSha = String(row.sha256 ?? '').toLowerCase();
  const expectedSha = expected.sha256.toLowerCase();
  if (actualSha !== expectedSha) {
    throw new Error(
      `Post-publish verification failed: sha256 mismatch for ` +
        `channel=${expected.channel}, abi=${expected.abi}, version_code=${expected.versionCode} ` +
        `(expected ${expectedSha.slice(0, 12)}..., got ${actualSha.slice(0, 12)}...).`,
    );
  }

  const actualKey = String(row.storage_key ?? '');
  if (actualKey !== expected.storageKey) {
    throw new Error(
      `Post-publish verification failed: storage_key mismatch for ` +
        `channel=${expected.channel}, abi=${expected.abi}, version_code=${expected.versionCode} ` +
        `(expected ${expected.storageKey}, got ${actualKey}).`,
    );
  }

  const actualVersionCode = Number(row.version_code);
  const actualChannel = String(row.channel ?? '');
  const actualAbi = String(row.abi ?? '');
  if (
    actualVersionCode !== expected.versionCode ||
    actualChannel !== expected.channel ||
    actualAbi !== expected.abi
  ) {
    throw new Error(
      `Post-publish verification failed: identity mismatch in app_releases row.`,
    );
  }
}

function parseCliArgs(): PublishCliOptions {
  const args = process.argv.slice(2);
  let manifestPath = '';
  let channel = 'pilot';
  let minFromVersionCode = 1;
  let notes: string | undefined;
  let mandatory = false;
  let allowLocalDb = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--manifest' && i + 1 < args.length) {
      manifestPath = args[++i];
    } else if (arg === '--channel' && i + 1 < args.length) {
      channel = args[++i];
    } else if (arg === '--min-from' && i + 1 < args.length) {
      minFromVersionCode = parseInt(args[++i], 10);
    } else if (arg === '--notes' && i + 1 < args.length) {
      notes = args[++i];
    } else if (arg === '--mandatory') {
      mandatory = true;
    } else if (arg === '--allow-local-db') {
      allowLocalDb = true;
    }
  }

  if (!manifestPath) {
    console.error(
      'Error: --manifest <path/to/release_manifest.json> is required.',
    );
    process.exit(1);
  }

  return {
    manifestPath,
    channel,
    minFromVersionCode,
    notes,
    mandatory,
    allowLocalDb,
  };
}

function deriveAbiAndVersionCode(
  filename: string,
  baseVersionName: string,
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

function hmac(key: Buffer | string, string: string): Buffer {
  return crypto.createHmac('sha256', key).update(string, 'utf8').digest();
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Fail-closed manifest digest gate.
 *
 * Verifies every artifact entry against the actual bytes on disk BEFORE any
 * upload or database write. Guards against the incident where a stale
 * release_manifest.json (generated by an older build) was used to publish
 * freshly rebuilt APKs whose bytes no longer matched the manifest, causing
 * the registry to record stale version/sha data.
 */
export function verifyManifestArtifacts(
  manifestDir: string,
  artifacts: ManifestArtifact[],
): void {
  for (const artifact of artifacts) {
    const artifactPath = path.join(manifestDir, artifact.file);
    if (!fs.existsSync(artifactPath)) {
      throw new Error(
        `Artifact missing on disk: ${artifactPath}. ` +
          'Rebuild with build_pos_apk.sh before publishing.',
      );
    }

    const actualDigest = sha256Hex(fs.readFileSync(artifactPath));
    const manifestDigest = artifact.sha256.toLowerCase();
    if (actualDigest !== manifestDigest) {
      throw new Error(
        `Stale manifest: artifact "${artifact.file}" does not match its recorded sha256. ` +
          `Manifest sha256 prefix: ${manifestDigest.slice(0, 12)}...; ` +
          `actual sha256 prefix: ${actualDigest.slice(0, 12)}.... ` +
          'The manifest is stale — rebuild with build_pos_apk.sh before publishing.',
      );
    }
  }
}

async function uploadFileToR2({
  endpoint,
  bucket,
  key,
  accessKeyId,
  secretAccessKey,
  filePath,
}: {
  endpoint: string;
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  filePath: string;
}): Promise<void> {
  const contentBuffer = fs.readFileSync(filePath);
  const host = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
  const canonicalUri = `/${bucket}/${encodeURIComponent(normalizedKey).replace(/%2F/g, '/')}`;
  const payloadHash = sha256Hex(contentBuffer);
  const contentType = 'application/vnd.android.package-archive';

  const canonicalHeaders =
    [
      `content-length:${contentBuffer.length}`,
      `content-type:${contentType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';

  const signedHeaders =
    'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: host,
        path: canonicalUri,
        method: 'PUT',
        headers: {
          Host: host,
          'Content-Type': contentType,
          'Content-Length': contentBuffer.length,
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': amzDate,
          Authorization: authHeader,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(
              new Error(`R2 upload failed (HTTP ${res.statusCode}): ${body}`),
            );
          }
        });
      },
    );

    req.on('error', reject);
    req.write(contentBuffer);
    req.end();
  });
}

export async function publishRelease(
  options: PublishCliOptions,
  deps: PublishReleaseDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? console.log;
  const uploadToR2 = deps.uploadToR2 ?? uploadFileToR2;
  const createPgClient =
    deps.createPgClient ??
    ((connectionString: string): PgClientLike => {
      const client = new Client({ connectionString });
      return {
        connect: async () => {
          await client.connect();
        },
        query: async (sql: string, params?: unknown[]) => {
          const res = (await client.query(sql, params)) as {
            rows: Record<string, unknown>[];
          };
          return { rows: res.rows };
        },
        end: async () => {
          await client.end();
        },
      };
    });

  if (!fs.existsSync(options.manifestPath)) {
    throw new Error(`Manifest file not found: ${options.manifestPath}`);
  }

  const manifestDir = path.dirname(path.resolve(options.manifestPath));
  const rawManifest = JSON.parse(
    fs.readFileSync(options.manifestPath, 'utf8'),
  ) as ReleaseManifestJson;

  const versionMatch = rawManifest.version.match(/^([0-9.]+)\+([0-9]+)$/);
  if (!versionMatch) {
    throw new Error(
      `Invalid version format in manifest: ${rawManifest.version} (expected x.y.z+buildNumber)`,
    );
  }

  const versionName = versionMatch[1];
  const baseBuildNumber = parseInt(versionMatch[2], 10);

  const endpoint = env.R2_ENDPOINT?.trim();
  const bucket = env.R2_BUCKET_NAME?.trim() || 'nhilos-pos';
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 credentials missing in environment (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).',
    );
  }

  log(
    '==============================================================================',
  );
  log('🚀 OmniFood POS — OTA Release Publisher');
  log(
    '==============================================================================',
  );
  log(`📦 Manifest:     ${options.manifestPath}`);
  log(`🏷️  Version:      ${versionName} (Base Build: ${baseBuildNumber})`);
  log(`📡 Channel:      ${options.channel}`);
  log(`☁️  Bucket:       ${bucket}`);
  log(
    '------------------------------------------------------------------------------',
  );

  // Digest gate: abort before DB connection, R2 upload, or DB write if the
  // manifest does not match the bytes on disk.
  verifyManifestArtifacts(manifestDir, rawManifest.artifacts);
  log('✓ All artifact digests match the manifest (fail-closed gate).');

  // Fail-closed remote DB gate: validate URL & connect BEFORE any R2 upload.
  const dbTarget = resolveRemoteDbConfig(env, options.allowLocalDb);
  const pgClient = createPgClient(dbTarget.connectionString);

  try {
    await connectAndAuditRemoteDb(pgClient, dbTarget, log);

    for (const artifact of rawManifest.artifacts) {
      const artifactPath = path.join(manifestDir, artifact.file);

      const { abi, versionCode } = deriveAbiAndVersionCode(
        artifact.file,
        versionName,
        baseBuildNumber,
      );
      if (abi === 'universal') continue; // POS terminals install per-ABI builds

      const storageKey = `releases/${options.channel}/nhilos-pos-${abi}-${versionCode}.apk`;
      const normalizedSha = artifact.sha256.toLowerCase();
      log(`\n📤 Uploading ${artifact.file} -> R2://${bucket}/${storageKey}`);
      log(
        `   ABI: ${abi} | versionCode: ${versionCode} | Size: ${artifact.size_human} (${artifact.size_bytes} bytes)`,
      );

      await uploadToR2({
        endpoint,
        bucket,
        key: storageKey,
        accessKeyId,
        secretAccessKey,
        filePath: artifactPath,
      });
      log(`   ✓ Upload complete to R2.`);

      log(`   💾 Registering in app_releases table...`);
      const insertSql = `
        INSERT INTO app_releases (
          channel, abi, version_code, version_name, sha256,
          size_bytes, storage_key, min_from_version_code, mandatory, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (channel, abi, version_code) DO UPDATE SET
          version_name = EXCLUDED.version_name,
          sha256 = EXCLUDED.sha256,
          size_bytes = EXCLUDED.size_bytes,
          storage_key = EXCLUDED.storage_key,
          min_from_version_code = EXCLUDED.min_from_version_code,
          mandatory = EXCLUDED.mandatory,
          notes = EXCLUDED.notes,
          published_at = NOW();
      `;
      const queryParams = [
        options.channel,
        abi,
        versionCode,
        versionName,
        normalizedSha,
        artifact.size_bytes.toString(),
        storageKey,
        options.minFromVersionCode,
        options.mandatory,
        options.notes || null,
      ];

      await pgClient.query(insertSql, queryParams);
      await verifyPublishedReleaseRow(pgClient, {
        channel: options.channel,
        abi,
        versionCode,
        sha256: normalizedSha,
        storageKey,
      });
      log(`   ✓ Release record persisted and verified in remote DB.`);
    }

    log(
      '\n==============================================================================',
    );
    log('🎉 ALL RELEASE ARTIFACTS PUBLISHED SUCCESSFULLY!');
    log(
      '==============================================================================',
    );
  } finally {
    await pgClient.end();
  }
}

async function main() {
  const options = parseCliArgs();
  await publishRelease(options);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal publication error:', err);
    process.exit(1);
  });
}
