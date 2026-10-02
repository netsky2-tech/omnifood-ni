import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../design_system/nhilos_tokens.dart';

/// Keypad "clean slate" matching NHILOS POS Experience Standard v1.0 (§18.2, §42.1)
/// Neutral white numeric keys, slate gray for delete and clear, zero brown or alarm red.
class PinPad extends StatelessWidget {
  final Function(String) onKeyPressed;
  final VoidCallback onDelete;
  final VoidCallback onClear;

  const PinPad({
    super.key,
    required this.onKeyPressed,
    required this.onDelete,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final spacing = constraints.maxHeight.isFinite && constraints.maxHeight < 320 ? 8.0 : 12.0;
        final double aspectRatio;
        if (constraints.maxHeight.isFinite) {
          final cellWidth = (constraints.maxWidth - 2 * spacing) / 3;
          final cellHeight = (constraints.maxHeight - 3 * spacing) / 4;
          aspectRatio = (cellWidth / cellHeight).clamp(0.5, 2.5);
        } else {
          aspectRatio = 1.4;
        }

        final fontSize = constraints.maxHeight.isFinite && constraints.maxHeight < 280 ? 18.0 : 22.0;

        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 3,
            childAspectRatio: aspectRatio,
            mainAxisSpacing: spacing,
            crossAxisSpacing: spacing,
          ),
          itemCount: 12,
          itemBuilder: (context, index) {
            if (index == 9) {
              return _buildSpecialButton(
                context,
                'C',
                () {
                  HapticFeedback.lightImpact();
                  onClear();
                },
                fontSize: fontSize,
              );
            } else if (index == 10) {
              return _buildNumberButton(
                context,
                '0',
                () {
                  HapticFeedback.lightImpact();
                  onKeyPressed('0');
                },
                fontSize: fontSize,
              );
            } else if (index == 11) {
              return _buildSpecialButton(
                context,
                '⌫',
                () {
                  HapticFeedback.lightImpact();
                  onDelete();
                },
                fontSize: fontSize,
              );
            } else {
              final number = (index + 1).toString();
              return _buildNumberButton(
                context,
                number,
                () {
                  HapticFeedback.lightImpact();
                  onKeyPressed(number);
                },
                fontSize: fontSize,
              );
            }
          },
        );
      },
    );
  }

  Widget _buildNumberButton(
    BuildContext context,
    String text,
    VoidCallback onPressed, {
    double fontSize = 22,
  }) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: NhilosColors.surface,
        foregroundColor: NhilosColors.textPrimary,
        minimumSize: const Size.fromHeight(48), // hit-area-min per §18.3
        padding: EdgeInsets.zero,
        shape: const RoundedRectangleBorder(
          borderRadius: NhilosRadii.buttonRadius,
          side: BorderSide(
            color: NhilosColors.border,
            width: 1,
          ),
        ),
      ),
      onPressed: onPressed,
      child: Text(
        text,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }

  Widget _buildSpecialButton(
    BuildContext context,
    String text,
    VoidCallback onPressed, {
    double fontSize = 22,
  }) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: NhilosColors.neutralGray, // Slate 100 per §18.2
        foregroundColor: NhilosColors.neutralGrayDark, // Slate 600
        minimumSize: const Size.fromHeight(48),
        padding: EdgeInsets.zero,
        shape: const RoundedRectangleBorder(
          borderRadius: NhilosRadii.buttonRadius,
          side: BorderSide(
            color: NhilosColors.border,
            width: 1,
          ),
        ),
      ),
      onPressed: onPressed,
      child: Text(
        text,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
