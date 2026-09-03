import 'package:flutter/material.dart';

/// Screen breakpoint constants for NHILOS POS.
/// Sunmi V2s and handheld terminals have a width of ~360-412dp (<= 600dp).
/// Tablets and POS desktop stations have widths > 600dp.
class ResponsiveBreakpoints {
  const ResponsiveBreakpoints._();

  static const double handheldBreakpoint = 600.0;
  static const double tabletBreakpoint = 900.0;
  static const double desktopBreakpoint = 1200.0;

  /// Returns true if the screen width is <= 600dp (e.g. Sunmi V2s, mobile phones, handheld POS).
  static bool isHandheld(BuildContext context) {
    return MediaQuery.sizeOf(context).width <= handheldBreakpoint;
  }

  /// Alias for isHandheld
  static bool isMobile(BuildContext context) => isHandheld(context);

  /// Returns true if the screen width is between 600dp and 900dp.
  static bool isTablet(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    return width > handheldBreakpoint && width <= tabletBreakpoint;
  }

  /// Returns true if the screen width is > 900dp.
  static bool isDesktop(BuildContext context) {
    return MediaQuery.sizeOf(context).width > tabletBreakpoint;
  }

  /// Helper to resolve a responsive value based on screen width.
  static T value<T>(
    BuildContext context, {
    required T mobile,
    T? tablet,
    T? desktop,
  }) {
    final width = MediaQuery.sizeOf(context).width;
    if (width > tabletBreakpoint && desktop != null) {
      return desktop;
    }
    if (width > handheldBreakpoint && tablet != null) {
      return tablet;
    }
    return mobile;
  }
}

/// Adaptive layout builder widget that switches between mobile/handheld and tablet/desktop views.
class ResponsiveLayout extends StatelessWidget {
  final Widget mobile;
  final Widget? tablet;
  final Widget? desktop;

  const ResponsiveLayout({
    super.key,
    required this.mobile,
    this.tablet,
    this.desktop,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth > ResponsiveBreakpoints.tabletBreakpoint) {
          return desktop ?? tablet ?? mobile;
        }
        if (constraints.maxWidth > ResponsiveBreakpoints.handheldBreakpoint) {
          return tablet ?? desktop ?? mobile;
        }
        return mobile;
      },
    );
  }
}
