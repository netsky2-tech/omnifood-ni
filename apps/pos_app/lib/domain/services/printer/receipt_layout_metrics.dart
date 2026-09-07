/// Paper width enum for thermal receipt formatting.
enum ReceiptPaperSize {
  mm58,
  mm80,
}

/// Centralized logical layout estimates for thermal receipt printers.
/// 32/48 columns and 384/576 dots require physical-device calibration; they are
/// configured limits, not proven hardware limits for Q80, MIRAY, or Sunmi.
class ReceiptLayoutMetrics {
  /// Central logical/configured estimates, not asserted printer-head facts.
  static const int logicalTextWidth58mm = 32;
  static const int logicalTextWidth80mm = 48;
  static const int logicalRasterWidth58mm = 384;
  static const int logicalRasterWidth80mm = 576;

  final ReceiptPaperSize paperSize;

  /// Printable width in monospaced character columns.
  final int printableWidth;

  /// Horizontal padding in characters on left and right (0 to maximize printable area).
  final int horizontalPadding;

  /// Maximum raster image width in pixels.
  final int maxImageWidth;

  /// Maximum raster image height in pixels.
  final int maxImageHeight;

  /// Column width for quantity in 80mm table (approx 8.3% of 48 columns).
  final int qtyWidth;

  /// Column width for description in 80mm table (approx 47.9% of 48 columns, flexible).
  final int descriptionWidth;

  /// Column width for unit price in 80mm table (approx 20.8% of 48 columns).
  final int unitPriceWidth;

  /// Column width for line total in 80mm table (approx 22.9% of 48 columns).
  final int totalWidth;

  const ReceiptLayoutMetrics({
    required this.paperSize,
    required this.printableWidth,
    this.horizontalPadding = 0,
    required this.maxImageWidth,
    this.maxImageHeight = 160,
    this.qtyWidth = 5,
    this.descriptionWidth = 22,
    this.unitPriceWidth = 10,
    this.totalWidth = 11,
  });

  /// 58mm logical estimate: 32 columns and 384-dot configured image bound.
  /// Employs 2-tier vertical item composition rather than a cramped table.
  factory ReceiptLayoutMetrics.mm58() => const ReceiptLayoutMetrics(
        paperSize: ReceiptPaperSize.mm58,
        printableWidth: logicalTextWidth58mm,
        horizontalPadding: 0,
        maxImageWidth: logicalRasterWidth58mm,
        maxImageHeight: 160,
        qtyWidth: 4,
        descriptionWidth: 32,
        unitPriceWidth: 10,
        totalWidth: 11,
      );

  /// 80mm logical estimate: 48 columns and 576-dot configured image bound.
  /// Employs a true 4-column tabular layout: 5 + 22 + 10 + 11 = 48 cols.
  factory ReceiptLayoutMetrics.mm80() => const ReceiptLayoutMetrics(
        paperSize: ReceiptPaperSize.mm80,
        printableWidth: logicalTextWidth80mm,
        horizontalPadding: 0,
        maxImageWidth: logicalRasterWidth80mm,
        maxImageHeight: 160,
        qtyWidth: 5,
        descriptionWidth: 22,
        unitPriceWidth: 10,
        totalWidth: 11,
      );

  /// Resolves metrics based on configured paper width in millimeters.
  factory ReceiptLayoutMetrics.fromPaperWidth(int paperWidthMm) {
    if (paperWidthMm >= 80) {
      return ReceiptLayoutMetrics.mm80();
    }
    return ReceiptLayoutMetrics.mm58();
  }

  /// Usable content width in characters.
  int get contentWidth => printableWidth - (horizontalPadding * 2);

  bool get is58mm => paperSize == ReceiptPaperSize.mm58;
  bool get is80mm => paperSize == ReceiptPaperSize.mm80;

  // ==========================================
  // Vertical Spacing Scale
  // ==========================================

  /// Minimal or zero extra spacing between closely tied lines.
  String smallGap() => '';

  /// Single newline between standard content lines.
  String lineGap() => '\n';

  /// Clear separation between major sections.
  String sectionGap() => '\n';

  /// Cut feed spacing before tear bar or paper cutter.
  String footerGap() => '\n\n\n';

  // ==========================================
  // Full-Width Dynamic Dividers
  // ==========================================

  /// Generates a continuous horizontal rule line spanning the exact content width.
  String divider([String char = '-']) => char * contentWidth;

  /// Double-line rule (=) for major document boundaries.
  String doubleDivider() => divider('=');

  /// Dotted line rule (.) for subtle separations.
  String dottedDivider() => divider('.');

  /// Centered section header enclosed with filler characters spanning full width.
  /// Example (32 cols): `------- DETALLE DE PAGO --------`
  String sectionHeader(String title, [String char = '-']) {
    final trimmed = ' $title ';
    if (trimmed.length >= contentWidth) {
      return title.length > contentWidth ? title.substring(0, contentWidth) : title;
    }
    final fillerTotal = contentWidth - trimmed.length;
    final leftFiller = fillerTotal ~/ 2;
    final rightFiller = fillerTotal - leftFiller;
    return '${char * leftFiller}$trimmed${char * rightFiller}';
  }
}
