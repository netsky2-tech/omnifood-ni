import { describe, expect, it } from "vitest";
import { getApiErrorMessage, isTechnicalErrorMessage } from "@/lib/api-error";

/**
 * Falsifiable guard for the modifiers-UI defect: technical backend text
 * (class-validator constraint arrays, internal code prefixes, stack traces,
 * JSON dumps) must NEVER reach the owner dashboard through
 * `getApiErrorMessage`. Spanish per-status copy or the caller's fallback is
 * returned instead. Genuine backend business messages must survive unchanged.
 *
 * If this guard fails, the leak has been re-opened.
 */

const SPANISH_400 = "Solicitud inválida. Verifique los datos ingresados.";
const SPANISH_500 =
  "Error en el servidor. Por favor intente nuevamente en unos minutos.";
const CALLER_FALLBACK = "No pudimos completar la operación";

// Each entry pairs a real technical message shape with the detector that must
// catch it. Sources verified in apps/admin_backend/src/modules.
const technicalStrings: Array<[string, string]> = [
  // Internal code prefix (onboarding-telemetry.service.ts:43)
  ["internal code prefix", "INVALID_TENANT: tenantId is required"],
  // class-validator constraint phrasings
  ["must be a", "price_delta must be a number conforming to the specified constraints"],
  ["must be", "quantity must be a positive number"],
  ["must not be", "name must not be empty"],
  ["should not be", "id should not be empty"],
  ["must be shorter", "code must be shorter than or equal to 20 characters"],
  ["must be longer", "password must be longer than or equal to 8 characters"],
  ["must contain", "password must contain a uppercase letter"],
  ["property", "property code has failed the following constraints"],
  ["nested property", "nested property supplier must be a valid object"],
  ["each value in", "each value in items must be a UUID"],
  ["must match", "code must match /^[A-Z]{3}$/ regular expression"],
  // Stack / path markers
  ["stack frame", "QueryFailedError: at QueryFailedQuery in node_modules/typeorm"],
  ["node_modules path", "Cannot find module 'x' in node_modules/x/dist"],
  ["object interpolation", "[object Object] is not a valid value"],
  // JSON / object dumps
  ["JSON object dump", '{"statusCode":400,"message":"Bad Request"}'],
  ["JSON array dump", '["id should not be empty","id must be a string"]'],
  // Error-object noise
  ["AxiosError", "AxiosError: Request failed with status code 500"],
  ["TypeError", "TypeError: Cannot read properties of undefined"],
  ["Error prefix", "Error: ECONNREFUSED 127.0.0.1:5432"],
];

describe("isTechnicalErrorMessage (single home of the display rule)", () => {
  it.each(technicalStrings)("detects %s: %s", (_detector, message) => {
    expect(isTechnicalErrorMessage(message)).toBe(true);
  });

  it.each([
    "El turno de caja no está abierto.",
    "El email ya está registrado",
    "Credenciales inválidas",
    "Supervisor no encontrado o inactivo",
    "El RUC ingresado no cumple con el formato DGI",
    "Ya existe una compra registrada con la factura 'F-500' para el proveedor 'Café Supplier'.",
    "Tasa oficial no disponible para la fecha",
  ])("accepts genuine business copy: %s", (message) => {
    expect(isTechnicalErrorMessage(message)).toBe(false);
  });
});

