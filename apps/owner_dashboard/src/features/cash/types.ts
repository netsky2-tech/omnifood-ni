/**
 * Cash-shift session read model for the owner dashboard (audit finding B6,
 * batch 6 slice 6a). Mirrors the fields returned by GET /sales/shifts
 * (CashShiftSession entity); machine codes stay as-is on the wire and are
 * translated only at the view layer (lib/labels.ts convention, D2/D3).
 */
export type CashShiftStatus = "OPEN" | "CLOSED";

export interface CashShiftSession {
  id: string;
  tenant_id: string;
  terminal_id: string;
  cashier_id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  status: CashShiftStatus;
  initial_float_nio: number;
  initial_float_usd: number;
  expected_cash_nio: number;
  expected_cash_usd: number;
  final_counted_nio: number | null;
  final_counted_usd: number | null;
  difference_nio: number | null;
  difference_usd: number | null;
  z_report_sequence: number | null;
}
