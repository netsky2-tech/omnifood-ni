import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ReleasesController } from './releases.controller';
import { ReleasesService } from '../services/releases.service';
import { ReleaseManifestResponseDto } from '../dto/release-manifest-response.dto';

describe('ReleasesController', () => {
  let controller: ReleasesController;
  let mockReleasesService: jest.Mocked<Partial<ReleasesService>>;
  let mockResponse: jest.Mocked<Partial<Response>>;

  const sampleManifest: ReleaseManifestResponseDto = {
    schema: 'omnifood.pos.release/1',
    channel: 'pilot',
    abi: 'arm64-v8a',
    versionCode: 2002,
    versionName: '1.0.2',
    sha256: 'a'.repeat(64),
    sizeBytes: 32357769,
    downloadUrl: 'https://r2.signed/download.apk',
    minFromVersionCode: 2001,
    mandatory: false,
    notes: 'Update',
    publishedAt: '2026-10-02T18:00:00.000Z',
  };

  beforeEach(() => {
    mockReleasesService = {
      getLatestRelease: jest.fn(),
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
    };
    controller = new ReleasesController(
      mockReleasesService as unknown as ReleasesService,
    );
  });

  it('returns release manifest when an update is available', async () => {
    (mockReleasesService.getLatestRelease as jest.Mock).mockResolvedValue(sampleManifest);

    const result = await controller.getLatestRelease(
      { channel: 'pilot', abi: 'arm64-v8a', currentVersionCode: 2001 },
      mockResponse as Response,
    );

    expect(result).toEqual(sampleManifest);
    expect(mockResponse.status).not.toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
  });

  it('sets 204 No Content and returns null when client is up-to-date', async () => {
    (mockReleasesService.getLatestRelease as jest.Mock).mockResolvedValue(null);

    const result = await controller.getLatestRelease(
      { channel: 'pilot', abi: 'arm64-v8a', currentVersionCode: 2002 },
      mockResponse as Response,
    );

    expect(result).toBeNull();
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
  });
});
