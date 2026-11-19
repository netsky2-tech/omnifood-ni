import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/ui/features/auth/utils/install_kit_link_parser.dart';

void main() {
  group('extractLinkingCodeFromPayload', () {
    test('extracts 6-char code from install-kit App Link URI', () {
      expect(
        extractLinkingCodeFromPayload(
          'https://api.nhilospos.com/i/tok123?code=AB23CD',
        ),
        'AB23CD',
      );
    });

    test('normalizes lowercase query code, extra params, and whitespace', () {
      expect(
        extractLinkingCodeFromPayload(
          '  https://staging.nhilospos.com/i/tok999?utm_source=qr&code=ab23cd&v=2  ',
        ),
        'AB23CD',
      );
    });

    test('accepts bare 6-character alphanumeric code and uppercases it', () {
      expect(extractLinkingCodeFromPayload('XY98ZW'), 'XY98ZW');
      expect(extractLinkingCodeFromPayload('  ab23cd  '), 'AB23CD');
      expect(extractLinkingCodeFromPayload('001122'), '001122');
    });

    test('returns null for URLs without valid 6-char code query param', () {
      expect(
        extractLinkingCodeFromPayload('https://api.nhilospos.com/i/tok123'),
        isNull,
      );
      expect(
        extractLinkingCodeFromPayload(
          'https://api.nhilospos.com/i/tok123?code=',
        ),
        isNull,
      );
      expect(
        extractLinkingCodeFromPayload(
          'https://api.nhilospos.com/i/tok123?code=AB23',
        ),
        isNull,
      );
      expect(
        extractLinkingCodeFromPayload(
          'https://api.nhilospos.com/i/tok123?code=AB23CD99',
        ),
        isNull,
      );
      expect(
        extractLinkingCodeFromPayload(
          'https://api.nhilospos.com/i/tok123?code=AB23-D',
        ),
        isNull,
      );
    });

    test('returns null for empty, malformed, or wrong-length raw inputs', () {
      expect(extractLinkingCodeFromPayload(''), isNull);
      expect(extractLinkingCodeFromPayload('   '), isNull);
      expect(extractLinkingCodeFromPayload('AB23C'), isNull);
      expect(extractLinkingCodeFromPayload('AB23CDE'), isNull);
      expect(extractLinkingCodeFromPayload('AB23-D'), isNull);
      expect(extractLinkingCodeFromPayload('hello world'), isNull);
    });
  });
}
