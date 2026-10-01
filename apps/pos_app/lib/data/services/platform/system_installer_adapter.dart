import 'dart:io';
import 'package:flutter/services.dart';
import '../../../domain/ports/release_installer_port.dart';

/// Default adapter implementing [ReleaseInstallerPort] using Android's
/// system PackageInstaller via FileProvider content:// URIs.
class SystemInstallerAdapter implements ReleaseInstallerPort {
  SystemInstallerAdapter({
    MethodChannel? channel,
  }) : _channel = channel ?? const MethodChannel('com.nhilos.pos_app/installer');

  final MethodChannel _channel;

  @override
  Future<bool> canRequestPackageInstalls() async {
    try {
      final result = await _channel.invokeMethod<bool>('canRequestPackageInstalls');
      return result ?? false;
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> openInstallPermissionSettings() async {
    try {
      await _channel.invokeMethod<bool>('openInstallPermissionSettings');
    } on PlatformException catch (e) {
      throw Exception('Failed to open install permission settings: ${e.message}');
    }
  }

  @override
  Future<InstallHandoffResult> installRelease(File apkFile) async {
    if (!apkFile.existsSync()) {
      return InstallFileNotFound(filePath: apkFile.path);
    }

    try {
      final success = await _channel.invokeMethod<bool>('installApk', {
        'filePath': apkFile.path,
      });

      if (success == true) {
        return InstallHandoffDispatched(filePath: apkFile.path);
      }
      return const InstallHandoffFailed(reason: 'Platform returned false without an exception');
    } on PlatformException catch (e) {
      if (e.code == 'PERMISSION_REQUIRED') {
        return const InstallPermissionRequired();
      }
      if (e.code == 'FILE_NOT_FOUND') {
        return InstallFileNotFound(filePath: apkFile.path);
      }
      return InstallHandoffFailed(
        reason: e.message ?? 'Unknown platform exception',
        errorCode: e.code,
      );
    } catch (e) {
      return InstallHandoffFailed(reason: e.toString());
    }
  }
}
