import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/printer/thermal_logo_processor.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ThermalLogoProcessor Tests', () {
    test('isPng detects valid and invalid PNG magic headers', () {
      final validPngHeader = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
      final invalidJpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      final tooShort = Uint8List.fromList([0x89, 0x50]);

      expect(ThermalLogoProcessor.isPng(validPngHeader), isTrue);
      expect(ThermalLogoProcessor.isPng(invalidJpeg), isFalse);
      expect(ThermalLogoProcessor.isPng(tooShort), isFalse);
    });

    test('rejects non-PNG files with friendly error message', () async {
      final fakeJpg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      final result = await ThermalLogoProcessor.processPngBytes(fakeJpg);

      expect(result.isValid, isFalse);
      expect(result.errorMessage, contains('PNG'));
    });

    test('buildEscPosRasterFrom1Bit creates standard GS v 0 bytecode', () {
      // 16 px width (2 bytes per row), 2 px height = 4 bytes bitmap
      final raw1BitBitmap = Uint8List.fromList([
        0xFF, 0x00, // Row 0: 8 black dots, 8 white dots
        0xAA, 0x55, // Row 1: alternating dots
      ]);

      final escPosBytes = ThermalLogoProcessor.buildEscPosRasterFrom1Bit(
        raw1BitBitmap: raw1BitBitmap,
        width: 16,
        height: 2,
      );

      // Verify Center alignment header: [0x1B, 0x61, 0x01]
      expect(escPosBytes[0], 0x1B);
      expect(escPosBytes[1], 0x61);
      expect(escPosBytes[2], 0x01);

      // Verify GS v 0 header: [0x1D, 0x76, 0x30, 0x00, xL=2, xH=0, yL=2, yH=0]
      expect(escPosBytes[3], 0x1D);
      expect(escPosBytes[4], 0x76);
      expect(escPosBytes[5], 0x30);
      expect(escPosBytes[6], 0x00);
      expect(escPosBytes[7], 2); // xL (2 bytes per row)
      expect(escPosBytes[8], 0); // xH
      expect(escPosBytes[9], 2); // yL (2 rows height)
      expect(escPosBytes[10], 0); // yH

      // Verify raster payload
      expect(escPosBytes.sublist(11, 15), [0xFF, 0x00, 0xAA, 0x55]);

      // Verify Align reset tail: [0x1B, 0x61, 0x00]
      expect(escPosBytes[15], 0x1B);
      expect(escPosBytes[16], 0x61);
      expect(escPosBytes[17], 0x00);
    });
  });
}
