/**
 * Fixtures de la parte 2 del showcase: Métricas de Convenios.
 *
 * Continuidad con la parte 1 (cliente empresa → convenio → descuento en POS):
 * mismos nombres, RUC y porcentajes. Las cifras son verificables: cada fila
 * cumple bruto - descuento = neto, neto / tickets = ticket promedio, y los
 * consolidados suman exactamente las filas.
 */

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(amount);

export const METRICS_PERIOD = {
  start: '2026-10-01',
  end: '2026-10-26',
  inputStart: '01/10/2026',
  inputEnd: '26/10/2026',
} as const;

export const METRICS_KPIS = {
  totalCorporateNetSalesNio: 36145.2,
  totalCorporateGrossSalesNio: 41880,
  totalCorporateDiscountNio: 5734.8,
  totalCorporateTickets: 71,
  overallAverageTicketNio: 509.09,
  overallEffectiveDiscountRate: 13.7,
  activeCompaniesCount: 3,
} as const;

export interface CompanyRow {
  customerId: string;
  customerName: string;
  customerTaxId: string;
  convenioName: string;
  ticketCount: number;
  grossSalesNio: number;
  discountNio: number;
  netSalesNio: number;
  effectiveDiscountRate: number;
  averageTicketNio: number;
  topProducts: { productId: string; productName: string; quantity: number; netSalesNio: number }[];
  preferredDays: string;
  preferredHours: string;
}

export const METRICS_COMPANIES: CompanyRow[] = [
  {
    customerId: 'cust-bac',
    customerName: 'Banco Atlántico de Nicaragua',
    customerTaxId: 'J0310000123456',
    convenioName: 'Convenio Banco Atlántico',
    ticketCount: 42,
    grossSalesNio: 28560,
    discountNio: 4284,
    netSalesNio: 24276,
    effectiveDiscountRate: 15,
    averageTicketNio: 578,
    topProducts: [
      { productId: 'p1', productName: 'Combo Almuerzo Ejecutivo', quantity: 28, netSalesNio: 11200 },
      { productId: 'p2', productName: 'Café Americano', quantity: 24, netSalesNio: 1440 },
      { productId: 'p3', productName: 'Almuerzo del Día', quantity: 12, netSalesNio: 1680 },
    ],
    preferredDays: 'Martes 9 · Miércoles 8 · Jueves 7',
    preferredHours: '12:30 PM y 1:00 PM',
  },
  {
    customerId: 'cust-coop',
    customerName: 'Cooperativa La Unión',
    customerTaxId: 'J0310000234567',
    convenioName: 'Convenio Cooperativa La Unión',
    ticketCount: 18,
    grossSalesNio: 7380,
    discountNio: 738,
    netSalesNio: 6642,
    effectiveDiscountRate: 10,
    averageTicketNio: 369,
    topProducts: [
      { productId: 'p1', productName: 'Combo Almuerzo Ejecutivo', quantity: 11, netSalesNio: 4400 },
      { productId: 'p4', productName: 'Batido de Fresa', quantity: 9, netSalesNio: 1170 },
    ],
    preferredDays: 'Lunes 6 · Viernes 5',
    preferredHours: '11:30 AM',
  },
  {
    customerId: 'cust-clinica',
    customerName: 'Clínica San Rafael',
    customerTaxId: 'J0310000345678',
    convenioName: 'Convenio Clínica San Rafael',
    ticketCount: 11,
    grossSalesNio: 5940,
    discountNio: 712.8,
    netSalesNio: 5227.2,
    effectiveDiscountRate: 12,
    averageTicketNio: 475.2,
    topProducts: [
      { productId: 'p5', productName: 'Sándwich de Pollo', quantity: 8, netSalesNio: 960 },
      { productId: 'p2', productName: 'Café Americano', quantity: 7, netSalesNio: 420 },
    ],
    preferredDays: 'Miércoles 4 · Jueves 4',
    preferredHours: '3:00 PM',
  },
];

export const OVERALL_TOP_PRODUCTS = [
  { productId: 'p1', productName: 'Combo Almuerzo Ejecutivo', quantity: 46, netSalesNio: 18400 },
  { productId: 'p2', productName: 'Café Americano', quantity: 38, netSalesNio: 2280 },
  { productId: 'p3', productName: 'Almuerzo del Día', quantity: 21, netSalesNio: 2940 },
  { productId: 'p4', productName: 'Batido de Fresa', quantity: 17, netSalesNio: 2210 },
  { productId: 'p5', productName: 'Croissant de Jamón', quantity: 12, netSalesNio: 1200 },
];

export const DAY_DISTRIBUTION = [
  { dayName: 'Lunes', ticketCount: 14 },
  { dayName: 'Martes', ticketCount: 16 },
  { dayName: 'Miércoles', ticketCount: 12 },
  { dayName: 'Jueves', ticketCount: 11 },
  { dayName: 'Viernes', ticketCount: 13 },
  { dayName: 'Sábado', ticketCount: 5 },
  { dayName: 'Domingo', ticketCount: 0 },
];

export const PEAK_HOURS = [
  { formattedHour: '12:30 PM', ticketCount: 22 },
  { formattedHour: '1:00 PM', ticketCount: 14 },
  { formattedHour: '11:30 AM', ticketCount: 9 },
  { formattedHour: '3:00 PM', ticketCount: 6 },
];

/** Directorio (pestaña anterior) para la transición de la escena 2. */
export const DIRECTORY_ROWS = [
  {
    name: 'Banco Atlántico de Nicaragua',
    type: 'Empresa',
    taxId: 'J0310000123456',
    phone: '+505 2278-0000',
    convenio: 'CONV-BAC: 15%',
  },
  {
    name: 'Cooperativa La Unión',
    type: 'Empresa',
    taxId: 'J0310000234567',
    phone: '+505 2244-1180',
    convenio: 'CONV-COOP: 10%',
  },
  {
    name: 'Clínica San Rafael',
    type: 'Empresa',
    taxId: 'J0310000345678',
    phone: '+505 2255-4477',
    convenio: 'CONV-CSR: 12%',
  },
  {
    name: 'María Fernanda López',
    type: 'Persona Natural',
    taxId: '001-120890-0004A',
    phone: '+505 8888-1020',
    convenio: null,
  },
];
