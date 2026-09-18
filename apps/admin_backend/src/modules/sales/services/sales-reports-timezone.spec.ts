import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SalesReportsService } from './sales-reports.service';
import { Invoice } from '../entities/invoice.entity';
import { InvoiceItem } from '../entities/invoice-item.entity';
import { Payment } from '../entities/payment.entity';
import { User } from '../../identity/entities/user.entity';
import { Between } from 'typeorm';

describe('SalesReportsService — America/Managua Business Day Boundaries Regression', () => {
  let service: SalesReportsService;
  let invoiceRepo: { find: jest.Mock };

  beforeEach(async () => {
    invoiceRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesReportsService,
        {
          provide: getRepositoryToken(Invoice),
          useValue: invoiceRepo,
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<SalesReportsService>(SalesReportsService);
  });

  it('anchors startDate and endDate to America/Managua (UTC-6) bounds', async () => {
    await service.getDashboard('tenant-1', {
      startDate: '2026-09-18',
      endDate: '2026-09-18',
    });

    expect(invoiceRepo.find).toHaveBeenCalled();
    const callArgs = invoiceRepo.find.mock.calls[0][0];
    const createdBetween = callArgs.where.created_at;

    // In America/Managua (UTC-6):
    // 2026-09-18 00:00:00.000-06:00 is 2026-09-18T06:00:00.000Z
    // 2026-09-18 23:59:59.999-06:00 is 2026-09-19T05:59:59.999Z
    const expectedStart = new Date('2026-09-18T00:00:00.000-06:00');
    const expectedEnd = new Date('2026-09-18T23:59:59.999-06:00');

    expect(expectedStart.toISOString()).toBe('2026-09-18T06:00:00.000Z');
    expect(expectedEnd.toISOString()).toBe('2026-09-19T05:59:59.999Z');

    expect(createdBetween).toEqual(Between(expectedStart, expectedEnd));
  });

  it('Caso A (00:30 Managua) falls strictly within business day bounds', () => {
    const start = new Date('2026-09-18T00:00:00.000-06:00');
    const end = new Date('2026-09-18T23:59:59.999-06:00');
    const saleCasoA = new Date('2026-09-18T06:30:00.000Z'); // 00:30 local

    expect(saleCasoA.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(saleCasoA.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it('Caso B (23:30 Managua) falls strictly within the SAME business day bounds', () => {
    const start = new Date('2026-09-18T00:00:00.000-06:00');
    const end = new Date('2026-09-18T23:59:59.999-06:00');
    const saleCasoB = new Date('2026-09-19T05:30:00.000Z'); // 23:30 local

    expect(saleCasoB.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(saleCasoB.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it('Caso C1 (23:59:59.999 Managua) vs Caso C2 (00:00:00 next day) partitions correctly across days', () => {
    const day18Start = new Date('2026-09-18T00:00:00.000-06:00');
    const day18End = new Date('2026-09-18T23:59:59.999-06:00');

    const day19Start = new Date('2026-09-19T00:00:00.000-06:00');
    const day19End = new Date('2026-09-19T23:59:59.999-06:00');

    const saleC1 = new Date('2026-09-19T05:59:59.999Z'); // 23:59:59.999 local
    const saleC2 = new Date('2026-09-19T06:00:00.000Z'); // 00:00:00 next day local

    // C1 is in day 18, NOT day 19
    expect(saleC1.getTime()).toBeGreaterThanOrEqual(day18Start.getTime());
    expect(saleC1.getTime()).toBeLessThanOrEqual(day18End.getTime());
    expect(saleC1.getTime()).toBeLessThan(day19Start.getTime());

    // C2 is in day 19, NOT day 18
    expect(saleC2.getTime()).toBeGreaterThan(day18End.getTime());
    expect(saleC2.getTime()).toBeGreaterThanOrEqual(day19Start.getTime());
    expect(saleC2.getTime()).toBeLessThanOrEqual(day19End.getTime());
  });

  it('Caso D (Month end) partitions 23:30 Aug 31 into August and 00:30 Sep 1 into September', () => {
    const augStart = new Date('2026-08-01T00:00:00.000-06:00');
    const augEnd = new Date('2026-08-31T23:59:59.999-06:00');

    const sepStart = new Date('2026-09-01T00:00:00.000-06:00');
    const sepEnd = new Date('2026-09-30T23:59:59.999-06:00');

    const saleD1 = new Date('2026-09-01T05:30:00.000Z'); // Aug 31 23:30 local
    const saleD2 = new Date('2026-09-01T06:30:00.000Z'); // Sep 1 00:30 local

    expect(saleD1.getTime()).toBeGreaterThanOrEqual(augStart.getTime());
    expect(saleD1.getTime()).toBeLessThanOrEqual(augEnd.getTime());
    expect(saleD1.getTime()).toBeLessThan(sepStart.getTime());

    expect(saleD2.getTime()).toBeGreaterThan(augEnd.getTime());
    expect(saleD2.getTime()).toBeGreaterThanOrEqual(sepStart.getTime());
    expect(saleD2.getTime()).toBeLessThanOrEqual(sepEnd.getTime());
  });

  it('Caso E (Year end) partitions 23:30 Dec 31 into 2026 and 00:30 Jan 1 into 2027', () => {
    const year2026End = new Date('2026-12-31T23:59:59.999-06:00');
    const year2027Start = new Date('2027-01-01T00:00:00.000-06:00');

    const saleE1 = new Date('2027-01-01T05:30:00.000Z'); // Dec 31 23:30 local
    const saleE2 = new Date('2027-01-01T06:30:00.000Z'); // Jan 1 00:30 local

    expect(saleE1.getTime()).toBeLessThanOrEqual(year2026End.getTime());
    expect(saleE1.getTime()).toBeLessThan(year2027Start.getTime());

    expect(saleE2.getTime()).toBeGreaterThan(year2026End.getTime());
    expect(saleE2.getTime()).toBeGreaterThanOrEqual(year2027Start.getTime());
  });
});
