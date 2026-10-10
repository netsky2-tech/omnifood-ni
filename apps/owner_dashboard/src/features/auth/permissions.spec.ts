import { describe, expect, it } from "vitest";
import type { User } from "@/types";
import {
  DEVICE_SYNC_REVOKE,
  canRevokeDevice,
} from "./permissions";

function makeUser(role: User["role"], permissions?: string[]): User {
  const user = {
    id: "u-1",
    email: "u@example.com",
    name: "Test User",
    role,
    tenantId: "t-1",
    active: true,
  } as User;
  if (permissions) {
    return { ...user, permissions } as User;
  }
  return user;
}

describe("canRevokeDevice", () => {
  it("grants OWNER even without a permissions array", () => {
    expect(canRevokeDevice(makeUser("OWNER"))).toBe(true);
  });

  it("denies MANAGER without the device_sync:revoke grant", () => {
    expect(
      canRevokeDevice(makeUser("MANAGER", ["inventory:cost_view"])),
    ).toBe(false);
  });

  it("grants MANAGER with the device_sync:revoke grant (delegated authority)", () => {
    expect(canRevokeDevice(makeUser("MANAGER", [DEVICE_SYNC_REVOKE]))).toBe(
      true,
    );
  });

  it("grants CASHIER with the device_sync:revoke grant (delegated authority)", () => {
    expect(canRevokeDevice(makeUser("CASHIER", [DEVICE_SYNC_REVOKE]))).toBe(
      true,
    );
  });

  it("denies CASHIER without the device_sync:revoke grant", () => {
    expect(canRevokeDevice(makeUser("CASHIER"))).toBe(false);
  });

  it("denies null and undefined users", () => {
    expect(canRevokeDevice(null)).toBe(false);
    expect(canRevokeDevice(undefined)).toBe(false);
  });

  it("accepts the uppercase backend-enum form DEVICE_SYNC_REVOKE", () => {
    expect(canRevokeDevice(makeUser("MANAGER", ["DEVICE_SYNC_REVOKE"]))).toBe(
      true,
    );
  });
});
