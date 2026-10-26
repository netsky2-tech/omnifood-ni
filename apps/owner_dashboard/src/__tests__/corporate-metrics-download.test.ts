import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBlob = vi.fn();

vi.mock('@/lib/api', () => ({
  api: { getBlob: (path: string) => getBlob(path) },
}));
vi.mock('@/lib/tenant', () => ({
  useTenantId: () => 'tenant-1',
}));

import { downloadCorporateMetricsFile } from '@/features/customers/corporate-metrics-api';

describe('downloadCorporateMetricsFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('refuses to save a JSON body as a spreadsheet', async () => {
    getBlob.mockResolvedValue(
      new Blob([JSON.stringify({ message: 'Reporte no disponible' })], {
        type: 'application/json',
      }),
    );
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');

    await expect(
      downloadCorporateMetricsFile({ format: 'xlsx' }),
    ).rejects.toThrow('Reporte no disponible');

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('explains the failure when the JSON body has no message', async () => {
    getBlob.mockResolvedValue(
      new Blob(['{"type":"Buffer","data":[80,75]}'], {
        type: 'application/json; charset=utf-8',
      }),
    );
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');

    await expect(
      downloadCorporateMetricsFile({ format: 'pdf' }),
    ).rejects.toThrow('El servidor no devolvió un archivo válido.');

    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('downloads a real spreadsheet blob', async () => {
    getBlob.mockResolvedValue(
      new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:report');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = click;
      }
      return element;
    });

    await downloadCorporateMetricsFile({
      format: 'xlsx',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      companyId: 'cust-bac-1234',
      companyName: 'Banco Atlántico S.A.',
    });

    expect(getBlob).toHaveBeenCalledWith(
      '/sales/reports/export/corporate-metrics?format=xlsx&startDate=2026-08-01&endDate=2026-08-31&companyId=cust-bac-1234',
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
