import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminInvoices,
  issueAdminCreditNote,
  type IssueAdminCreditNoteBody,
} from "./credit-notes-api";

export function useAdminInvoices(contingencyOnly = false) {
  return useQuery({
    queryKey: ["admin", "invoices", { contingencyOnly }],
    queryFn: ({ signal }) => fetchAdminInvoices({ signal, contingencyOnly }),
    staleTime: 60 * 1000,
  });
}

/**
 * Issuance mutation. On success the invoice list is invalidated so the
 * issued credit note shows up without a manual reload.
 */
export function useIssueCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: IssueAdminCreditNoteBody) =>
      issueAdminCreditNote(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "invoices"] });
    },
  });
}
