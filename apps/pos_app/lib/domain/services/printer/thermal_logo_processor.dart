import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

class LogoProcessingResult {
  final bool isValid;
  final String? errorMessage;
  final int width;
  final int height;
  final Uint8List? raw1BitBitmap;
  final List<int>? escPosRasterBytes;
  final String? base64Png;

  const LogoProcessingResult({
    required this.isValid,
    this.errorMessage,
    this.width = 0,
    this.height = 0,
    this.raw1BitBitmap,
    this.escPosRasterBytes,
    this.base64Png,
  });

  factory LogoProcessingResult.failure(String message) {
    return LogoProcessingResult(
      isValid: false,
      errorMessage: message,
    );
  }

  factory LogoProcessingResult.success({
    required int width,
    required int height,
    required Uint8List raw1BitBitmap,
    required List<int> escPosRasterBytes,
    String? base64Png,
  }) {
    return LogoProcessingResult(
      isValid: true,
      width: width,
      height: height,
      raw1BitBitmap: raw1BitBitmap,
      escPosRasterBytes: escPosRasterBytes,
      base64Png: base64Png,
    );
  }
}

/// Specialized Image Processing service for 58mm/80mm Thermal Receipt Printers.
/// Implements pure 1-bit Floyd-Steinberg error diffusion and ESC/POS raster byte generation.
class ThermalLogoProcessor {
  static const int maxThermalWidth58mm = 384; // 384 dots max on 58mm 203dpi head

  /// Validates PNG magic header [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].
  static bool isPng(Uint8List bytes) {
    if (bytes.length < 8) return false;
    return bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4E &&
        bytes[3] == 0x47 &&
        bytes[4] == 0x0D &&
        bytes[5] == 0x0A &&
        bytes[6] == 0x1A &&
        bytes[7] == 0x0A;
  }

  /// Processes raw PNG bytes into a strict 1-bit monochrome thermal raster image.
  static Future<LogoProcessingResult> processPngBytes(
    Uint8List pngBytes, {
    int maxWidth = maxThermalWidth58mm,
    bool applyDithering = true,
  }) async {
    if (!isPng(pngBytes)) {
      return LogoProcessingResult.failure(
        'El archivo seleccionado no tiene un formato PNG válido.',
      );
    }

    try {
      final codec = await ui.instantiateImageCodec(pngBytes);
      final frame = await codec.getNextFrame();
      final image = frame.image;

      final originalWidth = image.width;
      final originalHeight = image.height;

      if (originalWidth > maxWidth) {
        return LogoProcessingResult.failure(
          'El ancho de la imagen (${originalWidth}px) excede el máximo permitido de ${maxWidth}px para cabezales de 58mm.',
        );
      }

      final byteData = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (byteData == null) {
        return LogoProcessingResult.failure('No se pudieron extraer los píxeles de la imagen.');
      }

      final rgbaBytes = byteData.buffer.asUint8List();
      final width = originalWidth;
      final height = originalHeight;

      // 1. Convert to 2D Grayscale array with Alpha transparency blending (White background)
      final List<List<double>> gray = List.generate(
        height,
        (y) => List.generate(width, (x) {
          final offset = (y * width + x) * 4;
          final r = rgbaBytes[offset];
          final g = rgbaBytes[offset + 1];
          final b = rgbaBytes[offset + 2];
          final a = rgbaBytes[offset + 3];

          if (a < 128) {
            return 255.0; // Transparent background -> Pure White
          }
          // Standard ITU-R BT.601 Luminance formula
          return 0.299 * r + 0.587 * g + 0.114 * b;
        }),
      );

      // 2. Floyd-Steinberg Error Diffusion Dithering (or thresholding)
      final List<List<int>> binary = List.generate(
        height,
        (y) => List.filled(width, 0),
      );

      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          final oldPixel = gray[y][x].clamp(0.0, 255.0);
          final newPixel = oldPixel < 128.0 ? 0 : 255;
          binary[y][x] = newPixel == 0 ? 1 : 0; // 1 = Black (burn), 0 = White

          if (applyDithering) {
            final error = oldPixel - newPixel;

            if (x + 1 < width) {
              gray[y][x + 1] += error * (7.0 / 16.0);
            }
            if (x - 1 >= 0 && y + 1 < height) {
              gray[y + 1][x - 1] += error * (3.0 / 16.0);
            }
            if (y + 1 < height) {
              gray[y + 1][x] += error * (5.0 / 16.0);
            }
            if (x + 1 < width && y + 1 < height) {
              gray[y + 1][x + 1] += error * (1.0 / 16.0);
            }
          }
        }
      }

      // 3. Pack 1-bit pixels into ESC/POS Raster bitmap (MSB first, padded to 8 bits per row)
      final bytesPerRow = (width + 7) ~/ 8;
      final packedBitmap = Uint8List(bytesPerRow * height);

      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          if (binary[y][x] == 1) {
            final byteIndex = y * bytesPerRow + (x ~/ 8);
            final bitIndex = 7 - (x % 8);
            packedBitmap[byteIndex] |= (1 << bitIndex);
          }
        }
      }

      // 4. Generate ESC/POS GS v 0 raster command
      // Format: 0x1D 0x76 0x30 0x00 (normal mode) xL xH yL yH [data...]
      final xL = bytesPerRow % 256;
      final xH = (bytesPerRow ~/ 256) % 256;
      final yL = height % 256;
      final yH = (height ~/ 256) % 256;

      final escPosBytes = <int>[
        0x1B, 0x61, 0x01, // Center align
        0x1D, 0x76, 0x30, 0x00,
        xL, xH, yL, yH,
        ...packedBitmap,
        0x1B, 0x61, 0x00, // Reset left align
      ];

      return LogoProcessingResult.success(
        width: width,
        height: height,
        raw1BitBitmap: packedBitmap,
        escPosRasterBytes: escPosBytes,
        base64Png: base64Encode(pngBytes),
      );
    } catch (e) {
      return LogoProcessingResult.failure('Error al procesar la imagen: $e');
    }
  }

  /// Builds ESC/POS bytes from previously processed raw 1-bit bitmap.
  static List<int> buildEscPosRasterFrom1Bit({
    required Uint8List raw1BitBitmap,
    required int width,
    required int height,
  }) {
    final bytesPerRow = (width + 7) ~/ 8;
    final xL = bytesPerRow % 256;
    final xH = (bytesPerRow ~/ 256) % 256;
    final yL = height % 256;
    final yH = (height ~/ 256) % 256;

    return <int>[
      0x1B, 0x61, 0x01, // Center align
      0x1D, 0x76, 0x30, 0x00,
      xL, xH, yL, yH,
      ...raw1BitBitmap,
      0x1B, 0x61, 0x00, // Reset align left
    ];
  }
}
