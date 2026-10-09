interface ApiErrorLike {
  status?: number;
  statusCode?: number;
  code?: unknown;
  responseBody?: Record<string, unknown> | null;
  message?: string;
}

function checkIsApiError(error: unknown): error is ApiErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    ("status" in error || "statusCode" in error || "responseBody" in error)
  );
}

/**
 * Display-side rule (repo-wide, not modifiers-specific): decides whether a
 * backend `message` string is TECHNICAL text that must never reach the owner
 * dashboard. A message is technical when it matches ANY of these detectors:
 *
 * 1. Internal code prefix — a leading SCREAMING_SNAKE token followed by a
 *    colon (e.g. `INVALID_TENANT: tenantId is required`).
 * 2. class-validator phrasings — `must be `, `must not be `, `should not be `,
 *    `must be a `, `must be shorter`, `must be longer`, `must contain`,
 *    `property `, `nested property`, `each value in`, `must match`.
 * 3. Stack or path markers — `at `, `/node_modules/`, `node_modules/`,
 *    `[object Object]`.
 * 4. JSON or object dumps — a trimmed value starting with `{` or `[`.
 * 5. Error-object noise — `AxiosError`, `TypeError`, `Error:`.
 *
 * Evidence that suppression loses nothing legitimate: a repository-wide
 * search found ZERO backend exceptions thrown with an array payload, and the
 * only code-prefixed throw is an internal diagnostic. Genuine business copy
 * (e.g. `El turno de caja no está abierto.`) matches none of these and is
 * displayed verbatim. Guarded by src/__tests__/api-error.test.ts.
 */
/**
 * Statuses whose body `message` may override our own copy. These are exactly
 * the statuses this function has a case for: the body is trusted only where
 * the contract is understood. Any OTHER status is infrastructure — Nest's
 * platform defaults are plain English that no shape detector catches
 * ("Method Not Allowed", "Payload Too Large") — so there the body is ignored.
 *
 * Note that 5xx belongs here: the backend also delivers real business copy on
 * a 500 ("Tasa oficial no disponible para la fecha" when the FX rate for a
 * date is missing), so restricting this to client errors would hide it.
 */
const STATUSES_WITH_KNOWN_COPY = new Set<number>([
  400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504,
]);

export function isTechnicalErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return true;
  // JSON or object dumps
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  // Internal code prefix: leading SCREAMING_SNAKE token + colon
  if (/^[A-Z][A-Z0-9_]*:/.test(trimmed)) return true;
  const technicalMarkers = [
    // class-validator constraint phrasings
    "must be ",
    "must not be ",
    "should not be ",
    "must be a ",
    "must be shorter",
    "must be longer",
    "must contain",
    "property ",
    "nested property",
    "each value in",
    "must match",
    // stack or path markers
    "at ",
    "/node_modules/",
    "node_modules/",
    "[object Object]",
    // error-object noise
    "AxiosError",
    "TypeError",
    "Error:",
    // JavaScript engine phrasings: a thrown TypeError message is just as
    // unreadable to an operator as a validation dump.
    "Cannot read propert",
    "is not a function",
    "is not defined",
    "undefined is not an object",
    "Unexpected token",
  ];
  return technicalMarkers.some((marker) => trimmed.includes(marker));
}

/**
 * Maps any caught error (ApiError, Error, network failure, etc.) into a
 * clear, actionable, user-friendly message suitable for UI display.
 * Prevents leaking technical jargon, JSON blobs, or internal stack traces.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = "Ocurrió un error inesperado",
): string {
  if (!error) return fallback;

  if (checkIsApiError(error)) {
    const bodyMsg = error.responseBody?.message;
    const status = error.status ?? error.statusCode;
    if (Array.isArray(bodyMsg)) {
      // An ARRAY `message` is ALWAYS class-validator technical text (no
      // backend exception throws an array payload with business copy), so it
      // is never displayed: fall through to the Spanish per-status copy.
    } else if (
      status !== undefined &&
      STATUSES_WITH_KNOWN_COPY.has(status) &&
      typeof bodyMsg === "string" &&
      bodyMsg.trim().length > 0 &&
      !isTechnicalErrorMessage(bodyMsg)
    ) {
      // A string `message` is displayed only when it is business copy AND it
      // arrives on a status whose contract we understand. For any other
      // status the body is infrastructure noise: Nest's own defaults are
      // plain English that no shape detector catches ("Method Not Allowed",
      // "Payload Too Large"), and `ApiError.message` mirrors the body, which
      // is how a leak re-opened through the switch's `default`.
      return bodyMsg.trim();
    }

    switch (status) {
      case 400:
        return "Solicitud inválida. Verifique los datos ingresados.";
      case 401:
        return "Sesión expirada o no autorizada. Inicie sesión nuevamente.";
      case 403:
        return "No tiene permisos suficientes para realizar esta acción.";
      case 404:
        return "El recurso solicitado no fue encontrado o ha sido eliminado.";
      case 409:
        return "Conflicto: Ya existe un registro con este código o identificador.";
      case 422:
        return "Error de validación. Verifique los requisitos de los campos.";
      case 429:
        return "Demasiadas peticiones. Por favor espere un momento antes de reintentar.";
      case 500:
      case 502:
      case 503:
      case 504:
        return "Error en el servidor. Por favor intente nuevamente en unos minutos.";
      default:
        // No vetted Spanish copy exists for this status, so we do not trust
        // the body either: show our own generic copy.
        return fallback;
    }
  }

  if (error instanceof Error) {
    const msg = error.message;
    if (
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("Load failed")
    ) {
      return "Error de conexión. Verifique su acceso a internet o disponibilidad del servidor.";
    }
    if (msg === "Session expired" || msg === "Not authenticated") {
      return "Su sesión ha expirado. Por favor inicie sesión nuevamente.";
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return "La solicitud tardó demasiado tiempo. Verifique su conexión e intente de nuevo.";
    }
    // A non-API error can still carry technical text ("Cannot read properties
    // of undefined ..."), which is just as unreadable to the operator.
    if (isTechnicalErrorMessage(msg)) return fallback;
    return msg;
  }

  return fallback;
}
