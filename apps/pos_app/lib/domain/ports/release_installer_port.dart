import 'dart:io';

/// Outcome of attempting to hand off a verified release APK to the platform installer.
sealed class InstallHandoffResult {
  const InstallHandoffResult();
}

/// The system installer activity was successfully launched with the content://
/// URI. From this point forward, the Android PackageInstaller UI owns the
/// interactive confirmation with the operator.
class InstallHandoffDispatched extends InstallHandoffResult {
  const InstallHandoffDispatched({required this.filePath});
  final String filePath;
}

/// The app lacks the REQUEST_INSTALL_PACKAGES permission (Android 8.0+ / API 26+).
/// The operator must be guided to grant "Install unknown apps" in system Settings.
class InstallPermissionRequired extends InstallHandoffResult {
  const InstallPermissionRequired();
}

/// The target APK file could not be found on disk.
class InstallFileNotFound extends InstallHandoffResult {
  const InstallFileNotFound({required this.filePath});
  final String filePath;
}

/// The platform rejected or failed to start the installation activity.
class InstallHandoffFailed extends InstallHandoffResult {
  const InstallHandoffFailed({required this.reason, this.errorCode});
  final String reason;
  final String? errorCode;
}

/// Hexagonal port for dispatching verified release artifacts to the underlying
/// OS installer.
abstract interface class ReleaseInstallerPort {
  /// Checks whether the OS allows this app to request package installations.
  /// On Android 8.0+, this reflects the REQUEST_INSTALL_PACKAGES app-op.
  Future<bool> canRequestPackageInstalls();

  /// Opens the system Settings page where the operator can grant the
  /// "Install unknown apps" permission for this package.
  Future<void> openInstallPermissionSettings();

  /// Hands off [apkFile] to the system installer.
  ///
  /// Contract:
  /// - [apkFile] must be verified (SHA-256 and size) BEFORE calling this method.
  /// - Uses a secure content:// URI via FileProvider with FLAG_GRANT_READ_URI_PERMISSION.
  Future<InstallHandoffResult> installRelease(File apkFile);
}
