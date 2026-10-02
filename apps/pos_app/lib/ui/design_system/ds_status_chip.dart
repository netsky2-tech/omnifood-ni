import 'package:flutter/material.dart';
import 'nhilos_tokens.dart';

enum DsChipTone { neutral, primary, warning, success, danger }

class DsStatusChip extends StatelessWidget {
  const DsStatusChip({
    super.key,
    required this.label,
    this.tone = DsChipTone.neutral,
    this.icon,
  });

  final String label;
  final DsChipTone tone;
  final IconData? icon;

  Color _backgroundFor(BuildContext context) {
    switch (tone) {
      case DsChipTone.primary:
        return NhilosColors.brandTealLight;
      case DsChipTone.warning:
        return NhilosColors.warningLight;
      case DsChipTone.success:
        return NhilosColors.successLight;
      case DsChipTone.danger:
        return NhilosColors.dangerLight;
      case DsChipTone.neutral:
        return NhilosColors.neutralGray;
    }
  }

  Color _foregroundFor(BuildContext context) {
    switch (tone) {
      case DsChipTone.primary:
        return NhilosColors.brandPrimary;
      case DsChipTone.warning:
        return NhilosColors.warning;
      case DsChipTone.success:
        return NhilosColors.success;
      case DsChipTone.danger:
        return NhilosColors.danger;
      case DsChipTone.neutral:
        return NhilosColors.neutralGrayDark;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bg = _backgroundFor(context);
    final fg = _foregroundFor(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: NhilosRadii.chipRadius,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontWeight: FontWeight.w700,
              fontSize: 11,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
