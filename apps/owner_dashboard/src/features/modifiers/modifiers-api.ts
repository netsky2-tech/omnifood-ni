import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  ModifierGroup,
  ModifierGroupInput,
  ModifierOption,
  ModifierOptionInput,
} from "./types";
import type { EffectiveModifierGroup } from "./effective-types";

/**
 * HTTP functions for the modifier-groups screen. Same client and tenant
 * header conventions as the catalog feature; the backend prefixes all
 * routes under /modifier-groups.
 */
/** Listing filter for soft-deleted vs active modifier groups. */
export type ModifierGroupStatus = "active" | "inactive" | "all";

export function fetchModifierGroups(
  filters: {
    category_id?: string;
    product_id?: string;
    status?: ModifierGroupStatus;
  } = {},
  opts?: ApiClientMethodOptions,
) {
  const params = new URLSearchParams();
  if (filters.category_id) params.set("category_id", filters.category_id);
  if (filters.product_id) params.set("product_id", filters.product_id);
  // Omitted when absent: the backend defaults to the active listing, which
  // keeps the legacy URL (and its caching) unchanged.
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  return api.get<ModifierGroup[]>(
    `/modifier-groups${qs ? `?${qs}` : ""}`,
    opts,
  );
}

export function fetchEffectiveGroups(
  productId: string,
  opts?: ApiClientMethodOptions,
) {
  return api.get<EffectiveModifierGroup[]>(
    `/modifier-groups/effective?product_id=${productId}`,
    opts,
  );
}

export function attachGroupToCategory(
  groupId: string,
  catalogValueId: string,
  sortOrder: number,
  opts?: ApiClientMethodOptions,
) {
  return api.post<Record<string, string>>(
    `/modifier-groups/${groupId}/categories`,
    { catalog_value_id: catalogValueId, sort_order: sortOrder },
    opts,
  );
}

export function detachGroupFromCategory(
  groupId: string,
  catalogValueId: string,
  opts?: ApiClientMethodOptions,
) {
  return api.delete<{ success: boolean }>(
    `/modifier-groups/${groupId}/categories/${catalogValueId}`,
    opts,
  );
}

export function attachGroupToProduct(
  groupId: string,
  productId: string,
  sortOrder: number,
  opts?: ApiClientMethodOptions,
) {
  return api.post<Record<string, string>>(
    `/modifier-groups/${groupId}/products`,
    { product_id: productId, sort_order: sortOrder },
    opts,
  );
}

export function detachGroupFromProduct(
  groupId: string,
  productId: string,
  opts?: ApiClientMethodOptions,
) {
  return api.delete<{ success: boolean }>(
    `/modifier-groups/${groupId}/products/${productId}`,
    opts,
  );
}

export function createModifierGroup(
  input: ModifierGroupInput,
  opts?: ApiClientMethodOptions,
) {
  return api.post<ModifierGroup>("/modifier-groups", input, opts);
}

export function updateModifierGroup(
  id: string,
  input: Partial<ModifierGroupInput>,
  opts?: ApiClientMethodOptions,
) {
  return api.patch<ModifierGroup>(`/modifier-groups/${id}`, input, opts);
}

export function deactivateModifierGroup(
  id: string,
  opts?: ApiClientMethodOptions,
) {
  return api.delete<{ success: boolean }>(`/modifier-groups/${id}`, opts);
}

/** Restores a soft-deleted group; attachments and history are preserved. */
export function reactivateModifierGroup(
  id: string,
  opts?: ApiClientMethodOptions,
) {
  return api.patch<ModifierGroup>(
    `/modifier-groups/${id}`,
    { is_active: true },
    opts,
  );
}

export function createModifierOption(
  groupId: string,
  input: ModifierOptionInput,
  opts?: ApiClientMethodOptions,
) {
  return api.post<ModifierOption>(
    `/modifier-groups/${groupId}/options`,
    input,
    opts,
  );
}

export function updateModifierOption(
  groupId: string,
  optionId: string,
  input: Partial<ModifierOptionInput>,
  opts?: ApiClientMethodOptions,
) {
  return api.patch<ModifierOption>(
    `/modifier-groups/${groupId}/options/${optionId}`,
    input,
    opts,
  );
}

export function deactivateModifierOption(
  groupId: string,
  optionId: string,
  opts?: ApiClientMethodOptions,
) {
  return api.delete<{ success: boolean }>(
    `/modifier-groups/${groupId}/options/${optionId}`,
    opts,
  );
}

/** Restores a soft-deleted option; its group must already be active. */
export function reactivateModifierOption(
  groupId: string,
  optionId: string,
  opts?: ApiClientMethodOptions,
) {
  return api.patch<ModifierOption>(
    `/modifier-groups/${groupId}/options/${optionId}`,
    { is_active: true },
    opts,
  );
}

interface ApiErrorShape {
  status?: number;
  statusCode?: number;
}

/**
 * Translates backend failures into plain Spanish business copy for the
 * modifiers screen. The backend speaks English and returns technical
 * validation wording, so raw bodies are NEVER shown to the user: 409 maps
 * to the duplicate-name message, 400 to a generic form-review message and
 * connection failures to the offline message. Technical detail stays in
 * code, never on screen.
 */
export function describeModifierError(
  error: unknown,
  fallback: string,
): string {
  const status =
    (error as ApiErrorShape | null)?.status ??
    (error as ApiErrorShape | null)?.statusCode;

  if (status === 409) {
    return "Ya existe un grupo con ese nombre";
  }
  if (status === 400) {
    return "Revise los datos del formulario: hay valores que no son válidos";
  }
  if (status === 404) {
    return "El elemento ya no existe. Actualice la lista e intente de nuevo";
  }
  if (status === undefined) {
    // No HTTP status means the request never reached the server.
    return "No se pudo conectar con el servidor";
  }
  return fallback;
}
