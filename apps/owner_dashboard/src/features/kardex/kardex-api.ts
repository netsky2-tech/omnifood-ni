import { api, type ApiClientMethodOptions } from "@/lib/api";
import type { KardexPendingCorrection } from "./types";

/**
 * Pending kardex corrections queue (GET /inventory/regularization/pending,
 * OWNER/MANAGER on the backend). The server is authoritative: the list only
 * previews the approval; the backend re-validates role, threshold and
 * tenant on every POST.
 */
export function fetchPendingCorrections(opts?: ApiClientMethodOptions) {
  return api.get<KardexPendingCorrection[]>(
    "/inventory/regularization/pending",
    opts,
  );
}

export interface ApproveCorrectionInput {
  queueId: string;
}

export interface KardexCorrectionResponse {
  id: string;
  insumoId: string;
  previousUnitCostNio: number;
  recalculatedUnitCostNio: number;
  deltaUnitCostNio: number;
  totalDeltaCostNio: number;
  affectedQuantity: number;
  authorizationMethod: string | null;
}

/**
 * Approve one pending correction (POST /inventory/regularization/approve).
 *
 * `authMethod: "WEB_CONSOLE"` is the honest authorization declaration for
 * this surface: the approver acts inside an authenticated web-console
 * session (JWT), and the backend records that method as immutable audit
 * metadata on the correction. This route does not consume the optional
 * `token` field, so the dashboard does not fake a PIN/TOTP challenge it
 * cannot verify.
 */
export function approveCorrection(
  { queueId }: ApproveCorrectionInput,
  opts?: ApiClientMethodOptions,
) {
  return api.post<KardexCorrectionResponse>(
    "/inventory/regularization/approve",
    { queueId, authMethod: "WEB_CONSOLE" },
    opts,
  );
}
