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
 * Cash-shift status labels (issue #587, moved from
 * src/features/cash/labels.ts). Keys are the exact codes emitted by the
 * backend (`CashShiftStatus`, apps/admin_backend/src/modules/sales/dto/
 * cash-shift.dto.ts). Canonical vocabulary (NHILOS §26/§27): one term per
 * lifecycle state — Abierto / Cerrado — with no synonyms; unknown codes pass
 * through untouched via `localize` so a new backend code never crashes the UI.
 */
export const cashShiftStatusLabels: Record<string, string> = {
  OPEN: "Abierto",
  CLOSED: "Cerrado",
};

/**
 * Kardex regularization queue statuses (slice 6c). Keys are the exact values
 * of KardexQueueStatus (apps/admin_backend/src/modules/inventory/entities/
 * kardex-recalculate-queue.entity.ts); COMPLETED is intentionally absent —
 * the pending route excludes already-regularized rows, so a future COMPLETED
 * value on the wire passes through untouched via `localize`. Canonical
 * vocabulary (NHILOS §26/§27): one term per lifecycle state.
 */
export const kardexQueueStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  PROCESSING: "En proceso",
  BLOCKED: "Bloqueado",
  FAILED: "Falló",
};

/**
 * Inventory movement type labels (slice 6c). Keys are the exact values of
 * MovementType (apps/admin_backend/src/modules/inventory/entities/
 * inventory-movement.entity.ts), used on the kardex page to explain what
 * triggered each detected correction. Unknown values pass through untouched
 * via `localize`.
 */
export const kardexMovementTypeLabels: Record<string, string> = {
  SALE: "Venta",
  SALE_CANCEL: "Anulación de venta",
  PURCHASE: "Compra",
  ENTRADA_COMPRA: "Entrada de compra",
  SHRINKAGE: "Merma",
  PRODUCTION: "Producción",
  CREDIT_NOTE_RESTOCK: "Nota de crédito",
  ADJUSTMENT: "Ajuste",
  REVERSAL: "Reversión",
  INITIAL_STOCK: "Stock inicial",
};

/**
 * Audit event severity labels (slice 6b). Keys are the exact values of the
 * single backend AuditRiskClassifier taxonomy (audit-risk-classifier.ts):
 * CRITICAL / WARNING / INFO. Canonical vocabulary (NHILOS §26/§27): one term
 * per severity, agreeing with the "evento ..." copy used by the dashboard
 * attention band. Unknown values pass through untouched via `localize`.
 */
export const auditSeverityLabels: Record<string, string> = {
  CRITICAL: "Crítico",
  WARNING: "Advertencia",
  INFO: "Informativo",
};

/**
 * Audit action labels (slice 6b). Keys are the exact `change_log.action`
 * values written by the backend ingestion call sites (verified against
 * audit-risk-classifier.ts and its spec). A new backend code passes through
 * untouched via `localize` so it never crashes the UI.
 */
export const auditActionLabels: Record<string, string> = {
  ONBOARDING_ACTIVATION_CHECK_FAILED: "Fallo de control en activación de terminal",
  ONBOARDING_ACTIVATION_SUPPORT_OVERRIDE: "Anulación de control en activación de terminal",
  ONBOARDING_ACTIVATION_FINALIZED: "Activación de terminal finalizada",
  ONBOARDING_ACTIVATION_FOLLOW_UP_OPENED: "Seguimiento de activación abierto",
  ONBOARDING_ACTIVATION_FOLLOW_UP_CLOSED: "Seguimiento de activación cerrado",
  ONBOARDING_ACTIVATION_ATTEMPT_STARTED: "Intento de activación iniciado",
  CREATE: "Creación",
  UPDATE: "Modificación",
  DEACTIVATE: "Desactivación",
};

/**
 * Audited entity type labels (slice 6b). Keys are the exact
 * `change_log.target_type` values written by the backend ingestion call
 * sites (activation, catalog and product services).
 */
export const auditTargetTypeLabels: Record<string, string> = {
  ActivationAttempt: "Activación de terminal",
  ActivationCheckResult: "Control de activación",
  ActivationFollowUp: "Seguimiento de activación",
  catalog_value: "Valor de catálogo",
  product: "Producto",
};

/**
 * Logical (non-human) audit actor labels (slice 6b). Keys are the actor_ref
 * values documented by ChangeLogService; a terminal id or any other ref
 * passes through untouched via `localize`.
 */
export const auditActorRefLabels: Record<string, string> = {
  SYSTEM: "Sistema",
  SYSTEM_RECONCILER: "Conciliación automática",
  SYSTEM_FINALIZER: "Cierre automático",
};

