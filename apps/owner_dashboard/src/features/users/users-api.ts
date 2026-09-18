import { apiFetch, type ApiClientMethodOptions } from "@/lib/api";
import type {
  User,
  CreateUserInput,
  UpdateUserInput,
  PermissionMatrixResponse,
  UserEffectivePermissionsResponse,
  AppPermission,
} from "./types";

export async function fetchUsers(opts?: ApiClientMethodOptions): Promise<User[]> {
  return apiFetch<User[]>("/identity/users", opts);
}

export async function createUser(input: CreateUserInput, opts?: ApiClientMethodOptions): Promise<User> {
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
    ...opts,
    method: "POST",
    body: payload,
  });
}

export async function updateUser(id: string, input: UpdateUserInput, opts?: ApiClientMethodOptions): Promise<User> {
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
    ...opts,
    method: "PUT",
    body: payload,
  });
}

export async function deactivateUser(id: string, opts?: ApiClientMethodOptions): Promise<void> {
  await apiFetch<void>(`/identity/users/${id}`, {
    ...opts,
    method: "DELETE",
  });
}

export async function fetchPermissionsMatrix(opts?: ApiClientMethodOptions): Promise<PermissionMatrixResponse> {
  return apiFetch<PermissionMatrixResponse>("/identity/users/permissions/matrix", opts);
}

export async function fetchUserPermissions(
  userId: string,
  opts?: ApiClientMethodOptions,
): Promise<UserEffectivePermissionsResponse> {
  return apiFetch<UserEffectivePermissionsResponse>(`/identity/users/${userId}/permissions`, opts);
}

export async function updateUserPermissions(
  userId: string,
  customPermissions: AppPermission[],
  opts?: ApiClientMethodOptions,
): Promise<UserEffectivePermissionsResponse> {
  return apiFetch<UserEffectivePermissionsResponse>(
    `/identity/users/${userId}/permissions`,
    {
      ...opts,
      method: "PUT",
      body: {
        custom_permissions: customPermissions,
      },
    },
  );
}
