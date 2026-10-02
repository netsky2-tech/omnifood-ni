import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppRelease } from '../entities/app-release.entity';
import { R2StorageService } from './r2-storage.service';
import { ReleaseManifestResponseDto } from '../dto/release-manifest-response.dto';

export interface CreateReleaseInput {
  channel: string;
  abi: string;
  versionCode: number;
  versionName: string;
  sha256: string;
  sizeBytes: number;
  storageKey: string;
  minFromVersionCode: number;
  mandatory?: boolean;
  notes?: string;
  publishedAt?: Date;
}

@Injectable()
export class ReleasesService {
  private readonly logger = new Logger(ReleasesService.name);

  constructor(
    @InjectRepository(AppRelease)
    private readonly releaseRepo: Repository<AppRelease>,
    private readonly r2StorageService: R2StorageService,
  ) {}

  /**
   * Retrieves the latest release manifest for a given channel and target ABI.
   *
   * If currentVersionCode is supplied, returns null if no newer version is
   * available (client is already up-to-date).
   */
  async getLatestRelease(
    channel: string,
    abi: string,
    currentVersionCode?: number,
  ): Promise<ReleaseManifestResponseDto | null> {
    const query = this.releaseRepo
      .createQueryBuilder('r')
      .where('r.channel = :channel', { channel })
      .andWhere('r.abi = :abi', { abi });

    if (currentVersionCode !== undefined && currentVersionCode > 0) {
      query.andWhere('r.version_code > :currentVersionCode', {
        currentVersionCode,
      });
    }

    query.orderBy('r.version_code', 'DESC');

    const release = await query.getOne();
    if (!release) {
      return null;
    }

    const downloadUrl = this.r2StorageService.getPresignedDownloadUrl(
      release.storage_key,
    );

    return {
      schema: 'omnifood.pos.release/1',
      channel: release.channel,
      abi: release.abi,
      versionCode: release.version_code,
      versionName: release.version_name,
      sha256: release.sha256,
      sizeBytes: Number(release.size_bytes),
      downloadUrl,
      minFromVersionCode: release.min_from_version_code,
      mandatory: release.mandatory,
      notes: release.notes,
      publishedAt: release.published_at.toISOString(),
    };
  }

  /**
   * Registers a new software release in the catalog.
   */
  async createRelease(input: CreateReleaseInput): Promise<AppRelease> {
    const entity = this.releaseRepo.create({
      channel: input.channel,
      abi: input.abi,
      version_code: input.versionCode,
      version_name: input.versionName,
      sha256: input.sha256.toLowerCase(),
      size_bytes: input.sizeBytes.toString(),
      storage_key: input.storageKey,
      min_from_version_code: input.minFromVersionCode,
      mandatory: input.mandatory ?? false,
      notes: input.notes ?? null,
      published_at: input.publishedAt ?? new Date(),
    });

    return await this.releaseRepo.save(entity);
  }
}
