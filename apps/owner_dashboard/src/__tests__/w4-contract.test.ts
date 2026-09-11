import { describe, expect, it } from "vitest";
import fixture from "./fixtures/fiscal-dtos.json";

type DtoFixture = {
  description: string;
  fields: Record<string, { type: string; required: boolean }>;
};

const dtos = fixture as Record<string, DtoFixture>;

const FRONTEND_FIELDS: Record<string, string[]> = {
  MonthlyFiscalSummary: [
    "year", "month", "totalGrossSales", "totalTaxableSales",
    "totalExemptSales", "totalTaxCollected", "totalCreditNotes",
    "totalCreditNotesTax", "netTaxableSales", "netTaxPayable",
    "invoiceCount", "creditNoteCount", "generatedAt",
  ],
  VoidedInvoicesReport: [
    "startDate", "endDate", "totalVoidedCount", "totalVoidedAmount",
    "generatedAt", "invoices",
  ],
  VoidedInvoiceItem: [
    "id", "number", "total", "subtotal", "totalTax", "voidReason",
    "canceledAt", "userId", "cashierName",
  ],
  SequenceAuditReport: [
    "terminalId", "startDate", "endDate", "startSequence", "endSequence",
    "expectedCount", "actualCount", "missingSequences", "duplicateSequences",
    "hasGaps", "series", "generatedAt",
  ],
  SequenceAuditSeries: [
    "seriesPrefix", "startSequence", "endSequence", "expectedCount",
    "actualCount", "missingSequences", "duplicateSequences", "hasGaps",
  ],
  SalesBookExport: [
    "startDate", "endDate", "generatedAt", "totalRecords", "totalGrossNio",
    "totalTaxNio", "totalExemptNio", "records",
  ],
  SalesBookRow: [
    "date", "invoiceNumber", "documentType", "customerName",
    "exemptSubtotalNio", "taxableSubtotalNio", "taxAmountNio", "discountNio",
    "totalNio", "totalUsd", "status", "isCanceled",
  ],
  ZReportsExport: [
    "startDate", "endDate", "generatedAt", "totalRecords", "records",
  ],
  ZReportRow: [
    "shiftId", "closedAt", "openedAt", "terminalId", "zSequence",
    "cashierName", "initialFloatNio", "initialFloatUsd", "expectedCashNio",
    "expectedCashUsd", "finalCountedNio", "finalCountedUsd", "differenceNio",
    "differenceUsd", "status", "notes",
  ],
};

const TYPE_MAP: Record<string, Record<string, string>> = {
  MonthlyFiscalSummary: {
    year: "number", month: "number", totalGrossSales: "number",
    totalTaxableSales: "number", totalExemptSales: "number",
    totalTaxCollected: "number", totalCreditNotes: "number",
    totalCreditNotesTax: "number", netTaxableSales: "number",
    netTaxPayable: "number", invoiceCount: "number",
    creditNoteCount: "number", generatedAt: "string",
  },
  VoidedInvoicesReport: {
    startDate: "string", endDate: "string", totalVoidedCount: "number",
    totalVoidedAmount: "number", generatedAt: "string", invoices: "array",
  },
  VoidedInvoiceItem: {
    id: "string", number: "string", total: "number", subtotal: "number",
    totalTax: "number", voidReason: "string", canceledAt: "string",
    userId: "string", cashierName: "string",
  },
  SequenceAuditReport: {
    terminalId: "string", startDate: "string", endDate: "string",
    startSequence: "number", endSequence: "number", expectedCount: "number",
    actualCount: "number", missingSequences: "array", duplicateSequences: "array",
    hasGaps: "boolean", series: "array", generatedAt: "string",
  },
  SequenceAuditSeries: {
    seriesPrefix: "string", startSequence: "number", endSequence: "number",
    expectedCount: "number", actualCount: "number", missingSequences: "array",
    duplicateSequences: "array", hasGaps: "boolean",
  },
  SalesBookExport: {
    startDate: "string", endDate: "string", generatedAt: "string",
    totalRecords: "number", totalGrossNio: "number", totalTaxNio: "number",
    totalExemptNio: "number", records: "array",
  },
  SalesBookRow: {
    date: "string", invoiceNumber: "string", documentType: "string",
    customerName: "string", exemptSubtotalNio: "number",
    taxableSubtotalNio: "number", taxAmountNio: "number", discountNio: "number",
    totalNio: "number", totalUsd: "number", status: "string", isCanceled: "boolean",
  },
  ZReportsExport: {
    startDate: "string", endDate: "string", generatedAt: "string",
    totalRecords: "number", records: "array",
  },
  ZReportRow: {
    shiftId: "string", closedAt: "string", openedAt: "string",
    terminalId: "string", zSequence: "number", cashierName: "string",
    initialFloatNio: "number", initialFloatUsd: "number",
    expectedCashNio: "number", expectedCashUsd: "number",
    finalCountedNio: "number", finalCountedUsd: "number",
    differenceNio: "number", differenceUsd: "number",
    status: "string", notes: "string",
  },
};

function isTypeCompatible(backendType: string, frontendType: string): boolean {
  const map: Record<string, string[]> = {
    number: ["number"],
    string: ["string"],
    boolean: ["boolean"],
    array: ["array", "Array"],
  };
  return map[backendType]?.some((t) => frontendType.includes(t)) ?? false;
}

const DTO_TO_FRONTEND: Record<string, string> = {
  MonthlyFiscalSummaryReportDto: "MonthlyFiscalSummary",
  VoidedInvoicesReportDto: "VoidedInvoicesReport",
  VoidedInvoiceItemDto: "VoidedInvoiceItem",
  FiscalSequenceAuditReportDto: "SequenceAuditReport",
  SequenceAuditSeriesDto: "SequenceAuditSeries",
  SalesBookExportDto: "SalesBookExport",
  SalesBookRowDto: "SalesBookRow",
  ZReportsExportDto: "ZReportsExport",
  ZReportRowDto: "ZReportRow",
};

describe("W4 Contract — Frontend types match backend DTOs", () => {
  for (const [dtoName, dtoSpec] of Object.entries(dtos)) {
    const feName = DTO_TO_FRONTEND[dtoName] ?? dtoName;
    describe(dtoName, () => {
      const frontendFields = FRONTEND_FIELDS[feName] ?? [];
      const frontendTypes = TYPE_MAP[feName] ?? {};

      it("has all required fields from backend DTO", () => {
        for (const fieldName of Object.keys(dtoSpec.fields)) {
          expect(
            frontendFields,
            `${dtoName}: frontend type missing field "${fieldName}"`,
          ).toContain(fieldName);
        }
      });

      it("no extra fields in frontend not in backend", () => {
        for (const fieldName of frontendFields) {
          expect(
            Object.keys(dtoSpec.fields),
            `${dtoName}: frontend has extra field "${fieldName}" not in backend DTO`,
          ).toContain(fieldName);
        }
      });

      for (const [fieldName, spec] of Object.entries(dtoSpec.fields)) {
        const frontendType = frontendTypes?.[fieldName];
        if (frontendType) {
          it(`${fieldName} type compatibility`, () => {
            expect(
              isTypeCompatible(spec.type, frontendType),
              `${dtoName}.${fieldName}: backend "${spec.type}" not compatible with frontend "${frontendType}"`,
            ).toBe(true);
          });
        }
      }
    });
  }
});
