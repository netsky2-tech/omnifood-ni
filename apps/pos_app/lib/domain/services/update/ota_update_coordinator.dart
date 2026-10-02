import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../../core/platform/target_abi.dart';
import '../../models/update/release_manifest.dart';
import '../../ports/fiscal_safety_gate_port.dart';
import '../../ports/release_installer_port.dart';
import '../update/release_downloader.dart';
import '../update/upgrade_resolver.dart';
import '../../../data/services/api_base_url_service.dart';

/// Observable states of the OTA update lifecycle.
sealed class OtaUpdateState {
  const OtaUpdateState();
}

class OtaInitial extends OtaUpdateState {
  const OtaInitial();
}

class OtaChecking extends OtaUpdateState {
  const OtaChecking();
}

class OtaUpToDate extends OtaUpdateState {
  const OtaUpToDate(this.versionCode);
  final int versionCode;
}

class OtaUpdateAvailable extends OtaUpdateState {
  const OtaUpdateAvailable({
    required this.manifest,
    required this.fiscalVerdict,
  });

  final ReleaseManifest manifest;
  final FiscalSafetyVerdict fiscalVerdict;

  bool get canInstallNow => fiscalVerdict is FiscalGateClear;
}

class OtaDownloading extends OtaUpdateState {
  const OtaDownloading({
    required this.manifest,
    required this.receivedBytes,
    required this.totalBytes,
  });

  final ReleaseManifest manifest;
  final int receivedBytes;
  final int totalBytes;

  double get progress =>
      totalBytes > 0 ? (receivedBytes / totalBytes).clamp(0.0, 1.0) : 0.0;
}

class OtaReadyToInstall extends OtaUpdateState {
  const OtaReadyToInstall(this.verifiedArtifact);
  final VerifiedReleaseArtifact verifiedArtifact;
}

class OtaHandoffDispatched extends OtaUpdateState {
  const OtaHandoffDispatched();
}

class OtaPermissionRequired extends OtaUpdateState {
  const OtaPermissionRequired({this.pendingArtifact});
  final VerifiedReleaseArtifact? pendingArtifact;
}

class OtaFailed extends OtaUpdateState {
  const OtaFailed({
    required this.message,
    this.reasonCode,
  });

  final String message;
  final String? reasonCode;
}

/// Orchestrates discovery, verification, and dispatch of software updates.
///
/// Ties together:
///   - [ApiBaseUrlService] for backend endpoint resolution
///   - [TargetAbi] runtime detection (F9)
///   - [UpgradeResolver] rules R1–R3
///   - [FiscalSafetyGatePort] rule R7 (cart, sale, shift protection)
///   - [ReleaseDownloader] rules R4 & R5 (streaming SHA-256 and size verification)
///   - [ReleaseInstallerPort] rule F1 & F2 (FileProvider handoff)
class OtaUpdateCoordinator extends ChangeNotifier {
  OtaUpdateCoordinator({
    required ApiBaseUrlService apiBaseUrlService,
    required ReleaseDownloader releaseDownloader,
    required ReleaseInstallerPort releaseInstaller,
    required FiscalSafetyGatePort fiscalSafetyGate,
    required Dio dio,
    required Future<Directory> Function() getStorageDirectory,
    Future<PackageInfo> Function()? getPackageInfo,
    TargetAbi? Function()? resolveAbi,
  })  : _apiBaseUrlService = apiBaseUrlService,
        _releaseDownloader = releaseDownloader,
        _releaseInstaller = releaseInstaller,
        _fiscalSafetyGate = fiscalSafetyGate,
        _dio = dio,
        _getStorageDirectory = getStorageDirectory,
        _getPackageInfo = getPackageInfo ?? PackageInfo.fromPlatform,
        _resolveAbi = resolveAbi ?? (() => parseTargetAbi(Platform.version));

