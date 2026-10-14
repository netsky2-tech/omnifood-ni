import 'dart:math' as math;

/// Layout math for the sales catalog grid.
///
/// The catalog photo is stored square at [storedPhotoPx] by the backoffice
/// pipeline (`product-image-field.tsx` center-crops to 1:1 and resizes to
/// 300x300 WebP), so the column count cannot come from a fixed "max cell
/// extent" alone: a cell that is comfortable on an 8" terminal upscales the
/// stored photo on a high-density phone. The target card width is therefore
/// derived from the photo budget — `300 px / devicePixelRatio` — bounded by a
/// comfortable tile size, and the column count follows from it exactly like
/// `SliverGridDelegateWithMaxCrossAxisExtent` would.
///
/// Verified device bands (measured from field captures):
///
/// | Device          | Width dp | DPR     | Columns | Card    | Photo  | Upscale |
/// |-----------------|----------|---------|---------|---------|--------|---------|
/// | Sunmi V2s       | 320      | 1.5     | 2       | 138 dp  | 138 dp | 0.69x   |
/// | Samsung S23     | 384      | 2.8125  | 3       | 108 dp  | 108 dp | 1.01x   |
/// | MIRAY Q80       | 533.33   | 1.5     | 3       | 157.8 dp| 157.8  | 0.79x   |
/// | Tablet / desktop| >600     | 1.0     | 4+      | 175 dp+ | 175 dp | 0.58x   |
class ProductGridGeometry {
  const ProductGridGeometry({
    required this.viewportWidth,
    required this.devicePixelRatio,
  });

  /// Width available to the grid (the parent's constraint, not the screen).
  final double viewportWidth;

  /// Physical pixels per logical pixel. The stored 1:1 photo has a fixed pixel
  /// budget, so how big it may be rendered depends on this.
  final double devicePixelRatio;

  /// Terminals at or below this width are handheld: tighter padding and
  /// spacing, hand-tuned column counts.
  static const double handheldBreakpoint = 600;

  /// Flutter's `Card` default margin keeps 4 dp on each side of the cell.
  static const double cardMargin = 4;

  /// §46: every control needs a 48 dp touch target.
  static const double minTouchTarget = 48;

  /// Below this card width the footer uses the compact type scale.
  static const double compactCardWidth = 130;

  /// Two name lines plus the price, at the compact type scale.
  static const double compactFooterHeight = 64;

  /// Two name lines plus the price, at the regular type scale.
  static const double regularFooterHeight = 70;

  /// Largest tolerated upscale of the stored 1:1 photo.
  static const double maxPhotoUpscale = 1.15;

  /// Resolution the backoffice pipeline stores for every catalog photo.
  static const double storedPhotoPx = 300;

  /// Narrowest tile the compact type scale can still serve.
  static const double minReadableCardWidth = 96;

  /// Widest tile that still reads as a catalog tile instead of a banner.
  static const double maxCardWidth = 180;

  double get horizontalPadding =>
      viewportWidth <= handheldBreakpoint ? 10 : 16;

  double get crossAxisSpacing => viewportWidth <= handheldBreakpoint ? 8 : 12;

  double get mainAxisSpacing => crossAxisSpacing;

  /// Card width the photo budget allows: as wide as [maxCardWidth], as narrow
  /// as [minReadableCardWidth], and never past what the stored photo can
  /// render crisply on this device.
  double get targetCardWidth {
    final crisp = storedPhotoPx * maxPhotoUpscale / devicePixelRatio;
    return crisp.clamp(minReadableCardWidth, maxCardWidth).toDouble();
  }

  /// Maximum cell extent handed to the column-count formula.
  double get maxCrossAxisExtent => targetCardWidth + cardMargin * 2;

  /// Column count for this viewport, never below two (§15: a one-column
  /// catalog forces scrolling through the whole menu).
  int get columns {
    final available = viewportWidth - horizontalPadding * 2;
    return math.max(
      2,
      (available / (maxCrossAxisExtent + crossAxisSpacing)).ceil(),
    );
  }

  /// Width of one grid cell, including the `Card` margin on both sides.
  double get cellWidth =>
      (viewportWidth -
          horizontalPadding * 2 -
          crossAxisSpacing * (columns - 1)) /
      columns;

  /// Width of the visible card: the cell minus Flutter's default card margin.
  /// It is also the width of the 1:1 photo, which spans the full card.
  double get cardWidth => cellWidth - cardMargin * 2;

  bool get isCompact => cardWidth < compactCardWidth;

  /// Footer band under the photo, for this viewport.
  double get footerHeight => footerHeightForCard(cardWidth);

  /// Cell aspect ratio that makes the card exactly `photo (1:1) + footer`,
  /// leaving no dead space inside it.
  double get childAspectRatio =>
      cellWidth / (cardWidth + footerHeight + cardMargin * 2);

  /// How many times the stored 1:1 photo is scaled up to fill this card.
  double get imageUpscale => cardWidth * devicePixelRatio / storedPhotoPx;

  /// Footer height for a card that already knows its own rendered width (the
  /// card itself, from inside a `LayoutBuilder`).
  static double footerHeightForCard(double cardWidth) =>
      cardWidth < compactCardWidth ? compactFooterHeight : regularFooterHeight;
}
