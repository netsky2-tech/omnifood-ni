import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  AppPermission,
  DEFAULT_ROLE_PERMISSIONS,
  UserRole,
  resolveEffectivePermissions,
  hasEffectivePermission,
} from "@/features/users/types";
import { useHasPermission } from "@/features/users/use-has-permission";
import { useAuthStore } from "@/features/auth/auth-store";

describe("ONB1.5C — Frontend Onboarding Permissions & Role Resolution", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      isAuthenticated: false,
      hydrated: true,
    });
  });

  it("exports ONBOARDING_ACTIVATION_MANAGE and onboarding permissions in AppPermission", () => {
    expect(AppPermission.ONBOARDING_READ).toBe("onboarding:read");
    expect(AppPermission.ONBOARDING_START).toBe("onboarding:start");
    expect(AppPermission.ONBOARDING_FISCAL_CONFIGURE).toBe("onboarding:fiscal:configure");
    expect(AppPermission.ONBOARDING_TEMPLATE_APPLY).toBe("onboarding:template:apply");
    expect(AppPermission.ONBOARDING_PRODUCT_IMPORT_MANAGE).toBe("onboarding:product_import:manage");
    expect(AppPermission.ONBOARDING_ACTIVATION_MANAGE).toBe("onboarding:activation:manage");
    expect(AppPermission.ONBOARDING_SUPPORT_ASSIST).toBe("onboarding:support:assist");
  });

  it("includes ONBOARDING_ACTIVATION_MANAGE in OWNER default role permissions", () => {
    const ownerPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.OWNER];
    expect(ownerPerms).toContain(AppPermission.ONBOARDING_ACTIVATION_MANAGE);
    expect(ownerPerms).toContain(AppPermission.ONBOARDING_READ);
  });

  it("excludes ONBOARDING_ACTIVATION_MANAGE from MANAGER, CASHIER and WAITER default role permissions", () => {
    expect(DEFAULT_ROLE_PERMISSIONS[UserRole.MANAGER]).not.toContain(
      AppPermission.ONBOARDING_ACTIVATION_MANAGE,
    );
    expect(DEFAULT_ROLE_PERMISSIONS[UserRole.CASHIER]).not.toContain(
      AppPermission.ONBOARDING_ACTIVATION_MANAGE,
    );
    expect(DEFAULT_ROLE_PERMISSIONS[UserRole.WAITER]).not.toContain(
      AppPermission.ONBOARDING_ACTIVATION_MANAGE,
    );
  });

  it("resolves effective permissions correctly for role and custom grants", () => {
    // Owner has it naturally
    expect(
      hasEffectivePermission(
        { role: UserRole.OWNER, permissions: [] },
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      ),
    ).toBe(true);

    // Manager does NOT have it by default
    expect(
      hasEffectivePermission(
        { role: UserRole.MANAGER, permissions: [] },
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      ),
    ).toBe(false);

    // Manager with explicit custom override HAS it
    expect(
      hasEffectivePermission(
        {
          role: UserRole.MANAGER,
          permissions: [AppPermission.ONBOARDING_ACTIVATION_MANAGE],
        },
        AppPermission.ONBOARDING_ACTIVATION_MANAGE,
      ),
    ).toBe(true);
  });

  it("useHasPermission hook reflects auth store current user permissions", () => {
    // No user -> false
    const { result: r1 } = renderHook(() =>
      useHasPermission(AppPermission.ONBOARDING_ACTIVATION_MANAGE),
    );
    expect(r1.current).toBe(false);

    // Cashier user -> false
    useAuthStore.setState({
      user: {
        id: "u-cashier",
        email: "cashier@example.com",
        name: "Cajero",
        role: UserRole.CASHIER,
        tenantId: "t-1",
        active: true,
      },
      isAuthenticated: true,
    });

    const { result: r2 } = renderHook(() =>
      useHasPermission(AppPermission.ONBOARDING_ACTIVATION_MANAGE),
    );
    expect(r2.current).toBe(false);

    // Owner user -> true
    useAuthStore.setState({
      user: {
        id: "u-owner",
        email: "owner@example.com",
        name: "Dueño",
        role: UserRole.OWNER,
        tenantId: "t-1",
        active: true,
      },
      isAuthenticated: true,
    });

    const { result: r3 } = renderHook(() =>
      useHasPermission(AppPermission.ONBOARDING_ACTIVATION_MANAGE),
    );
    expect(r3.current).toBe(true);
  });
});
