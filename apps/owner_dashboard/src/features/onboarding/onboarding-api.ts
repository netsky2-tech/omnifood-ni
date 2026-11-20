import { api } from "@/lib/api";
import type {
  OnboardingSessionResponse,
  OnboardingReadinessSnapshot,
  CreateManualProductDto,
  OnboardingManualProductResponse,
  OnboardingCatalogSummaryResponse,
  ActivationAttempt,
  StartActivationDto,
  GenerateLinkingCodeResponse,
  LinkingCodeResponse,
  CreateInstallTokenDto,
  CreateInstallTokenResponse,
  InstallTokenListItem,
  ReactivationChallenge,
  ReactivationChallengeRecord,
  InitiateTerminalReactivationDto,
  InitiateTerminalReactivationResponse,
  RecoveryCodeResponse,
} from "./types";

export function isVersionConflictError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (
      record.statusCode === 409 ||
      record.status === 409 ||
      record.code === "VERSION_CONFLICT"
    ) {
      return true;
    }
    const msg = typeof record.message === "string" ? record.message : "";
    if (
      msg.includes("VERSION_CONFLICT") ||
      msg.includes("409") ||
      msg.includes("Optimistic lock conflict")
    ) {
      return true;
    }
  }
  return false;
}

export async function fetchOnboardingSession(): Promise<OnboardingSessionResponse> {
  return api.get<OnboardingSessionResponse>("/onboarding/session");
}

export async function fetchOnboardingReadiness(): Promise<OnboardingReadinessSnapshot> {
  return api.get<OnboardingReadinessSnapshot>("/onboarding/readiness");
}

export async function startOnboardingSession(
  source = "SETUP_CENTER",
): Promise<OnboardingSessionResponse> {
  return api.post<OnboardingSessionResponse>("/onboarding/session/start", { source });
}

export async function createManualOnboardingProduct(
  dto: CreateManualProductDto,
): Promise<OnboardingManualProductResponse> {
  return api.post<OnboardingManualProductResponse>("/onboarding/catalog/manual-product", dto);
}

export async function fetchOnboardingCatalogSummary(): Promise<OnboardingCatalogSummaryResponse> {
  return api.get<OnboardingCatalogSummaryResponse>("/onboarding/catalog/summary");
}

export async function startActivationAttempt(
  dto: StartActivationDto,
): Promise<ActivationAttempt> {
  return api.post<ActivationAttempt>("/onboarding/activation/attempts", dto);
}

export async function fetchActiveActivationAttempt(): Promise<ActivationAttempt | null> {
  return api.get<ActivationAttempt | null>("/onboarding/activation/attempts/active");
}

export async function cancelActivationAttempt(
  attemptId: string,
  reason?: string,
): Promise<ActivationAttempt> {
  return api.post<ActivationAttempt>(
    `/onboarding/activation/attempts/${attemptId}/cancel`,
    { reason },
  );
}

/**
 * Generates a single-use terminal linking code for the caller's tenant
 * (issue #556 stage 12c). Human-auth: the tenant and actor identity come from
 * the Bearer owner JWT, never from the payload; the backend DTO
 * (GenerateLinkingCodeDto) is fully optional, so NO body is sent. The
 * plaintext code is returned exactly once and expires in 15 minutes.
 */
export async function generateLinkingCode(): Promise<GenerateLinkingCodeResponse> {
  return api.post<GenerateLinkingCodeResponse>("/onboarding/activation/linking-codes");
}

/**
 * Lists the most recent linking codes of the caller's tenant, sorted by
 * createdAt DESC (limit 20). Human-auth: the tenant identity comes from the
 * Bearer owner JWT, never from the query. The dashboard polls this listing to
 * detect when a terminal claims a code and offer one-click activation for the
 * claimed deviceId (issue #569 single linking flow).
 */
export async function fetchLinkingCodes(): Promise<LinkingCodeResponse[]> {
  return api.get<LinkingCodeResponse[]>("/onboarding/activation/linking-codes");
}

/**
 * Lists the tenant's POS install kit tokens (issue #958).
 */
