import {
  canonicalFiscalId,
  detectFiscalIdType,
  isValidRuc,
  type FiscalIdType,
} from './nicaragua-fiscal.validator';

/**
 * Normative parity vectors (design §3 — founder-pilot-fiscal-and-printer-fixture-alignment).
 * Vector values must stay identical to the Dart parity suite
 * `apps/pos_app/test/core/utils/nicaragua_fiscal_validator_test.dart` and the
 * dashboard suite; the tuple syntax here is a line-economy encoding, not a
 * semantic change. Erratum (SDD #9051): rows 17/18 raws were mislabeled in
 * design §3 rows 9/10 — under the Dart reference (day=DD, month=MM over the
 * 6-digit block) they are VALID cédulas; the invalid vectors are month-13 /
 * day-32 rows 9/10 below.
 */
type Vector = readonly [
  raw: string | null | undefined,
  valid: boolean,
  canonical: string | undefined,
  type: FiscalIdType,
];
const VECTORS: readonly Vector[] = [
  ['J0310000055555', true, 'J0310000055555', 'rucJuridico'],
  ['j0310000055555', true, 'J0310000055555', 'rucJuridico'],
  ['J 031-0000055555', true, 'J0310000055555', 'rucJuridico'],
  ['J031000005555', false, undefined, 'invalid'],
  ['K0310000055555', false, undefined, 'invalid'],
  ['CF-12345', false, undefined, 'invalid'],
  ['001-150885-1004J', true, '0011508851004J', 'cedula'],
  ['0011508851004j', true, '0011508851004J', 'cedula'],
  ['001-121390-1004J', false, undefined, 'invalid'], // month 13
  ['001-320590-1004J', false, undefined, 'invalid'], // day 32
  ['001-150885-10044', false, undefined, 'invalid'], // no letter
  ['0011508851004', false, undefined, 'invalid'], // no J prefix
  ['', false, undefined, 'none'],
  ['   ', false, undefined, 'none'],
  [null, false, undefined, 'none'],
  [undefined, false, undefined, 'none'],
  ['001-150985-1004J', true, '0011509851004J', 'cedula'], // day 15, month 09
  ['321-150885-1004J', true, '3211508851004J', 'cedula'], // 321 = municipality
];
const toCases = (vectors: readonly Vector[]) =>
  vectors.map((v, i) => [i, v] as const);
const CASES = toCases(VECTORS);
const VALID_CASES = toCases(VECTORS.filter(([, valid]) => valid));
describe('nicaragua-fiscal.validator (parity vectors)', () => {
  it.each(CASES)('vector #$i: isValidRuc(%j) === %j', (_i, [raw, valid]) => {
    expect(isValidRuc(raw)).toBe(valid);
  });
  it.each(VALID_CASES)(
    'vector #$i: canonicalFiscalId(%j) === %j',
    (_i, [raw, , canonical]) => {
      expect(canonicalFiscalId(raw)).toBe(canonical);
    },
  );
  it.each(CASES)(
    'vector #$i: detectFiscalIdType(%j) === %j',
    (_i, [raw, , , type]) => {
      expect(detectFiscalIdType(raw)).toBe(type);
    },
  );
  it('rejects J-RUC with too many digits and cédula with bad letter position', () => {
    expect(isValidRuc('J03100000555555')).toBe(false);
    expect(isValidRuc('001-150885-1004')).toBe(false);
    expect(isValidRuc('X0310000055555')).toBe(false);
  });
});
