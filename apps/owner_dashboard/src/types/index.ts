export type UserRole = "OWNER" | "MANAGER" | "CASHIER" | "WAITER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  active: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ruc: string;
  active: boolean;
}

export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardSummary {
  totalSales: number;
  totalTransactions: number;
  averageTicket: number;
  salesTrend: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  hourlySales: Array<{ hour: string; amount: number }>;
}

export interface Product {
  id: string;
  name: string;
  type: "SIMPLE" | "COMPOUND" | "VARIANT_PARENT";
  sku: string;
  price: number;
  cost: number;
  active: boolean;
  categoryId: string;
  metadata: Record<string, unknown>;
}

export interface InventoryAlert {
  id: string;
  productName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  severity: "LOW" | "CRITICAL" | "OUT_OF_STOCK";
}

export interface VoidedInvoice {
  id: string;
  consecutiveNumber: string;
  amount: number;
  reason: string;
  voidedBy: string;
  voidedAt: string;
}
