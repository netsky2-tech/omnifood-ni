import 'package:flutter/material.dart';

class DsSecondaryButton extends StatelessWidget {
  const DsSecondaryButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.expand = false,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final button = OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: colorScheme.onSurface,
        side: BorderSide(color: colorScheme.outline, width: 1),
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
        ),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 14,
          letterSpacing: 0.5,
        ),
      ),
      child: Row(
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 18),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
    return expand
        ? SizedBox(width: double.infinity, child: button)
        : button;
  }
}
