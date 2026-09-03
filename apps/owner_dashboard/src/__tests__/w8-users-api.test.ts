import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { setTokens, clearTokens } from "@/lib/api";
import {
  fetchUsers,
  createUser,
  updateUser,
  deactivateUser,
  fetchPermissionsMatrix,
  fetchUserPermissions,
  updateUserPermissions,
} from "@/features/users/users-api";
import {
  createUserSchema,
  updateUserSchema,
  updatePermissionsSchema,
  AppPermission,
  UserRole,
  resolveEffectivePermissions,
  PERMISSIONS_CATALOG,
  ALL_APP_PERMISSIONS,
} from "@/features/users/types";

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

describe("W8 — Users & Permissions Management API & Schemas (TDD RED)", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid createUserSchema payload", () => {
      const valid = {
        name: "Carlos Cajero",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        pin: "1234",
      };
      const parsed = createUserSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid email in createUserSchema", () => {
      const invalid = {
        name: "Carlos",
        email: "not-an-email",
        role: UserRole.CASHIER,
      };
      const parsed = createUserSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it("rejects non-numeric PIN or PIN with fewer than 4 digits", () => {
      const nonNumeric = {
        name: "Carlos",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        pin: "12ab",
      };
      expect(createUserSchema.safeParse(nonNumeric).success).toBe(false);

      const tooShort = {
        name: "Carlos",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        pin: "123",
      };
      expect(createUserSchema.safeParse(tooShort).success).toBe(false);
    });

    it("accepts valid 4-8 digit numeric PIN", () => {
      const pin4 = {
        name: "Carlos",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        pin: "5678",
      };
      expect(createUserSchema.safeParse(pin4).success).toBe(true);

      const pin6 = {
        name: "Carlos",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        pin: "123456",
      };
      expect(createUserSchema.safeParse(pin6).success).toBe(true);
    });

    it("validates updateUserSchema allowing partial updates", () => {
      const partial = {
        name: "Carlos Alberto",
        role: UserRole.MANAGER,
      };
      const parsed = updateUserSchema.safeParse(partial);
      expect(parsed.success).toBe(true);
    });

    it("validates updatePermissionsSchema and rejects duplicates", () => {
      const valid = {
        custom_permissions: [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.CASH_MANUAL_DRAWER_OPEN,
        ],
      };
      expect(updatePermissionsSchema.safeParse(valid).success).toBe(true);

      const duplicates = {
        custom_permissions: [
          AppPermission.SALES_VOID_INVOICE,
          AppPermission.SALES_VOID_INVOICE,
        ],
      };
      expect(updatePermissionsSchema.safeParse(duplicates).success).toBe(false);
    });
  });

  describe("Permission Calculation Logic", () => {
    it("resolves OWNER effective permissions including all defaults even without custom permissions", () => {
      const perms = resolveEffectivePermissions(UserRole.OWNER, []);
      expect(perms).toContain(AppPermission.SALES_VOID_INVOICE);
      expect(perms).toContain(AppPermission.INVENTORY_RECIPE_EDIT);
      expect(perms).toContain(AppPermission.LOYALTY_ADJUST);
    });

    it("resolves CASHIER effective permissions merging role defaults (empty) and custom overrides", () => {
      const perms = resolveEffectivePermissions(UserRole.CASHIER, [
        AppPermission.SALES_DISCOUNT_OVERRIDE,
      ]);
      expect(perms).toEqual([AppPermission.SALES_DISCOUNT_OVERRIDE]);
    });

    it("deduplicates role defaults and custom permissions", () => {
      const perms = resolveEffectivePermissions(UserRole.MANAGER, [
        AppPermission.SALES_VOID_INVOICE, // already in MANAGER defaults
        AppPermission.INVENTORY_RECIPE_EDIT, // not in MANAGER defaults
      ]);
      expect(perms.filter((p) => p === AppPermission.SALES_VOID_INVOICE).length).toBe(1);
      expect(perms).toContain(AppPermission.INVENTORY_RECIPE_EDIT);
    });
  });

  describe("API Client functions", () => {
    it("fetchUsers sends GET /api/identity/users with bearer token", async () => {
      const mockUsers = [
        {
          id: "u-1",
          name: "Owner Admin",
          email: "admin@omnifood.ni",
          role: UserRole.OWNER,
          is_active: true,
          created_at: "2026-08-31T00:00:00Z",
        },
      ];
      mockFetchSuccess(mockUsers);

      const users = await fetchUsers();
      expect(users).toEqual(mockUsers);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-owner-token",
          }),
        }),
      );
    });

    it("createUser sends POST /api/identity/users with JSON payload", async () => {
      const newUser = {
        id: "u-2",
        name: "Carlos Cajero",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        is_active: true,
        created_at: "2026-09-01T00:00:00Z",
      };
      mockFetchSuccess(newUser, 201);

      const result = await createUser({
        name: "Carlos Cajero",
        email: "carlos@omnifood.ni",
        role: UserRole.CASHIER,
        pin: "1234",
      });

      expect(result).toEqual(newUser);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-owner-token",
          }),
          body: JSON.stringify({
            name: "Carlos Cajero",
            email: "carlos@omnifood.ni",
            role: UserRole.CASHIER,
            pin: "1234",
          }),
        }),
      );
    });

    it("updateUser sends PUT /api/identity/users/:id with JSON payload", async () => {
      const updatedUser = {
        id: "u-2",
        name: "Carlos Modificado",
        email: "carlos@omnifood.ni",
        role: UserRole.MANAGER,
        is_active: true,
        created_at: "2026-09-01T00:00:00Z",
      };
      mockFetchSuccess(updatedUser);

      const result = await updateUser("u-2", {
        name: "Carlos Modificado",
        role: UserRole.MANAGER,
      });

      expect(result).toEqual(updatedUser);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users/u-2",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            name: "Carlos Modificado",
            role: UserRole.MANAGER,
          }),
        }),
      );
    });

    it("deactivateUser sends DELETE /api/identity/users/:id", async () => {
      mockFetchSuccess({});

      await deactivateUser("u-2");

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users/u-2",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            Authorization: "Bearer test-owner-token",
          }),
        }),
      );
    });

    it("fetchPermissionsMatrix sends GET /api/identity/users/permissions/matrix", async () => {
      const mockMatrix = {
        role_defaults: {
          [UserRole.OWNER]: [AppPermission.SALES_VOID_INVOICE],
          [UserRole.MANAGER]: [AppPermission.SALES_VOID_INVOICE],
          [UserRole.CASHIER]: [],
          [UserRole.WAITER]: [],
        },
        all_permissions: [AppPermission.SALES_VOID_INVOICE],
      };
      mockFetchSuccess(mockMatrix);

      const matrix = await fetchPermissionsMatrix();
      expect(matrix).toEqual(mockMatrix);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users/permissions/matrix",
        expect.anything(),
      );
    });

    it("fetchUserPermissions sends GET /api/identity/users/:id/permissions", async () => {
      const mockPerms = {
        user_id: "u-2",
        role: UserRole.CASHIER,
        role_permissions: [],
        custom_permissions: [AppPermission.SALES_DISCOUNT_OVERRIDE],
        effective_permissions: [AppPermission.SALES_DISCOUNT_OVERRIDE],
      };
      mockFetchSuccess(mockPerms);

      const result = await fetchUserPermissions("u-2");
      expect(result).toEqual(mockPerms);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users/u-2/permissions",
        expect.anything(),
      );
    });

    it("updateUserPermissions sends PUT /api/identity/users/:id/permissions", async () => {
      const mockPerms = {
        user_id: "u-2",
        role: UserRole.CASHIER,
        role_permissions: [],
        custom_permissions: [AppPermission.SALES_DISCOUNT_OVERRIDE],
        effective_permissions: [AppPermission.SALES_DISCOUNT_OVERRIDE],
      };
      mockFetchSuccess(mockPerms);

      const result = await updateUserPermissions("u-2", [
        AppPermission.SALES_DISCOUNT_OVERRIDE,
      ]);

      expect(result).toEqual(mockPerms);
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/identity/users/u-2/permissions",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            custom_permissions: [AppPermission.SALES_DISCOUNT_OVERRIDE],
          }),
        }),
      );
    });

    it("throws clear error when backend returns ConflictException (409) for duplicate email", async () => {
      mockFetchError(409, "El email ya está registrado");

      await expect(
        createUser({
          name: "Duplicate User",
          email: "existing@omnifood.ni",
          role: UserRole.WAITER,
        }),
      ).rejects.toThrow("El email ya está registrado");
    });
  });

  describe("Triangulation — Complex Edge Cases & Invariants", () => {
    describe("PIN & Password boundary cases", () => {
      it("preserves leading zeros in PIN (e.g. '0123') without stripping or numeric coercion", async () => {
        mockFetchSuccess({ id: "u-3", name: "Ana", email: "ana@omnifood.ni", role: UserRole.CASHIER });

        await createUser({
          name: "Ana",
          email: "ana@omnifood.ni",
          role: UserRole.CASHIER,
          pin: "0123",
        });

        const lastCall = fetchSpy.mock.calls[0]!;
        const body = JSON.parse(lastCall[1].body);
        expect(body.pin).toBe("0123");
      });

      it("omits empty string PIN and Password from JSON payload", async () => {
        mockFetchSuccess({ id: "u-4", name: "Luis", email: "luis@omnifood.ni", role: UserRole.WAITER });

        await createUser({
          name: "Luis",
          email: "luis@omnifood.ni",
          role: UserRole.WAITER,
          pin: "",
          password: "",
        });

        const lastCall = fetchSpy.mock.calls[0]!;
        const body = JSON.parse(lastCall[1].body);
        expect(body.pin).toBeUndefined();
        expect(body.password).toBeUndefined();
      });

      it("rejects PIN with 9+ digits or whitespace", () => {
        expect(createUserSchema.safeParse({
          name: "Test",
          email: "test@omnifood.ni",
          role: UserRole.CASHIER,
          pin: "123456789", // 9 digits
        }).success).toBe(false);

        expect(createUserSchema.safeParse({
          name: "Test",
          email: "test@omnifood.ni",
          role: UserRole.CASHIER,
          pin: " 1234 ",
        }).success).toBe(false);
      });

      it("rejects password shorter than 6 characters", () => {
        expect(createUserSchema.safeParse({
          name: "Test",
          email: "test@omnifood.ni",
          role: UserRole.CASHIER,
          password: "12345", // 5 chars
        }).success).toBe(false);
      });
    });

    describe("Permission catalog metadata & resolution edge cases", () => {
      it("guarantees every AppPermission has valid catalog metadata with category and non-empty label", () => {
        const catalogKeys = Object.keys(PERMISSIONS_CATALOG);
        expect(catalogKeys.length).toBe(16);

        for (const perm of ALL_APP_PERMISSIONS) {
          const meta = PERMISSIONS_CATALOG[perm];
          expect(meta).toBeDefined();
          expect(meta.label.length).toBeGreaterThan(0);
          expect(meta.description.length).toBeGreaterThan(0);
          expect(["Ventas", "Caja & Turnos", "Inventario", "Reportes", "Lealtad"]).toContain(meta.category);
        }
      });

      it("returns empty permissions array for unknown role or WAITER role", () => {
        expect(resolveEffectivePermissions(UserRole.WAITER, [])).toEqual([]);
        expect(resolveEffectivePermissions("UNKNOWN_ROLE", [])).toEqual([]);
      });

      it("discards invalid/unknown permission strings gracefully", () => {
        const perms = resolveEffectivePermissions(UserRole.CASHIER, [
          "fake:unknown_permission",
          AppPermission.SALES_PRICE_OVERRIDE,
        ]);
        expect(perms).toEqual([AppPermission.SALES_PRICE_OVERRIDE]);
      });
    });

    describe("HTTP Error Boundaries", () => {
      it("propagates 403 Forbidden on unauthorized user management attempt", async () => {
        mockFetchError(403, "Solo el propietario puede gestionar usuarios");
        await expect(fetchUsers()).rejects.toThrow();
      });

      it("propagates 404 Not Found when updating or deactivating non-existent user", async () => {
        mockFetchError(404, "Usuario no encontrado");
        await expect(updateUser("missing-id", { name: "Nuevo" })).rejects.toThrow();

        mockFetchError(404, "Usuario no encontrado");
        await expect(deactivateUser("missing-id")).rejects.toThrow();
      });
    });
  });
});
