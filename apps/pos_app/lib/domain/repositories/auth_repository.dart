import '../models/user.dart';

abstract class AuthRepository {
  Future<User?> loginOnline(String email, String password);
  Future<void> syncStaff();
  Future<User?> loginOffline(String userId, String pin);
  Future<User?> getCurrentUser();
  Future<void> logout();
}