// Response shapes that previously leaked technical text into the UI. Every
// entry must render as the Spanish per-status copy (or the caller's fallback
// when no status is known) and must NOT contain the technical text.
const technicalResponses: Array<{
  name: string;
  error: unknown;
  leak: string;
  expected: string;
}> = [
  {
    name: "class-validator array (the real modifiers defect)",
    error: {
      status: 400,
      responseBody: { message: ["id should not be empty", "id must be a string"] },
    },
    leak: "id should not be empty",
    expected: SPANISH_400,
  },
  {
    name: "class-validator array with a single price_delta constraint",
    error: {
      status: 400,
      responseBody: {
        message: [
          "price_delta must be a number conforming to the specified constraints",
        ],
      },
    },
    leak: "price_delta must be a number",
    expected: SPANISH_400,
  },
  {
    name: "internal code prefix string (INVALID_TENANT)",
    error: {
      status: 400,
      responseBody: { message: "INVALID_TENANT: tenantId is required" },
    },
    leak: "INVALID_TENANT",
    expected: SPANISH_400,
  },
  {
    name: "UUID constraint string",
    error: {
      status: 400,
      responseBody: { message: "projectId must be a UUID" },
    },
    leak: "projectId must be a UUID",
    expected: SPANISH_400,
  },
  {
    name: "object message (renders as [object Object])",
    error: {
      status: 400,
      responseBody: { message: { error: "boom" } },
    },
    leak: "[object Object]",
    expected: SPANISH_400,
  },
  {
    name: "stack trace string",
    error: {
      status: 500,
      responseBody: {
        message: "Error: at QueryFailedError in node_modules/typeorm",
      },
    },
    leak: "node_modules/typeorm",
    expected: SPANISH_500,
  },
  {
    name: "JSON object dump",
    error: {
      status: 500,
      responseBody: {
        message: '{"statusCode":400,"message":"Bad Request"}',
      },
    },
    leak: '"statusCode"',
    expected: SPANISH_500,
  },
  {
    name: "JSON array dump string",
    error: {
      status: 400,
      responseBody: { message: '["id should not be empty"]' },
    },
    leak: "id should not be empty",
    expected: SPANISH_400,
  },
  {
    name: "technical string with unknown status falls back to caller fallback",
    error: { responseBody: { message: "id should not be empty" } },
    leak: "id should not be empty",
    expected: CALLER_FALLBACK,
  },
  // Nest's own platform defaults are plain English that NO shape detector
  // catches, and they arrive on statuses with no vetted Spanish copy. The body
  // must not be trusted there: `message` mirrors the body on a real ApiError,
  // which is exactly how the leak re-opened through the switch's `default`.
  {
    name: "plain English platform message on an untrusted status (405)",
    error: {
      status: 405,
      message: "Method Not Allowed",
      responseBody: { message: "Method Not Allowed" },
    },
    leak: "Method Not Allowed",
    expected: CALLER_FALLBACK,
  },
  {
    name: "plain English platform message on an untrusted status (413)",
    error: {
      status: 413,
      message: "Payload Too Large",
      responseBody: { message: "Payload Too Large" },
    },
    leak: "Payload Too Large",
    expected: CALLER_FALLBACK,
  },
];

describe("getApiErrorMessage never returns technical text from non-API errors", () => {
  it("suppresses a technical non-API error message", () => {
    const rendered = getApiErrorMessage(
      new TypeError("Cannot read properties of undefined (reading 'price_delta')"),
      CALLER_FALLBACK,
    );
    expect(rendered).not.toContain("price_delta");
    expect(rendered).toBe(CALLER_FALLBACK);
  });

  it("keeps a plain non-API error message that is not technical", () => {
    const rendered = getApiErrorMessage(
      new Error("El archivo no tiene filas"),
      CALLER_FALLBACK,
    );
    expect(rendered).toBe("El archivo no tiene filas");
  });
});

describe("getApiErrorMessage never returns technical backend text", () => {
  it.each(technicalResponses)("$name", ({ error, leak, expected }) => {
    const rendered = getApiErrorMessage(error, CALLER_FALLBACK);
    expect(rendered).not.toContain(leak);
    expect(rendered).toBe(expected);
  });
});

// Real backend business messages (verified in the service sources) MUST be
// returned unchanged, with no status-copy substitution.
const businessResponses: Array<{ status: number; message: string }> = [
  { status: 400, message: "El turno de caja no está abierto." },
  { status: 409, message: "El email ya está registrado" },
  { status: 401, message: "Credenciales inválidas" },
  { status: 404, message: "Supervisor no encontrado o inactivo" },
  { status: 400, message: "Tasa oficial no disponible para la fecha" },
  {
    status: 409,
    message:
      "Ya existe una compra registrada con la factura 'F-500' para el proveedor 'Café Supplier'.",
  },
];

describe("getApiErrorMessage preserves genuine business messages", () => {
  it.each(businessResponses)("returns $message unchanged", ({ status, message }) => {
    const rendered = getApiErrorMessage(
      { status, responseBody: { message } },
      CALLER_FALLBACK,
    );
    expect(rendered).toBe(message);
  });
});
