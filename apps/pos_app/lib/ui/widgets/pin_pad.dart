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
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 1.5,
        mainAxisSpacing: 16, // stack-md
        crossAxisSpacing: 16,
      ),
      itemCount: 12,
      itemBuilder: (context, index) {
        if (index == 9) {
          return _buildButton(context, 'C', onClear, color: const Color(0xFFBA1A1A));
        } else if (index == 10) {
          return _buildButton(context, '0', () => onKeyPressed('0'));
        } else if (index == 11) {
          return _buildButton(context, '⌫', onDelete, color: const Color(0xFF79573F));
        } else {
          final number = (index + 1).toString();
          return _buildButton(context, number, () => onKeyPressed(number));
        }
      },
    );
  }

  Widget _buildButton(BuildContext context, String text, VoidCallback onPressed, {Color? color}) {
    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        backgroundColor: color ?? Colors.white,
        foregroundColor: color != null ? Colors.white : const Color(0xFF1A1C1C),
        minimumSize: const Size.fromHeight(48), // hit-area-min
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
        style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700),
      ),
    );
  }
}
