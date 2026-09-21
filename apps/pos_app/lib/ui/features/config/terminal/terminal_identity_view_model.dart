import 'package:flutter/foundation.dart';

import '../../../../data/daos/local_config_dao.dart';
import '../../../../data/services/terminal_identity_service.dart';
import '../../../../domain/models/config/printer_config.dart';
import '../../../../domain/services/config/printer_config_service.dart';

/// Read-only view model that exposes the terminal's canonical identity so an
/// operator can register the same id in the owner dashboard.
///
/// HARD REQUIREMENT: this surface must never mutate state. It reads the
/// persisted identity via [LocalConfigDao.getConfigByKey] using
/// [TerminalIdentityService.localDeviceIdKey] and deliberately does NOT call
/// `TerminalIdentityService.resolveDeviceId()`, which persists a newly
/// generated `pos-local-<uuid>` when no build-time id is present.
class TerminalIdentityViewModel extends ChangeNotifier {
  TerminalIdentityViewModel({
    required LocalConfigDao configDao,
    required PrinterConfigService printerConfigService,
    String buildTimeDeviceId = const String.fromEnvironment('DEVICE_ID'),
  })  : _configDao = configDao,
        _printerConfigService = printerConfigService,
        _buildTimeDeviceId = buildTimeDeviceId.trim() {
    load();
  }

  final LocalConfigDao _configDao;
  final PrinterConfigService _printerConfigService;
  final String _buildTimeDeviceId;

  String? _terminalId;

  /// Factual comparison result; never a provenance claim. See
  /// [matchesBuildTimeId] for the exact contract.
  bool? _matchesBuildTimeId;
  String? _printerDriverLabel;
  int? _paperWidthMm;
  bool _isLoading = false;
  String? _errorMessage;

  /// Canonical terminal id persisted on this device, or `null` when the
  /// terminal has no identity yet.
  /// Canonical terminal id persisted on this device, or `null` when the
  /// terminal has no identity yet.
  String? get terminalId => _terminalId;

  /// Build-time device id compiled into this build. May be empty when the
  /// app was built without a `DEVICE_ID` dart-define.
  String get buildTimeId => _buildTimeDeviceId;

  /// Whether the persisted identity equals the compiled build-time id.
  ///
  /// IMPORTANT: this is a plain string comparison, NOT provenance. The origin
  /// of the persisted value is never stored, so it cannot be recovered here:
  /// this flag can only state that the two strings are equal. `null` means no
  /// identity is persisted yet; `false` covers both a differing value and a
  /// build without a compiled id.
  bool? get matchesBuildTimeId => _matchesBuildTimeId;

  /// Label of the active printer driver, matching the hardware screen.
  String? get printerDriverLabel => _printerDriverLabel;

  /// Configured thermal paper width in millimetres.
  int? get paperWidthMm => _paperWidthMm;

  bool get isLoading => _isLoading;

  String? get errorMessage => _errorMessage;

  /// Loads the persisted identity and the printer profile without writing.
  Future<void> load() async {
    _isLoading = true;
    notifyListeners();

    try {
      // Read-only: only getConfigByKey is ever called on the DAO here.
      final entity = await _configDao
          .getConfigByKey(TerminalIdentityService.localDeviceIdKey);
      final persistedValue = entity?.value.trim();

      if (persistedValue == null || persistedValue.isEmpty) {
        _terminalId = null;
        _matchesBuildTimeId = null;
      } else {
        _terminalId = persistedValue;
        // Factual comparison only: never claim when or where the identity
        // was generated.
        _matchesBuildTimeId = _buildTimeDeviceId == persistedValue;
      }

      final printerConfig = await _printerConfigService.getPrinterConfig();
      _printerDriverLabel = driverLabelFor(printerConfig.driverType);
      _paperWidthMm = printerConfig.paperWidthMm;
    } catch (e) {
      _errorMessage = 'Error al cargar la identidad de la terminal: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Maps a [PrinterDriverType] to the same label shown on the hardware
  /// settings screen. Read-only mapping; no hardware defaults are changed.
  static String driverLabelFor(PrinterDriverType driverType) {
    switch (driverType) {
      case PrinterDriverType.sunmiV2s:
        return 'Sunmi V2s';
      case PrinterDriverType.mock:
        return 'Simulador';
      case PrinterDriverType.escPosNetwork:
        return 'Red TCP/IP';
      case PrinterDriverType.iPosQ80:
        return 'Q80 / iPos';
    }
  }
}
