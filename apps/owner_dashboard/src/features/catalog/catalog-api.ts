import { api } from "@/lib/api";
import type {
  CatalogType,
  CatalogValue,
  CreateCatalogValueInput,
  UpdateCatalogValueInput,
} from "./types";

export function fetchCatalogValues(
  type: CatalogType,
  includeInactive = false,
) {
  const params = includeInactive ? "?includeInactive=true" : "";
  return api.get<CatalogValue[]>(`/catalogs/${type}${params}`);
}

export function createCatalogValue(
  type: CatalogType,
  input: CreateCatalogValueInput,
) {
  return api.post<CatalogValue>(`/catalogs/${type}`, input);
}

export function updateCatalogValue(
  type: CatalogType,
  id: string,
  input: UpdateCatalogValueInput,
) {
  return api.patch<CatalogValue>(`/catalogs/${type}/${id}`, input);
}

export function deactivateCatalogValue(type: CatalogType, id: string) {
  return api.delete<{ id: string; deactivated: boolean }>(
    `/catalogs/${type}/${id}`,
  );
}

export function seedCatalogDefaults() {
  return api.post<{ inserted: number }>("/catalogs/seed-defaults", {});
}
