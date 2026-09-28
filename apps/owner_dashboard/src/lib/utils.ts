import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: "NIO" | "USD" = "NIO"): string {
  const formatter = new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
  return formatter.format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-NI").format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-NI", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatDate(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-NI", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatDateTime(date: Date | string | number): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-NI", {
    // NHILOS §38: auditable date-times render in the PRODUCT timezone so the
    // owner sees one canonical wall-clock regardless of where the browser or
    // CI runner lives (tests run on UTC runners).
    timeZone: "America/Managua",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const DAYS_OF_WEEK: { value: string; label: string }[] = [
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "7", label: "Domingo" },
];

/**
 * Formats a Date into a calendar date string (YYYY-MM-DD) in the user's local timezone.
 * Avoids `d.toISOString().slice(0, 10)` which rolls over to UTC and selects tomorrow's
 * date in western timezones (e.g. Nicaragua UTC-6) after 18:00 local time.
 */
export function formatLocalDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into DD/MM/YYYY for display.
 * Internal state and API calls remain ISO; this is purely cosmetic.
 * NHILOS POS standard: day/month/year (Nicaraguan format).
 */
export function formatDisplayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

