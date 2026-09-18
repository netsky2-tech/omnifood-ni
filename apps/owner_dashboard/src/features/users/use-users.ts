import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchUsers,
  createUser,
  updateUser,
  deactivateUser,
  fetchPermissionsMatrix,
  fetchUserPermissions,
  updateUserPermissions,
} from "./users-api";
import type {
  CreateUserInput,
  UpdateUserInput,
  AppPermission,
} from "./types";

export function useUsers() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["users", tenantId],
    queryFn: ({ signal }) => fetchUsers({ signal }),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      updateUser(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
    },
  });
}

export function usePermissionsMatrix() {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["users", tenantId, "permissions-matrix"],
    queryFn: ({ signal }) => fetchPermissionsMatrix({ signal }),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUserPermissions(userId: string | null) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["users", tenantId, userId, "permissions"],
    queryFn: ({ signal }) => fetchUserPermissions(userId!, { signal }),
    enabled: Boolean(userId),
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  return useMutation({
    mutationFn: ({
      userId,
      permissions,
    }: {
      userId: string;
      permissions: AppPermission[];
    }) => updateUserPermissions(userId, permissions),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
      queryClient.invalidateQueries({
        queryKey: ["users", tenantId, variables.userId, "permissions"],
      });
    },
  });
}
