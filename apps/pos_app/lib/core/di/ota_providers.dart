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
  });

  final ApiBaseUrlService apiBaseUrlService;
  final OtaUpdateCoordinator otaCoordinator;
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
}) {
  final apiBaseUrlService = ApiBaseUrlService(localConfigDao);
  final otaCoordinator = OtaUpdateCoordinator(
    apiBaseUrlService: apiBaseUrlService,
    releaseDownloader:
        ReleaseDownloader(dio: downloadDio ?? buildOtaDownloadDio()),
    releaseInstaller: SystemInstallerAdapter(),
    fiscalSafetyGate: FiscalSafetyGateAdapter(
      checkOpenShift: () async {
        final sessions = await cashierSessionDao.getAllSessions();
        return sessions.any((s) => !s.isClosed);
      },
    ),
    dio: discoveryDio,
    getStorageDirectory: getStorageDirectory,
    getPackageInfo: getPackageInfo,
    resolveAbi: resolveAbi,
  );
  return OtaDependencies(
    apiBaseUrlService: apiBaseUrlService,
    otaCoordinator: otaCoordinator,
  );
}
