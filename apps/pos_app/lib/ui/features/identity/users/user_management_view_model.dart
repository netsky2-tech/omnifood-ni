import 'package:flutter/foundation.dart';
import '../../../../../domain/models/user.dart';
import '../../../../../domain/repositories/auth_repository.dart';
import 'package:uuid/uuid.dart';

class UserManagementViewModel extends ChangeNotifier {
  final AuthRepository _authRepository;
  final _uuid = const Uuid();

  UserManagementViewModel(this._authRepository);

  List<User> _users = [];
  List<User> get users => _users;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _errorMessage;
  String? get errorMessage => _errorMessage;

  Future<void> loadUsers() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      _users = await _authRepository.getAllUsers();
    } catch (e) {
      _errorMessage = 'Error al cargar usuarios: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> saveUser(User user, {String? pin}) async {
    try {
      await _authRepository.saveUser(user, pin: pin);
      await loadUsers();
    } catch (e) {
      _errorMessage = 'Error al guardar usuario: $e';
      notifyListeners();
    }
  }

  Future<void> toggleUserStatus(User user) async {
    final updated = user.copyWith(isActive: !user.isActive);
    await saveUser(updated);
  }

  Future<void> resetPin(String userId, String newPin) async {
    final user = _users.firstWhere((u) => u.id == userId);
    await saveUser(user, pin: newPin);
  }

  String generateId() => _uuid.v4();

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }
}
