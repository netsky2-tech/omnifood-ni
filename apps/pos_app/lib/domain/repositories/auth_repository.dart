import '../models/user.dart';

abstract class AuthRepository {
  bool get isPendingSync;
  DateTime? get lastSyncTimestamp;

  Future<User?> loginOnline(String email, String password);
  Future<void> syncStaff();
  Future<User?> loginOffline(String userId, String pin);
  Future<bool> authorizeOverride({required String supervisorId, String? pin, String? totpCode});
  Future<User?> getCurrentUser();
  Future<String?> getAccessToken();
  Future<void> logout();

  // User Management
  Future<List<User>> getAllUsers();
  Future<void> saveUser(User user, {String? pin});
  Future<void> deleteUser(String userId);
}
