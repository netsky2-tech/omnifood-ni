import 'dart:async';
import '../../../data/daos/local_config_dao.dart';
import '../../../data/models/local_config_entity.dart';
import '../../models/config/printer_config.dart';

/// Service for managing local hardware printer configuration and preferences.
/// Persisted offline-first in SQLite table [local_configs].
class PrinterConfigService {
  PrinterConfigService(this._configDao);

  static const String driverTypeKey = 'printer_driver_type';
  static const String autoPrintInvoiceKey = 'printer_auto_invoice';
  static const String autoPrintKitchenKey = 'printer_auto_kitchen';
  static const String openDrawerOnCashKey = 'printer_open_drawer_cash';
  static const String paperWidthMmKey = 'printer_paper_width_mm';
  static const String networkIpKey = 'printer_network_ip';
  static const String networkPortKey = 'printer_network_port';
  static const String copiesKey = 'printer_copies';
  static const String headerBusinessNameKey = 'printer_header_business_name';
  static const String headerRucKey = 'printer_header_ruc';

  /// Locally persisted issuer RUC key (`FiscalProjectionKeys.ruc`).
  ///
  /// Written by the DGI fiscal projection (`fiscal_inbox_handler.dart`) and,
  /// by explicit product decision, also by the operator from the POS business
  /// profile. The local value therefore wins over the projection until the next
  /// fiscal resync restores it — that override is intentional (offline-first).
  static const String fiscalRucKey = 'ruc';

  /// D-17 (P0): fiscal authorization number. Written by the operator from
  /// the POS business profile (like [fiscalRucKey]); read into
  /// [PrinterConfig.dgiAuthorizationCode] and printed at the bottom-right of
  /// the invoice (DT 09-2007 QUINTO).
  ///
  /// D-21 consolidation (#551): the legacy backing pair
  /// (`dgi_authorization_date` / `dgi_authorization_document`) was removed
  /// from the model and this service. Rows persisted by older builds stay in
  /// `local_configs` and are simply ignored on read — no destructive
  /// migration, and nothing resurrects them.
  static const String dgiAuthorizationCodeKey = 'dgi_authorization_code';
  static const String headerAddressKey = 'printer_header_address';
  static const String headerPhoneKey = 'printer_header_phone';
  static const String logoBase64Key = 'printer_logo_base64';
  static const String logoWidthKey = 'printer_logo_width';
  static const String logoHeightKey = 'printer_logo_height';
  static const String isLogoEnabledKey = 'printer_logo_enabled';

  final LocalConfigDao _configDao;
  final StreamController<PrinterConfig> _configStreamController =
      StreamController<PrinterConfig>.broadcast();

  Stream<PrinterConfig> get onConfigChanged => _configStreamController.stream;

  /// Whether the operator has deliberately configured a printer profile.
  ///
  /// True only when BOTH [driverTypeKey] and [paperWidthMmKey] exist with
  /// non-blank values in `local_configs`. Read-only: it never writes, and it
  /// never materialises the fabricated defaults that [getPrinterConfig]
  /// reports for a fresh terminal (L1-08a).
  Future<bool> isPrinterProfileConfigured() async {
    final driverEntity = await _configDao.getConfigByKey(driverTypeKey);
    final paperWidthEntity = await _configDao.getConfigByKey(paperWidthMmKey);
    final driverConfigured =
        driverEntity != null && driverEntity.value.trim().isNotEmpty;
    final paperWidthConfigured =
        paperWidthEntity != null && paperWidthEntity.value.trim().isNotEmpty;
    return driverConfigured && paperWidthConfigured;
  }

  /// Deliberately confirms the printer profile chosen by the operator.
  ///
  /// This is the ONLY path that materialises a printer profile on a fresh
  /// terminal: it writes exactly [driverTypeKey] and [paperWidthMmKey] and
  /// nothing else (L1-08b). Everything else goes through [savePrinterConfig],
  /// which preserves an absent profile.
  Future<void> confirmPrinterProfile({
    required PrinterDriverType driverType,
    required int paperWidthMm,
  }) async {
    await _configDao.saveConfig(LocalConfigEntity(
      key: driverTypeKey,
      value: _driverCode(driverType),
      description: 'Tipo de controlador de impresora',
    ));
    await _configDao.saveConfig(LocalConfigEntity(
      key: paperWidthMmKey,
      value: paperWidthMm.toString(),
      description: 'Paper width in mm (58 or 80)',
    ));
  }

