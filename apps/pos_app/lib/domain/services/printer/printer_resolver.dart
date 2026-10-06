import '../../models/config/printer_config.dart';
import '../../ports/printer_port.dart';
import '../../../data/adapters/printer/ipos_printer_adapter.dart';
import '../../../data/adapters/printer/mock_printer_adapter.dart';
import '../../../data/adapters/printer/sunmi_printer_adapter.dart';
import '../../../data/adapters/printer/unavailable_printer_adapter.dart';

/// Factory and resolver for initializing the active [PrinterPort] based on [PrinterConfig].
class PrinterResolver {
  static final MockPrinterAdapter _sharedMock = MockPrinterAdapter();
  static final SunmiPrinterAdapter _sharedSunmi = SunmiPrinterAdapter();
  static final IPosPrinterAdapter _sharedIPos = IPosPrinterAdapter();
  static const UnavailablePrinterAdapter _sharedUnavailable =
      UnavailablePrinterAdapter();

  static PrinterPort resolve(PrinterConfig config) {
    switch (config.driverType) {
      case PrinterDriverType.sunmiV2s:
        return _sharedSunmi;
      case PrinterDriverType.iPosQ80:
        return _sharedIPos;
      case PrinterDriverType.mock:
        return _sharedMock;
      case PrinterDriverType.escPosNetwork:
        // #70 T1: there is no real ESC/POS network adapter in this version.
        // Never route this driver to the mock (it reports false successes);
        // fail honestly instead. The port must not throw: a thrown exception
        // here would take down the hardware screen and the sale path.
        return _sharedUnavailable;
    }
  }

  static MockPrinterAdapter get sharedMock => _sharedMock;
  static SunmiPrinterAdapter get sharedSunmi => _sharedSunmi;
  static IPosPrinterAdapter get sharedIPos => _sharedIPos;
  static UnavailablePrinterAdapter get sharedUnavailable => _sharedUnavailable;
}
