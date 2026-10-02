import 'dart:ui';
import 'package:flutter/material.dart';

/// Design tokens for NHILOS POS matching NHILOS POS Experience Standard v1.0 (§42.1, §42.7)
/// Authoritative reference: docs/nhilos/nhilos_pos_experience_standard_v1.0.md
class NhilosColors {
  NhilosColors._();

  // Primary backgrounds & surfaces (§42.1)
  static const Color background = Color(0xFFF8FAFC); // Slate 50
  static const Color surface = Color(0xFFFFFFFF);
  static const Color neutralGray = Color(0xFFF1F5F9); // Slate 100
  static const Color neutralGrayDark = Color(0xFF475569); // Slate 600

  // Structural borders (§42.1)
  static const Color border = Color(0xFFE2E8F0); // Slate 200
  static const Color borderStrong = Color(0xFFCBD5E1); // Slate 300

  // Typography (§42.1)
  static const Color textPrimary = Color(0xFF0F172A); // Slate 900
  static const Color textSecondary = Color(0xFF64748B); // Slate 500
  static const Color textMuted = Color(0xFF94A3B8); // Slate 400

  // Brand Primary & Actions (§42.1: Deep Teal & Navy)
  static const Color brandPrimary = Color(0xFF1E3A40); // Deep Teal
  static const Color brandNavy = Color(0xFF0F292E); // Navy
  static const Color brandTealLight = Color(0xFFE6EFF0);

  // Status & Semantics (§42.1)
  static const Color success = Color(0xFF059669); // Emerald 600
  static const Color successLight = Color(0xFFECFDF5); // Emerald 50
  static const Color successBorder = Color(0xFF10B981); // Emerald 500

  static const Color danger = Color(0xFFDC2626); // Red 600
  static const Color dangerLight = Color(0xFFFEF2F2); // Red 50
  static const Color dangerBorder = Color(0xFFF87171); // Red 400

  static const Color warning = Color(0xFFD97706); // Amber 600
  static const Color warningLight = Color(0xFFFFFBEB); // Amber 50
  static const Color warningBorder = Color(0xFFFBBF24); // Amber 400
}

/// Standard corner radii (§42.7)
class NhilosRadii {
  NhilosRadii._();

  static const double card = 12.0;
  static const double modal = 12.0;
  static const double button = 8.0;
  static const double chip = 8.0;
  static const double badge = 4.0;

  static const BorderRadius cardRadius = BorderRadius.all(Radius.circular(card));
  static const BorderRadius modalRadius = BorderRadius.all(Radius.circular(modal));
  static const BorderRadius buttonRadius = BorderRadius.all(Radius.circular(button));
  static const BorderRadius chipRadius = BorderRadius.all(Radius.circular(chip));
  static const BorderRadius badgeRadius = BorderRadius.all(Radius.circular(badge));
}

/// Standard Typography helpers (§34.1, §42.7)
class NhilosTextStyles {
  NhilosTextStyles._();

  /// Always apply tabular numbers to financial and quantitative metrics (§34.1)
  static TextStyle tabular({TextStyle? base}) {
    return (base ?? const TextStyle()).copyWith(
      fontFeatures: [
        ...?base?.fontFeatures,
        const FontFeature.tabularFigures(),
      ],
    );
  }

  static const TextStyle tabularBase = TextStyle(
    fontFeatures: [FontFeature.tabularFigures()],
  );
}