  Future<PrinterConfig> getPrinterConfig() async {
    final driverEntity = await _configDao.getConfigByKey(driverTypeKey);
    final autoInvoiceEntity = await _configDao.getConfigByKey(autoPrintInvoiceKey);
    final autoKitchenEntity = await _configDao.getConfigByKey(autoPrintKitchenKey);
    final openDrawerEntity = await _configDao.getConfigByKey(openDrawerOnCashKey);
    final paperWidthEntity = await _configDao.getConfigByKey(paperWidthMmKey);
    final networkIpEntity = await _configDao.getConfigByKey(networkIpKey);
    final networkPortEntity = await _configDao.getConfigByKey(networkPortKey);
    final copiesEntity = await _configDao.getConfigByKey(copiesKey);
    final bizNameEntity = await _configDao.getConfigByKey(headerBusinessNameKey) ??
        await _configDao.getConfigByKey('business_name');
    final rucEntity = await _configDao.getConfigByKey(headerRucKey);
    final fiscalRucEntity = await _configDao.getConfigByKey(fiscalRucKey);
    final addressEntity = await _configDao.getConfigByKey(headerAddressKey) ??
        await _configDao.getConfigByKey('address');
    final phoneEntity = await _configDao.getConfigByKey(headerPhoneKey) ??
        await _configDao.getConfigByKey('phone');
    final logoBase64Entity = await _configDao.getConfigByKey(logoBase64Key);
    final logoWidthEntity = await _configDao.getConfigByKey(logoWidthKey);
    final logoHeightEntity = await _configDao.getConfigByKey(logoHeightKey);
    final isLogoEnabledEntity = await _configDao.getConfigByKey(isLogoEnabledKey);

    PrinterDriverType driverType = PrinterDriverType.sunmiV2s;
    if (driverEntity != null) {
      if (driverEntity.value == 'MOCK') {
        driverType = PrinterDriverType.mock;
      } else if (driverEntity.value == 'ESCPOS_NETWORK') {
        driverType = PrinterDriverType.escPosNetwork;
      } else if (driverEntity.value == 'IPOS_Q80') {
        driverType = PrinterDriverType.iPosQ80;
      } else {
        driverType = PrinterDriverType.sunmiV2s;
      }
    }

    final autoInvoice = autoInvoiceEntity == null
        ? true
        : autoInvoiceEntity.value.trim().toLowerCase() == 'true';
    final autoKitchen = autoKitchenEntity == null
        ? false
        : autoKitchenEntity.value.trim().toLowerCase() == 'true';
    final openDrawer = openDrawerEntity == null
        ? true
        : openDrawerEntity.value.trim().toLowerCase() == 'true';
    final paperWidth = int.tryParse(paperWidthEntity?.value ?? '') ?? 58;
    final networkPort = int.tryParse(networkPortEntity?.value ?? '') ?? 9100;
    final copies = int.tryParse(copiesEntity?.value ?? '') ?? 1;
    final logoWidth = int.tryParse(logoWidthEntity?.value ?? '');
    final logoHeight = int.tryParse(logoHeightEntity?.value ?? '');
    final isLogoEnabled = isLogoEnabledEntity?.value.trim().toLowerCase() == 'true';
    final taxRegimeEntity = await _configDao.getConfigByKey('tax_regime');
    final authCodeEntity =
        await _configDao.getConfigByKey(dgiAuthorizationCodeKey);

    return PrinterConfig(
      driverType: driverType,
      autoPrintInvoice: autoInvoice,
      autoPrintKitchen: autoKitchen,
      openDrawerOnCash: openDrawer,
      paperWidthMm: paperWidth,
      networkIp: networkIpEntity?.value,
      networkPort: networkPort,
      copies: copies,
      headerBusinessName: bizNameEntity?.value ?? 'OMNIFOOD NI',
      headerRuc: rucEntity?.value,
      fiscalRuc: fiscalRucEntity?.value,
      headerAddress: addressEntity?.value,
      headerPhone: phoneEntity?.value,
      taxRegime: taxRegimeEntity?.value,
      dgiAuthorizationCode: authCodeEntity?.value,
      logoBase64: logoBase64Entity?.value,
      logoWidth: logoWidth,
      logoHeight: logoHeight,
      isLogoEnabled: isLogoEnabled,
    );
  }

