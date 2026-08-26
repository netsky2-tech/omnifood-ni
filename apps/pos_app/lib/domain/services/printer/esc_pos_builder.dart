import 'dart:convert';

enum EscPosAlign { left, center, right }

enum EscPosFontSize { normal, doubleWidth, doubleHeight, doubleSize }

/// Fluent builder for generating standard ESC/POS thermal printer byte streams.
class EscPosBuilder {
  final List<int> _bytes = [];

  EscPosBuilder() {
    init();
  }

  /// ESC @ (0x1B, 0x40) - Reset and initialize printer.
  EscPosBuilder init() {
    _bytes.addAll([0x1B, 0x40]);
    return this;
  }

  /// ESC a n (0x1B, 0x61, n) - Set text alignment.
  EscPosBuilder align(EscPosAlign alignment) {
    int val = 0;
    switch (alignment) {
      case EscPosAlign.left:
        val = 0;
        break;
      case EscPosAlign.center:
        val = 1;
        break;
      case EscPosAlign.right:
        val = 2;
        break;
    }
    _bytes.addAll([0x1B, 0x61, val]);
    return this;
  }

  /// ESC E n (0x1B, 0x45, n) - Turn bold mode on or off.
  EscPosBuilder bold([bool enable = true]) {
    _bytes.addAll([0x1B, 0x45, enable ? 1 : 0]);
    return this;
  }

  /// ESC - n (0x1B, 0x2D, n) - Turn underline on or off.
  EscPosBuilder underline([bool enable = true]) {
    _bytes.addAll([0x1B, 0x2D, enable ? 1 : 0]);
    return this;
  }

  /// GS ! n (0x1D, 0x21, n) - Set font scaling.
  EscPosBuilder fontSize(EscPosFontSize size) {
    int val = 0x00;
    switch (size) {
      case EscPosFontSize.normal:
        val = 0x00;
        break;
      case EscPosFontSize.doubleWidth:
        val = 0x10;
        break;
      case EscPosFontSize.doubleHeight:
        val = 0x01;
        break;
      case EscPosFontSize.doubleSize:
        val = 0x11;
        break;
    }
    _bytes.addAll([0x1D, 0x21, val]);
    return this;
  }

  /// Appends raw text encoded in Latin1 / UTF-8.
  EscPosBuilder text(String text) {
    try {
      _bytes.addAll(latin1.encode(text));
    } catch (_) {
      _bytes.addAll(utf8.encode(text));
    }
    return this;
  }

  /// Appends text followed by line feed (LF: 0x0A).
  EscPosBuilder textLine(String line) {
    text(line);
    _bytes.add(0x0A);
    return this;
  }

  /// ESC d n (0x1B, 0x64, n) - Feed n blank lines.
  EscPosBuilder feedLines([int count = 1]) {
    if (count <= 0) return this;
    _bytes.addAll([0x1B, 0x64, count]);
    return this;
  }

  /// GS V (0x1D, 0x56, 0x42, 0x00) - Cut paper (partial or full).
  EscPosBuilder cut() {
    _bytes.addAll([0x1D, 0x56, 0x42, 0x00]);
    return this;
  }

  /// ESC p 0 25 250 (0x1B, 0x70, 0x00, 0x19, 0xFA) - Pulse to cash drawer.
  EscPosBuilder kickDrawer() {
    _bytes.addAll([0x1B, 0x70, 0x00, 0x19, 0xFA]);
    return this;
  }

  /// Returns the complete generated ESC/POS byte sequence.
  List<int> toBytes() => List.unmodifiable(_bytes);
}
