import '../../models/config/printer_config.dart';
import '../../ports/printer_port.dart';
import '../../../data/adapters/printer/ipos_printer_adapter.dart';
import '../../../data/adapters/printer/mock_printer_adapter.dart';
import '../../../data/adapters/printer/sunmi_printer_adapter.dart';

/// Factory and resolver for initializing the active [PrinterPort] based on [PrinterConfig].
class PrinterResolver {
  static final MockPrinterAdapter _sharedMock = MockPrinterAdapter();
  static final SunmiPrinterAdapter _sharedSunmi = SunmiPrinterAdapter();
  static final IPosPrinterAdapter _sharedIPos = IPosPrinterAdapter();

  static PrinterPort resolve(PrinterConfig config) {
    switch (config.driverType) {
      case PrinterDriverType.sunmiV2s:
        return _sharedSunmi;
      case PrinterDriverType.iPosQ80:
        return _sharedIPos;
      case PrinterDriverType.mock:
      case PrinterDriverType.escPosNetwork:
        return _sharedMock;
    }
  }

  static MockPrinterAdapter get sharedMock => _sharedMock;
  static SunmiPrinterAdapter get sharedSunmi => _sharedSunmi;
  static IPosPrinterAdapter get sharedIPos => _sharedIPos;
}
