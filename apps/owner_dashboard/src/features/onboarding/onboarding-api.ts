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
