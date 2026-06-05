import 'package:flutter/material.dart';

class DsSectionCard extends StatelessWidget {
  const DsSectionCard({
    super.key,
    this.title,
    this.icon,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: const Color(0xFF767777), width: 1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 0),
              child: Row(
                children: [
                  if (icon != null) ...[
                    Icon(icon, size: 18, color: colorScheme.onSurface),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: Text(
                      title!,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  // ignore: use_null_aware_elements
                  if (trailing != null) trailing!,
                ],
              ),
            ),
          Padding(
            padding: padding,
            child: child,
          ),
        ],
      ),
    );
  }
}
