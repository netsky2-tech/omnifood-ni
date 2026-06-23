import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogValue } from './entities/catalog-value.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AuthGuard } from '../identity/guards/auth.guard';
import { RolesGuard } from '../identity/guards/roles.guard';

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
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return { secret: getRequiredCatalogJwtSecret(configService) };
      },
    }),
    TypeOrmModule.forFeature([CatalogValue]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService, AuthGuard, RolesGuard],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
