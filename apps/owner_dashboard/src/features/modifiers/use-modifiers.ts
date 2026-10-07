import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantId } from "@/lib/tenant";
import {
  fetchModifierGroups,
  fetchEffectiveGroups,
  attachGroupToCategory,
  detachGroupFromCategory,
  attachGroupToProduct,
  detachGroupFromProduct,
  createModifierGroup,
  updateModifierGroup,
  deactivateModifierGroup,
  reactivateModifierGroup,
  createModifierOption,
  updateModifierOption,
  deactivateModifierOption,
  reactivateModifierOption,
} from "./modifiers-api";
import type { ModifierGroupInput, ModifierOptionInput } from "./types";
import type { ModifierGroupStatus } from "./modifiers-api";

/**
 * react-query hooks for the modifier-groups screen, following the same
 * invalidation conventions as the catalog feature: one tenant-scoped key
 * for the list, and every mutation invalidates it so the list re-fetches.
 */
/**
 * Listing of modifier groups, optionally filtered by lifecycle status.
 * `active` (or no argument) keeps the exact legacy query key and request:
 * existing cache entries and tenant-prefix invalidations stay valid.
 * `inactive`/`all` extend the key with the status so both listings get
 * their own cache slot under the same invalidation prefix.
 */
export function useModifierGroups(status?: ModifierGroupStatus) {
  const tenantId = useTenantId();
  const isDefaultListing = !status || status === "active";
  return useQuery({
    queryKey: isDefaultListing
      ? ["modifiers", tenantId]
      : ["modifiers", tenantId, "status", status],
    queryFn: ({ signal }) =>
      fetchModifierGroups(isDefaultListing ? {} : { status: status! }, {
        signal,
      }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Groups attached to one category (inheritance source). */
export function useGroupsByCategory(categoryId?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["modifiers", tenantId, "category", categoryId],
    queryFn: ({ signal }) =>
      fetchModifierGroups({ category_id: categoryId! }, { signal }),
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Effective resolution for one product (inherited + own exceptions). */
export function useEffectiveGroups(productId?: string) {
  const tenantId = useTenantId();
  return useQuery({
    queryKey: ["modifiers", tenantId, "effective", productId],
    queryFn: ({ signal }) => fetchEffectiveGroups(productId!, { signal }),
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAttachCategory() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      catalogValueId,
      sortOrder,
    }: {
      groupId: string;
      catalogValueId: string;
      sortOrder: number;
    }) => attachGroupToCategory(groupId, catalogValueId, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useDetachCategory() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      catalogValueId,
    }: {
      groupId: string;
      catalogValueId: string;
    }) => detachGroupFromCategory(groupId, catalogValueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useAttachProduct() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      productId,
      sortOrder,
    }: {
      groupId: string;
      productId: string;
      sortOrder: number;
    }) => attachGroupToProduct(groupId, productId, sortOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useDetachProduct() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      productId,
    }: {
      groupId: string;
      productId: string;
    }) => detachGroupFromProduct(groupId, productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useCreateModifierGroup() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (input: ModifierGroupInput) => createModifierGroup(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useUpdateModifierGroup() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Partial<ModifierGroupInput>;
    }) => updateModifierGroup(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useDeactivateModifierGroup() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (id: string) => deactivateModifierGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useReactivateModifierGroup() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: (id: string) => reactivateModifierGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useCreateModifierOption() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      input,
    }: {
      groupId: string;
      input: ModifierOptionInput;
    }) => createModifierOption(groupId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useUpdateModifierOption() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      optionId,
      input,
    }: {
      groupId: string;
      optionId: string;
      input: Partial<ModifierOptionInput>;
    }) => updateModifierOption(groupId, optionId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useDeactivateModifierOption() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      optionId,
    }: {
      groupId: string;
      optionId: string;
    }) => deactivateModifierOption(groupId, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}

export function useReactivateModifierOption() {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  return useMutation({
    mutationFn: ({
      groupId,
      optionId,
    }: {
      groupId: string;
      optionId: string;
    }) => reactivateModifierOption(groupId, optionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modifiers", tenantId] });
    },
  });
}
