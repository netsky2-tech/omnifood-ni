import { api, type ApiClientMethodOptions } from "@/lib/api";
import { toFiniteNumber } from "@/lib/numeric";
import type {
  ModifierGroup,
  ModifierGroupInput,
  ModifierOption,
  ModifierOptionInput,
} from "./types";
import type {
  EffectiveModifierGroup,
  EffectiveModifierOption,
} from "./effective-types";

/**
 * Honest wire types: Postgres `numeric` reaches the client as strings, so
 * `price_delta` is untrusted at this boundary even though `ModifierOption`
 * declares it as `number`. Everything else is an `integer`/`boolean`/`uuid`
 * column, which node-postgres returns with its declared type already.
 */
export type RawModifierOption = Omit<ModifierOption, "price_delta"> & {
  price_delta: unknown;
};

export type RawModifierGroup = Omit<ModifierGroup, "options"> & {
  options: RawModifierOption[];
};

export type RawEffectiveModifierOption = Omit<
  EffectiveModifierOption,
  "price_delta"
> & {
  price_delta: unknown;
};

export type RawEffectiveModifierGroup = Omit<
  EffectiveModifierGroup,
  "options"
> & {
  options: RawEffectiveModifierOption[];
};

/** Mirrors the backend response boundary in `apps/admin_backend/src/modules/modifiers/modifier-response.ts`. */
export function normalizeModifierOption(
  raw: RawModifierOption,
): ModifierOption {
  return {
    ...raw,
    price_delta: toFiniteNumber(raw.price_delta),
  };
}

export function normalizeModifierGroup(raw: RawModifierGroup): ModifierGroup {
  return {
    ...raw,
    options: raw.options.map(normalizeModifierOption),
  };
}

export function normalizeModifierGroupList(
  raws: RawModifierGroup[],
): ModifierGroup[] {
  return raws.map(normalizeModifierGroup);
}

export function normalizeEffectiveGroups(
  raws: RawEffectiveModifierGroup[],
): EffectiveModifierGroup[] {
  return raws.map((group) => ({
    ...group,
    options: group.options.map((option) => ({
      ...option,
      price_delta: toFiniteNumber(option.price_delta),
    })),
  }));
}

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
  return api
    .get<RawModifierGroup[]>(`/modifier-groups${qs ? `?${qs}` : ""}`, opts)
    .then<ModifierGroup[], never>(normalizeModifierGroupList);
}

export function fetchEffectiveGroups(
  productId: string,
  opts?: ApiClientMethodOptions,
) {
  return api
    .get<RawEffectiveModifierGroup[]>(
      `/modifier-groups/effective?product_id=${productId}`,
      opts,
    )
    .then<EffectiveModifierGroup[], never>(normalizeEffectiveGroups);
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
  return api
    .post<RawModifierGroup>("/modifier-groups", input, opts)
    .then(normalizeModifierGroup);
}

export function updateModifierGroup(
  id: string,
  input: Partial<ModifierGroupInput>,
  opts?: ApiClientMethodOptions,
) {
  return api
    .patch<RawModifierGroup>(`/modifier-groups/${id}`, input, opts)
    .then(normalizeModifierGroup);
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
  return api
    .patch<RawModifierGroup>(
      `/modifier-groups/${id}`,
      { is_active: true },
      opts,
    )
    .then(normalizeModifierGroup);
}

export function createModifierOption(
  groupId: string,
  input: ModifierOptionInput,
  opts?: ApiClientMethodOptions,
) {
  return api
    .post<RawModifierOption>(`/modifier-groups/${groupId}/options`, input, opts)
    .then(normalizeModifierOption);
}

export function updateModifierOption(
  groupId: string,
  optionId: string,
  input: Partial<ModifierOptionInput>,
  opts?: ApiClientMethodOptions,
) {
  return api
    .patch<RawModifierOption>(
      `/modifier-groups/${groupId}/options/${optionId}`,
      input,
      opts,
    )
    .then(normalizeModifierOption);
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
  return api
    .patch<RawModifierOption>(
      `/modifier-groups/${groupId}/options/${optionId}`,
      { is_active: true },
      opts,
    )
    .then(normalizeModifierOption);
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
    return "Ya existe un grupo con ese nombre. Revise la vista «Inactivos»: quizá es un grupo desactivado que puede reactivarse.";
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
