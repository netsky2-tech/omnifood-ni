import 'dart:typed_data';

import 'package:crypto/crypto.dart';

String sha256LowerHex(Uint8List frameBytes) =>
    sha256.convert(frameBytes).toString();
