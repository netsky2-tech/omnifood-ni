import 'package:flutter/material.dart';

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
        final spacing = constraints.maxHeight.isFinite && constraints.maxHeight < 320 ? 8.0 : 16.0;
        final double aspectRatio;
        if (constraints.maxHeight.isFinite) {
          final cellWidth = (constraints.maxWidth - 2 * spacing) / 3;
          final cellHeight = (constraints.maxHeight - 3 * spacing) / 4;
          aspectRatio = (cellWidth / cellHeight).clamp(0.5, 2.5);
        } else {
          aspectRatio = 1.5;
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
              return _buildButton(context, 'C', onClear, color: const Color(0xFFBA1A1A), fontSize: fontSize);
            } else if (index == 10) {
              return _buildButton(context, '0', () => onKeyPressed('0'), fontSize: fontSize);
            } else if (index == 11) {
              return _buildButton(context, '⌫', onDelete, color: const Color(0xFF79573F), fontSize: fontSize);
            } else {
              final number = (index + 1).toString();
              return _buildButton(context, number, () => onKeyPressed(number), fontSize: fontSize);
            }
          },
        );
      },
    );
  }

  Widget _buildButton(
    BuildContext context,
    String text,
    VoidCallback onPressed, {
    Color? color,
    double fontSize = 22,
  }) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: color ?? Colors.white,
        foregroundColor: color != null ? Colors.white : const Color(0xFF1A1C1C),
        minimumSize: const Size.fromHeight(44), // hit-area-min
        padding: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(
            color: color ?? const Color(0xFF767777),
            width: 1,
          ),
        ),
      ),
      onPressed: onPressed,
      child: Text(
        text,
        style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w700),
      ),
    );
  }
}
