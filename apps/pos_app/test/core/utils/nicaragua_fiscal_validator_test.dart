import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/utils/nicaragua_fiscal_validator.dart';

void main() {
  group('NicaraguaFiscalValidator - Triangulation Tests', () {
    group('Cédula de Identidad Nicaragüense', () {
      test('debe validar cédulas con formato oficial estándar con guiones', () {
        // Managua: 001, Fecha: 12-05-1990, Correlativo: 0001, Letra: A
        expect(NicaraguaFiscalValidator.isValidCedula('001-120590-0001A'), isTrue);
        expect(NicaraguaFiscalValidator.isValidCedula('281-240885-0002B'), isTrue);
        expect(NicaraguaFiscalValidator.isValidCedula('321-010100-0010X'), isTrue);
      });

      test('debe validar cédulas normalizadas sin guiones (14 caracteres)', () {
        expect(NicaraguaFiscalValidator.isValidCedula('0011205900001A'), isTrue);
        expect(NicaraguaFiscalValidator.isValidCedula('2812408850002B'), isTrue);
      });

      test('debe validar cédulas en minúsculas convirtiendo la letra a mayúscula', () {
        expect(NicaraguaFiscalValidator.isValidCedula('001-120590-0001a'), isTrue);
        expect(NicaraguaFiscalValidator.isValidCedula('0011205900001a'), isTrue);
      });

      test('debe rechazar cédulas con longitud inválida', () {
        expect(NicaraguaFiscalValidator.isValidCedula('001-120590-0001'), isFalse); // 13 chars
        expect(NicaraguaFiscalValidator.isValidCedula('001-120590-0001AA'), isFalse); // 15 chars
        expect(NicaraguaFiscalValidator.isValidCedula(''), isFalse);
        expect(NicaraguaFiscalValidator.isValidCedula('   '), isFalse);
      });

      test('debe rechazar cédulas con fecha no válida (mes > 12 o día > 31)', () {
        expect(NicaraguaFiscalValidator.isValidCedula('001-320590-0001A'), isFalse); // Día 32
        expect(NicaraguaFiscalValidator.isValidCedula('001-000590-0001A'), isFalse); // Día 00
        expect(NicaraguaFiscalValidator.isValidCedula('001-121390-0001A'), isFalse); // Mes 13
        expect(NicaraguaFiscalValidator.isValidCedula('001-120090-0001A'), isFalse); // Mes 00
      });

      test('debe rechazar cédulas con caracteres no alfanuméricos o letras en campos numéricos', () {
        expect(NicaraguaFiscalValidator.isValidCedula('00A-120590-0001A'), isFalse);
        expect(NicaraguaFiscalValidator.isValidCedula('001-12X590-0001A'), isFalse);
        expect(NicaraguaFiscalValidator.isValidCedula('001-120590-00011'), isFalse); // Termina en número
        expect(NicaraguaFiscalValidator.isValidCedula('001-120590-0001#'), isFalse);
      });
    });

    group('RUC Nicaragüense (Personas Jurídicas y Naturales)', () {
      test('debe validar RUC de Persona Jurídica (inicia con J seguido de 13 dígitos)', () {
        expect(NicaraguaFiscalValidator.isValidRuc('J0310000000001'), isTrue);
        expect(NicaraguaFiscalValidator.isValidRuc('j0310000000001'), isTrue); // Insensible a mayúsculas
        expect(NicaraguaFiscalValidator.isValidRuc('J0000000000000'), isTrue);
      });

      test('debe validar RUC de Persona Natural (basado en Cédula 14 caracteres)', () {
        expect(NicaraguaFiscalValidator.isValidRuc('001-120590-0001A'), isTrue);
        expect(NicaraguaFiscalValidator.isValidRuc('0011205900001A'), isTrue);
      });

      test('debe rechazar RUC con formato corrupto', () {
        expect(NicaraguaFiscalValidator.isValidRuc('J031000000001'), isFalse); // 13 chars
        expect(NicaraguaFiscalValidator.isValidRuc('J03100000000001'), isFalse); // 15 chars
        expect(NicaraguaFiscalValidator.isValidRuc('K0310000000001'), isFalse); // Letra no permitida
        expect(NicaraguaFiscalValidator.isValidRuc('J031000000000A'), isFalse); // Letra en dígito
      });
    });

    group('Detección de Tipo Fiscal & Normalización', () {
      test('debe clasificar correctamente el tipo de identificación fiscal', () {
        expect(
          NicaraguaFiscalValidator.detectType('001-120590-0001A'),
          equals(FiscalIdentificationType.cedula),
        );
        expect(
          NicaraguaFiscalValidator.detectType('J0310000000001'),
          equals(FiscalIdentificationType.rucJuridico),
        );
        expect(
          NicaraguaFiscalValidator.detectType('INVALID-FORMAT'),
          equals(FiscalIdentificationType.invalid),
        );
        expect(
          NicaraguaFiscalValidator.detectType(null),
          equals(FiscalIdentificationType.none),
        );
      });

      test('debe normalizar el formato de la cédula al formato oficial con guiones', () {
        expect(
          NicaraguaFiscalValidator.formatCedula('0011205900001a'),
          equals('001-120590-0001A'),
        );
        expect(
          NicaraguaFiscalValidator.formatCedula('001-120590-0001A'),
          equals('001-120590-0001A'),
        );
      });

      test('debe limpiar espacios y guiones para almacenamiento canónico', () {
        expect(
          NicaraguaFiscalValidator.clean(' 001-120590-0001A '),
          equals('0011205900001A'),
        );
        expect(
          NicaraguaFiscalValidator.clean('J-031000-000001'),
          equals('J031000000001'),
        );
      });

      /// Normative parity vectors (design §3, corrected per SDD erratum #9051)
      /// for change founder-pilot-fiscal-and-printer-fixture-alignment.
      ///
      /// CHARACTERIZATION PIN: the Dart validator is the normative reference;
      /// this table pins existing behavior and MUST stay identical to the TS
      /// suites (`apps/admin_backend/src/modules/onboarding/utils/
      /// nicaragua-fiscal.validator.spec.ts` and the owner-dashboard copy).
      /// The TS table carries 18 rows because JS distinguishes `null` from
      /// `undefined`; Dart has no undefined, so those rows collapse here.
      /// Rows 17/18 raws were mislabeled in design §3 rows 9/10 ("month 15" /
      /// "day 32") — under day=DD/month=MM over the 6-digit block they are
      /// VALID cédulas; the genuine invalid vectors are month-13 / day-32.
      group('PR-1 parity vectors (normative table)', () {
        const vectors = <(String?, bool, String?, FiscalIdentificationType)>[
          ('J0310000055555', true, 'J0310000055555', FiscalIdentificationType.rucJuridico),
          ('j0310000055555', true, 'J0310000055555', FiscalIdentificationType.rucJuridico),
          ('J 031-0000055555', true, 'J0310000055555', FiscalIdentificationType.rucJuridico),
          ('J031000005555', false, null, FiscalIdentificationType.invalid),
          ('K0310000055555', false, null, FiscalIdentificationType.invalid),
          ('CF-12345', false, null, FiscalIdentificationType.invalid),
          ('001-150885-1004J', true, '0011508851004J', FiscalIdentificationType.cedula),
          ('0011508851004j', true, '0011508851004J', FiscalIdentificationType.cedula),
          ('001-121390-1004J', false, null, FiscalIdentificationType.invalid), // month 13
          ('001-320590-1004J', false, null, FiscalIdentificationType.invalid), // day 32
          ('001-150885-10044', false, null, FiscalIdentificationType.invalid), // no letter
          ('0011508851004', false, null, FiscalIdentificationType.invalid), // no J prefix
          ('', false, null, FiscalIdentificationType.none),
          ('   ', false, null, FiscalIdentificationType.none),
          (null, false, null, FiscalIdentificationType.none),
          ('001-150985-1004J', true, '0011509851004J', FiscalIdentificationType.cedula), // day 15, month 09
          ('321-150885-1004J', true, '3211508851004J', FiscalIdentificationType.cedula), // 321 = municipality
        ];

        test('every vector satisfies isValidRuc / detectType / canonical clean', () {
          for (final (raw, valid, canonical, type) in vectors) {
            expect(
              NicaraguaFiscalValidator.isValidRuc(raw),
              valid,
              reason: 'isValidRuc($raw) must be $valid',
            );
            expect(
              NicaraguaFiscalValidator.detectType(raw),
              type,
              reason: 'detectType($raw) must be $type',
            );
            if (valid) {
              expect(
                NicaraguaFiscalValidator.clean(raw),
                canonical,
                reason: 'clean($raw) must be $canonical',
              );
            }
          }
        });

        test('rejects J-RUC with too many digits and cédula with bad letter position', () {
          expect(NicaraguaFiscalValidator.isValidRuc('J03100000555555'), isFalse);
          expect(NicaraguaFiscalValidator.isValidRuc('001-150885-1004'), isFalse);
          expect(NicaraguaFiscalValidator.isValidRuc('X0310000055555'), isFalse);
        });
      });
    });
  });
}
