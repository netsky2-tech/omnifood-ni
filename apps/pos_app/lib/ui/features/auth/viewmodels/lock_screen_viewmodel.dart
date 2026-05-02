import 'package:flutter/material.dart';
import '../../../../domain/models/user.dart';
import '../../../../domain/repositories/auth_repository.dart';
import '../../../../data/daos/user_dao.dart';
import '../../../../data/mappers/user_mapper.dart';

class LockScreenViewModel extends ChangeNotifier {
  final AuthRepository _authRepository;
  final UserDao _userDao;

  LockScreenViewModel(this._authRepository, this._userDao);

  List<User> _users = [];
  List<User> get users => _users;

  User? _selectedUser;
  User? get selectedUser => _selectedUser;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  Future<void> loadUsers() async {
    _isLoading = true;
    notifyListeners();

    final entities = await _userDao.findAllActiveUsers();
    _users = entities.map((e) => e.toDomain()).toList();

    // FALLBACK: Si no hay usuarios (primera vez o backend caído), agregar admin inicial
    if (_users.isEmpty) {
      _users.add(const User(
        id: 'setup-admin',
        name: 'Admin Inicial (Setup)',
        email: 'admin@omnifood.ni',
        role: UserRole.owner,
        pinHash: '', 
        isActive: true,
      ));
    }
    
    _isLoading = false;
    notifyListeners();
  }

  void selectUser(User user) {
    _selectedUser = user;
    _error = null;
    notifyListeners();
  }

  Future<bool> unlock(String pin) async {
    if (_selectedUser == null) return false;

    _isLoading = true;
    _error = null;
    notifyListeners();

    final user = await _authRepository.loginOffline(_selectedUser!.id, pin);
    
    _isLoading = false;
    if (user == null) {
      _error = 'PIN incorrecto';
      notifyListeners();
      return false;
    }

    notifyListeners();
    return true;
  }
}
