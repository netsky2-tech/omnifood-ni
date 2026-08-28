import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogValue } from './entities/catalog-value.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { IdentityModule } from '../identity/identity.module';

export const getRequiredCatalogJwtSecret = (
  configService: ConfigService,
): string => {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret?.trim()) {
    throw new Error('JWT_SECRET is required for CatalogModule');
  }
  return secret;
};

@Module({
  imports: [IdentityModule, TypeOrmModule.forFeature([CatalogValue])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
