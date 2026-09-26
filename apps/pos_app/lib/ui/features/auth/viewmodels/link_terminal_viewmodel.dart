import 'package:flutter/foundation.dart';
import '../../../../domain/models/auth/terminal_linking.dart';
import '../../../../domain/repositories/auth_repository.dart';

/// Drives the pre-auth terminal linking flow (issue #556): claim the
/// 6-char code, persist the tenant binding (slug + tenantId), then hand
/// control to the login screen.
class LinkTerminalViewModel extends ChangeNotifier {
  LinkTerminalViewModel(
    this._authRepository, {
    required this.deviceId,
    required Future<void> Function(String slug) persistTenantSlug,
    Future<void> Function(String tenantId)? persistTenantId,
  })  : _persistTenantSlug = persistTenantSlug,
        _persistTenantId = persistTenantId;

  final AuthRepository _authRepository;

  /// Resolved terminal identity, shown on the linking screen so the owner
  /// can confirm which terminal is being linked.
  final String deviceId;

  final Future<void> Function(String slug) _persistTenantSlug;
  final Future<void> Function(String tenantId)? _persistTenantId;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  /// Claims the linking code and persists the tenant binding. Returns true
  /// when the terminal is linked and login can proceed. Local persistence
  /// failures fail closed: without a persisted slug the gate would lock the
  /// operator out on the next start.
  Future<bool> link(String code) async {
    final trimmedCode = code.trim();
    if (trimmedCode.isEmpty) {
      _error = 'Ingrese el código de vinculación.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final linking =
          await _authRepository.claimLinkingCode(trimmedCode, deviceId);
      await _persistTenantSlug(linking.slug);
      final persistTenantId = _persistTenantId;
      if (persistTenantId != null && linking.tenantId.isNotEmpty) {
        await persistTenantId(linking.tenantId);
      }
      _isLoading = false;
      notifyListeners();
      return true;
    } on LinkingClaimException catch (e) {
      _error = e.userMessage;
      _isLoading = false;
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'No se pudo vincular el terminal. Intente de nuevo.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
}
