/**
 * Centralized code → human Spanish label map for the owner dashboard
 * (issue #587, decisions D2/D4).
 *
 * Conventions (mirroring apps/pos_app/lib/core/localization/label_map.dart):
 * - One plain `Record<string, string>` per family; keys are the exact codes
 *   emitted by the backend or declared by the frontend enums.
 * - `localize(code, map)` passes unknown codes through untouched, so a new
 *   backend code never crashes the UI — the regression guard in
 *   src/__tests__/labels.test.ts catches unmapped raw codes at the map level.
 * - Backend machine codes stay as-is on the wire (D3); translation happens
 *   only at the view layer.
 */

/** Returns the human label for `code`, or `code` itself when unmapped. */
export function localize(code: string, map: Record<string, string>): string {
  return map[code] ?? code;
}

/**
 * Onboarding lifecycle states, copy moved verbatim from
 * `getLifecycleDisplayLabel` in src/features/onboarding/setup-center-view.tsx
 * (which now delegates here). Keys verified against `OnboardingLifecycleState`
 * in src/features/onboarding/types.ts.
 */
export const lifecycleStateLabels: Record<string, string> = {
  PROVISIONED: "Inicial",
  SETUP_IN_PROGRESS: "En Configuración",
  SALE_READY: "Listo para Venta",
  ACTIVATION_IN_PROGRESS: "Activación en Curso",
  ACTIVATED: "Activado",
};

/**
 * Inventory alert severities, verified against `AlertSeverity` in
 * src/features/inventory/types.ts (badge text only — the color classes stay
 * in `SEVERITY_STYLES` inside inventory-page.tsx).
 */
export const alertSeverityLabels: Record<string, string> = {
  CRITICAL: "Crítica",
  WARNING: "Advertencia",
  NEGATIVE_STOCK: "Stock Negativo",
};

/**
 * Bulk-import commit modes, verified against `CommitMode` in
 * src/features/settings/types.ts. Option VALUE attributes keep sending the raw
 * enum to the API; only the visible text is human-first.
 */
export const importModeLabels: Record<string, string> = {
  VALID_ONLY: "Importar solo las filas válidas",
  ALL_OR_NOTHING: "Exigir 100% de filas válidas o no importar nada",
};

/**
 * Bulk-import duplicate resolution strategies, verified against
 * `DuplicateResolution` in src/features/settings/types.ts.
 */
export const duplicateResolutionLabels: Record<string, string> = {
  REPLACE: "Actualizar precio y datos del producto existente",
  SKIP: "Omitir el duplicado y conservar el producto existente",
  FAIL: "Detener la importación si existe un duplicado",
};

/**
 * Documented machine failure codes of POST /onboarding/activation/attempts,
 * verified against apps/admin_backend/src/modules/onboarding/services/
 * activation.service.ts. When one of these codes appears in the backend
 * message, the view renders this human lead line (D4) and keeps the raw
 * backend message visible as secondary detail.
 *
 * Note: the linking-code endpoint (device-linking.service.ts) throws no
 * operator-facing machine codes — its failures are status-driven (401/403)
 * or generic messages — so it has no entries in this map.
 */
export const backendActivationErrorLabels: Record<string, string> = {
  CANNOT_START_ACTIVATION_NOT_SALE_READY:
    "Tu comercio todavía no está Listo para Venta, así que no se puede iniciar la activación de la terminal. Completá los pasos pendientes del Setup Center e intentá de nuevo.",
  ACTIVE_ATTEMPT_EXISTS:
    "Ya existe una activación en curso para tu comercio. Continuá el proceso desde la terminal POS; la activación actual debe completarse antes de iniciar otra.",
  FISCAL_REVISION_NOT_AVAILABLE:
    "No se pudo registrar la revisión de tu configuración fiscal. Revisá la Configuración Fiscal DGI en el Setup Center e intentá de nuevo.",
};
