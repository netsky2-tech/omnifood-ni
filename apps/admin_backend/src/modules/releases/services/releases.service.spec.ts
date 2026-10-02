import { Repository } from 'typeorm';
import { ReleasesService } from './releases.service';
import { R2StorageService } from './r2-storage.service';
import { AppRelease } from '../entities/app-release.entity';

describe('ReleasesService', () => {
  let service: ReleasesService;
  let mockRepo: jest.Mocked<Partial<Repository<AppRelease>>>;
  let mockR2Storage: jest.Mocked<Partial<R2StorageService>>;

  const sampleRelease: AppRelease = {
    id: '11111111-1111-1111-1111-111111111111',
    channel: 'pilot',
    abi: 'arm64-v8a',
    version_code: 2002,
    version_name: '1.0.2',
    sha256: 'a'.repeat(64),
    size_bytes: '32357769',
    storage_key: 'releases/pilot/app-arm64-2002.apk',
    min_from_version_code: 2001,
    mandatory: false,
    notes: 'OTA update test',
    published_at: new Date('2026-10-02T18:00:00.000Z'),
    created_at: new Date('2026-10-02T18:00:00.000Z'),
  };

  beforeEach(() => {
    mockR2Storage = {
      getPresignedDownloadUrl: jest.fn().mockReturnValue('https://r2.signed/download.apk'),
    };
  });

  const setupMockQueryBuilder = (returnValue: AppRelease | null) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(returnValue),
    };
    mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn().mockImplementation((dto) => dto as AppRelease),
      save: jest.fn().mockImplementation(async (entity) => entity as AppRelease),
    };
    service = new ReleasesService(
      mockRepo as unknown as Repository<AppRelease>,
      mockR2Storage as unknown as R2StorageService,
    );
    return qb;
  };

  it('returns formatted ReleaseManifest when a matching release exists', async () => {
    const qb = setupMockQueryBuilder(sampleRelease);

    const result = await service.getLatestRelease('pilot', 'arm64-v8a', 2001);

    expect(result).not.toBeNull();
    expect(result?.schema).toBe('omnifood.pos.release/1');
    expect(result?.channel).toBe('pilot');
    expect(result?.abi).toBe('arm64-v8a');
    expect(result?.versionCode).toBe(2002);
    expect(result?.versionName).toBe('1.0.2');
    expect(result?.sha256).toBe('a'.repeat(64));
    expect(result?.sizeBytes).toBe(32357769);
    expect(result?.downloadUrl).toBe('https://r2.signed/download.apk');
    expect(result?.minFromVersionCode).toBe(2001);
    expect(result?.mandatory).toBe(false);
    expect(result?.notes).toBe('OTA update test');
    expect(result?.publishedAt).toBe('2026-10-02T18:00:00.000Z');

    expect(qb.where).toHaveBeenCalledWith('r.channel = :channel', { channel: 'pilot' });
    expect(qb.andWhere).toHaveBeenCalledWith('r.abi = :abi', { abi: 'arm64-v8a' });
    expect(qb.andWhere).toHaveBeenCalledWith('r.version_code > :currentVersionCode', {
      currentVersionCode: 2001,
    });
    expect(mockR2Storage.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'releases/pilot/app-arm64-2002.apk',
    );
  });

  it('returns null when no release is found in the repository', async () => {
    setupMockQueryBuilder(null);

    const result = await service.getLatestRelease('pilot', 'arm64-v8a', 2002);

    expect(result).toBeNull();
    expect(mockR2Storage.getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('creates and saves a new release entity', async () => {
    setupMockQueryBuilder(null);

    const saved = await service.createRelease({
      channel: 'pilot',
      abi: 'arm64-v8a',
      versionCode: 2003,
      versionName: '1.0.3',
      sha256: 'B'.repeat(64), // uppercase input should be lowercased
      sizeBytes: 33000000,
      storageKey: 'releases/pilot/app-2003.apk',
      minFromVersionCode: 2001,
      mandatory: true,
      notes: 'Critical hotfix',
    });

    expect(saved.channel).toBe('pilot');
    expect(saved.version_code).toBe(2003);
    expect(saved.sha256).toBe('b'.repeat(64)); // lowercased
    expect(saved.mandatory).toBe(true);
    expect(mockRepo.save).toHaveBeenCalled();
  });
});
