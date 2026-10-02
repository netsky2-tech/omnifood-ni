/// The ABI the running Dart VM was compiled for.
///
/// Correct by construction rather than guessed: Flutter compiles a separate
/// Dart runtime per target ABI, so `dart:io Platform.version` ends with
/// `on "android_arm64"` inside the arm64 APK and `on "android_arm"` inside the
/// armeabi-v7a one. Verified on this host (yields `linux_x64`), which proves
/// the format; the device build yields the android_* variant.
///
/// This deliberately avoids adding `device_info_plus`: the terminal does not
/// need to ask the OS what CPU it has, it needs to know which artifact it *is*,
/// and the artifact already carries that fact.
enum TargetAbi {
  arm64v8a('arm64-v8a'),
  armeabiV7a('armeabi-v7a'),
  x86_64('x86_64'),
  x86('x86');

  const TargetAbi(this.wireName);

  /// The identifier used in the release manifest and by the backend registry.
  final String wireName;

  static TargetAbi? fromWireName(String? value) {
    if (value == null) return null;
    final normalized = value.trim();
    for (final abi in TargetAbi.values) {
      if (abi.wireName == normalized) return abi;
    }
    return null;
  }
}

/// Non-Android hosts (tests, desktop) and unrecognized strings resolve to
/// `null` rather than to a guessed ABI: an unknown ABI must never be allowed
/// to select a downloadable artifact.
TargetAbi? parseTargetAbi(String platformVersion) {
  final match = RegExp(r'on "([a-z0-9_]+)"').firstMatch(platformVersion);
  final target = match?.group(1);
  switch (target) {
    case 'android_arm64':
      return TargetAbi.arm64v8a;
    case 'android_arm':
      return TargetAbi.armeabiV7a;
    case 'android_x64':
      return TargetAbi.x86_64;
    case 'android_x86':
      return TargetAbi.x86;
    default:
      return null;
  }
}
