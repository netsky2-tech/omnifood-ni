import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/platform/system_installer_adapter.dart';
import 'package:pos_app/domain/ports/release_installer_port.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late MethodChannel channel;
  final List<MethodCall> calls = [];
  dynamic channelResult;
  PlatformException? channelException;

  setUp(() {
    tempDir = Directory.systemTemp.createTempSync('installer_adapter_test_');
    channel = const MethodChannel('com.nhilos.pos_app/installer');
    calls.clear();
    channelResult = null;
    channelException = null;

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      (MethodCall call) async {
        calls.add(call);
        if (channelException != null) {
          throw channelException!;
        }
        return channelResult;
      },
    );
  });

  tearDown(() {
    if (tempDir.existsSync()) {
      tempDir.deleteSync(recursive: true);
    }
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      channel,
      null,
    );
  });

  group('SystemInstallerAdapter', () {
    test('installRelease returns InstallFileNotFound when file does not exist', () async {
      final adapter = SystemInstallerAdapter(channel: channel);
      final nonExistent = File('${tempDir.path}/absent.apk');

      final result = await adapter.installRelease(nonExistent);

      expect(result, isA<InstallFileNotFound>());
      expect((result as InstallFileNotFound).filePath, nonExistent.path);
      expect(calls, isEmpty, reason: 'MethodChannel must not be invoked if file is missing');
    });

    test('installRelease dispatches handoff when channel succeeds', () async {
      final existingFile = File('${tempDir.path}/valid.apk')..writeAsBytesSync([1, 2, 3]);
      channelResult = true;

      final adapter = SystemInstallerAdapter(channel: channel);
      final result = await adapter.installRelease(existingFile);

      expect(result, isA<InstallHandoffDispatched>());
      expect((result as InstallHandoffDispatched).filePath, existingFile.path);
      expect(calls.single.method, 'installApk');
      expect(calls.single.arguments, {'filePath': existingFile.path});
    });

    test('installRelease maps PERMISSION_REQUIRED to InstallPermissionRequired', () async {
      final existingFile = File('${tempDir.path}/valid.apk')..writeAsBytesSync([1, 2, 3]);
      channelException = PlatformException(
        code: 'PERMISSION_REQUIRED',
        message: 'REQUEST_INSTALL_PACKAGES is not granted',
      );

      final adapter = SystemInstallerAdapter(channel: channel);
      final result = await adapter.installRelease(existingFile);

      expect(result, isA<InstallPermissionRequired>());
    });

    test('installRelease maps unknown platform errors to InstallHandoffFailed', () async {
      final existingFile = File('${tempDir.path}/valid.apk')..writeAsBytesSync([1, 2, 3]);
      channelException = PlatformException(
        code: 'INSTALL_ERROR',
        message: 'Activity not found',
      );

      final adapter = SystemInstallerAdapter(channel: channel);
      final result = await adapter.installRelease(existingFile);

      expect(result, isA<InstallHandoffFailed>());
      final failed = result as InstallHandoffFailed;
      expect(failed.errorCode, 'INSTALL_ERROR');
      expect(failed.reason, 'Activity not found');
    });

    test('canRequestPackageInstalls returns platform boolean response', () async {
      final adapter = SystemInstallerAdapter(channel: channel);

      channelResult = true;
      expect(await adapter.canRequestPackageInstalls(), isTrue);

      channelResult = false;
      expect(await adapter.canRequestPackageInstalls(), isFalse);

      channelException = PlatformException(code: 'UNAVAILABLE');
      expect(await adapter.canRequestPackageInstalls(), isFalse);
    });

    test('openInstallPermissionSettings invokes channel method', () async {
      final adapter = SystemInstallerAdapter(channel: channel);
      channelResult = true;

      await adapter.openInstallPermissionSettings();

      expect(calls.single.method, 'openInstallPermissionSettings');
    });
  });
}
