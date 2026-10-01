import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/platform/target_abi.dart';

void main() {
  group('parseTargetAbi', () {
    test('resolves the arm64 terminal build', () {
      expect(
        parseTargetAbi(
          '3.11.5 (stable) (Wed Apr 15 00:36:32 2026 -0700) on "android_arm64"',
        ),
        TargetAbi.arm64v8a,
      );
    });

    test('resolves the 32-bit arm build', () {
      expect(
        parseTargetAbi('3.11.5 (stable) (…) on "android_arm"'),
        TargetAbi.armeabiV7a,
      );
    });

    test('resolves the emulator build', () {
      expect(
        parseTargetAbi('3.11.5 (stable) (…) on "android_x64"'),
        TargetAbi.x86_64,
      );
      expect(
        parseTargetAbi('3.11.5 (stable) (…) on "android_x86"'),
        TargetAbi.x86,
      );
    });

    test('returns null for a non-Android host instead of guessing', () {
      // The host running `flutter test` reports linux_x64. Guessing an ABI
      // here would let a test (or a desktop build) select a phone artifact.
      expect(parseTargetAbi('3.11.5 (stable) (…) on "linux_x64"'), isNull);
      expect(parseTargetAbi('no target suffix here'), isNull);
      expect(parseTargetAbi(''), isNull);
    });

    test('does not confuse android_arm64 with android_arm', () {
      // Substring-matching these two is an easy and dangerous mistake: the
      // armeabi-v7a artifact must never be offered to an arm64 install.
      expect(parseTargetAbi('on "android_arm64"'), TargetAbi.arm64v8a);
      expect(parseTargetAbi('on "android_arm"'), TargetAbi.armeabiV7a);
    });
  });

  group('TargetAbi wire names', () {
    test('match the Android ABI identifiers the registry stores', () {
      expect(TargetAbi.arm64v8a.wireName, 'arm64-v8a');
      expect(TargetAbi.armeabiV7a.wireName, 'armeabi-v7a');
      expect(TargetAbi.x86_64.wireName, 'x86_64');
    });

    test('fromWireName round-trips and rejects unknown identifiers', () {
      for (final abi in TargetAbi.values) {
        expect(TargetAbi.fromWireName(abi.wireName), abi);
      }
      expect(TargetAbi.fromWireName('arm64'), isNull);
      expect(TargetAbi.fromWireName('ARM64-V8A'), isNull);
      expect(TargetAbi.fromWireName(''), isNull);
      expect(TargetAbi.fromWireName(null), isNull);
    });

    test('fromWireName tolerates surrounding whitespace only', () {
      expect(TargetAbi.fromWireName('  arm64-v8a  '), TargetAbi.arm64v8a);
    });
  });
}
