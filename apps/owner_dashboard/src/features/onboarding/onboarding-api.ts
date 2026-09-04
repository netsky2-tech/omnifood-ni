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
