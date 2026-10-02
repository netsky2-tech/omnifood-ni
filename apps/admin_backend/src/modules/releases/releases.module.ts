import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppRelease } from './entities/app-release.entity';
import { ReleasesController } from './controllers/releases.controller';
import { ReleasesService } from './services/releases.service';
import { R2StorageService } from './services/r2-storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppRelease]),
    ConfigModule,
  ],
  controllers: [ReleasesController],
  providers: [ReleasesService, R2StorageService],
  exports: [ReleasesService, R2StorageService],
})
export class ReleasesModule {}
