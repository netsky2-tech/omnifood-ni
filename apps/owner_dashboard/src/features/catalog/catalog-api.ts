import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  CatalogType,
  CatalogValue,
  CreateCatalogValueInput,
  UpdateCatalogValueInput,
} from "./types";

export function fetchCatalogValues(
  type: CatalogType,
  includeInactive = false,
  opts?: ApiClientMethodOptions,
) {
  const params = includeInactive ? "?includeInactive=true" : "";
  return api.get<CatalogValue[]>(`/catalogs/${type}${params}`, opts);
}

export function createCatalogValue(
  type: CatalogType,
  input: CreateCatalogValueInput,
  opts?: ApiClientMethodOptions,
) {
  return api.post<CatalogValue>(`/catalogs/${type}`, input, opts);
}

export function updateCatalogValue(
  type: CatalogType,
  id: string,
  input: UpdateCatalogValueInput,
  opts?: ApiClientMethodOptions,
) {
  return api.patch<CatalogValue>(`/catalogs/${type}/${id}`, input, opts);
}

export function deactivateCatalogValue(type: CatalogType, id: string, opts?: ApiClientMethodOptions) {
  return api.delete<{ id: string; deactivated: boolean }>(
    `/catalogs/${type}/${id}`,
    opts,
  );
}

export function seedCatalogDefaults(opts?: ApiClientMethodOptions) {
  return api.post<{ inserted: number }>("/catalogs/seed-defaults", {}, opts);
}
