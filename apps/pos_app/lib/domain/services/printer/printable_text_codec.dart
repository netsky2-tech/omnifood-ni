/// Deterministic receipt text codec for single-column Latin-1 printer paths.
///
/// It keeps Latin-1 Spanish characters, composes common decomposed accents,
/// transliterates web punctuation, and replaces every unsupported code point
/// with one ASCII question mark. It never emits UTF-8 bytes.
class PrintableTextCodec {
  const PrintableTextCodec();

  static const _punctuation = <int, String>{
    0x2018: "'",
    0x2019: "'",
    0x201A: "'",
    0x201C: '"',
    0x201D: '"',
    0x201E: '"',
    0x2013: '-',
    0x2014: '-',
    0x2026: '...',
    0x00A0: ' ',
  };

  static const _composed = <String, String>{
    'a\u0301': 'á', 'e\u0301': 'é', 'i\u0301': 'í', 'o\u0301': 'ó', 'u\u0301': 'ú',
    'A\u0301': 'Á', 'E\u0301': 'É', 'I\u0301': 'Í', 'O\u0301': 'Ó', 'U\u0301': 'Ú',
    'n\u0303': 'ñ', 'N\u0303': 'Ñ', 'u\u0308': 'ü', 'U\u0308': 'Ü',
  };

  String normalize(String input, {bool preserveNewlines = true}) {
    final out = StringBuffer();
    final codePoints = input.runes.toList(growable: false);
    for (var i = 0; i < codePoints.length; i++) {
      final current = codePoints[i];
      if (i + 1 < codePoints.length) {
        final pair = String.fromCharCode(current) + String.fromCharCode(codePoints[i + 1]);
        final composed = _composed[pair];
        if (composed != null) {
          out.write(composed);
          i++;
          continue;
        }
      }
      if (current == 0x0A && preserveNewlines) {
        out.write('\n');
      } else if (current == 0x09 || current == 0x0D || current < 0x20 || current == 0x7F) {
        out.write(' ');
      } else if (current <= 0xFF) {
        out.writeCharCode(current);
      } else {
        out.write(_punctuation[current] ?? '?');
      }
    }
    return out.toString();
  }
}
