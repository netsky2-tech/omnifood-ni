import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/utils/numeric_utils.dart';

void main() {
  group('asDouble', () {
    test('handles null', () {
      expect(asDouble(null), isNull);
    });

    test('handles int and double primitives', () {
      expect(asDouble(42), 42.0);
      expect(asDouble(42.5), 42.5);
      expect(asDouble(0), 0.0);
    });

    test('handles valid numeric strings from PostgreSQL numeric/decimal', () {
      expect(asDouble('10000.0000'), 10000.0);
      expect(asDouble('2000.50'), 2000.5);
      expect(asDouble('  15.5  '), 15.5);
      expect(asDouble('0'), 0.0);
    });

    test('handles empty or malformed strings safely without throwing', () {
      expect(asDouble(''), isNull);
      expect(asDouble('   '), isNull);
      expect(asDouble('not-a-number'), isNull);
    });

    test('handles unexpected types safely without throwing', () {
      expect(asDouble(true), isNull);
      expect(asDouble([]), isNull);
      expect(asDouble({}), isNull);
    });
  });

  group('asInt', () {
    test('handles null', () {
      expect(asInt(null), isNull);
    });

    test('handles int primitives', () {
      expect(asInt(42), 42);
      expect(asInt(0), 0);
    });

    test('handles double primitives (truncates to int)', () {
      expect(asInt(42.9), 42);
    });

    test('handles valid integer strings', () {
      expect(asInt('42'), 42);
      expect(asInt('  10  '), 10);
      expect(asInt('0'), 0);
    });

    test('handles empty or malformed strings safely without throwing', () {
      expect(asInt(''), isNull);
      expect(asInt('   '), isNull);
      expect(asInt('not-a-number'), isNull);
    });
  });
}