  /// Persists the printer configuration.
  ///
  /// Profile rule (L1-08b): the driver key and the paper-width key are only
  /// written when they ALREADY exist with non-blank values in `local_configs`
  /// (same criterion as [isPrinterProfileConfigured]). An unconfigured terminal
  /// therefore keeps its unconfigured state through unrelated saves (auto-print
  /// toggles, logo uploads, ...) instead of materialising the fabricated
  /// defaults; a configured device still persists profile edits. Only
  /// [confirmPrinterProfile] materialises a profile.
  Future<void> savePrinterConfig(PrinterConfig config) async {
    final existingDriverEntity = await _configDao.getConfigByKey(driverTypeKey);
    final existingPaperWidthEntity =
        await _configDao.getConfigByKey(paperWidthMmKey);
    final driverConfigured = existingDriverEntity != null &&
        existingDriverEntity.value.trim().isNotEmpty;
    final paperWidthConfigured = existingPaperWidthEntity != null &&
        existingPaperWidthEntity.value.trim().isNotEmpty;

    if (driverConfigured) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: driverTypeKey,
        value: _driverCode(config.driverType),
        description: 'Tipo de controlador de impresora',
      ));
    }
    await _configDao.saveConfig(LocalConfigEntity(
      key: autoPrintInvoiceKey,
      value: config.autoPrintInvoice.toString(),
      description: 'Auto-print customer invoice on sale checkout',
    ));
    await _configDao.saveConfig(LocalConfigEntity(
      key: autoPrintKitchenKey,
      value: config.autoPrintKitchen.toString(),
      description: 'Auto-print kitchen order ticket',
    ));
    await _configDao.saveConfig(LocalConfigEntity(
      key: openDrawerOnCashKey,
      value: config.openDrawerOnCash.toString(),
      description: 'Kick cash drawer on cash payments',
    ));
    if (paperWidthConfigured) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: paperWidthMmKey,
        value: config.paperWidthMm.toString(),
        description: 'Paper width in mm (58 or 80)',
      ));
    }

    if (config.networkIp != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: networkIpKey,
        value: config.networkIp!,
        description: 'Network printer IP address',
      ));
    }
    await _configDao.saveConfig(LocalConfigEntity(
      key: networkPortKey,
      value: config.networkPort.toString(),
      description: 'Network printer port',
    ));
    await _configDao.saveConfig(LocalConfigEntity(
      key: copiesKey,
      value: config.copies.toString(),
      description: 'Default invoice print copies',
    ));

    await _configDao.saveConfig(LocalConfigEntity(
      key: headerBusinessNameKey,
      value: config.headerBusinessName,
      description: 'Header business name for printed tickets',
    ));
    if (config.headerRuc != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: headerRucKey,
        value: config.headerRuc!,
        description: 'RUC for printed tickets',
      ));
    }
    if (config.headerAddress != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: headerAddressKey,
        value: config.headerAddress!,
        description: 'Address for printed tickets',
      ));
    }
    if (config.headerPhone != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: headerPhoneKey,
        value: config.headerPhone!,
        description: 'Phone for printed tickets',
      ));
    }

    // D-21 (#551): the fiscal authorization keys are business-profile data,
    // exactly like the projected `ruc` key ([fiscalRucKey]): they are written
    // by the business profile and the DGI projection, never by printer saves.
    // A printer save carrying them would round-trip printer config into
    // fiscal identity (the contamination [savePrinterConfig] exists to
    // prevent). The legacy D-17 backing pair is gone from the model, so a
    // save can never resurrect it.

    if (config.logoBase64 != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: logoBase64Key,
        value: config.logoBase64!,
        description: 'Monochrome 1-bit logo raster bytes (Base64)',
      ));
    }
    if (config.logoWidth != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: logoWidthKey,
        value: config.logoWidth.toString(),
        description: 'Logo width in pixels',
      ));
    }
    if (config.logoHeight != null) {
      await _configDao.saveConfig(LocalConfigEntity(
        key: logoHeightKey,
        value: config.logoHeight.toString(),
        description: 'Logo height in pixels',
      ));
    }
    await _configDao.saveConfig(LocalConfigEntity(
      key: isLogoEnabledKey,
      value: config.isLogoEnabled.toString(),
      description: 'Whether company logo is printed on receipt header',
    ));

    _configStreamController.add(config);
  }

  String _driverCode(PrinterDriverType driverType) {
    switch (driverType) {
      case PrinterDriverType.mock:
        return 'MOCK';
      case PrinterDriverType.escPosNetwork:
        return 'ESCPOS_NETWORK';
      case PrinterDriverType.sunmiV2s:
        return 'SUNMI_V2S';
      case PrinterDriverType.iPosQ80:
        return 'IPOS_Q80';
    }
  }

  void dispose() {
    _configStreamController.close();
  }
}
