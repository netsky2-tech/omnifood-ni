import 'package:flutter/material.dart';
import '../../../../domain/repositories/auth_repository.dart';

class LoginViewModel extends ChangeNotifier {
  final AuthRepository _authRepository;

  LoginViewModel(this._authRepository);

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final onlineUser = await _authRepository.loginOnline(email, password);
    final user = onlineUser ?? await _authRepository.loginOffline(email, password);
    
    _isLoading = false;
    if (user == null) {
      _error = 'Error de autenticación. Verifique sus credenciales o conexión.';
      notifyListeners();
      return false;
    }

    notifyListeners();
    return true;
  }
}
