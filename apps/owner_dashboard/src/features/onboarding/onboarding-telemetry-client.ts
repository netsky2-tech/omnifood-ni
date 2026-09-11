import { api } from "@/lib/api";

const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;
const CARD_REGEX =
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12})\b/g;
const EMAIL_REGEX =
  /\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*([a-zA-Z0-9_.+-])@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g;

const SECRET_KEY_NAMES = new Set([
  "password",
  "pass",
  "pwd",
  "secret",
  "apikey",
  "api_key",
  "token",
  "jwt",
  "bearer",
]);

const PIN_KEY_NAMES = new Set([
  "pin",
  "totp",
  "totpcode",
  "totp_code",
  "otp",
  "passcode",
]);

const CSV_KEY_NAMES = new Set([
  "rawcsv",
  "raw_csv",
  "csvcontent",
  "csv_content",
  "csvdata",
  "filedata",
]);

const REQUIRED_STEPS = new Set([
  "FISCAL_SETUP",
  "PRODUCT_CATALOG",
  "ACTIVATION_VERIFICATION_SALE",
]);

export function isSkippableStep(stepId: string): boolean {
  return !REQUIRED_STEPS.has(stepId.trim());
}

export function sanitizeClientTelemetryPayload<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    return sanitizeString(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeClientTelemetryPayload(item)) as unknown as T;
  }

  if (typeof input === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === "string") {
        if (
          /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(value.trim()) ||
          value.includes("Bearer eyJ")
        ) {
          result[key] = sanitizeString(value);
          continue;
        }

        if (/^\d{13,19}$/.test(value.trim())) {
          result[key] = "[REDACTED_CARD]";
          continue;
        }

        if (isCsvKey(key) || isRawCsvContent(value)) {
          result[key] = summarizeRawCsv(value);
          continue;
        }
      }

      if (isSecretKey(key)) {
        result[key] = "[REDACTED_SECRET]";
        continue;
      }

      if (isPinKey(key)) {
        result[key] = "[REDACTED_PIN]";
        continue;
      }

      result[key] = sanitizeClientTelemetryPayload(value);
    }
    return result as T;
  }

  return input;
}

function sanitizeString(str: string): string {
  if (/^\d{13,19}$/.test(str.trim())) {
    return "[REDACTED_CARD]";
  }

  let sanitized = str;
  sanitized = sanitized.replace(JWT_REGEX, "[REDACTED_JWT]");
  sanitized = sanitized.replace(CARD_REGEX, "[REDACTED_CARD]");
  sanitized = sanitized.replace(
    EMAIL_REGEX,
    (_match, firstChar, lastChar, domain) => `${firstChar}***${lastChar}@${domain}`,
  );
  return sanitized;
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[-_]/g, "");
  for (const secret of SECRET_KEY_NAMES) {
    if (lower.includes(secret)) return true;
  }
  return false;
}

function isPinKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[-_]/g, "");
  for (const pin of PIN_KEY_NAMES) {
    if (lower.includes(pin)) return true;
  }
  return false;
}

function isCsvKey(key: string): boolean {
  const lower = key.toLowerCase().replace(/[-_]/g, "");
  for (const csv of CSV_KEY_NAMES) {
    if (lower.includes(csv)) return true;
  }
  return false;
}

function isRawCsvContent(value: string): boolean {
  if (value.length < 50) return false;
  const lines = value.split("\n");
  if (lines.length >= 3) {
    const firstCommaCount = (lines[0].match(/,/g) || []).length;
    const secondCommaCount = (lines[1].match(/,/g) || []).length;
    if (firstCommaCount >= 2 && firstCommaCount === secondCommaCount) {
      return true;
    }
  }
  return false;
}

function summarizeRawCsv(content: string) {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  return {
    redacted: true,
    type: "RAW_CSV_REDACTED",
    lineCount: lines.length,
    byteLength: new TextEncoder().encode(content).length,
  };
}

export interface EmitTelemetryDto {
  eventName: string;
  stepId?: string;
  durationMs?: number;
  properties?: Record<string, any>;
  counts?: Record<string, number>;
}

export async function emitOnboardingTelemetry(
  dto: EmitTelemetryDto,
): Promise<{ accepted: boolean; eventName: string }> {
  if (dto.eventName === "STEP_SKIPPED" && dto.stepId) {
    if (!isSkippableStep(dto.stepId)) {
      throw new Error(`Cannot skip required onboarding step: ${dto.stepId}`);
    }
  }

  const sanitizedProps = dto.properties
    ? sanitizeClientTelemetryPayload(dto.properties)
    : undefined;

  return api.post<{ accepted: boolean; eventName: string }>(
    "/onboarding/telemetry/events",
    {
      ...dto,
      properties: sanitizedProps,
    },
  );
}
