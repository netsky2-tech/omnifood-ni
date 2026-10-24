import { useQuery } from '@tanstack/react-query';
import { api, type ApiClientMethodOptions } from '@/lib/api';
import { useTenantId } from '@/lib/tenant';

export interface CorporateCustomerProduct {
  productId: string;
  productName: string;
  quantity: number;
  netSalesNio: number;
  discountNio: number;
}

export interface CorporateDayDistribution {
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  dayName: string;
  ticketCount: number;
  netSalesNio: number;
}

export interface CorporatePeakHour {
  hour: number; // 0..23 (hora local)
  formattedHour: string;
  ticketCount: number;
  netSalesNio: number;
}

export interface CorporateCustomerTimePattern {
  daysOfWeek: CorporateDayDistribution[];
  peakHours: CorporatePeakHour[];
}

export interface CorporateCustomerSummary {
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  customerType: string | null;
  convenioCode: string | null;
  convenioName: string | null;
  ticketCount: number;
  grossSalesNio: number;
  discountNio: number;
  netSalesNio: number;
  effectiveDiscountRate: number;
  averageTicketNio: number;
  topProducts?: CorporateCustomerProduct[];
  timePattern?: CorporateCustomerTimePattern;
}

export interface CorporateMetricsKpis {
  totalCorporateGrossSalesNio: number;
  totalCorporateDiscountNio: number;
  totalCorporateNetSalesNio: number;
  totalCorporateTickets: number;
  overallAverageTicketNio: number;
  overallEffectiveDiscountRate: number;
  activeCompaniesCount: number;
}

export interface CorporateMetricsReport {
  startDate?: string;
  endDate?: string;
  generatedAt: string;
  kpis: CorporateMetricsKpis;
  companies: CorporateCustomerSummary[];
  overallTopProducts?: CorporateCustomerProduct[];
  overallDayDistribution?: CorporateDayDistribution[];
  overallPeakHours?: CorporatePeakHour[];
}

function toQueryParams(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export function fetchCorporateMetrics(
  startDate?: string,
  endDate?: string,
  opts?: ApiClientMethodOptions,
): Promise<CorporateMetricsReport> {
  const url = `/sales/reports/corporate-metrics${toQueryParams({ startDate, endDate })}`;
  return opts
    ? api.get<CorporateMetricsReport>(url, opts)
    : api.get<CorporateMetricsReport>(url);
}

export async function downloadCorporateMetricsFile(params: {
  startDate?: string;
  endDate?: string;
  format: 'xlsx' | 'pdf';
  companyId?: string;
  companyName?: string;
}): Promise<void> {
  const { companyName, ...queryParams } = params;
  const query = toQueryParams(queryParams);
  const blob = await api.getBlob(
    `/sales/reports/export/corporate-metrics${query}`,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileSuffix = `${params.startDate ?? 'inicio'}_${params.endDate ?? 'fin'}`;
  const cleanName = companyName
    ? companyName.replace(/[^a-zA-Z0-9]/g, '_')
    : params.companyId?.slice(0, 8);
  const filename = cleanName
    ? `consumo_${cleanName}_${fileSuffix}.${params.format}`
    : `reporte_convenios_${fileSuffix}.${params.format}`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useCorporateMetrics(startDate?: string, endDate?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ['customers', tenantId, 'corporate-metrics', startDate, endDate],
    queryFn: ({ signal }) => fetchCorporateMetrics(startDate, endDate, { signal }),
    staleTime: 2 * 60 * 1000,
  });
}
