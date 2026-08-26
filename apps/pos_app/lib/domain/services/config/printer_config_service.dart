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
  static const String headerAddressKey = 'printer_header_address';
  static const String headerPhoneKey = 'printer_header_phone';

  final LocalConfigDao _configDao;
  final StreamController<PrinterConfig> _configStreamController =
      StreamController<PrinterConfig>.broadcast();

  Stream<PrinterConfig> get onConfigChanged => _configStreamController.stream;

  Future<PrinterConfig> getPrinterConfig() async {
    final driverEntity = await _configDao.getConfigByKey(driverTypeKey);
    final autoInvoiceEntity = await _configDao.getConfigByKey(autoPrintInvoiceKey);
    final autoKitchenEntity = await _configDao.getConfigByKey(autoPrintKitchenKey);
    final openDrawerEntity = await _configDao.getConfigByKey(openDrawerOnCashKey);
    final paperWidthEntity = await _configDao.getConfigByKey(paperWidthMmKey);
    final networkIpEntity = await _configDao.getConfigByKey(networkIpKey);
    final networkPortEntity = await _configDao.getConfigByKey(networkPortKey);
    final copiesEntity = await _configDao.getConfigByKey(copiesKey);
    final bizNameEntity = await _configDao.getConfigByKey(headerBusinessNameKey);
    final rucEntity = await _configDao.getConfigByKey(headerRucKey);
    final addressEntity = await _configDao.getConfigByKey(headerAddressKey);
    final phoneEntity = await _configDao.getConfigByKey(headerPhoneKey);

    PrinterDriverType driverType = PrinterDriverType.sunmiV2s;
    if (driverEntity != null) {
      if (driverEntity.value == 'MOCK') {
        driverType = PrinterDriverType.mock;
      } else if (driverEntity.value == 'ESCPOS_NETWORK') {
        driverType = PrinterDriverType.escPosNetwork;
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
      headerAddress: addressEntity?.value,
      headerPhone: phoneEntity?.value,
    );
  }

  Future<void> savePrinterConfig(PrinterConfig config) async {
    String driverCode = 'SUNMI_V2S';
    switch (config.driverType) {
      case PrinterDriverType.mock:
        driverCode = 'MOCK';
        break;
      case PrinterDriverType.escPosNetwork:
        driverCode = 'ESCPOS_NETWORK';
        break;
      case PrinterDriverType.sunmiV2s:
        driverCode = 'SUNMI_V2S';
        break;
    }

    await _configDao.saveConfig(LocalConfigEntity(
      key: driverTypeKey,
      value: driverCode,
      description: 'Printer driver type',
    ));
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
    await _configDao.saveConfig(LocalConfigEntity(
      key: paperWidthMmKey,
      value: config.paperWidthMm.toString(),
      description: 'Paper width in mm (58 or 80)',
    ));

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

    _configStreamController.add(config);
  }

  void dispose() {
    _configStreamController.close();
  }
}
