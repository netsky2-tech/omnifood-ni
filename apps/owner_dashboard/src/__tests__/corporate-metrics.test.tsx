import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CorporateMetricsTab } from '@/features/customers/corporate-metrics-tab';
import * as metricsApiModule from '@/features/customers/corporate-metrics-api';

vi.mock('@/features/customers/corporate-metrics-api');

function TestWrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CorporateMetricsTab (Backoffice Standard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state properly', () => {
    vi.spyOn(metricsApiModule, 'useCorporateMetrics').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(
      <TestWrapper>
        <CorporateMetricsTab />
      </TestWrapper>,
    );

    expect(
      screen.getByText(/cargando métricas de convenios y empresas/i),
    ).toBeInTheDocument();
  });

  it('renders KPI cards and corporate ranking table with accurate data and badges', () => {
    const mockReport: metricsApiModule.CorporateMetricsReport = {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      generatedAt: '2026-08-31T23:59:59Z',
      kpis: {
        totalCorporateGrossSalesNio: 15000,
        totalCorporateDiscountNio: 1500,
        totalCorporateNetSalesNio: 13500,
        totalCorporateTickets: 30,
        overallAverageTicketNio: 450,
        overallEffectiveDiscountRate: 10,
        activeCompaniesCount: 1,
      },
      companies: [
        {
          customerId: 'cust-bac',
          customerName: 'Banco Atlántico S.A.',
          customerTaxId: 'J0310000001234',
          customerType: 'EMPRESA',
          convenioCode: 'CONV-BAC',
          convenioName: 'Convenio Empleados BAC',
          ticketCount: 30,
          grossSalesNio: 15000,
          discountNio: 1500,
          netSalesNio: 13500,
          effectiveDiscountRate: 10,
          averageTicketNio: 450,
        },
      ],
    };

    vi.spyOn(metricsApiModule, 'useCorporateMetrics').mockReturnValue({
      data: mockReport,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(
      <TestWrapper>
        <CorporateMetricsTab />
      </TestWrapper>,
    );

    // Verify 4 KPIs
    expect(screen.getByText('Facturación Neta B2B')).toBeInTheDocument();
    expect(screen.getByText('Descuentos Otorgados')).toBeInTheDocument();
    expect(screen.getByText('Tickets Corporativos')).toBeInTheDocument();
    expect(screen.getByText('Ticket Promedio B2B')).toBeInTheDocument();
    expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(2);

    // Verify table row and badge
    expect(screen.getByText('Banco Atlántico S.A.')).toBeInTheDocument();
    expect(screen.getByText(/RUC: J0310000001234/)).toBeInTheDocument();
    expect(screen.getByText('CONV-BAC')).toBeInTheDocument();
    expect(screen.getByText('Convenio Empleados BAC')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('renders actionable empty state when no corporate records are found in period', () => {
    const emptyReport: metricsApiModule.CorporateMetricsReport = {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      generatedAt: '2026-08-31T23:59:59Z',
      kpis: {
        totalCorporateGrossSalesNio: 0,
        totalCorporateDiscountNio: 0,
        totalCorporateNetSalesNio: 0,
        totalCorporateTickets: 0,
        overallAverageTicketNio: 0,
        overallEffectiveDiscountRate: 0,
        activeCompaniesCount: 0,
      },
      companies: [],
    };

    vi.spyOn(metricsApiModule, 'useCorporateMetrics').mockReturnValue({
      data: emptyReport,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    render(
      <TestWrapper>
        <CorporateMetricsTab />
      </TestWrapper>,
    );

    expect(
      screen.getByText(/sin ventas corporativas en este período/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver mes actual/i })).toBeInTheDocument();
  });

  it('renders semantic error alert with retry button when query fails', () => {
    const mockRefetch = vi.fn();
    vi.spyOn(metricsApiModule, 'useCorporateMetrics').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network timeout'),
      refetch: mockRefetch,
    } as any);

    render(
      <TestWrapper>
        <CorporateMetricsTab />
      </TestWrapper>,
    );

    expect(
      screen.getByText(/no se pudieron consultar las métricas corporativas/i),
    ).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /reintentar/i });
    expect(retryBtn).toBeInTheDocument();
    retryBtn.click();
    expect(mockRefetch).toHaveBeenCalled();
  });
});
