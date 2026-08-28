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
    });
  });
}
