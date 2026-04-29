import 'package:bcrypt/bcrypt.dart';

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
}
