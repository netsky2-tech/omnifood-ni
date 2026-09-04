import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  emitOnboardingTelemetry,
  sanitizeClientTelemetryPayload,
  isSkippableStep,
} from "../features/onboarding/onboarding-telemetry-client";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

describe("OnboardingTelemetryClient (ONB1.9E & ONB1.9F)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ONB1.9F — Client Zero Secrets Sanitizer", () => {
    it("redacts JWT tokens from values and strings", () => {
      const fakeJwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const payload = {
        action: "VIEW_PAGE",
        authHeader: `Bearer ${fakeJwt}`,
        token: fakeJwt,
      };

      const sanitized = sanitizeClientTelemetryPayload(payload);
      expect(sanitized.authHeader).not.toContain(fakeJwt);
      expect(sanitized.authHeader).toContain("[REDACTED_JWT]");
      expect(sanitized.token).toBe("[REDACTED_JWT]");
    });

    it("redacts password, pin, and secret field names", () => {
      const payload = {
        user: "owner",
        password: "superPassword99!",
        pin: "4321",
        secret_key: "key-123",
      };

      const sanitized = sanitizeClientTelemetryPayload(payload);
      expect(sanitized.user).toBe("owner");
      expect(sanitized.password).toBe("[REDACTED_SECRET]");
      expect(sanitized.pin).toBe("[REDACTED_PIN]");
      expect(sanitized.secret_key).toBe("[REDACTED_SECRET]");
    });

    it("redacts credit card numbers (PAN)", () => {
      const payload = {
        cardNumber: "4532015012345678",
        message: "Card 5425233430109903 used at POS",
      };

      const sanitized = sanitizeClientTelemetryPayload(payload);
      expect(sanitized.cardNumber).toBe("[REDACTED_CARD]");
      expect(sanitized.message).toContain("[REDACTED_CARD]");
      expect(sanitized.message).not.toContain("5425233430109903");
    });

    it("redacts full raw CSV and replaces with summary", () => {
      const rawCsv = "sku,name,price\n1,Soda,30\n2,Water,15\n3,Beer,40";
      const payload = {
        filename: "test.csv",
        raw_csv: rawCsv,
      };

      const sanitized = sanitizeClientTelemetryPayload(payload);
      expect(sanitized.filename).toBe("test.csv");
      expect(sanitized.raw_csv).toEqual({
        redacted: true,
        type: "RAW_CSV_REDACTED",
        lineCount: 4,
        byteLength: rawCsv.length,
      });
    });

    it("masks plain text emails", () => {
      const payload = {
        email: "owner@pulperia.ni",
      };

      const sanitized = sanitizeClientTelemetryPayload(payload);
      expect(sanitized.email).toBe("o***r@pulperia.ni");
    });
  });

  describe("ONB1.9E — Step Skipped Rules & Event Emission", () => {
    it("identifies required blockers as non-skippable", () => {
      expect(isSkippableStep("FISCAL_SETUP")).toBe(false);
      expect(isSkippableStep("PRODUCT_CATALOG")).toBe(false);
      expect(isSkippableStep("ACTIVATION_VERIFICATION_SALE")).toBe(false);

      expect(isSkippableStep("BOH_INVENTORY")).toBe(true);
      expect(isSkippableStep("BOH_COSTING")).toBe(true);
      expect(isSkippableStep("BOH_OPERATIONS")).toBe(true);
    });

    it("throws error when attempting to skip a required blocker", async () => {
      await expect(
        emitOnboardingTelemetry({
          eventName: "STEP_SKIPPED",
          stepId: "FISCAL_SETUP",
        }),
      ).rejects.toThrow("Cannot skip required onboarding step: FISCAL_SETUP");
    });

    it("emits telemetry event with sanitized payload", async () => {
      (api.post as any).mockResolvedValue({ accepted: true, eventName: "STEP_VIEWED" });

      const result = await emitOnboardingTelemetry({
        eventName: "STEP_VIEWED",
        stepId: "BOH_INVENTORY",
        properties: {
          screen: "setup_center",
          unnecessaryPassword: "do-not-send-me",
        },
      });

      expect(result.accepted).toBe(true);
      expect(api.post).toHaveBeenCalledWith(
        "/onboarding/telemetry/events",
        expect.objectContaining({
          eventName: "STEP_VIEWED",
          stepId: "BOH_INVENTORY",
          properties: {
            screen: "setup_center",
            unnecessaryPassword: "[REDACTED_SECRET]",
          },
        }),
      );
    });
  });
});
