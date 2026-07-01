import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { BcnFxRate } from './entities/bcn-fx-rate.entity';
import { FxRateResolverService } from './fx-rate-resolver.service';

describe('FxRateResolverService', () => {
  let service: FxRateResolverService;
  let repository: jest.Mocked<Repository<BcnFxRate>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxRateResolverService,
        {
          provide: getRepositoryToken(BcnFxRate),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FxRateResolverService>(FxRateResolverService);
    repository = module.get(getRepositoryToken(BcnFxRate));
  });

  it('returns the persisted BCN rate for the requested invoice date', async () => {
    repository.findOne.mockResolvedValue({
      id: 'fx-rate-1',
      effective_date: '2026-01-03',
      rate_nio: 36.5123,
      created_at: new Date('2026-01-03T00:00:00.000Z'),
    });

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-03'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-03',
      effectiveDate: '2026-01-03',
      rateNio: 36.5123,
    });
  });

  it('throws NotFoundException when no BCN rate exists for the requested invoice date', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.getBcnRateByInvoiceDate('2026-01-04')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-04',
      ),
    );
  });
});
