import { api, type ApiClientMethodOptions } from "@/lib/api";
import type {
  ModifierGroup,
  ModifierGroupInput,
  ModifierOption,
  ModifierOptionInput,
} from "./types";

/**
 * HTTP functions for the modifier-groups screen. Same client and tenant
 * header conventions as the catalog feature; the backend prefixes all
 * routes under /modifier-groups.
 */
export function fetchModifierGroups(opts?: ApiClientMethodOptions) {
  return api.get<ModifierGroup[]>("/modifier-groups", opts);
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
