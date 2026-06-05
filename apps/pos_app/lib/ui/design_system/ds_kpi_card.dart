import 'package:flutter/material.dart';

class DsKpiCard extends StatelessWidget {
  const DsKpiCard({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.valueColor,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData? icon;
  final Color? valueColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          border: Border.all(color: const Color(0xFF767777), width: 1),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.0,
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                if (icon != null) Icon(icon, size: 18, color: colorScheme.onSurfaceVariant),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              value,
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w700,
                fontFamily: 'Inter',
                fontFeatures: const [FontFeature.tabularFigures()],
                color: valueColor ?? colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
