import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { setTokens, clearTokens } from "@/lib/api";
import {
  fetchOnboardingSession,
  fetchOnboardingReadiness,
  startOnboardingSession,
  isVersionConflictError,
} from "@/features/onboarding/onboarding-api";
import {
  OnboardingLifecycleState,
  type OnboardingSessionResponse,
  type OnboardingReadinessSnapshot,
} from "@/features/onboarding/types";
import { calculateSetupCenterProgress } from "@/features/onboarding/use-onboarding";

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  setTokens({ accessToken: "test-owner-token", refreshToken: "test-refresh-token" });
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

function mockFetchSuccess(body: unknown, status = 200) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchError(status: number, message: string) {
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ message, statusCode: status }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("ONB1.2 — Onboarding API & Concurrency Contract (TDD RED)", () => {
  const sampleSessionResponse: OnboardingSessionResponse = {
    session: {
      id: "session-uuid-1",
      tenantId: "tenant-onb-1",
      lifecycleState: OnboardingLifecycleState.SETUP_IN_PROGRESS,
      onboardingStartedAt: "2026-09-03T18:00:00.000Z",
      saleReadyFirstAt: null,
      activationStartedAt: null,
      activatedAt: null,
      firstSuccessfulSaleAt: null,
      firstCustomerSaleAt: null,
      lastActivityAt: "2026-09-03T18:05:00.000Z",
      currentActivationAttemptId: null,
      measurementEligible: true,
      legacyBaseline: false,
      optimisticVersion: 1,
      createdAt: "2026-09-03T18:00:00.000Z",
      updatedAt: "2026-09-03T18:05:00.000Z",
    },
    readiness: {
      identity: {
        tenantExists: true,
        initialOwnerExists: true,
        ownerCanAuthenticate: true,
        tenantContextValid: true,
      },
      fiscal: {
        minimumConfigurationValid: true,
        businessName: "Café París",
        fiscalRegime: "CUOTA_FIJA",
        taxRate: 0.0,
        pricesIncludeTax: true,
      },
      catalog: {
        sellableProductCount: 0,
        hasSellableProduct: false,
      },
      saleReady: false,
      inventoryReady: false,
      costingReady: false,
      operationsReady: false,
      blockers: ["CATALOG_NO_SELLABLE_PRODUCTS"],
      warnings: [],
      evaluatedAt: "2026-09-03T18:05:00.000Z",
    },
  };

  describe("API Client Endpoints", () => {
    it("fetchOnboardingSession calls GET /api/onboarding/session and returns session + readiness", async () => {
      mockFetchSuccess(sampleSessionResponse);

      const result = await fetchOnboardingSession();

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/onboarding/session",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-owner-token",
          }),
        }),
      );

      expect(result.session.tenantId).toBe("tenant-onb-1");
      expect(result.session.lifecycleState).toBe(OnboardingLifecycleState.SETUP_IN_PROGRESS);
      expect(result.session.optimisticVersion).toBe(1);
      expect(result.readiness.saleReady).toBe(false);
      expect(result.readiness.blockers).toContain("CATALOG_NO_SELLABLE_PRODUCTS");
    });

    it("fetchOnboardingReadiness calls GET /api/onboarding/readiness", async () => {
      mockFetchSuccess(sampleSessionResponse.readiness);

      const result = await fetchOnboardingReadiness();

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/onboarding/readiness",
        expect.objectContaining({
          method: "GET",
        }),
      );

      expect(result.fiscal.minimumConfigurationValid).toBe(true);
      expect(result.catalog.sellableProductCount).toBe(0);
    });

    it("startOnboardingSession calls POST /api/onboarding/session/start with source", async () => {
      mockFetchSuccess(sampleSessionResponse);

      const result = await startOnboardingSession("SETUP_CENTER");

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/onboarding/session/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ source: "SETUP_CENTER" }),
        }),
      );

      expect(result.session.id).toBe("session-uuid-1");
    });
  });

  describe("VERSION_CONFLICT & Optimistic Concurrency Detection", () => {
    it("isVersionConflictError identifies 409 ConflictException containing VERSION_CONFLICT", () => {
      const error = new Error(
        "VERSION_CONFLICT: Onboarding session session-uuid-1 was updated concurrently (expected version: 1)",
      );
      expect(isVersionConflictError(error)).toBe(true);
    });

    it("isVersionConflictError returns false for generic network or auth errors", () => {
      expect(isVersionConflictError(new Error("Network timeout"))).toBe(false);
      expect(isVersionConflictError(new Error("Unauthorized"))).toBe(false);
      expect(isVersionConflictError(null)).toBe(false);
      expect(isVersionConflictError(undefined)).toBe(false);
    });

    it("throws and propagates error on VERSION_CONFLICT response from backend", async () => {
      mockFetchError(
        409,
        "VERSION_CONFLICT: Onboarding session session-uuid-1 was updated concurrently (expected version: 1)",
      );

      await expect(fetchOnboardingSession()).rejects.toThrow(/VERSION_CONFLICT/i);
    });
  });

  describe("State-based Progress Calculation (Pure Domain Evaluation, No useState Authority)", () => {
    it("computes step states based strictly on readiness ports without ephemeral state", () => {
      const progress = calculateSetupCenterProgress(
        sampleSessionResponse.session,
        sampleSessionResponse.readiness,
      );

      expect(progress.currentLifecycle).toBe(OnboardingLifecycleState.SETUP_IN_PROGRESS);
      expect(progress.isSaleReady).toBe(false);
      expect(progress.isLegacyBaseline).toBe(false);
      expect(progress.isMeasurementEligible).toBe(true);
      expect(progress.optimisticVersion).toBe(1);

      // Identity step should be completed
      const identityStep = progress.steps.find((s) => s.key === "identity");
      expect(identityStep?.status).toBe("COMPLETED");

      // Fiscal step should be completed
      const fiscalStep = progress.steps.find((s) => s.key === "fiscal");
      expect(fiscalStep?.status).toBe("COMPLETED");

      // Catalog step should be BLOCKED because sellableProductCount === 0
      const catalogStep = progress.steps.find((s) => s.key === "catalog");
      expect(catalogStep?.status).toBe("IN_PROGRESS");
      expect(catalogStep?.blockers).toContain("CATALOG_NO_SELLABLE_PRODUCTS");

      // Activation step should be BLOCKED because not SALE_READY
      const activationStep = progress.steps.find((s) => s.key === "activation");
      expect(activationStep?.status).toBe("BLOCKED");

      // Next recommended action should point to Catalog / Products
      expect(progress.nextRecommendedAction.actionKey).toBe("catalog");
    });

    it("recognizes pre-configured tenant without requiring artificial clicks (OD-16 / ONB1.2C)", () => {
      const preconfiguredReadiness: OnboardingReadinessSnapshot = {
        identity: {
          tenantExists: true,
          initialOwnerExists: true,
          ownerCanAuthenticate: true,
          tenantContextValid: true,
        },
        fiscal: {
          minimumConfigurationValid: true,
          businessName: "Restaurante Preexistente S.A.",
          fiscalRegime: "REGIMEN_GENERAL",
          taxRate: 15.0,
          pricesIncludeTax: true,
        },
        catalog: {
          sellableProductCount: 42,
          hasSellableProduct: true,
        },
        saleReady: true,
        inventoryReady: false,
        costingReady: false,
        operationsReady: false,
        blockers: [],
        warnings: [],
        evaluatedAt: "2026-09-03T18:10:00.000Z",
      };

      const preconfiguredSession = {
        ...sampleSessionResponse.session,
        lifecycleState: OnboardingLifecycleState.SALE_READY,
        saleReadyFirstAt: "2026-09-03T18:10:00.000Z",
        optimisticVersion: 2,
      };

      const progress = calculateSetupCenterProgress(
        preconfiguredSession,
        preconfiguredReadiness,
      );

      expect(progress.isSaleReady).toBe(true);
      expect(progress.currentLifecycle).toBe(OnboardingLifecycleState.SALE_READY);

      const catalogStep = progress.steps.find((s) => s.key === "catalog");
      expect(catalogStep?.status).toBe("COMPLETED");

      const activationStep = progress.steps.find((s) => s.key === "activation");
      expect(activationStep?.status).toBe("IN_PROGRESS");

      expect(progress.nextRecommendedAction.actionKey).toBe("activation");
    });

    it("respects legacyBaseline flag without fabricating historical metrics (ONB1.2A)", () => {
      const legacySession = {
        ...sampleSessionResponse.session,
        legacyBaseline: true,
        measurementEligible: false,
        onboardingStartedAt: null,
      };

      const progress = calculateSetupCenterProgress(
        legacySession,
        sampleSessionResponse.readiness,
      );

      expect(progress.isLegacyBaseline).toBe(true);
      expect(progress.isMeasurementEligible).toBe(false);
    });

    it("triangulates: fiscal incomplete but catalog loaded directs to fiscal step", () => {
      const fiscalIncompleteReadiness: OnboardingReadinessSnapshot = {
        identity: {
          tenantExists: true,
          initialOwnerExists: true,
          ownerCanAuthenticate: true,
          tenantContextValid: true,
        },
        fiscal: {
          minimumConfigurationValid: false,
        },
        catalog: {
          sellableProductCount: 15,
          hasSellableProduct: true,
        },
        saleReady: false,
        inventoryReady: false,
        costingReady: false,
        operationsReady: false,
        blockers: ["FISCAL_CONFIGURATION_INCOMPLETE"],
        warnings: [],
        evaluatedAt: "2026-09-03T18:15:00.000Z",
      };

      const progress = calculateSetupCenterProgress(
        sampleSessionResponse.session,
        fiscalIncompleteReadiness,
      );

      expect(progress.steps.find((s) => s.key === "fiscal")?.status).toBe("IN_PROGRESS");
      expect(progress.steps.find((s) => s.key === "catalog")?.status).toBe("COMPLETED");
      expect(progress.nextRecommendedAction.actionKey).toBe("fiscal");
    });

    it("triangulates: fully activated lifecycle shows 100% progress and completed activation step", () => {
      const activatedSession = {
        ...sampleSessionResponse.session,
        lifecycleState: OnboardingLifecycleState.ACTIVATED,
        activatedAt: "2026-09-03T18:30:00.000Z",
        firstSuccessfulSaleAt: "2026-09-03T18:29:00.000Z",
        optimisticVersion: 5,
      };

      const fullReadiness: OnboardingReadinessSnapshot = {
        identity: {
          tenantExists: true,
          initialOwnerExists: true,
          ownerCanAuthenticate: true,
          tenantContextValid: true,
        },
        fiscal: {
          minimumConfigurationValid: true,
          businessName: "Super Pollo",
          fiscalRegime: "CUOTA_FIJA",
        },
        catalog: {
          sellableProductCount: 10,
          hasSellableProduct: true,
        },
        saleReady: true,
        inventoryReady: true,
        costingReady: false,
        operationsReady: false,
        blockers: [],
        warnings: [],
        evaluatedAt: "2026-09-03T18:30:00.000Z",
      };

      const progress = calculateSetupCenterProgress(activatedSession, fullReadiness);

      expect(progress.currentLifecycle).toBe(OnboardingLifecycleState.ACTIVATED);
      expect(progress.percentage).toBe(100);
      expect(progress.completedStepsCount).toBe(4);
      expect(progress.steps.every((s) => s.status === "COMPLETED")).toBe(true);
      expect(progress.nextRecommendedAction.label).toBe("Onboarding Completado");
    });
  });
});