/**
 * POS counter-ledger action labels (S4b bitacora view). Keys are the exact
 * `audit_logs.action` codes written by the POS sales/print writers (anulaciones,
 * notas de crédito, reimpresiones, impresión corrupta) and the identity
 * services (gaveta, overrides, usuarios), as classified by the SINGLE backend
 * AuditRiskClassifier table (S4a block in audit-risk-classifier.ts). A new
 * backend code passes through untouched via `localize`; the guard in
 * src/__tests__/labels.test.ts pins this key set against that table.
 */
export const auditLedgerActionLabels: Record<string, string> = {
  SALE_CREATED: "Venta registrada",
  SALE_VOIDED: "Anulación de factura",
  CREDIT_NOTE_CREATED: "Nota de crédito emitida",
  SUPERVISOR_OVERRIDE_MANUAL_DISCOUNT: "Descuento manual autorizado",
  SUPERVISOR_OVERRIDE_CLOSE_SESSION: "Cierre de sesión autorizado",
  SUPERVISOR_OVERRIDE_APPROVED: "Autorización de supervisor aprobada",
  SUPERVISOR_OVERRIDE_REJECTED: "Autorización de supervisor rechazada",
  DRAWER_OPENED_MANUALLY: "Apertura manual de gaveta",
  REPRINT_REQUESTED: "Reimpresión solicitada",
  PRINT_PAYLOAD_CORRUPT: "Impresión detenida por datos corruptos",
  SALE_INVENTORY_REMEDIATED: "Corrección de inventario sobre factura",
  USER_CREATED: "Usuario creado",
  USER_UPDATED: "Usuario modificado",
  USER_DEACTIVATED: "Usuario desactivado",
  USER_PERMISSIONS_UPDATED: "Permisos de usuario actualizados",
};

/**
 * POS counter-ledger entity type labels (S4b bitacora view). Keys are the
 * exact `audit_logs.target_type` values written by the POS sales writers
 * (invoice, credit_note) and the identity services (CASH_DRAWER,
 * SUPERVISOR_OVERRIDE, USER). Unknown values pass through untouched via
 * `localize`.
 */
export const auditLedgerTargetTypeLabels: Record<string, string> = {
  invoice: "Factura",
  credit_note: "Nota de crédito",
  CASH_DRAWER: "Caja / gaveta",
  SUPERVISOR_OVERRIDE: "Autorización de supervisor",
  USER: "Usuario",
};

/**
 * Menu-import skipped-recipe reasons, verified against
 * `menu-import.service.ts` (`reason: 'VERSION_ALREADY_EXISTS'`). Used in the
 * wizard preview so the owner never sees a raw backend enum (BX-010). Unknown
 * reasons pass through untouched via `localize`.
 */
export const menuImportSkipReasonLabels: Record<string, string> = {
  VERSION_ALREADY_EXISTS: "ya tiene una versión de receta",
};

/**
 * Recipe publication states, verified against `RecipePublicationState`
 * (apps/admin_backend/src/modules/inventory/entities/recipe-version.entity.ts).
 * Used for the menu-import skipped list ("estado actual: …") so the owner sees
 * the §26 status vocabulary, not the raw wire value (BX-010).
 */
export const publicationStateLabels: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicada",
  ARCHIVED: "Archivada",
};

/**
 * Frontend-first normalization of the backend's English row-issue messages
 * (`menu-import.service.ts` `assemble()`), so the owner reads actionable
 * Spanish in the errors/warnings tables (BX-010). The Excel column names
 * quoted inside the messages ('producto', 'precio', …) are kept verbatim: they
 * mirror what the owner typed in the workbook. Unknown messages pass through
 * unchanged so a new backend message never breaks the preview.
 */
export function normalizeMenuImportIssueMessage(message: string): string {
  const patterns: [RegExp, string][] = [
    [/^Sheet '(.+)' has no data rows$/, "La hoja '$1' no tiene filas de datos."],
    [/^Row is missing '(.+)'$/, "Falta la columna '$1' en esta fila."],
    [/^'(.+?)' for product '(.+?)' is missing or not numeric$/, "El campo '$1' del producto '$2' falta o no es numérico."],
    [/^Conflicting precio (.+) for product '(.+?)' \(first-seen price (.+)\)$/, "Precio contradictorio ($1) para el producto '$2'; el primer precio visto fue $3."],
    [/^'(.+?)' for ingredient '(.+?)' is missing or not numeric$/, "El campo '$1' del insumo '$2' falta o no es numérico."],
    [/^'(.+?)' for ingredient '(.+?)' is missing$/, "Falta el campo '$1' del insumo '$2'."],
  ];
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}

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
