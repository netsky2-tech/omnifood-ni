import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:pos_app/data/models/human_authorization/canonical.dart';
import 'package:pos_app/data/models/human_authorization/error_codes.dart';

/// Resolves `fixtures/human-authorization/v1` under the repository root,
/// robustly regardless of the working directory `flutter test` picks.
Directory resolveHumanAuthorizationFixtureRoot() {
  var current = Directory.current.absolute;
  while (true) {
    final candidate =
        Directory('${current.path}/fixtures/human-authorization/v1');
    if (candidate.existsSync()) return candidate;
    final parent = current.parent;
    if (parent.path == current.path) {
      throw StateError(
        'could not locate fixtures/human-authorization/v1 '
        'from ${Directory.current.path}',
      );
    }
    current = parent;
  }
}

Map<String, dynamic> loadCanonicalVectorsFixture() {
  final path =
      '${resolveHumanAuthorizationFixtureRoot().path}/canonical-vectors.json';
  return jsonDecode(File(path).readAsStringSync()) as Map<String, dynamic>;
}

Uint8List utf8Bytes(String text) => Uint8List.fromList(utf8.encode(text));

Uint8List hexBytes(String hex) {
  final bytes = <int>[];
  for (var i = 0; i < hex.length; i += 2) {
    bytes.add(int.parse(hex.substring(i, i + 2), radix: 16));
  }
  return Uint8List.fromList(bytes);
}

/// Extracts the stable failure from a result expected to be a rejection.
OhacError failureOf(OhacResult<dynamic> result) {
  if (result is OhacFailure<dynamic>) return result.error;
  throw StateError('expected the contract to reject the payload');
}

/// Stamps a body the way the backend stamps epochs and assertions:
/// canonicalize, compute the integrity digest over the canonical bytes, then
/// append the `digest` field.
Uint8List signBody(Map<String, dynamic> body) {
  final canonical = canonicalizeOhac(utf8Bytes(jsonEncode(body)));
  if (canonical is OhacFailure<Uint8List>) {
    throw StateError('test body failed to canonicalize: ${canonical.error}');
  }
  final digest =
      ohacDigest((canonical as OhacSuccess<Uint8List>).value);
  return utf8Bytes(jsonEncode(<String, dynamic>{...body, 'digest': digest}));
}
