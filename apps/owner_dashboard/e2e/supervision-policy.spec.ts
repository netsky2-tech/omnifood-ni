import { test, expect } from "@playwright/test";
import { performLogin, setupStandardApiMocks } from "./helpers/mock-session";

/**
 * End-to-end browser coverage for the Supervision Policy configuration:
 * An OWNER logs in, navigates to Settings -> Supervision tab, interacts
 * with the Cash Control & Void switches (Blind Count, Corte X PIN, Void PIN),
 * and saves the policy, verifying full browser interaction and network state.
 */
test.describe("NHILOS POS — Owner Dashboard Supervision Policy E2E", () => {
  let currentPolicyState = {
    authorizingRoles: ["MANAGER", "OWNER"],
    selfAuthorizationAllowedCloseBox: true,
    selfAuthorizationAllowedCashDrawer: true,
    selfAuthorizationAllowedManualDiscount: true,
    supervisorRequiredForModifierQuantity: false,
    blindCountEnabled: true,
    supervisorRequiredForPartialXReport: false,
    supervisorRequiredForVoid: false,
  };
  let policyConfigured = false;
  let lastPutPayload: Record<string, unknown> | null = null;

  test.beforeEach(async ({ page }) => {
    lastPutPayload = null;
    policyConfigured = false;
    currentPolicyState = {
      authorizingRoles: ["MANAGER", "OWNER"],
      selfAuthorizationAllowedCloseBox: true,
      selfAuthorizationAllowedCashDrawer: true,
      selfAuthorizationAllowedManualDiscount: true,
      supervisorRequiredForModifierQuantity: false,
      blindCountEnabled: true,
      supervisorRequiredForPartialXReport: false,
      supervisorRequiredForVoid: false,
    };

    await setupStandardApiMocks(page);

    // Dynamic backend route simulation for /api/supervision/policy
    await page.route("**/api/supervision/policy", async (route) => {
      const method = route.request().method();

      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            policy: policyConfigured ? currentPolicyState : null,
            defaultPolicy: {
              authorizingRoles: ["MANAGER", "OWNER"],
              selfAuthorizationAllowedCloseBox: true,
              selfAuthorizationAllowedCashDrawer: true,
              selfAuthorizationAllowedManualDiscount: true,
              supervisorRequiredForModifierQuantity: false,
              blindCountEnabled: true,
              supervisorRequiredForPartialXReport: false,
              supervisorRequiredForVoid: false,
            },
            configured: policyConfigured,
            operationMode: "FOODPARK_QSR",
            validation: { errors: [], warnings: [] },
            configVersion: { revision: 1, fingerprint: "fp-test-01" },
          }),
        });
        return;
      }

      if (method === "PUT") {
        const body = JSON.parse(route.request().postData() || "{}");
        lastPutPayload = body;
        currentPolicyState = {
          ...currentPolicyState,
          ...body,
        };
        policyConfigured = true;

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            policy: currentPolicyState,
            defaultPolicy: currentPolicyState,
            configured: true,
            operationMode: "FOODPARK_QSR",
            validation: { errors: [], warnings: [] },
            configVersion: { revision: 2, fingerprint: "fp-test-02" },
          }),
        });
        return;
      }

      await route.continue();
    });

    await performLogin(page);
  });

  test("owner can configure blind cash count, Corte X PIN and void invoice PIN policies", async ({
    page,
  }) => {
    // 1. Navigate to Settings page
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible();

    // 2. Open Supervision Tab
    const supervisionTab = page.getByRole("tab", { name: "Supervisión" });
    await expect(supervisionTab).toBeVisible();
    await supervisionTab.click();

    // 3. Verify Supervision Policy Card and its sections
    await expect(page.getByTestId("supervision-policy-card")).toBeVisible();
    await expect(page.getByText("Control de caja y anulaciones")).toBeVisible();

    // 4. Locate the three new switches
    const blindCountSwitch = page.locator("#blindCountEnabled");
    const corteXSwitch = page.locator("#supervisorRequiredForPartialXReport");
    const voidSwitch = page.locator("#supervisorRequiredForVoid");

    await expect(blindCountSwitch).toBeVisible();
    await expect(corteXSwitch).toBeVisible();
    await expect(voidSwitch).toBeVisible();

    // 5. Initial state in Foodpark QSR default:
    // blindCountEnabled is true, corteX is false, void is false
    await expect(blindCountSwitch).toHaveAttribute("data-state", "checked");
    await expect(corteXSwitch).toHaveAttribute("data-state", "unchecked");
    await expect(voidSwitch).toHaveAttribute("data-state", "unchecked");

    // Save button should initially be disabled because form is pristine
    const saveButton = page.getByTestId("supervision-save-button");
    await expect(saveButton).toBeDisabled();

    // 6. User modifies policies:
    // - Turn off blind count (manager wants cashiers to see theoretical balances)
    // - Turn on Corte X supervisor PIN
    // - Turn on Invoice Void supervisor PIN
    await blindCountSwitch.click();
    await corteXSwitch.click();
    await voidSwitch.click();

    await expect(blindCountSwitch).toHaveAttribute("data-state", "unchecked");
    await expect(corteXSwitch).toHaveAttribute("data-state", "checked");
    await expect(voidSwitch).toHaveAttribute("data-state", "checked");

    // Save button should now be enabled
    await expect(saveButton).toBeEnabled();

    // 7. Click Save button
    await saveButton.click();

    // 8. Verify the PUT request carried the exact modified policies
    await expect.poll(() => lastPutPayload).not.toBeNull();
    expect(lastPutPayload).toMatchObject({
      blindCountEnabled: false,
      supervisorRequiredForPartialXReport: true,
      supervisorRequiredForVoid: true,
    });

    // 9. After successful save, the form becomes pristine and button is disabled again
    await expect(saveButton).toBeDisabled();

    // 10. Reload the page to ensure the settings persist across page loads
    await page.reload();
    await page.getByRole("tab", { name: "Supervisión" }).click();

    await expect(page.locator("#blindCountEnabled")).toHaveAttribute("data-state", "unchecked");
    await expect(page.locator("#supervisorRequiredForPartialXReport")).toHaveAttribute("data-state", "checked");
    await expect(page.locator("#supervisorRequiredForVoid")).toHaveAttribute("data-state", "checked");
  });
});
