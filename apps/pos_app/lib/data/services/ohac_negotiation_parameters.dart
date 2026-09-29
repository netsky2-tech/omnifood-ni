import 'dart:developer' as developer;

import 'package:package_info_plus/package_info_plus.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';

/// The policy schemas this POS build can parse, on the wire as a
/// comma-joined list (backend `parseHumanAuthorizationNegotiation`).
///
/// Today that is exactly the epoch contract's own schema; the list shape is
/// kept explicit so a second schema joins the list rather than replacing the
/// constant.
const List<String> ohacSupportedPolicySchemas = <String>[
  staffPolicyEpochV1Schema,
];

/// The assertion schemas this POS build can produce, comma-joined on the
/// wire. The verifier will require the minimum assertion schema (design
/// §7.1), so the negotiation advertises it from the start.
const List<String> ohacSupportedAssertionSchemas = <String>[
  minimumAssertionSchema,
];

/// Builds the four OHAC pull negotiation query parameters (design §11.5
/// decision 30, §12) from values the caller has already read.
///
/// This builder is pure: it decides nothing about failure and cannot omit
/// anything. Omission — the fail-closed legacy-client answer — belongs to the
/// caller, which passes no parameters at all when the version read fails. In
/// particular a **present but empty** [posBuild] is sent verbatim: the
/// backend deliberately answers an absent build as a legacy client and a
/// present-blank one as `UPGRADE_REQUIRED`, so dropping the empty string
/// here would silently turn an opted-in terminal into a legacy one
/// (`staff-policy-epoch-delivery.service.ts`).
///
/// [serverFloorSequence] is the terminal's local copy of the **server-
/// confirmed** floor (`server_floor_sequence`), not the active sequence: the
/// backend answers `RECOVERY_REQUIRED` when the reported floor runs ahead of
/// what it has acknowledged, and the active sequence legitimately does while
/// a candidate is unacknowledged.
Map<String, String> buildOhacNegotiationParameters({
  required String posBuild,
  required int serverFloorSequence,
  List<String> policySchemas = ohacSupportedPolicySchemas,
  List<String> assertionSchemas = ohacSupportedAssertionSchemas,
}) =>
    <String, String>{
      'ohacPosBuild': posBuild,
      'ohacPolicySchemas': policySchemas.join(','),
      'ohacAssertionSchemas': assertionSchemas.join(','),
      // The wire value is a decimal string; both sides compare floors with
      // BigInt, never lexically.
      'ohacFloorSequence': serverFloorSequence.toString(),
    };

/// Reads the POS's own package version at runtime (design §11.5 decision
/// 30) as the **pubspec `version` string** — the full `version: 1.0.0+1`
/// field reconstructed from `PackageInfo.version` (`1.0.0`) and
/// `PackageInfo.buildNumber` (`1`).
///
/// The cohort gate matches `pos_build` with **exact string equality**
/// (`staff-policy-epoch-materialization.service.ts`: `pos_build = $2`), so
/// the sent value must round-trip the pubspec field the operator seeds
/// against. Decision 30's "send the version verbatim" is therefore read as
/// "the app's own package version" — the pubspec field — not as the raw
/// `PackageInfo.version` accessor: dropping the build number would make two
/// rebuilds of `1.0.0` indistinguishable to an exact-build gate. A pubspec
/// declared without a build number round-trips exactly (no trailing `+`).
///
/// Reading the built artifact's own version is the only source that cannot
/// drift from the artifact: the exact `(pos_build, backend_build)` pair is
/// the cohort gate's key, and a drifted value would silently disable every
/// terminal. When the read throws — a platform without the plugin, a failed
/// channel call — this returns null and the caller omits the negotiation
/// parameters entirely, behaving as a legacy client. That is the fail-closed
/// answer: no epoch, no assertion, and no silently wrong build.
Future<String?> readOhacPosBuild() async {
  try {
    final info = await PackageInfo.fromPlatform();
    // A blank build number is treated as absent so a pubspec declared as
    // `version: 1.0.0` (no `+build`) round-trips exactly, without a
    // trailing `+`.
    final buildNumber = info.buildNumber.trim();
    return buildNumber.isEmpty ? info.version : '${info.version}+$buildNumber';
  } catch (e) {
    developer.log(
      '[SYNC_PULL] ohac_pos_build_read_failed=$e; '
      'omitting OHAC negotiation parameters (legacy client)',
      name: 'SyncService',
    );
    return null;
  }
}
