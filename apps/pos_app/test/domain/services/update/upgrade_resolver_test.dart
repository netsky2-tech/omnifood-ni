import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/platform/target_abi.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/services/update/upgrade_resolver.dart';

ReleaseManifest release({
  TargetAbi abi = TargetAbi.arm64v8a,
  int versionCode = 2002,
  int minFromVersionCode = 2001,
  bool mandatory = false,
}) {
  return ReleaseManifest(
    channel: 'pilot',
    abi: abi,
    versionCode: versionCode,
    versionName: '1.0.$versionCode',
    sha256: 'a' * 64,
    sizeBytes: 32357769,
    downloadUrl: Uri.parse('https://cdn.test/arm64-$versionCode.apk'),
    minFromVersionCode: minFromVersionCode,
    mandatory: mandatory,
    publishedAt: DateTime.utc(2026, 10, 2),
  );
}

UpgradeRejectionReason refused(UpgradeDecision d) {
  expect(d, isA<UpgradeRejected>());
  return (d as UpgradeRejected).reason;
}

void main() {
  group('resolveUpgrade — the normal upgrade', () {
    test('offers an arm64 release over a lower installed arm64 build', () {
      final d = resolveUpgrade(
        manifest: release(),
        terminalAbi: TargetAbi.arm64v8a,
        installedVersionCode: 2001,
      );
      expect(d, isA<UpgradeOffered>());
      final offered = d as UpgradeOffered;
      expect(offered.manifest.versionCode, 2002);
      expect(offered.installedVersionCode, 2001);
      expect(offered.mandatory, isFalse);
    });

    test('reports mandatory so the caller can withhold the skip option', () {
      final d = resolveUpgrade(
        manifest: release(mandatory: true),
        terminalAbi: TargetAbi.arm64v8a,
        installedVersionCode: 2001,
      );
      expect((d as UpgradeOffered).mandatory, isTrue);
    });

    test('accepts each ABI pairing with its own artifact', () {
      for (final abi in TargetAbi.values) {
        final d = resolveUpgrade(
          manifest: release(abi: abi, versionCode: 2002, minFromVersionCode: 2001),
          terminalAbi: abi,
          installedVersionCode: 2001,
        );
        expect(d, isA<UpgradeOffered>(), reason: 'mismatched for $abi');
      }
    });
  });

  group('resolveUpgrade — R1, the wrong artifact for this terminal', () {
    test('refuses an armeabi-v7a release on an arm64 terminal', () {
      // The Q80 is arm64. A v7a APK is the classic publishing slip because both
      // are "arm", and it is exactly what a single global versionCode hides.
      expect(
        refused(resolveUpgrade(
          manifest: release(abi: TargetAbi.armeabiV7a),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 2001,
        )),
        UpgradeRejectionReason.abiMismatch,
      );
    });

    test('refuses the mirror case: arm64 release on a v7a terminal', () {
      expect(
        refused(resolveUpgrade(
          manifest: release(abi: TargetAbi.arm64v8a),
          terminalAbi: TargetAbi.armeabiV7a,
          installedVersionCode: 1001,
        )),
        UpgradeRejectionReason.abiMismatch,
      );
    });

    test('refuses an emulator artifact on real hardware', () {
      expect(
        refused(resolveUpgrade(
          manifest: release(abi: TargetAbi.x86_64),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 2001,
        )),
        UpgradeRejectionReason.abiMismatch,
      );
    });

    test('refuses rather than guesses when the terminal cannot name its ABI',
        () {
      expect(
        refused(resolveUpgrade(
          manifest: release(),
          terminalAbi: null,
          installedVersionCode: 2001,
        )),
        UpgradeRejectionReason.abiUnknown,
      );
    });
  });

  group('resolveUpgrade — R2, version direction', () {
    test('equal versionCode is "up to date", not a failure', () {
      final d = resolveUpgrade(
        manifest: release(versionCode: 2001, minFromVersionCode: 2000),
        terminalAbi: TargetAbi.arm64v8a,
        installedVersionCode: 2001,
      );
      expect(d, isA<UpToDate>());
      expect((d as UpToDate).versionCode, 2001);
    });

    test('a lower versionCode is refused before any download', () {
      // Android will not install this over a non-debuggable release build, and
      // -d does not rescue it. Reaching the installer would only waste 32 MB
      // and end in a message the operator cannot act on.
      final d = resolveUpgrade(
        manifest: release(versionCode: 2001, minFromVersionCode: 2000),
        terminalAbi: TargetAbi.arm64v8a,
        installedVersionCode: 2002,
      );
      expect(refused(d), UpgradeRejectionReason.downgradeOffered);
      expect((d as UpgradeRejected).detail, contains('Android will refuse'));
      expect(d.detail, contains('2001'));
      expect(d.detail, contains('2002'));
    });

    test('a one-step upgrade is offered; the boundary is strict', () {
      expect(
        resolveUpgrade(
          manifest: release(versionCode: 2002, minFromVersionCode: 2001),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 2001,
        ),
        isA<UpgradeOffered>(),
      );
    });
  });

  group('resolveUpgrade — R3, the certified upgrade path', () {
    test('refuses a jump from below the declared floor', () {
      expect(
        refused(resolveUpgrade(
          manifest: release(versionCode: 2005, minFromVersionCode: 2003),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 2002,
        )),
        UpgradeRejectionReason.unsupportedUpgradePath,
      );
    });

    test('accepts exactly the floor version', () {
      expect(
        resolveUpgrade(
          manifest: release(versionCode: 2005, minFromVersionCode: 2003),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 2003,
        ),
        isA<UpgradeOffered>(),
      );
    });

    test('the floor check runs only after the direction check', () {
      // A release that is both older than installed AND has a high floor is a
      // registry mistake; reporting it as an unsupported path would send the
      // operator hunting for the wrong cause.
      expect(
        refused(resolveUpgrade(
          manifest: release(versionCode: 2001, minFromVersionCode: 2000),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 2002,
        )),
        UpgradeRejectionReason.downgradeOffered,
      );
    });
  });

  group('resolveUpgrade — caller wiring bugs', () {
    test('a non-positive installed version is its own reason', () {
      for (final bad in [0, -1, -2001]) {
        expect(
          refused(resolveUpgrade(
            manifest: release(),
            terminalAbi: TargetAbi.arm64v8a,
            installedVersionCode: bad,
          )),
          UpgradeRejectionReason.invalidInstalledVersion,
          reason: 'installed $bad must not be treated as a real version',
        );
      }
    });

    test('is checked before ABI, so a wiring bug is not misread as a mismatch',
        () {
      expect(
        refused(resolveUpgrade(
          manifest: release(abi: TargetAbi.armeabiV7a),
          terminalAbi: TargetAbi.arm64v8a,
          installedVersionCode: 0,
        )),
        UpgradeRejectionReason.invalidInstalledVersion,
      );
    });
  });

  group('rejection diagnostics', () {
    test('detail names both sides of an ABI mismatch in canonical English', () {
      final d = resolveUpgrade(
        manifest: release(abi: TargetAbi.armeabiV7a),
        terminalAbi: TargetAbi.arm64v8a,
        installedVersionCode: 2001,
      ) as UpgradeRejected;
      expect(d.detail, contains('armeabi-v7a'));
      expect(d.detail, contains('arm64-v8a'));
    });

    test('detail names the numbers involved in an unsupported path', () {
      final d = resolveUpgrade(
        manifest: release(versionCode: 2005, minFromVersionCode: 2003),
        terminalAbi: TargetAbi.arm64v8a,
        installedVersionCode: 2002,
      ) as UpgradeRejected;
      expect(d.detail, contains('2002'));
      expect(d.detail, contains('2003'));
      expect(d.detail, contains('2005'));
    });
  });
}