  final ApiBaseUrlService _apiBaseUrlService;
  final ReleaseDownloader _releaseDownloader;
  final ReleaseInstallerPort _releaseInstaller;
  final FiscalSafetyGatePort _fiscalSafetyGate;
  final Dio _dio;
  final Future<Directory> Function() _getStorageDirectory;
  final Future<PackageInfo> Function() _getPackageInfo;
  final TargetAbi? Function() _resolveAbi;

  OtaUpdateState _state = const OtaInitial();
  OtaUpdateState get state => _state;

  void _setState(OtaUpdateState newState) {
    _state = newState;
    notifyListeners();
  }

  /// Checks the backend for an update offer.
  ///
  /// Offline-first contract:
  /// - If the backend URL is unconfigured, discovery quietly returns.
  /// - If network is unavailable or backend is offline, state remains safe.
  Future<void> checkForUpdate({String channel = 'pilot'}) async {
    _setState(const OtaChecking());

    final abi = _resolveAbi();
    if (abi == null) {
      _setState(const OtaFailed(
        message: 'No se pudo identificar la arquitectura del terminal.',
        reasonCode: 'ABI_UNKNOWN',
      ));
      return;
    }

    final urlResolution = await _apiBaseUrlService.resolve();
    if (!urlResolution.isConfigured || urlResolution.url == null) {
      _setState(const OtaInitial());
      return;
    }

    final int installedVersionCode;
    try {
      final info = await _getPackageInfo();
      installedVersionCode = int.tryParse(info.buildNumber) ?? 0;
    } catch (_) {
      _setState(const OtaFailed(
        message: 'No se pudo leer la versión instalada de la aplicación.',
        reasonCode: 'PACKAGE_INFO_ERROR',
      ));
      return;
    }

    if (installedVersionCode <= 0) {
      _setState(const OtaFailed(
        message: 'El código de versión instalado no es válido.',
        reasonCode: 'INVALID_INSTALLED_VERSION',
      ));
      return;
    }

    final discoveryUrl =
        '${urlResolution.url}/v1/releases/latest?channel=$channel&abi=${abi.wireName}&currentVersionCode=$installedVersionCode';

    final Response<dynamic> response;
    try {
      response = await _dio.get(
        discoveryUrl,
        options: Options(
          validateStatus: (status) =>
              status != null && (status == 200 || status == 204),
        ),
      );
    } catch (e) {
      _setState(OtaFailed(
        message: 'Error al consultar actualizaciones en el servidor.',
        reasonCode: e.toString(),
      ));
      return;
    }

    if (response.statusCode == 204 || response.data == null) {
      _setState(OtaUpToDate(installedVersionCode));
      return;
    }

    final parseResult = ReleaseManifest.tryParse(response.data);
    if (parseResult is! ReleaseManifestAccepted) {
      final rejection = parseResult as ReleaseManifestRejection;
      _setState(OtaFailed(
        message: 'El servidor envió una oferta de versión inválida.',
        reasonCode: rejection.reason.name,
      ));
      return;
    }

    final manifest = parseResult.manifest;
    final upgradeDecision = resolveUpgrade(
      manifest: manifest,
      terminalAbi: abi,
      installedVersionCode: installedVersionCode,
    );

    switch (upgradeDecision) {
      case UpToDate():
        _setState(OtaUpToDate(installedVersionCode));
      case UpgradeRejected(:final reason, :final detail):
        _setState(OtaFailed(
          message: detail,
          reasonCode: reason.name,
        ));
      case UpgradeOffered():
        final fiscalVerdict = await _fiscalSafetyGate.evaluateSafety();
        _setState(OtaUpdateAvailable(
          manifest: manifest,
          fiscalVerdict: fiscalVerdict,
        ));
    }
  }

