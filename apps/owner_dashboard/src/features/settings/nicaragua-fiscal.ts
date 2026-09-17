/**
 * Pure Nicaraguan fiscal-ID validator (Owner Dashboard copy). Normative
 * algorithm: design §3 of SDD `founder-pilot-fiscal-and-printer-fixture-alignment`;
 * pinned by identical vector tables in `src/__tests__/nicaragua-fiscal.test.ts`
 * and the backend `nicaragua-fiscal.validator.spec.ts`; Dart reference:
 * `apps/pos_app/lib/core/utils/nicaragua_fiscal_validator.dart`. Pure util.
 */

export type FiscalIdType = "rucJuridico" | "cedula" | "invalid" | "none";

/**
 * Human-readable rejection message naming the accepted forms (spec FR-1):
 * legal J-RUC or valid natural-person cédula.
 */
export const RUC_ACCEPTED_FORMS_MESSAGE =
  "El RUC del emisor es obligatorio: RUC jurídico (J + 13 dígitos) o cédula válida";

/** null → ''; remove every whitespace and hyphen; uppercase the rest. */
export function cleanFiscalId(raw: string | null | undefined): string {
  return raw?.replace(/[\s-]/g, "").toUpperCase() ?? "";
}

const RUC_JURIDICO_REGEX = /^J\d{13}$/;
const CEDULA_REGEX = /^(\d{3})(\d{6})(\d{4})([A-Z])$/;

/** Legal cédula: 3-6-4 digits + final letter, with DDMMYY plausibility. */
export function isValidCedulaId(cleaned: string): boolean {
  const match = CEDULA_REGEX.exec(cleaned);
  const datePart = match?.[2];
  if (!datePart) {
    return false;
  }
  // Parity with the Dart reference (substring(2, 4)): month is exactly two
  // digits, so '150885' → month '08' (valid) and '150985' → month '09'
  // (also valid — see vector rows 17/18); only 1..12 plausibility applies.
  const day = Number(datePart.slice(0, 2));
  const month = Number(datePart.slice(2, 4));
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

/** Valid legal J-RUC (J + 13 digits) or valid natural-person cédula. */
export function isValidRuc(raw: string | null | undefined): boolean {
  if (raw == null || raw.trim().length === 0) {
    return false;
  }
  const cleaned = cleanFiscalId(raw);
  return RUC_JURIDICO_REGEX.test(cleaned) || isValidCedulaId(cleaned);
}

/** Zod-facing alias: the form/schema predicate for a usable issuer RUC. */
export const isValidNicaraguaFiscalId = isValidRuc;

/** Canonical form of a valid fiscal ID; empty string when absent/invalid. */
export function canonicalFiscalId(raw: string | null | undefined): string {
  if (!isValidRuc(raw)) {
    return "";
  }
  return cleanFiscalId(raw);
}

export function detectFiscalIdType(
  raw: string | null | undefined,
): FiscalIdType {
  if (raw == null || raw.trim().length === 0) {
    return "none";
  }
  const cleaned = cleanFiscalId(raw);
  if (RUC_JURIDICO_REGEX.test(cleaned)) {
    return "rucJuridico";
  }
  if (isValidCedulaId(cleaned)) {
    return "cedula";
  }
  return "invalid";
}
