import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import { CreateLoyaltyProgramDto, UpdateLoyaltyProgramDto } from './loyalty-program.dto';

describe('LoyaltyProgramDto (Production ValidationPipe Boundary)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const metadataCreate: ArgumentMetadata = {
    type: 'body',
    metatype: CreateLoyaltyProgramDto,
  };

  const metadataUpdate: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateLoyaltyProgramDto,
  };

  describe('CreateLoyaltyProgramDto', () => {
    it('accepts a minimal SPEND_POINTS program when eligibility_rule is omitted (reproducing S1)', async () => {
      const payload = {
        name: 'Smash Burger Club',
        program_type: 'SPEND_POINTS',
        earning_rule: {
          spendBlockNio: 10,
          pointsPerBlock: 1,
        },
      };

      const transformed = await pipe.transform(payload, metadataCreate);
      expect(transformed).toBeInstanceOf(CreateLoyaltyProgramDto);
      expect(transformed.name).toBe('Smash Burger Club');
      expect(transformed.program_type).toBe('SPEND_POINTS');
    });

    it('accepts an explicit empty object for eligibility_rule', async () => {
      const payload = {
        name: 'Smash Burger Club',
        program_type: 'SPEND_POINTS',
        earning_rule: {
          spendBlockNio: 10,
          pointsPerBlock: 1,
        },
        eligibility_rule: {},
      };

      const transformed = await pipe.transform(payload, metadataCreate);
      expect(transformed).toBeInstanceOf(CreateLoyaltyProgramDto);
      expect(transformed.eligibility_rule).toEqual({});
    });

    it('accepts structured eligibility_rule fields', async () => {
      const payload = {
        name: 'VIP Club',
        program_type: 'SPEND_POINTS',
        earning_rule: {
          spendBlockNio: 20,
          pointsPerBlock: 2,
        },
        eligibility_rule: {
          minimumTicketTotal: 100,
          requiresCustomer: true,
        },
      };

      const transformed = await pipe.transform(payload, metadataCreate);
      expect(transformed.eligibility_rule).toEqual({
        minimumTicketTotal: 100,
        requiresCustomer: true,
      });
    });

    it('accepts PRODUCT_STAMPS and VISIT_STAMPS valid payloads', async () => {
      const productPayload = {
        name: 'Coffee Stamp Card',
        program_type: 'PRODUCT_STAMPS',
        earning_rule: {
          eligibleProductIds: ['11111111-1111-1111-1111-111111111111'],
          unitsPerPurchasedUnit: 1,
        },
      };
      const transformedProduct = await pipe.transform(productPayload, metadataCreate);
      expect(transformedProduct.program_type).toBe('PRODUCT_STAMPS');

      const visitPayload = {
        name: 'Visit Rewards',
        program_type: 'VISIT_STAMPS',
        earning_rule: {
          unitsPerVisit: 1,
          minimumSpendNio: 50,
        },
      };
      const transformedVisit = await pipe.transform(visitPayload, metadataCreate);
      expect(transformedVisit.program_type).toBe('VISIT_STAMPS');
    });

    it('accepts valid starts_at and ends_at ISO date strings', async () => {
      const payload = {
        name: 'Summer Promo',
        program_type: 'SPEND_POINTS',
        starts_at: '2026-06-01T00:00:00.000Z',
        ends_at: '2026-08-31T23:59:59.000Z',
        earning_rule: {
          spendBlockNio: 10,
          pointsPerBlock: 1,
        },
      };

      const transformed = await pipe.transform(payload, metadataCreate);
      expect(transformed.starts_at).toBe('2026-06-01T00:00:00.000Z');
      expect(transformed.ends_at).toBe('2026-08-31T23:59:59.000Z');
    });

    it('rejects forbidden non-whitelisted properties', async () => {
      const payload = {
        name: 'Illegal Property Club',
        program_type: 'SPEND_POINTS',
        unknownProperty: 'hacker',
        earning_rule: {
          spendBlockNio: 10,
          pointsPerBlock: 1,
        },
      };

      await expect(pipe.transform(payload, metadataCreate)).rejects.toThrow();
    });

    it('rejects invalid program_type enum', async () => {
      const payload = {
        name: 'Invalid Type',
        program_type: 'CRYPTO_COINS',
        earning_rule: {
          spendBlockNio: 10,
          pointsPerBlock: 1,
        },
      };

      await expect(pipe.transform(payload, metadataCreate)).rejects.toThrow();
    });
  });

  describe('UpdateLoyaltyProgramDto', () => {
    it('accepts partial updates without eligibility_rule or earning_rule', async () => {
      const payload = {
        name: 'Renamed Club',
      };

      const transformed = await pipe.transform(payload, metadataUpdate);
      expect(transformed).toBeInstanceOf(UpdateLoyaltyProgramDto);
      expect(transformed.name).toBe('Renamed Club');
    });

    it('accepts updating earning_rule and eligibility_rule', async () => {
      const payload = {
        earning_rule: {
          spendBlockNio: 15,
          pointsPerBlock: 2,
        },
        eligibility_rule: {
          minimumTicketTotal: 50,
        },
      };

      const transformed = await pipe.transform(payload, metadataUpdate);
      expect(transformed.earning_rule?.spendBlockNio).toBe(15);
      expect(transformed.eligibility_rule?.minimumTicketTotal).toBe(50);
    });
  });
});
