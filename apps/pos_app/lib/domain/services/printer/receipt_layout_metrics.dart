/// Paper width enum for thermal receipt formatting.
enum ReceiptPaperSize {
  mm58,
  mm80,
}

/// Centralized layout metrics for thermal receipt printers.
/// The 80mm Q80 text width is physically verified at 44 columns through the
/// production Nyx `printText` path; raster bounds remain configured limits.
class ReceiptLayoutMetrics {
  /// Central logical/configured estimates, calibrated for hardware printheads.
  static const int logicalTextWidth58mm = 32;
  static const int logicalTextWidth80mm = 44;
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

  /// Column width for quantity in the 80mm table.
  final int qtyWidth;

  /// Column width for description in the 80mm table.
  final int descriptionWidth;

  /// Column width for unit price in the 80mm table.
  final int unitPriceWidth;

  /// Column width for line total in the 80mm table.
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

  /// 80mm calibrated mode: 44 columns and 576-dot configured image bound.
  /// Employs a true 4-column tabular layout: 5 + 18 + 10 + 11 = 44 cols.
  factory ReceiptLayoutMetrics.mm80() => const ReceiptLayoutMetrics(
        paperSize: ReceiptPaperSize.mm80,
        printableWidth: logicalTextWidth80mm,
        horizontalPadding: 0,
        maxImageWidth: logicalRasterWidth80mm,
        maxImageHeight: 160,
        qtyWidth: 5,
        descriptionWidth: 18,
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
