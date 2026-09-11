/// Paper width enum for thermal receipt formatting.
enum ReceiptPaperSize { mm58, mm80 }

/// Centralized layout metrics for thermal receipt printers.
/// Text columns are logical layout metrics. Device-specific dots, fonts, and
/// physical padding belong to printer adapters.
class ReceiptLayoutMetrics {
  /// Central logical column counts calibrated for each target renderer.
  static const int logicalTextWidth58mm = 32;
  static const int logicalTextWidth80mm = 40;
  static const int logicalRasterWidth58mm = 384;
  static const int logicalRasterWidth80mm = 576;

  final ReceiptPaperSize paperSize;

  /// Usable content width in monospaced character columns.
  final int contentColumns;

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

  /// Number of 1-char gutter columns between item-table columns.
  /// For 80mm: 3 gutters between CANT|DESCRIPCION|P.UNIT|TOTAL.
  final int columnGutters;

  const ReceiptLayoutMetrics({
    required this.paperSize,
    required this.contentColumns,
    required this.maxImageWidth,
    this.maxImageHeight = 160,
    this.qtyWidth = 5,
    this.descriptionWidth = 22,
    this.unitPriceWidth = 10,
    this.totalWidth = 11,
    this.columnGutters = 0,
  });

  /// 58mm logical estimate: 32 columns and 384-dot configured image bound.
  /// Employs 2-tier vertical item composition rather than a cramped table.
  factory ReceiptLayoutMetrics.mm58() => const ReceiptLayoutMetrics(
    paperSize: ReceiptPaperSize.mm58,
    contentColumns: logicalTextWidth58mm,
    maxImageWidth: logicalRasterWidth58mm,
    maxImageHeight: 160,
    qtyWidth: 4,
    descriptionWidth: 32,
    unitPriceWidth: 10,
    totalWidth: 11,
    columnGutters: 0,
  );

  /// 80mm Nyx TLMono mode: 40 logical columns. Physical centering is handled
  /// by the Nyx adapter rather than by adding spaces to formatted lines.
  /// Master grid with inter-column gutters:
  ///   CANT(4) + gutter(1) + DESCRIPCION(14) + gutter(1) + P.UNIT(8) + gutter(1) + TOTAL(11) = 40
  factory ReceiptLayoutMetrics.mm80() => const ReceiptLayoutMetrics(
    paperSize: ReceiptPaperSize.mm80,
    contentColumns: logicalTextWidth80mm,
    maxImageWidth: logicalRasterWidth80mm,
    maxImageHeight: 160,
    qtyWidth: 4,
    descriptionWidth: 14,
    unitPriceWidth: 8,
    totalWidth: 11,
    columnGutters: 3,
  );

  /// Resolves metrics based on configured paper width in millimeters.
  factory ReceiptLayoutMetrics.fromPaperWidth(int paperWidthMm) {
    if (paperWidthMm >= 80) {
      return ReceiptLayoutMetrics.mm80();
    }
    return ReceiptLayoutMetrics.mm58();
  }

  int get contentWidth => contentColumns;

  bool get is58mm => paperSize == ReceiptPaperSize.mm58;
  bool get is80mm => paperSize == ReceiptPaperSize.mm80;

  // ==========================================
  // 80mm Amount Column Geometry
  // ==========================================

  /// Position (0-indexed) where the TOTAL/amount column begins in 80mm mode.
  /// For the master grid: 4 (CANT) + 1 (gutter) + 17 (DESCRIPCION) + 1 (gutter) + 8 (P.UNIT) + 1 (gutter) = 32.
  /// [columnGutters] is the count of 1-char gutter columns between the 4 data columns.
  int get amountColumnStart =>
      qtyWidth + descriptionWidth + unitPriceWidth + columnGutters;

  /// Position one past the last character of the TOTAL column in 80mm mode.
  /// Equals contentWidth (40).
  int get amountRightEdge => amountColumnStart + totalWidth;

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
      return title.length > contentWidth
          ? title.substring(0, contentWidth)
          : title;
    }
    final fillerTotal = contentWidth - trimmed.length;
    final leftFiller = fillerTotal ~/ 2;
    final rightFiller = fillerTotal - leftFiller;
    return '${char * leftFiller}$trimmed${char * rightFiller}';
  }
}
