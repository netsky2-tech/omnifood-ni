import 'package:flutter/material.dart';

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
    final colorScheme = Theme.of(context).colorScheme;
    switch (tone) {
      case DsChipTone.primary:
        return colorScheme.primary;
      case DsChipTone.warning:
        return const Color(0xFF866249);
      case DsChipTone.success:
        return const Color(0xFF41646A);
      case DsChipTone.danger:
        return colorScheme.errorContainer;
      case DsChipTone.neutral:
        return const Color(0xFFE3E2E2);
    }
  }

  Color _foregroundFor(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    switch (tone) {
      case DsChipTone.primary:
      case DsChipTone.warning:
      case DsChipTone.success:
        return Colors.white;
      case DsChipTone.danger:
        return colorScheme.onErrorContainer;
      case DsChipTone.neutral:
        return colorScheme.onSurface;
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
        borderRadius: BorderRadius.circular(4),
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
