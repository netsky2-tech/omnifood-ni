/// Parses linking codes from install-kit QR payloads, App Link URIs, or
/// direct 6-character manual codes (issue #958).
final RegExp _linkingCodePattern = RegExp(r'^[A-Z0-9]{6}$');

/// Extracts and normalizes a 6-character alphanumeric linking code from [raw].
///
/// Supported inputs:
/// - Full install-kit URL / App Link with `?code=XXXXXX` query parameter
///   (e.g. `https://api.nhilospos.com/i/tok123?code=AB23CD`).
/// - Bare 6-character alphanumeric code (e.g. `ab23cd`).
///
/// Returns the uppercase 6-character code, or `null` if [raw] does not
/// contain a valid linking code.
String? extractLinkingCodeFromPayload(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    return null;
  }

  final uri = Uri.tryParse(trimmed);
  final queryCode = uri?.queryParameters['code'];
  if (queryCode != null) {
    final normalized = queryCode.trim().toUpperCase();
    return _linkingCodePattern.hasMatch(normalized) ? normalized : null;
  }

  final normalizedRaw = trimmed.toUpperCase();
  if (_linkingCodePattern.hasMatch(normalizedRaw)) {
    return normalizedRaw;
  }

  return null;
}
