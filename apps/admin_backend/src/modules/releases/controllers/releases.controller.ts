import {
  Controller,
  Get,
  Query,
  Res,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ReleasesService } from '../services/releases.service';
import { LatestReleaseQueryDto } from '../dto/latest-release-query.dto';
import { ReleaseManifestResponseDto } from '../dto/release-manifest-response.dto';

@Controller('v1/releases')
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) {}

  /**
   * Discovers the latest software release for a target channel and ABI.
   *
   * Query parameters:
   *   - abi (required): e.g. "arm64-v8a"
   *   - channel (optional, defaults to "pilot")
   *   - currentVersionCode (optional): if supplied, returns 204 No Content
   *     when the client is already running the latest version or newer.
   */
  @Get('latest')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getLatestRelease(
    @Query() query: LatestReleaseQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReleaseManifestResponseDto | null> {
    const manifest = await this.releasesService.getLatestRelease(
      query.channel || 'pilot',
      query.abi,
      query.currentVersionCode,
    );

    if (!manifest) {
      res.status(HttpStatus.NO_CONTENT);
      return null;
    }

    return manifest;
  }
}
