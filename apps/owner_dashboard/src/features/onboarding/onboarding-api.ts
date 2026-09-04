import { api } from "@/lib/api";
import type {
  OnboardingSessionResponse,
  OnboardingReadinessSnapshot,
  CreateManualProductDto,
  OnboardingManualProductResponse,
  OnboardingCatalogSummaryResponse,
} from "./types";

export function isVersionConflictError(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof Error) {
    const msg = error.message;
    return msg.includes("VERSION_CONFLICT") || msg.includes("409");
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (record.statusCode === 409 || record.status === 409) return true;
    if (typeof record.message === "string" && record.message.includes("VERSION_CONFLICT")) {
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