  /// Downloads, verifies, and dispatches installation of [manifest].
  ///
  /// Protected by [FiscalSafetyGatePort]: will refuse to download if the terminal
  /// has open sales, active cart items, or an open cashier shift (Rule R7).
  Future<void> downloadAndInstall(ReleaseManifest manifest) async {
    // 1. Guard check
    final fiscalVerdict = await _fiscalSafetyGate.evaluateSafety();
    if (fiscalVerdict is FiscalGateBlocked) {
      _setState(OtaUpdateAvailable(
        manifest: manifest,
        fiscalVerdict: fiscalVerdict,
      ));
      return;
    }

    // 2. Storage directory resolution
    final Directory baseDir;
    try {
      baseDir = await _getStorageDirectory();
    } catch (e) {
      _setState(OtaFailed(
        message: 'No se pudo acceder al almacenamiento del dispositivo.',
        reasonCode: e.toString(),
      ));
      return;
    }

    final releasesDir = Directory('${baseDir.path}/releases');

    // 3. Download & Verify
    _setState(OtaDownloading(
      manifest: manifest,
      receivedBytes: 0,
      totalBytes: manifest.sizeBytes,
    ));

    final downloadResult = await _releaseDownloader.downloadAndVerify(
      manifest: manifest,
      targetDirectory: releasesDir,
      onProgress: (received, total) {
        _setState(OtaDownloading(
          manifest: manifest,
          receivedBytes: received,
          totalBytes: total > 0 ? total : manifest.sizeBytes,
        ));
      },
    );

    switch (downloadResult) {
      case DownloadVerificationFailure(:final detail, :final reason):
        _setState(OtaFailed(
          message: 'La verificación del archivo descargado falló: $detail',
          reasonCode: reason.name,
        ));
        return;
      case DownloadNetworkFailure(:final detail):
        _setState(OtaFailed(
          message: 'Error al descargar la actualización: $detail',
          reasonCode: 'NETWORK_ERROR',
        ));
        return;
      case VerifiedReleaseArtifact():
        _setState(OtaReadyToInstall(downloadResult));

        // 4. Handoff to platform installer
        final handoffResult =
            await _releaseInstaller.installRelease(downloadResult.file);
        switch (handoffResult) {
          case InstallHandoffDispatched():
            _setState(const OtaHandoffDispatched());
          case InstallPermissionRequired():
            _setState(OtaPermissionRequired(pendingArtifact: downloadResult));
          case InstallFileNotFound(:final filePath):
            _setState(OtaFailed(
              message: 'El archivo descargado no se encontró en $filePath.',
              reasonCode: 'FILE_NOT_FOUND',
            ));
          case InstallHandoffFailed(:final reason, :final errorCode):
            _setState(OtaFailed(
              message: 'El instalador del sistema rechazó la solicitud: $reason',
              reasonCode: errorCode ?? 'INSTALL_FAILED',
            ));
        }
    }
  }

  /// Opens system settings to grant package install permissions.
  Future<void> openInstallSettings() async {
    await _releaseInstaller.openInstallPermissionSettings();
  }

  /// Automatically or manually resumes the installation handoff once the
  /// operator has granted the REQUEST_INSTALL_PACKAGES permission in Settings.
  Future<void> resumeInstallAfterPermission() async {
    final currentState = _state;
    if (currentState is! OtaPermissionRequired) return;

    final canInstall = await _releaseInstaller.canRequestPackageInstalls();
    if (!canInstall) return;

    final pending = currentState.pendingArtifact;
    if (pending != null && pending.file.existsSync()) {
      _setState(OtaReadyToInstall(pending));
      final handoffResult =
          await _releaseInstaller.installRelease(pending.file);
      if (handoffResult is InstallHandoffDispatched) {
        _setState(const OtaHandoffDispatched());
      } else if (handoffResult is InstallPermissionRequired) {
        _setState(OtaPermissionRequired(pendingArtifact: pending));
      } else if (handoffResult is InstallHandoffFailed) {
        _setState(OtaFailed(
          message:
              'El instalador del sistema rechazó la solicitud: ${handoffResult.reason}',
          reasonCode: handoffResult.errorCode ?? 'INSTALL_FAILED',
        ));
      }
    } else {
      // Artifact was cleared or missing; reset to initial so the user can re-check
      _setState(const OtaInitial());
    }
  }
}
