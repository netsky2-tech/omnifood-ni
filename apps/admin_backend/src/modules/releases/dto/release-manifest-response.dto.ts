export interface ReleaseManifestResponseDto {
  schema: 'omnifood.pos.release/1';
  channel: string;
  abi: string;
  versionCode: number;
  versionName: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
  minFromVersionCode: number;
  mandatory: boolean;
  notes: string | null;
  publishedAt: string;
}
