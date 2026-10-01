import '../../../core/platform/target_abi.dart';
import '../../models/update/release_manifest.dart';

/// Whether an already-parsed, already-valid release may be installed on *this*
/// terminal, given what is installed right now.
///
/// Pure logic with no I/O: the manifest parser decides whether an offer is
/// well-formed, this decides whether it applies. Keeping them apart is what
/// lets a registry mistake (a v7a artifact published under arm64, or a version
/// that has gone backwards) be caught before a byte is downloaded.
///
/// Rule numbering refers to odd/tasks/ota-update-channel.md.
sealed class UpgradeDecision {
  const UpgradeDecision();
}

/// Nothing to do: the terminal already runs this exact version. A normal,
/// unremarkable outcome — must not be reported to the operator as a failure.
class UpToDate extends UpgradeDecision {
  const UpToDate(this.versionCode);
  final int versionCode;
}

/// The offer is installable on this terminal.
class UpgradeOffered extends UpgradeDecision {
  const UpgradeOffered({
    required this.manifest,
    required this.installedVersionCode,
  });

  final ReleaseManifest manifest;
  final int installedVersionCode;

  /// A mandatory release still requires the operator to confirm the install:
  /// "mandatory" removes the choice to skip *this version*, never the choice to
  /// refuse a restart in the middle of a service. The fiscal gate owns that.
  bool get mandatory => manifest.mandatory;
}

/// The offer must not be installed here.
class UpgradeRejected extends UpgradeDecision {
  const UpgradeRejected(this.reason, this.detail);
  final UpgradeRejectionReason reason;

  /// Canonical English detail for logs. The UI maps [reason] to localized copy.
  final String detail;
}

enum UpgradeRejectionReason {
  /// R1 — the artifact was built for a different ABI. Installing it would
  /// either fail outright or, on a device that accepts a 32-bit build, replace
  /// a faster binary with a slower one.
  abiMismatch,

  /// The running process could not identify its own ABI. Proceeding would mean
  /// guessing, and a guess here selects which binary lands on a fiscal device.
  abiUnknown,

  /// R2 — the published versionCode is lower than what is installed. Android
  /// refuses this at install time on a non-debuggable release build
  /// (INSTALL_FAILED_VERSION_DOWNGRADE), so reaching the installer would only
  /// produce a confusing failure. This is a registry mistake, not a terminal
  /// state, and is worth surfacing.
  downgradeOffered,

  /// R3 — the installed version is below the release's declared floor, so the
  /// publisher has not certified this jump. Skipping intermediate releases can
  /// mean skipping a database migration, which on this product means risking
  /// the fiscal sequence.
  unsupportedUpgradePath,

  /// The caller reported an installed versionCode that is not a positive
  /// integer. That is a wiring bug on the terminal side, not a registry
  /// problem, and it must not be confused with a legitimate refusal.
  invalidInstalledVersion,
}

/// Decides whether [manifest] may be installed over [installedVersionCode].
UpgradeDecision resolveUpgrade({
  required ReleaseManifest manifest,
  required TargetAbi? terminalAbi,
  required int installedVersionCode,
}) {
  if (installedVersionCode <= 0) {
    return UpgradeRejected(
      UpgradeRejectionReason.invalidInstalledVersion,
      'installed versionCode must be a positive integer, got '
      '$installedVersionCode',
    );
  }

  if (terminalAbi == null) {
    return const UpgradeRejected(
      UpgradeRejectionReason.abiUnknown,
      'the running process could not resolve its own target ABI',
    );
  }

  if (manifest.abi != terminalAbi) {
    return UpgradeRejected(
      UpgradeRejectionReason.abiMismatch,
      'release targets ${manifest.abi.wireName} but this terminal is '
      '${terminalAbi.wireName}',
    );
  }

  if (manifest.versionCode < installedVersionCode) {
    return UpgradeRejected(
      UpgradeRejectionReason.downgradeOffered,
      'release ${manifest.versionCode} is older than installed '
      '$installedVersionCode; Android will refuse this install',
    );
  }

  if (manifest.versionCode == installedVersionCode) {
    return UpToDate(installedVersionCode);
  }

  if (installedVersionCode < manifest.minFromVersionCode) {
    return UpgradeRejected(
      UpgradeRejectionReason.unsupportedUpgradePath,
      'installed $installedVersionCode is below the supported floor '
      '${manifest.minFromVersionCode} for release ${manifest.versionCode}',
    );
  }

  return UpgradeOffered(
    manifest: manifest,
    installedVersionCode: installedVersionCode,
  );
}
