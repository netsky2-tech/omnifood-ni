import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { BcnFxRate } from './entities/bcn-fx-rate.entity';
import { FxRateResolverService } from './fx-rate-resolver.service';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

describe('FxRateResolverService', () => {
  let service: FxRateResolverService;
  let findOneMock: jest.MockedFunction<Repository<BcnFxRate>['findOne']>;
  let upsertMock: jest.MockedFunction<Repository<BcnFxRate>['upsert']>;
  let configService: { get: jest.Mock };
  const fetchMock = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >();
  const originalFetch = global.fetch;

  const createUpsertResult = (): Awaited<
    ReturnType<Repository<BcnFxRate>['upsert']>
  > => ({
    identifiers: [],
    generatedMaps: [],
    raw: [],
  });

  const createFetchResponse = (body: string, init?: ResponseInit): Response =>
    new Response(body, init);

  beforeEach(async () => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    configService = { get: jest.fn() };
    findOneMock = jest.fn<
      ReturnType<Repository<BcnFxRate>['findOne']>,
      Parameters<Repository<BcnFxRate>['findOne']>
    >();
    upsertMock = jest.fn<
      ReturnType<Repository<BcnFxRate>['upsert']>,
      Parameters<Repository<BcnFxRate>['upsert']>
    >();

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
            findOne: findOneMock,
            upsert: upsertMock,
          },
        },
      ],
    }).compile();

    service = module.get<FxRateResolverService>(FxRateResolverService);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the persisted BCN rate for the requested invoice date', async () => {
    findOneMock.mockResolvedValue({
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
    findOneMock.mockResolvedValue(null);
    upsertMock.mockResolvedValue(createUpsertResult());
    configService.get.mockImplementation((key: string) => {
      if (key === 'BCN_PROXY_URL') {
        return 'https://fx-proxy.example.test/bcn';
      }

      if (key === 'BCN_TIMEOUT') {
        return '7';
      }

      return undefined;
    });
    let capturedFetchInput: FetchInput | undefined;
    let capturedFetchInit: FetchInit;
    const bcnResponse = createFetchResponse(`
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
          </soap:Envelope>`);
    fetchMock.mockImplementation(
      (input: FetchInput, init?: FetchInit): Promise<Response> => {
        capturedFetchInput = input;
        capturedFetchInit = init;

        return Promise.resolve(bcnResponse);
      },
    );

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-04'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-04',
      effectiveDate: '2026-01-04',
      rateNio: 36.6123,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedFetchInput).toBe('https://fx-proxy.example.test/bcn');
    expect(capturedFetchInit?.method).toBe('POST');
    expect(capturedFetchInit?.headers).toMatchObject({
      SOAPAction: 'http://servicios.bcn.gob.ni/RecuperaTC_Mes',
    });
    expect(upsertMock).toHaveBeenCalledWith(
      { effective_date: '2026-01-04', rate_nio: 36.6123 },
      ['effective_date'],
    );
  });

  it('parses legacy any-wrapped monthly SOAP responses', async () => {
    findOneMock.mockResolvedValue(null);
    upsertMock.mockResolvedValue(createUpsertResult());
    fetchMock.mockResolvedValue(
      createFetchResponse(`
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <RecuperaTC_MesResponse xmlns="http://servicios.bcn.gob.ni/">
                <RecuperaTC_MesResult>
                  <any>&lt;Detalle_TC&gt;&lt;Tc&gt;&lt;Fecha&gt;05/01/2026&lt;/Fecha&gt;&lt;Valor&gt;36.7000&lt;/Valor&gt;&lt;/Tc&gt;&lt;/Detalle_TC&gt;</any>
                </RecuperaTC_MesResult>
              </RecuperaTC_MesResponse>
            </soap:Body>
          </soap:Envelope>`),
    );

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-05'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-05',
      effectiveDate: '2026-01-05',
      rateNio: 36.7,
    });
  });

  it('throws NotFoundException without upsert or nearby-date fallback when the monthly BCN response lacks the exact invoice date', async () => {
    findOneMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      createFetchResponse(`
          <Detalle_TC>
            <Tc><Fecha>06/01/2026</Fecha><Valor>36.8000</Valor></Tc>
            <Tc><Fecha>08/01/2026</Fecha><Valor>36.8100</Valor></Tc>
          </Detalle_TC>`),
    );

    await expect(service.getBcnRateByInvoiceDate('2026-01-07')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-07',
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith({
      where: { effective_date: '2026-01-07' },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics when the network fails', async () => {
    findOneMock.mockResolvedValue(null);
    fetchMock.mockRejectedValue(new Error('proxy unavailable'));

    await expect(service.getBcnRateByInvoiceDate('2026-01-08')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-08',
      ),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics when the BCN request times out', async () => {
    findOneMock.mockResolvedValue(null);
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
    let capturedFetchInit: FetchInit;
    fetchMock.mockImplementation(
      (_input: FetchInput, init?: FetchInit): Promise<Response> => {
        capturedFetchInit = init;
        if (init?.signal?.aborted) {
          return Promise.reject(new Error('BCN request aborted'));
        }

        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('BCN request aborted'));
          });
        });
      },
    );

    try {
      await expect(
        service.getBcnRateByInvoiceDate('2026-01-09'),
      ).rejects.toThrow(
        new NotFoundException(
          'No official BCN FX rate found for invoiceDate 2026-01-09',
        ),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(capturedFetchInit?.signal).toBeInstanceOf(AbortSignal);
      expect(upsertMock).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it('returns safe not-found semantics when BCN responds with HTTP non-OK', async () => {
    findOneMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      createFetchResponse('Service unavailable', { status: 503 }),
    );

    await expect(service.getBcnRateByInvoiceDate('2026-01-10')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-10',
      ),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics for malformed SOAP without rate nodes', async () => {
    findOneMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(createFetchResponse('<soap:Envelope><broken>'));

    await expect(service.getBcnRateByInvoiceDate('2026-01-11')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-11',
      ),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns safe not-found semantics for invalid rate and date nodes', async () => {
    findOneMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      createFetchResponse(`
          <Detalle_TC>
            <Tc><Fecha>12/01/2026</Fecha><Valor>not-a-rate</Valor></Tc>
            <Tc><Fecha>invalid-date</Fecha><Valor>36.9000</Valor></Tc>
          </Detalle_TC>`),
    );

    await expect(service.getBcnRateByInvoiceDate('2026-01-12')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-12',
      ),
    );
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('normalizes full ISO invoice datetimes to the canonical official rate date', async () => {
    findOneMock.mockResolvedValue(null);
    upsertMock.mockResolvedValue(createUpsertResult());
    fetchMock.mockResolvedValue(
      createFetchResponse(`
          <Detalle_TC>
            <Tc><Fecha>13/01/2026</Fecha><Valor>36.9012</Valor></Tc>
          </Detalle_TC>`),
    );

    await expect(
      service.getBcnRateByInvoiceDate('2026-01-13T23:59:59.000Z'),
    ).resolves.toEqual({
      invoiceDate: '2026-01-13',
      effectiveDate: '2026-01-13',
      rateNio: 36.9012,
    });
    expect(findOneMock).toHaveBeenCalledWith({
      where: { effective_date: '2026-01-13' },
    });
    expect(upsertMock).toHaveBeenCalledWith(
      { effective_date: '2026-01-13', rate_nio: 36.9012 },
      ['effective_date'],
    );
  });

  it('throws NotFoundException when no BCN rate exists for the requested invoice date', async () => {
    findOneMock.mockResolvedValue(null);

    await expect(service.getBcnRateByInvoiceDate('2026-01-04')).rejects.toThrow(
      new NotFoundException(
        'No official BCN FX rate found for invoiceDate 2026-01-04',
      ),
    );
  });
});
