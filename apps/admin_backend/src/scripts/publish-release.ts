import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import dataSource from '../data-source';

interface ManifestArtifact {
  file: string;
  size_bytes: number;
  size_human: string;
  sha256: string;
}

interface ReleaseManifestJson {
  project: string;
  version: string;
  git_commit: string;
  build_timestamp: string;
  artifacts: ManifestArtifact[];
}

function parseCliArgs(): {
  manifestPath: string;
  channel: string;
  minFromVersionCode: number;
  notes?: string;
  mandatory: boolean;
} {
  const args = process.argv.slice(2);
  let manifestPath = '';
  let channel = 'pilot';
  let minFromVersionCode = 1;
  let notes: string | undefined;
  let mandatory = false;

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
    }
  }

  if (!manifestPath) {
    console.error('Error: --manifest <path/to/release_manifest.json> is required.');
    process.exit(1);
  }

  return { manifestPath, channel, minFromVersionCode, notes, mandatory };
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

  const canonicalHeaders = [
    `content-length:${contentBuffer.length}`,
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

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
            reject(new Error(`R2 upload failed (HTTP ${res.statusCode}): ${body}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.write(contentBuffer);
    req.end();
  });
}

async function main() {
  const options = parseCliArgs();

  if (!fs.existsSync(options.manifestPath)) {
    console.error(`Manifest file not found: ${options.manifestPath}`);
    process.exit(1);
  }

  const manifestDir = path.dirname(path.resolve(options.manifestPath));
  const rawManifest = JSON.parse(fs.readFileSync(options.manifestPath, 'utf8')) as ReleaseManifestJson;

  const versionMatch = rawManifest.version.match(/^([0-9.]+)\+([0-9]+)$/);
  if (!versionMatch) {
    console.error(`Invalid version format in manifest: ${rawManifest.version} (expected x.y.z+buildNumber)`);
    process.exit(1);
  }

  const versionName = versionMatch[1];
  const baseBuildNumber = parseInt(versionMatch[2], 10);

  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim() || 'nhilos-pos';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('Error: R2 credentials missing in environment (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).');
    process.exit(1);
  }

  console.log('==============================================================================');
  console.log('🚀 OmniFood POS — OTA Release Publisher');
  console.log('==============================================================================');
  console.log(`📦 Manifest:     ${options.manifestPath}`);
  console.log(`🏷️  Version:      ${versionName} (Base Build: ${baseBuildNumber})`);
  console.log(`📡 Channel:      ${options.channel}`);
  console.log(`☁️  Bucket:       ${bucket}`);
  console.log('------------------------------------------------------------------------------');

  let dbConnected = false;
  let pgClient: any = null;
  const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

  if (dbUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Client } = require('pg');
      pgClient = new Client({ connectionString: dbUrl });
      await pgClient.connect();
      console.log('✓ Connected to remote database via DATABASE_URL.');
    } catch (e: any) {
      console.warn(`⚠️  Remote database connection failed: ${e.message}`);
      pgClient = null;
    }
  }

  if (!pgClient) {
    try {
      await dataSource.initialize();
      dbConnected = true;
      console.log('✓ Database connection initialized via local dataSource.');
    } catch (e: any) {
      console.warn(`⚠️  Database connection skipped or failed (${e.message}). Only R2 uploads will proceed.`);
    }
  }

  for (const artifact of rawManifest.artifacts) {
    const artifactPath = path.join(manifestDir, artifact.file);
    if (!fs.existsSync(artifactPath)) {
      console.error(`Artifact missing on disk: ${artifactPath}`);
      process.exit(1);
    }

    const { abi, versionCode } = deriveAbiAndVersionCode(artifact.file, versionName, baseBuildNumber);
    if (abi === 'universal') continue; // POS terminals install per-ABI builds

    const storageKey = `releases/${options.channel}/nhilos-pos-${abi}-${versionCode}.apk`;
    console.log(`\n📤 Uploading ${artifact.file} -> R2://${bucket}/${storageKey}`);
    console.log(`   ABI: ${abi} | versionCode: ${versionCode} | Size: ${artifact.size_human} (${artifact.size_bytes} bytes)`);

    await uploadFileToR2({
      endpoint,
      bucket,
      key: storageKey,
      accessKeyId,
      secretAccessKey,
      filePath: artifactPath,
    });
    console.log(`   ✓ Upload complete to R2.`);

    if (pgClient || dbConnected) {
      console.log(`   💾 Registering in app_releases table...`);
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
        artifact.sha256.toLowerCase(),
        artifact.size_bytes.toString(),
        storageKey,
        options.minFromVersionCode,
        options.mandatory,
        options.notes || null,
      ];

      if (pgClient) {
        await pgClient.query(insertSql, queryParams);
      } else {
        await dataSource.query(insertSql, queryParams);
      }
      console.log(`   ✓ Release record persisted.`);
    }
  }

  if (pgClient) {
    await pgClient.end();
  }
  if (dbConnected) {
    await dataSource.destroy();
  }

  console.log('\n==============================================================================');
  console.log('🎉 ALL RELEASE ARTIFACTS PUBLISHED SUCCESSFULLY!');
  console.log('==============================================================================');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal publication error:', err);
    process.exit(1);
  });
}
