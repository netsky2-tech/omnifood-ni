import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ReleasesService } from '../../releases/services/releases.service';
import { ReleaseManifestResponseDto } from '../../releases/dto/release-manifest-response.dto';
import { InstallToken } from '../entities/install-token.entity';
import {
  ALLOWED_ABIS,
  DEFAULT_INSTALL_ABI,
  DEFAULT_INSTALL_CHANNEL,
  hashInstallToken,
  INSTALL_TOKEN_LOOKUP_FLAG_SQL,
  InstallKitService,
  LOOKUP_INSTALL_TOKEN_BY_HASH_SQL,
  RECORD_INSTALL_TOKEN_USE_SQL,
  validateInstallAbi,
} from './install-kit.service';

interface MockInstallTokenRepo {
  create: jest.Mock<InstallToken, [Partial<InstallToken>]>;
  save: jest.Mock<Promise<InstallToken>, [InstallToken]>;
  update: jest.Mock<Promise<{ affected: number }>, [unknown, unknown]>;
  find: jest.Mock<Promise<InstallToken[]>, [unknown]>;
  findOne: jest.Mock<Promise<InstallToken | null>, [unknown]>;
}

describe('InstallKitService', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const actorUserId = '22222222-2222-4222-8222-222222222222';
  const tokenId = '33333333-3333-4333-8333-333333333333';

  let mockRepo: MockInstallTokenRepo;
  let mockQuery: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  let mockManager: EntityManager;
  let mockDataSource: DataSource;
  let mockReleasesService: {
    getLatestRelease: jest.Mock<
      Promise<ReleaseManifestResponseDto | null>,
      [string, string, number?]
    >;
  };
  let service: InstallKitService;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn((input: Partial<InstallToken>) => ({
        id: tokenId,
        tenantId: input.tenantId ?? tenantId,
        tokenHash: input.tokenHash ?? '',
        tokenPrefix: input.tokenPrefix ?? '',
        label: input.label ?? null,
        createdByUserId: input.createdByUserId ?? actorUserId,
        revokedAt: input.revokedAt ?? null,
        lastUsedAt: input.lastUsedAt ?? null,
        useCount: input.useCount ?? 0,
        createdAt: new Date('2026-11-19T00:00:00.000Z'),
      })),
      save: jest.fn(async (entity: InstallToken) => entity),
      update: jest.fn<Promise<{ affected: number }>, [unknown, unknown]>(
        async () => ({ affected: 1 }),
      ),
      find: jest.fn<Promise<InstallToken[]>, [unknown]>(async () => []),
      findOne: jest.fn<Promise<InstallToken | null>, [unknown]>(
        async () => null,
      ),
    };

    mockQuery = jest.fn<Promise<unknown>, [string, unknown[]?]>(
      async () => [],
    );
    mockManager = {
      query: mockQuery,
      getRepository: jest.fn(() => mockRepo),
    } as unknown as EntityManager;

    mockDataSource = {
      transaction: jest.fn(
        async <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          await work(mockManager),
      ),
    } as unknown as DataSource;

    mockReleasesService = {
      getLatestRelease: jest.fn<
        Promise<ReleaseManifestResponseDto | null>,
        [string, string, number?]
      >(async () => null),
    };

    service = new InstallKitService(
      mockDataSource,
      mockReleasesService as unknown as ReleasesService,
    );
  });

  describe('createToken', () => {
    it('creates a 32-byte base64url token, stores SHA-256 hash and 8-char prefix, and returns plaintext once', async () => {
      const result = await service.createToken(tenantId, actorUserId, {
        label: '  Caja Principal  ',
      });

      expect(result.id).toBe(tokenId);
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.tokenPrefix).toBe(result.token.slice(0, 8));
      expect(result.label).toBe('Caja Principal');
      expect(result.createdAt).toBeInstanceOf(Date);

      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT set_config('app.tenant_id', $1, true)",
        [tenantId],
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          tokenHash: hashInstallToken(result.token),
          tokenPrefix: result.token.slice(0, 8),
          label: 'Caja Principal',
          createdByUserId: actorUserId,
          revokedAt: null,
          useCount: 0,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('rotates tokens by revoking previous active tokens when revokePrevious is true', async () => {
      await service.createToken(tenantId, actorUserId, {
        label: 'Rotado',
        revokePrevious: true,
      });

      expect(mockRepo.update).toHaveBeenCalledTimes(1);
      const [criteria, partial] = mockRepo.update.mock.calls[0] as [
        Record<string, unknown>,
        { revokedAt: Date },
      ];
      expect(criteria.tenantId).toBe(tenantId);
      expect(partial.revokedAt).toBeInstanceOf(Date);
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('listTokens', () => {
    it('returns safe token metadata without tokenHash or tenantId', async () => {
      const createdAt = new Date('2026-11-19T10:00:00.000Z');
      const revokedAt = new Date('2026-11-19T11:00:00.000Z');
      mockRepo.find.mockResolvedValueOnce([
        {
          id: tokenId,
          tenantId,
          tokenHash: 'a'.repeat(64),
          tokenPrefix: 'AbCd1234',
          label: 'Caja 1',
          createdByUserId: actorUserId,
          revokedAt: null,
          lastUsedAt: createdAt,
          useCount: 4,
          createdAt,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          tenantId,
          tokenHash: 'b'.repeat(64),
          tokenPrefix: 'EfGh5678',
          label: null,
          createdByUserId: actorUserId,
          revokedAt,
          lastUsedAt: null,
          useCount: 0,
          createdAt,
        },
      ]);

      const items = await service.listTokens(tenantId);

      expect(items).toEqual([
        {
          id: tokenId,
          tokenPrefix: 'AbCd1234',
          label: 'Caja 1',
          createdAt,
          revokedAt: null,
          lastUsedAt: createdAt,
          useCount: 4,
          active: true,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          tokenPrefix: 'EfGh5678',
          label: null,
          createdAt,
          revokedAt,
          lastUsedAt: null,
          useCount: 0,
          active: false,
        },
      ]);
      expect('tokenHash' in items[0]).toBe(false);
      expect('tenantId' in items[0]).toBe(false);
    });
  });

  describe('revokeToken', () => {
    it('sets revokedAt on an active tenant token', async () => {
      const entity: InstallToken = {
        id: tokenId,
        tenantId,
        tokenHash: 'a'.repeat(64),
        tokenPrefix: 'AbCd1234',
        label: 'Caja 1',
        createdByUserId: actorUserId,
        revokedAt: null,
        lastUsedAt: null,
        useCount: 0,
        createdAt: new Date(),
      };
      mockRepo.findOne.mockResolvedValueOnce(entity);

      await service.revokeToken(tenantId, tokenId);

      expect(entity.revokedAt).toBeInstanceOf(Date);
      expect(mockRepo.save).toHaveBeenCalledWith(entity);
    });

    it('throws NotFoundException when token does not exist for tenant', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.revokeToken(tenantId, tokenId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateInstallAbi', () => {
    it('accepts every allowed ABI and defaults to arm64-v8a when omitted', () => {
      expect(validateInstallAbi(undefined)).toBe(DEFAULT_INSTALL_ABI);
      expect(validateInstallAbi('')).toBe(DEFAULT_INSTALL_ABI);
      for (const abi of ALLOWED_ABIS) {
        expect(validateInstallAbi(abi)).toBe(abi);
      }
    });

    it.each(['universal', 'debug', '../etc/passwd', 'arm64', 'mips'])(
      'rejects disallowed ABI "%s" with BadRequestException',
      (invalidAbi) => {
        expect(() => validateInstallAbi(invalidAbi)).toThrow(
          BadRequestException,
        );
      },
    );
  });

  describe('resolveInstallToken', () => {
    const plaintext = 'valid-token-value-1234567890';
    const releaseFixture: ReleaseManifestResponseDto = {
      schema: 'omnifood.pos.release/1',
      channel: 'pilot',
      abi: 'arm64-v8a',
      versionCode: 2045,
      versionName: '1.4.5',
      sha256: 'f'.repeat(64),
      sizeBytes: 34_567_890,
      downloadUrl: 'https://r2.example.com/nhilos-pos/app-arm64-v8a.apk?sig=1',
      minFromVersionCode: 1000,
      mandatory: false,
      notes: 'Pilot release',
      publishedAt: '2026-11-19T00:00:00.000Z',
    };

    it('rejects disallowed ABI before hitting the database', async () => {
      await expect(
        service.resolveInstallToken(plaintext, { abi: 'universal' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown token', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await expect(service.resolveInstallToken(plaintext)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        1,
        INSTALL_TOKEN_LOOKUP_FLAG_SQL,
        ['on'],
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        LOOKUP_INSTALL_TOKEN_BY_HASH_SQL,
        [hashInstallToken(plaintext)],
      );
    });

    it('throws GoneException for a revoked token', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: tokenId, revoked_at: '2026-11-19T12:00:00.000Z' },
        ]);

      await expect(service.resolveInstallToken(plaintext)).rejects.toThrow(
        GoneException,
      );
      expect(mockReleasesService.getLatestRelease).not.toHaveBeenCalled();
    });

    it('delegates to ReleasesService, updates last_used_at/use_count, and returns presigned release metadata', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: tokenId, revoked_at: null }])
        .mockResolvedValueOnce([]);
      mockReleasesService.getLatestRelease.mockResolvedValueOnce(
        releaseFixture,
      );

      const resolved = await service.resolveInstallToken(plaintext);

      expect(mockReleasesService.getLatestRelease).toHaveBeenCalledWith(
        DEFAULT_INSTALL_CHANNEL,
        DEFAULT_INSTALL_ABI,
      );
      expect(mockQuery).toHaveBeenNthCalledWith(
        3,
        RECORD_INSTALL_TOKEN_USE_SQL,
        [tokenId],
      );
      expect(resolved).toEqual({
        downloadUrl: releaseFixture.downloadUrl,
        versionName: releaseFixture.versionName,
        versionCode: releaseFixture.versionCode,
        abi: 'arm64-v8a',
        sizeBytes: releaseFixture.sizeBytes,
        sha256: releaseFixture.sha256,
      });
    });

    it('throws NotFoundException and does not increment use_count when no release exists', async () => {
      mockQuery
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: tokenId, revoked_at: null }]);
      mockReleasesService.getLatestRelease.mockResolvedValueOnce(null);

      await expect(
        service.resolveInstallToken(plaintext, { abi: 'x86_64' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });
});
