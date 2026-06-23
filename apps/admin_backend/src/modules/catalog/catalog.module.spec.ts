import { ConfigService } from '@nestjs/config';
import { getRequiredCatalogJwtSecret } from './catalog.module';

describe('CatalogModule configuration', () => {
  it('returns JWT_SECRET when configured', () => {
    const configService = {
      get: jest.fn().mockReturnValue('configured-secret'),
    } as unknown as ConfigService;

    expect(getRequiredCatalogJwtSecret(configService)).toBe(
      'configured-secret',
    );
  });

  it('fails startup when JWT_SECRET is missing', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => getRequiredCatalogJwtSecret(configService)).toThrow(
      'JWT_SECRET is required for CatalogModule',
    );
  });
});
