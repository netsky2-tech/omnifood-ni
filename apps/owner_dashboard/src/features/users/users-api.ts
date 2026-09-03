import { apiFetch } from "@/lib/api";
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  PermissionMatrixResponse,
  UserEffectivePermissionsResponse,
  AppPermission,
} from "./types";

export async function fetchUsers(): Promise<User[]> {
  return apiFetch<User[]>("/identity/users");
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const payload: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    role: input.role,
  };

  if (input.password && input.password.trim().length > 0) {
    payload.password = input.password;
  }

  if (input.pin && input.pin.trim().length > 0) {
    payload.pin = input.pin;
  }

  return apiFetch<User>("/identity/users", {
    method: "POST",
    body: payload,
  });
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const payload: Record<string, unknown> = {};

  if (input.name !== undefined && input.name.trim().length > 0) {
    payload.name = input.name;
  }

  if (input.role !== undefined) {
    payload.role = input.role;
  }

  if (input.password && input.password.trim().length > 0) {
    payload.password = input.password;
  }

  if (input.pin && input.pin.trim().length > 0) {
    payload.pin = input.pin;
  }

  return apiFetch<User>(`/identity/users/${id}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deactivateUser(id: string): Promise<void> {
  await apiFetch<void>(`/identity/users/${id}`, {
    method: "DELETE",
  });
}

export async function fetchPermissionsMatrix(): Promise<PermissionMatrixResponse> {
  return apiFetch<PermissionMatrixResponse>("/identity/users/permissions/matrix");
}

export async function fetchUserPermissions(
  userId: string,
): Promise<UserEffectivePermissionsResponse> {
  return apiFetch<UserEffectivePermissionsResponse>(`/identity/users/${userId}/permissions`);
}

export async function updateUserPermissions(
  userId: string,
  customPermissions: AppPermission[],
): Promise<UserEffectivePermissionsResponse> {
  return apiFetch<UserEffectivePermissionsResponse>(
    `/identity/users/${userId}/permissions`,
    {
      method: "PUT",
      body: {
        custom_permissions: customPermissions,
      },
    },
  );
}
