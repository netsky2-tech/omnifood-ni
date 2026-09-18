import { describe, expect, it } from "vitest";

import {
  canonicalFiscalId,
  detectFiscalIdType,
  isValidNicaraguaFiscalId,
} from "@/features/settings/nicaragua-fiscal";

/**
 * Normative parity vectors (design §3, corrected per SDD erratum #9051).
 * MUST stay identical to the backend and Dart suites
 * (`nicaragua-fiscal.validator.spec.ts`, `nicaragua_fiscal_validator_test.dart`);
 * any change updates all copies in one commit. Rows 17/18 were mislabeled in
 * design §3 rows 9/10 ("month 15" / "day 32") — with day=DD, month=MM over the
 * 6-digit block they are VALID cédulas; invalid vectors are month-13/day-32.
 */
const VECTORS: ReadonlyArray<{
  raw: string | null | undefined;
  valid: boolean;
  canonical?: string;
  type: "rucJuridico" | "cedula" | "invalid" | "none";
}> = [
  { raw: "J0310000055555", valid: true, canonical: "J0310000055555", type: "rucJuridico" },
  { raw: "j0310000055555", valid: true, canonical: "J0310000055555", type: "rucJuridico" },
  { raw: "J 031-0000055555", valid: true, canonical: "J0310000055555", type: "rucJuridico" },
  { raw: "J031000005555", valid: false, type: "invalid" },
  { raw: "K0310000055555", valid: false, type: "invalid" },
  { raw: "CF-12345", valid: false, type: "invalid" },
  { raw: "001-150885-1004J", valid: true, canonical: "0011508851004J", type: "cedula" },
  { raw: "0011508851004j", valid: true, canonical: "0011508851004J", type: "cedula" },
  { raw: "001-121390-1004J", valid: false, type: "invalid" }, // month 13
  { raw: "001-320590-1004J", valid: false, type: "invalid" }, // day 32
  { raw: "001-150885-10044", valid: false, type: "invalid" }, // no letter
  { raw: "0011508851004", valid: false, type: "invalid" }, // no J prefix
  { raw: "", valid: false, type: "none" },
  { raw: "   ", valid: false, type: "none" },
  { raw: null, valid: false, type: "none" },
  { raw: undefined, valid: false, type: "none" },
  { raw: "001-150985-1004J", valid: true, canonical: "0011509851004J", type: "cedula" }, // day 15, month 09
  { raw: "321-150885-1004J", valid: true, canonical: "3211508851004J", type: "cedula" }, // 321 = municipality
];

describe("nicaragua-fiscal (dashboard parity vectors)", () => {
  it.each(VECTORS.map((v, i) => [i, v] as const))(
    "vector #$i: isValidNicaraguaFiscalId(%j) === %j",
    (_i, vector) => {
      expect(isValidNicaraguaFiscalId(vector.raw)).toBe(vector.valid);
    },
  );

  it.each(VECTORS.filter((v) => v.valid).map((v, i) => [i, v] as const))(
    "vector #$i: canonicalFiscalId(%j) === %j",
    (_i, vector) => {
      expect(canonicalFiscalId(vector.raw)).toBe(vector.canonical);
    },
  );

  it.each(VECTORS.map((v, i) => [i, v] as const))(
    "vector #$i: detectFiscalIdType(%j) === %j",
    (_i, vector) => {
      expect(detectFiscalIdType(vector.raw)).toBe(vector.type);
    },
  );
});
