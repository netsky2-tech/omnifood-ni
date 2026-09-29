import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:package_info_plus_platform_interface/package_info_data.dart';
import 'package:package_info_plus_platform_interface/package_info_platform_interface.dart';
import 'package:pos_app/data/models/human_authorization/staff_policy_epoch_v1.dart';
import 'package:pos_app/data/services/ohac_negotiation_parameters.dart';

/// OHAC pull negotiation parameters (design §11.5 decision 30, §12).
///
/// The wire names are frozen by the backend's `InboundSyncQueryDto` /
/// `parseHumanAuthorizationNegotiation`: `ohacPosBuild`, `ohacPolicySchemas`,
/// `ohacAssertionSchemas`, `ohacFloorSequence`. An **absent** build means a
/// legacy client (the authorization member is omitted entirely); a **present
/// but empty** build means an opted-in client that cannot be served
/// (`UPGRADE_REQUIRED`). The builder therefore never drops an empty build —
/// omission is decided by the caller (the version reader returning null),
/// never by the builder.
void main() {
  group('buildOhacNegotiationParameters', () {
    test('sends the four exact wire names with the contract schema constants',
        () {
      final params = buildOhacNegotiationParameters(
        posBuild: '1.0.0+1',
        serverFloorSequence: 7,
      );

      expect(params.keys, containsAll(<String>[
        'ohacPosBuild',
        'ohacPolicySchemas',
        'ohacAssertionSchemas',
        'ohacFloorSequence',
      ]));
      expect(params['ohacPosBuild'], '1.0.0+1');
      // The supported-schema lists are the contract's own vocabulary, not
      // caller choices: the POS speaks exactly the epoch schema and the
      // minimum assertion schema, comma-joined as a list.
      expect(params['ohacPolicySchemas'], staffPolicyEpochV1Schema);
      expect(params['ohacAssertionSchemas'], minimumAssertionSchema);
      // The floor is the server-confirmed position, on the wire as a decimal
      // string (both sides compare it with BigInt, backend
      // `floorAheadOf`).
      expect(params['ohacFloorSequence'], '7');
    });

    test('sends a comma-joined list when a schema list holds more than one '
        'entry', () {
      final params = buildOhacNegotiationParameters(
        posBuild: '1.0.0+1',
        serverFloorSequence: 0,
        policySchemas: const ['a.schema.v1', 'b.schema.v1'],
        assertionSchemas: const ['c.assertion.v1', 'd.assertion.v1'],
      );

      expect(params['ohacPolicySchemas'], 'a.schema.v1,b.schema.v1');
      expect(params['ohacAssertionSchemas'], 'c.assertion.v1,d.assertion.v1');
    });

    test('sends an empty build verbatim instead of dropping it', () {
      // Present-blank is meaningful on the wire (the backend answers
      // UPGRADE_REQUIRED for it); only a null reader result may omit params.
      final params = buildOhacNegotiationParameters(
        posBuild: '',
        serverFloorSequence: 0,
      );

      expect(params.containsKey('ohacPosBuild'), isTrue);
      expect(params['ohacPosBuild'], '');
    });

    test('formats the floor as a decimal string for sequence 0', () {
      final params = buildOhacNegotiationParameters(
        posBuild: '1.0.0+1',
        serverFloorSequence: 0,
      );

      expect(params['ohacFloorSequence'], '0');
    });
  });

  group('readOhacPosBuild', () {
    test('returns null when the platform read throws, so the caller omits '
        'the negotiation parameters entirely (decision 30 fail-closed)',
        () async {
      // Order-coupled by the package, not by choice: the injected failing
      // platform is only consulted while package_info_plus' private static
      // cache is empty, and package_info_plus 9.x caches the first
      // successful `fromPlatform` read with no public reset. This test
      // therefore must run before any successful
      // `PackageInfo.setMockInitialValues` in this file. Removing the
      // coupling needs a production seam (an injectable version reader)
      // and is out of scope for a test-only change.
      final originalPlatform = PackageInfoPlatform.instance;
      PackageInfoPlatform.instance = _ThrowingPlatform();
      addTearDown(() => PackageInfoPlatform.instance = originalPlatform);

      expect(await readOhacPosBuild(), isNull);
    });

    test('returns the pubspec version string, reconstructing the `+` build '
        'suffix from the build number', () async {
      PackageInfo.setMockInitialValues(
        appName: 'OmniFood POS',
        packageName: 'com.omnifood.pos',
        version: '1.2.43',
        buildNumber: '7',
        buildSignature: '',
      );

      expect(await readOhacPosBuild(), '1.2.43+7');
    });

    test('omits the `+` suffix when the build number is absent, so a pubspec '
        'declared without a build round-trips exactly', () async {
      PackageInfo.setMockInitialValues(
        appName: 'OmniFood POS',
        packageName: 'com.omnifood.pos',
        version: '1.0.0',
        buildNumber: '',
        buildSignature: '',
      );

      expect(await readOhacPosBuild(), '1.0.0');
    });

    test('treats a whitespace-only build number as absent instead of '
        'emitting a trailing `+`', () async {
      PackageInfo.setMockInitialValues(
        appName: 'OmniFood POS',
        packageName: 'com.omnifood.pos',
        version: '1.0.0',
        buildNumber: '  ',
        buildSignature: '',
      );

      expect(await readOhacPosBuild(), '1.0.0');
    });
  });
}

/// A platform implementation whose read always fails, standing in for the
/// real platform channel being unavailable (the environment in which
/// decision 30's fail-closed rule must hold).
class _ThrowingPlatform extends PackageInfoPlatform {
  @override
  Future<PackageInfoData> getAll({String? baseUrl}) async {
    throw StateError('platform read unavailable');
  }
}