export async function listInstallTokens(): Promise<InstallTokenListItem[]> {
  return api.get<InstallTokenListItem[]>("/onboarding/install-tokens");
}

/**
 * Creates a new POS install kit token for the caller's tenant (issue #958).
 * Plaintext `token` is returned once in the response.
 */
export async function createInstallToken(
  dto: CreateInstallTokenDto = {},
): Promise<CreateInstallTokenResponse> {
  return api.post<CreateInstallTokenResponse>("/onboarding/install-tokens", dto);
}

/**
 * Revokes an install kit token by id (issue #958).
 */
export async function revokeInstallToken(tokenId: string): Promise<void> {
  await api.delete<void>(`/onboarding/install-tokens/${encodeURIComponent(tokenId)}`);
}

/**
 * Lists active (PENDING / APPROVED) terminal reactivation challenges for the
 * caller's tenant (issue #566).
 */
export async function fetchReactivationChallenges(): Promise<ReactivationChallenge[]> {
  const raw = await api.get<unknown>("/onboarding/activation/reactivation-challenges");
  return Array.isArray(raw) ? (raw as ReactivationChallenge[]) : [];
}

/**
 * Approves a pending terminal reactivation challenge with 1 click (issue #566).
 */
export async function approveReactivationChallenge(
  challengeId: string,
): Promise<ReactivationChallengeRecord> {
  return api.post<ReactivationChallengeRecord>(
    `/onboarding/activation/reactivation-challenges/${encodeURIComponent(challengeId)}/approve`,
  );
}

/**
 * Cancels/rejects a pending or approved terminal reactivation challenge (issue #566).
 */
export async function cancelReactivationChallenge(
  challengeId: string,
): Promise<ReactivationChallengeRecord> {
  return api.post<ReactivationChallengeRecord>(
    `/onboarding/activation/reactivation-challenges/${encodeURIComponent(challengeId)}/cancel`,
  );
}

/**
 * Initiates reactivation for an existing terminal, preserving its canonical
 * terminalId and fiscal sequence (issue #566).
 */
export async function initiateTerminalReactivation(
  terminalId: string,
  payload: InitiateTerminalReactivationDto,
): Promise<InitiateTerminalReactivationResponse> {
  return api.post<InitiateTerminalReactivationResponse>(
    `/onboarding/activation/terminals/${encodeURIComponent(terminalId)}/reactivate`,
    payload,
  );
}

/**
 * Issues/rotates a one-time 6-digit recovery code for offline/dashboard-less
 * terminal reactivation approval (issue #566).
 */
export async function rotateTerminalRecoveryCode(
  terminalId: string,
): Promise<RecoveryCodeResponse> {
  return api.post<RecoveryCodeResponse>(
    `/onboarding/activation/terminals/${encodeURIComponent(terminalId)}/recovery-code`,
  );
}

/**
 * Builds the stable public install kit URL (`https://<host>/i/<token>` or
 * `https://<host>/i/<token>?code=<CODE>`) from the dashboard's API base URL,
 * stripping any trailing `/api` or `/api/` prefix cleanly (issue #958).
 *
 * When `apiBaseUrl` is relative (e.g. `/api` in local Vite dev) or empty,
 * falls back to `window.location.origin` if available, or returns a
 * root-relative `/i/<token>` path in non-browser contexts.
 */
export function buildInstallKitUrl(
  apiBaseUrl: string,
  token: string,
  linkingCode?: string,
): string {
  const normalizedBase = apiBaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/i, "")
    .replace(/\/+$/, "");

  const encodedToken = encodeURIComponent(token.trim());
  const path = `/i/${encodedToken}`;
  const trimmedCode = linkingCode?.trim();
  const query = trimmedCode ? `?code=${encodeURIComponent(trimmedCode)}` : "";

  if (normalizedBase.length > 0) {
    return `${normalizedBase}${path}${query}`;
  }

  if (
    typeof window !== "undefined" &&
    typeof window.location?.origin === "string" &&
    /^https?:\/\//i.test(window.location.origin)
  ) {
    return `${window.location.origin}${path}${query}`;
  }

  return `${path}${query}`;
}
