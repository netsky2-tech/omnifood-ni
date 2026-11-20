import 'package:flutter/material.dart';
import '../../../../domain/repositories/auth_repository.dart';

class LoginViewModel extends ChangeNotifier {
  final AuthRepository _authRepository;

  /// Resolves the locally stored tenant slug (pre-auth routing hint, issue
  /// #556). Null/absent resolver means legacy behavior: no slug is sent.
  final Future<String?> Function()? _resolveTenantSlug;

  /// Optional best-effort hook executed right after a successful online login
  /// (e.g. post-reactivation fiscal/FX re-priming for #566). Failures never
  /// block login.
  final Future<void> Function()? _onOnlineLoginSuccess;

  LoginViewModel(
    this._authRepository, {
    Future<String?> Function()? resolveTenantSlug,
    Future<void> Function()? onOnlineLoginSuccess,
  })  : _resolveTenantSlug = resolveTenantSlug,
        _onOnlineLoginSuccess = onOnlineLoginSuccess;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    // Slug is pre-auth context, never authority: resolver failures never
    // block or alter the login flow.
    String? tenantSlug;
    final resolveTenantSlug = _resolveTenantSlug;
    if (resolveTenantSlug != null) {
      try {
        tenantSlug = await resolveTenantSlug();
      } catch (_) {
        tenantSlug = null;
      }
    }

    final onlineUser =
        await _authRepository.loginOnline(email, password, tenantSlug: tenantSlug);
    if (onlineUser != null && _onOnlineLoginSuccess != null) {
      try {
        await _onOnlineLoginSuccess();
      } catch (_) {
        // Post-login re-priming is best-effort and must never block login.
      }
    }
    final user = onlineUser ?? await _authRepository.loginOffline(email, password);
    
    _isLoading = false;
    if (user == null) {
      _error = _authRepository.lastAuthError ??
          'Error de autenticación. Verifique sus credenciales o conexión.';
      notifyListeners();
      return false;
    }

    notifyListeners();
    return true;
  }
}
