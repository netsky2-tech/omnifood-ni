import 'package:bcrypt/bcrypt.dart';
import 'package:otp/otp.dart';

class LocalAuthService {
  bool verifyPin(String pin, String hash) {
    try {
      return BCrypt.checkpw(pin, hash);
    } catch (e) {
      return false;
    }
  }

  String hashPin(String pin) {
    return BCrypt.hashpw(pin, BCrypt.gensalt());
  }

  bool verifyTotp(String code, String secretSeed) {
    try {
      final normalizedCode = code.trim();
      final isSixDigits = RegExp(r'^\d{6}$').hasMatch(normalizedCode);
      if (!isSixDigits) {
        return false;
      }

      final now = DateTime.now().millisecondsSinceEpoch;
      // Accept current window and +/- 1 window for slight time drift
      final currentCode = OTP.generateTOTPCodeString(
        secretSeed,
        now,
        algorithm: Algorithm.SHA1,
        isGoogle: true,
      );
      final pastCode = OTP.generateTOTPCodeString(
        secretSeed,
        now - 30000,
        algorithm: Algorithm.SHA1,
        isGoogle: true,
      );
      final futureCode = OTP.generateTOTPCodeString(
        secretSeed,
        now + 30000,
        algorithm: Algorithm.SHA1,
        isGoogle: true,
      );

      return normalizedCode == currentCode ||
          normalizedCode == pastCode ||
          normalizedCode == futureCode;
    } catch (e) {
      return false;
    }
  }
}
