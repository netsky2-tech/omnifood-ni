import { render, screen, fireEvent } from '@testing-library/react';
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
          topProducts: [
            {
              productId: 'p-1',
              productName: 'Combo Almuerzo Ejecutivo',
              quantity: 20,
              netSalesNio: 9000,
              discountNio: 1000,
            },
          ],
          timePattern: {
            daysOfWeek: [
              { dayOfWeek: 1, dayName: 'Lunes', ticketCount: 10, netSalesNio: 4500 },
              { dayOfWeek: 5, dayName: 'Viernes', ticketCount: 20, netSalesNio: 9000 },
            ],
            peakHours: [
              { hour: 12, formattedHour: '12:00 PM', ticketCount: 18, netSalesNio: 8000 },
            ],
          },
        },
      ],
      overallTopProducts: [
        {
          productId: 'p-1',
          productName: 'Combo Almuerzo Ejecutivo',
          quantity: 20,
          netSalesNio: 9000,
          discountNio: 1000,
        },
      ],
      overallDayDistribution: [
        { dayOfWeek: 1, dayName: 'Lunes', ticketCount: 10, netSalesNio: 4500 },
        { dayOfWeek: 5, dayName: 'Viernes', ticketCount: 20, netSalesNio: 9000 },
      ],
      overallPeakHours: [
        { hour: 12, formattedHour: '12:00 PM', ticketCount: 18, netSalesNio: 8000 },
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
    expect(screen.getByText('Facturación Neta')).toBeInTheDocument();
    expect(screen.getByText('Descuentos Otorgados')).toBeInTheDocument();
    expect(screen.getAllByText('Tickets').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Ticket Promedio')).toBeInTheDocument();
    expect(screen.getAllByText('30').length).toBeGreaterThanOrEqual(2);

    // Verify table row and convenio description
    expect(screen.getByText('Banco Atlántico S.A.')).toBeInTheDocument();
    expect(screen.getByText(/RUC: J0310000001234/)).toBeInTheDocument();
    expect(screen.getByText('Convenio Empleados BAC')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();

    // Verify widgets of Phase 2
    expect(screen.getByText('Productos Más Consumidos en Convenios')).toBeInTheDocument();
    expect(screen.getByText('Afluencia Semanal y Horarios Pico')).toBeInTheDocument();
    expect(screen.getByText('Combo Almuerzo Ejecutivo')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM')).toBeInTheDocument();

    // Verify Excel and PDF export buttons (Phase 3)
    expect(screen.getByRole('button', { name: /exportar a excel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar a pdf/i })).toBeInTheDocument();

    // Verify row expansion
    const companyRow = screen.getByText('Banco Atlántico S.A.');
    fireEvent.click(companyRow);
    expect(screen.getByText(/Detalle de Consumo — Banco Atlántico S.A./)).toBeInTheDocument();
    expect(screen.getByText('Platos y Productos Preferidos')).toBeInTheDocument();
    expect(screen.getByText('Horarios y Días Habituales de Visita')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar excel de banco atlántico s\.a\./i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar pdf de banco atlántico s\.a\./i })).toBeInTheDocument();
  });

  it('renders convenio name directly when convenioCode is null or empty', () => {
    const mockReport: metricsApiModule.CorporateMetricsReport = {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      generatedAt: '2026-08-31T23:59:59Z',
      kpis: {
        totalCorporateGrossSalesNio: 5000,
        totalCorporateDiscountNio: 500,
        totalCorporateNetSalesNio: 4500,
        totalCorporateTickets: 10,
        overallAverageTicketNio: 450,
        overallEffectiveDiscountRate: 10,
        activeCompaniesCount: 1,
      },
      companies: [
        {
          customerId: 'cust-claro',
          customerName: 'Claro Nicaragua S.A.',
          customerTaxId: 'J0310000005555',
          customerType: 'EMPRESA',
          convenioCode: null, // Sin código manual ingresado
          convenioName: 'Convenio Corporativo Claro',
          ticketCount: 10,
          grossSalesNio: 5000,
          discountNio: 500,
          netSalesNio: 4500,
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

    expect(screen.getByText('Claro Nicaragua S.A.')).toBeInTheDocument();
    expect(screen.getByText('Convenio Corporativo Claro')).toBeInTheDocument();
    expect(screen.queryByText(/sin convenio formal/i)).not.toBeInTheDocument();
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
