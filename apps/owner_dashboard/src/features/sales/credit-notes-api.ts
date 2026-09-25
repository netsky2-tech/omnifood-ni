import { api, type ApiClientMethodOptions } from "@/lib/api";

/**
 * B1c-2 slice B (D-14, #553 part 2): Backoffice credit-note issuance.
 * Backend surface: AdminInvoicesController (slice A) — POST/GET under
 * /sales/admin, human JWT transport, ISSUE_CREDIT_NOTE permission.
 */

export interface AdminInvoiceItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AdminInvoicePayment {
  method: string;
}

/** Invoice row as served by GET /sales/admin/invoices (findAll shape). */
export interface AdminInvoice {
  id: string;
  number: string;
  created_at: string;
  total: number;
  type: string;
  isCanceled: boolean;
  customerId?: string | null;
  items: AdminInvoiceItem[];
  payments?: AdminInvoicePayment[];
}

/** Result of a successful issuance: the allocated number is the fiscal fact. */
export interface IssuedCreditNote {
  id: string;
  number: string;
  originInvoiceId: string;
  originInvoiceNumber: string;
  total: number;
}

export interface IssueAdminCreditNoteBody {
  originInvoiceId: string;
  refundReasonCode: string;
  refundReasonPolicy: string;
  items: { originInvoiceItemId: string; quantity: number }[];
  notes?: string;
}

export function fetchAdminInvoices(opts?: ApiClientMethodOptions) {
  return api.get<AdminInvoice[]>("/sales/admin/invoices", opts);
}

export function issueAdminCreditNote(
  body: IssueAdminCreditNoteBody,
  opts?: ApiClientMethodOptions,
) {
  return api.post<IssuedCreditNote>("/sales/admin/credit-notes", body, opts);
}
