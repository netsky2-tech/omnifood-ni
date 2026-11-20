import 'package:uuid/uuid.dart';

import '../daos/local_config_dao.dart';
import '../models/local_config_entity.dart';

typedef LocalTerminalIdFactory = String Function();

class TerminalIdentityService {
  TerminalIdentityService(
    this._configDao, {
    LocalTerminalIdFactory? createLocalId,
  }) : _createLocalId = createLocalId ?? _defaultCreateLocalId;

  static const localDeviceIdKey = 'terminal_device_id';

  final LocalConfigDao _configDao;
  final LocalTerminalIdFactory _createLocalId;

  Future<String> resolveDeviceId({String buildTimeDeviceId = ''}) async {
    final provisionedDeviceId = buildTimeDeviceId.trim();
    if (provisionedDeviceId.isNotEmpty) {
      await _configDao.saveConfig(
        LocalConfigEntity(
          key: localDeviceIdKey,
          value: provisionedDeviceId,
          description:
              'Stable offline-safe terminal identity provisioned at build time.',
        ),
      );
      return provisionedDeviceId;
    }

    final existing = await _configDao.getConfigByKey(localDeviceIdKey);
    final existingValue = existing?.value.trim();
    if (existingValue != null && existingValue.isNotEmpty) {
      return existingValue;
    }

    final generated = _createLocalId().trim();
    if (generated.isEmpty) {
      throw StateError('Generated terminal identity must not be empty');
    }

    await _configDao.saveConfig(
      LocalConfigEntity(
        key: localDeviceIdKey,
        value: generated,
        description:
            'Stable offline-safe terminal identity generated on first install.',
      ),
    );
    return generated;
  }

  /// Overwrites `local_configs['terminal_device_id']` with the canonical
  /// [deviceId] restored during terminal reactivation or factory-reset
  /// replacement (issue #566).
  Future<String> persistCanonicalDeviceId(String deviceId) async {
    final normalized = deviceId.trim();
    if (normalized.isEmpty) {
      throw ArgumentError.value(
        deviceId,
        'deviceId',
        'Canonical terminal identity must not be empty',
      );
    }

    await _configDao.saveConfig(
      LocalConfigEntity(
        key: localDeviceIdKey,
        value: normalized,
        description:
            'Canonical terminal identity restored or assigned by backend.',
      ),
    );
    return normalized;
  }

  static String _defaultCreateLocalId() => 'pos-local-${const Uuid().v4()}';
}
