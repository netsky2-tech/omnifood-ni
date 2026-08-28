import { ConfigService } from '@nestjs/config';
import { getRequiredOnboardingJwtSecret } from './onboarding.module';

describe('OnboardingModule (Unit)', () => {
  it('returns JWT secret from config when present', () => {
    const configService = {
      get: jest.fn().mockReturnValue('valid-secret'),
    } as unknown as ConfigService;

    const secret = getRequiredOnboardingJwtSecret(configService);
    expect(secret).toBe('valid-secret');
    expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('throws error when JWT_SECRET is missing or blank', () => {
    const configService = {
      get: jest.fn().mockReturnValue('   '),
    } as unknown as ConfigService;

    expect(() => getRequiredOnboardingJwtSecret(configService)).toThrow(
      'JWT_SECRET is required for OnboardingModule',
    );
  });
});
