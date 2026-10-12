import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly config: R2Config | null;

  constructor(configService: ConfigService) {
    const accountId = configService.get<string>('R2_ACCOUNT_ID')?.trim();
    const accessKeyId = configService.get<string>('R2_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = configService.get<string>('R2_SECRET_ACCESS_KEY')?.trim();
    const bucketName = configService.get<string>('R2_BUCKET_NAME')?.trim() || 'nhilos-pos';
    let endpoint = configService.get<string>('R2_ENDPOINT')?.trim();

    if (!endpoint && accountId) {
      endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    }

    if (accessKeyId && secretAccessKey && endpoint && bucketName && accountId) {
      this.config = {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        endpoint,
      };
      this.logger.log(`R2 storage initialized for bucket: ${bucketName}`);
    } else {
      this.config = null;
      this.logger.warn(
        'R2 storage credentials incomplete; presigned release download URLs will fail if queried.',
      );
    }
  }

  get isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Generates a signed GET URL using AWS SigV4 query authentication for Cloudflare R2.
   *
   * @param key The object key in the bucket (e.g. "releases/pilot/app-arm64-2002.apk")
   * @param expiresInSeconds Lifetime of the signed URL (default: 3600s / 1 hour)
   * @param date Date to sign for (defaults to now)
   */
  getPresignedDownloadUrl(
    key: string,
    expiresInSeconds: number = 3600,
    date: Date = new Date(),
  ): string {
    if (!this.config) {
      throw new Error(
        'R2 storage is not configured (missing R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY)',
      );
    }

    const { endpoint, bucketName, accessKeyId, secretAccessKey } = this.config;
    const host = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
    const canonicalUri = `/${bucketName}/${encodeURIComponent(normalizedKey).replace(/%2F/g, '/')}`;

    const queryParams: [string, string][] = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', `${accessKeyId}/${credentialScope}`],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', expiresInSeconds.toString()],
      ['X-Amz-SignedHeaders', 'host'],
    ];

    queryParams.sort(([a], [b]) => a.localeCompare(b));
    const canonicalQueryString = queryParams
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
    ].join('\n');

    const hmac = (secret: Buffer | string, data: string) =>
      crypto.createHmac('sha256', secret).update(data, 'utf8').digest();

    const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign, 'utf8')
      .digest('hex');

    return `${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }
}
