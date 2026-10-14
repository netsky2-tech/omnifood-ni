import { describe, expect, it } from "vitest";
import {
  ALL_APP_PERMISSIONS,
  AppPermission,
  PERMISSIONS_CATALOG,
  updatePermissionsSchema,
} from "../features/users/types";

/**
 * #553 Part 2 (T1) — the dashboard permission mirror must know
 * `sales:issue_credit_note` (the backend's SALES_ISSUE_CREDIT_NOTE, the
 * SOHO Backoffice emitter per D-14/DEC-1). Without it, the permission
 * matrix UI and its zod schema cannot grant or display the permission
 * that already exists and is enforced server-side.
 */
describe("sales:issue_credit_note permission mirror (#553 Part 2 T1)", () => {
  it("declares the permission key mirroring the backend enum", () => {
    expect(AppPermission.SALES_ISSUE_CREDIT_NOTE).toBe(
      "sales:issue_credit_note",
    );
  });

  it("offers it to the permission matrix via ALL_APP_PERMISSIONS", () => {
    expect(ALL_APP_PERMISSIONS).toContain(AppPermission.SALES_ISSUE_CREDIT_NOTE);
  });

  it("documents it in PERMISSIONS_CATALOG under the Ventas category", () => {
    const meta = PERMISSIONS_CATALOG[AppPermission.SALES_ISSUE_CREDIT_NOTE];
    expect(meta.key).toBe(AppPermission.SALES_ISSUE_CREDIT_NOTE);
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.category).toBe("Ventas");
  });

  it("accepts the permission in updatePermissionsSchema", () => {
    const parsed = updatePermissionsSchema.safeParse({
      custom_permissions: [AppPermission.SALES_ISSUE_CREDIT_NOTE],
    });
    expect(parsed.success).toBe(true);
  });
});
