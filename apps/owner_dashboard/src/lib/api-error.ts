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
    // If backend provided a custom user-facing message, check if it's clean and informative
    const bodyMsg = error.responseBody?.message;
    if (typeof bodyMsg === "string" && bodyMsg.trim().length > 0) {
      const trimmed = bodyMsg.trim();
      // Avoid raw technical stacktraces or json strings
      if (
        !trimmed.startsWith("{") &&
        !trimmed.includes("at ") &&
        !trimmed.startsWith("AxiosError") &&
        !trimmed.includes("node_modules")
      ) {
        return trimmed;
      }
    } else if (Array.isArray(bodyMsg) && bodyMsg.length > 0) {
      const joined = bodyMsg.filter((m): m is string => typeof m === "string" && m.trim().length > 0).join(". ");
      if (joined.length > 0) {
        return joined;
      }
    }

    const status = error.status ?? error.statusCode;
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
        return error.message || fallback;
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
    return msg;
  }

  return fallback;
}
