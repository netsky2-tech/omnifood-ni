import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { BcnFxRate } from './entities/bcn-fx-rate.entity';
import { FxRateResolverService } from './fx-rate-resolver.service';

describe('FxRateResolverService', () => {
  let service: FxRateResolverService;
  let repository: jest.Mocked<Repository<BcnFxRate>>;
  let configService: { get: jest.Mock };
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    configService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxRateResolverService,
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: getRepositoryToken(BcnFxRate),
          useValue: {
            findOne: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FxRateResolverService>(FxRateResolverService);
    repository = module.get(getRepositoryToken(BcnFxRate));
  });

  afterAll(() => {
    global.fetch = originalFetch;
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the configured proxy URL as the first transport endpoint', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.upsert.mockResolvedValue({} as never);
    configService.get.mockImplementation((key: string) => {
      if (key === 'BCN_PROXY_URL') {
        return 'https://fx-proxy.example.test/bcn';
      }

      if (key === 'BCN_TIMEOUT') {
        return '7';
      }

      return undefined;
    });
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(`
          <soap:Envelope>
            <soap:Body>
              <RecuperaTC_MesResponse>
                <RecuperaTC_MesResult>
                  <Detalle_TC>
                    <Tc><Fecha>04/01/2026</Fecha><Valor>36.6123</Valor></Tc>
                  </Detalle_TC>
                </RecuperaTC_MesResult>
              </RecuperaTC_MesResponse>
            </soap:Body>
          </soap:Envelope>`),
    });

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-04'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-04',
      effectiveDate: '2026-01-04',
      rateNio: 36.6123,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://fx-proxy.example.test/bcn',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          SOAPAction: 'http://servicios.bcn.gob.ni/RecuperaTC_Mes',
        }),
      }),
    );
    expect(repository.upsert).toHaveBeenCalledWith(
      { effective_date: '2026-01-04', rate_nio: 36.6123 },
      ['effective_date'],
    );
  });

  it('parses legacy any-wrapped monthly SOAP responses', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.upsert.mockResolvedValue({} as never);
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(`
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <RecuperaTC_MesResponse xmlns="http://servicios.bcn.gob.ni/">
                <RecuperaTC_MesResult>
                  <any>&lt;Detalle_TC&gt;&lt;Tc&gt;&lt;Fecha&gt;05/01/2026&lt;/Fecha&gt;&lt;Valor&gt;36.7000&lt;/Valor&gt;&lt;/Tc&gt;&lt;/Detalle_TC&gt;</any>
                </RecuperaTC_MesResult>
              </RecuperaTC_MesResponse>
            </soap:Body>
          </soap:Envelope>`),
    });

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-05'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-05',
      effectiveDate: '2026-01-05',
      rateNio: 36.7,
    });
  });

  it('does not use a different monthly rate when the exact invoice date is absent', async () => {
    repository.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(`
          <Detalle_TC>
            <Tc><Fecha>06/01/2026</Fecha><Valor>36.8000</Valor></Tc>
          </Detalle_TC>`),
    });

    await expect(service.getBcnRateByInvoiceDate('2026-01-07')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-07',
      ),
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics when the network fails', async () => {
    repository.findOne.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error('proxy unavailable'));

    await expect(service.getBcnRateByInvoiceDate('2026-01-08')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-08',
      ),
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics when the BCN request times out', async () => {
    repository.findOne.mockResolvedValue(null);
    configService.get.mockImplementation((key: string) => {
      if (key === 'BCN_TIMEOUT') {
        return '5';
      }

      return undefined;
    });
    const setTimeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((callback: () => void) => {
        callback();
        return 0 as unknown as NodeJS.Timeout;
      });
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new Error('BCN request aborted'));
      }

      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('BCN request aborted'));
        });
      });
    });

    try {
      await expect(
        service.getBcnRateByInvoiceDate('2026-01-09'),
      ).rejects.toThrow(
        new NotFoundException(
          'No official BCN FX rate found for invoiceDate 2026-01-09',
        ),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(repository.upsert).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('returns safe not-found semantics when BCN responds with HTTP non-OK', async () => {
    repository.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service unavailable'),
    });

    await expect(service.getBcnRateByInvoiceDate('2026-01-10')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-10',
      ),
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics for malformed SOAP without rate nodes', async () => {
    repository.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<soap:Envelope><broken>'),
    });

    await expect(service.getBcnRateByInvoiceDate('2026-01-11')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-11',
      ),
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics for invalid rate and date nodes', async () => {
    repository.findOne.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(`
          <Detalle_TC>
            <Tc><Fecha>12/01/2026</Fecha><Valor>not-a-rate</Valor></Tc>
            <Tc><Fecha>invalid-date</Fecha><Valor>36.9000</Valor></Tc>
          </Detalle_TC>`),
    });

    await expect(service.getBcnRateByInvoiceDate('2026-01-12')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-12',
      ),
    );
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('normalizes full ISO invoice datetimes to the canonical official rate date', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.upsert.mockResolvedValue({} as never);
    fetchMock.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(`
          <Detalle_TC>
            <Tc><Fecha>13/01/2026</Fecha><Valor>36.9012</Valor></Tc>
          </Detalle_TC>`),
    });

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-13T23:59:59.000Z'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-13',
      effectiveDate: '2026-01-13',
      rateNio: 36.9012,
    });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { effective_date: '2026-01-13' },
    });
    expect(repository.upsert).toHaveBeenCalledWith(
      { effective_date: '2026-01-13', rate_nio: 36.9012 },
      ['effective_date'],
    );
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
