// Build-time extraction of the OTA-related construction that used to live
// inline inside the `TerminalIdentityViewModel` provider closure in
// `main.dart`.
//
// T1 (OTA automatic discovery) ownership contract: the OtaUpdateCoordinator
// produced here is registered as its own app-root
// `ChangeNotifierProvider<OtaUpdateCoordinator>` with `lazy: false`, so the
// object exists from app start — before any screen opens — instead of only
// when the operator opens the terminal-identity settings screen. Later
// discovery tasks attach periodic scheduling to this same instance.

import 'dart:io';

import 'package:dio/dio.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/platform/target_abi.dart';
import '../../data/daos/local_config_dao.dart';
import '../../data/daos/sales/cashier_session_dao.dart';
import '../../data/services/api_base_url_service.dart';
import '../../data/services/platform/system_installer_adapter.dart';
import '../../data/services/update/fiscal_safety_gate_adapter.dart';
import '../../data/update/shared_preferences_release_offer_suppression_store.dart';
import '../../domain/services/update/offer_suppression.dart';
import '../../domain/services/update/ota_update_coordinator.dart';
import '../../domain/services/update/release_downloader.dart';

/// Clean Dio instance with NO auth interceptors and generous timeouts for
/// downloading large APK binaries from external object storage (R2).
Dio buildOtaDownloadDio() => Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(minutes: 5),
      ),
    );

/// The OTA-related dependencies shared between the app-root coordinator
/// provider and the terminal-identity view model: the coordinator plus the
/// [ApiBaseUrlService] the view model needs independently for server-URL
/// configuration (one instance, so both surfaces resolve the same URL).
class OtaDependencies {
  const OtaDependencies({
    required this.apiBaseUrlService,
    required this.otaCoordinator,
    required this.releaseOfferSuppressionStore,
  });

  final ApiBaseUrlService apiBaseUrlService;
  final OtaUpdateCoordinator otaCoordinator;

  /// T3 (offer suppression, AC5): persisted record of the highest surfaced
  /// versionCode, consumed by the silent discovery service. Overridable for
  /// tests; production uses SharedPreferences.
  final ReleaseOfferSuppressionStore releaseOfferSuppressionStore;
}

/// Builds the app-root OTA coordinator and its shared [ApiBaseUrlService].
///
/// Keep the parameter list narrow and injectable: the only required external
/// collaborators are the two DAOs (config resolution + open-shift check),
/// the discovery Dio (with auth interceptors, for `/v1/releases/latest`),
/// and the storage-directory resolver. The coordinator's own override hooks
/// (`getPackageInfo` / `resolveAbi`) are passed through unchanged for tests.
OtaDependencies buildOtaDependencies({
  required LocalConfigDao localConfigDao,
  required CashierSessionDao cashierSessionDao,
  required Dio discoveryDio,
  required Future<Directory> Function() getStorageDirectory,
  Dio? downloadDio,
  Future<PackageInfo> Function()? getPackageInfo,
  TargetAbi? Function()? resolveAbi,
  ReleaseOfferSuppressionStore? offerSuppressionStore,

  /// Resolves the acting user's id at ACTION time (the same per-action
  /// resolution `SaleViewModel.openSession` and `CashShiftViewModel`
  /// use — never a literal captured at construction).
  ///
  /// Required by the fiscal gate: the open-shift lookup MUST be scoped to
  /// the acting user and the terminal, exactly like the rest of the app.
  /// The unscoped variant (`getAllSessions().any(!isClosed)`) is
  /// explicitly DEPRECATED for production use in
  /// [CashierSessionDao.getActiveSession] — it ignores user and terminal,
  /// so an abandoned session belonging to any other operator kept the
  /// terminal from ever passing the OTA gate, even after the operator had
  /// closed their own register (device-reported).
  Future<String?> Function()? resolveActingUserId,

  /// Resolves this device's terminal id. Same resolution the cash-shift
  /// opener uses (`deviceId` in `main.dart`), so the gate and the shift
  /// opener agree on what "this terminal" means.
  Future<String> Function()? resolveTerminalId,

  /// Compile-time `--dart-define=API_URL=...` value. Read exactly once, at
  /// this app-root seam, the way `main.dart` does — the domain layer only
  /// ever receives the value (T5, V13). Tests may override it; production
  /// callers never pass it.
  String buildTimeApiUrl = const String.fromEnvironment('API_URL'),
}) {
  final apiBaseUrlService = ApiBaseUrlService(localConfigDao);
  final otaCoordinator = OtaUpdateCoordinator(
    apiBaseUrlService: apiBaseUrlService,
    releaseDownloader:
        ReleaseDownloader(dio: downloadDio ?? buildOtaDownloadDio()),
    releaseInstaller: SystemInstallerAdapter(),
    fiscalSafetyGate: FiscalSafetyGateAdapter(
      checkOpenShift: () async {
        // The identity is resolved at ACTION time, not at construction:
        // the operator may have logged in or changed terminals since the
        // coordinator was built.
        final userId = await resolveActingUserId?.call();
        if (userId == null || userId.isEmpty) {
          // No acting user means no shift of THIS operator can be open.
          // Treating it as "no open shift" is the correct read: there is
          // nothing of this operator's to reconcile. (The gate still
          // blocks on the cart and on an in-flight sale, which are the
          // states that actually risk losing money.)
          return false;
        }
        final terminalId = await resolveTerminalId?.call() ?? '';
        final session = await cashierSessionDao
            .getActiveSessionForUserAndTerminal(userId, terminalId);
        return session != null && !session.isClosed;
      },
    ),
    dio: discoveryDio,
    getStorageDirectory: getStorageDirectory,
    getPackageInfo: getPackageInfo,
    resolveAbi: resolveAbi,
    buildTimeApiUrl: buildTimeApiUrl,
  );
  return OtaDependencies(
    apiBaseUrlService: apiBaseUrlService,
    otaCoordinator: otaCoordinator,
    releaseOfferSuppressionStore:
        offerSuppressionStore ?? SharedPreferencesReleaseOfferSuppressionStore(),
  );
}
