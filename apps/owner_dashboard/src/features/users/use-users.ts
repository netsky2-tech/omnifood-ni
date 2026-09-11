import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  return useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUser(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      updateUser(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function usePermissionsMatrix() {
  return useQuery({
    queryKey: ["users", "permissions-matrix"],
    queryFn: fetchPermissionsMatrix,
    staleTime: 10 * 60 * 1000,
  });
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: ["users", userId, "permissions"],
    queryFn: () => fetchUserPermissions(userId!),
    enabled: Boolean(userId),
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      permissions,
    }: {
      userId: string;
      permissions: AppPermission[];
    }) => updateUserPermissions(userId, permissions),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({
        queryKey: ["users", variables.userId, "permissions"],
      });
    },
  });
}
