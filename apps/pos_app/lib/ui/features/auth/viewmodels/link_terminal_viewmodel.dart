import 'package:flutter/foundation.dart';
import '../../../../data/services/hardware_fingerprint_service.dart';
import '../../../../data/services/terminal_identity_service.dart';
import '../../../../domain/models/auth/terminal_linking.dart';
import '../../../../domain/repositories/auth_repository.dart';
import '../../../../domain/security/device_sync_credential_record.dart';
import '../../../../domain/security/device_sync_credential_store.dart';

/// Drives the pre-auth terminal linking and reactivation flows (issues #556, #566):
/// - Checks whether this physical device was previously activated via its
///   privacy-preserving hardware fingerprint (`device-lookup`).
/// - Completes dashboard-approved or recovery-code-authorized reactivation,
///   persisting the canonical `terminalId` and rotated sync credential.
/// - Claims 6-char linking codes (manual, QR, App Link), passing the hardware
///   fingerprint and adopting any canonical `terminalId` / auto-approved
///   reactivation challenge returned for factory-reset replacements.
class LinkTerminalViewModel extends ChangeNotifier {
  LinkTerminalViewModel(
    this._authRepository, {
    required String deviceId,
    required Future<void> Function(String slug) persistTenantSlug,
    Future<void> Function(String tenantId)? persistTenantId,
    HardwareFingerprintService? hardwareFingerprintService,
    TerminalIdentityService? terminalIdentityService,
    DeviceSyncCredentialStore? deviceSyncCredentialStore,
  })  : _deviceId = deviceId,
        _persistTenantSlug = persistTenantSlug,
        _persistTenantId = persistTenantId,
        _hardwareFingerprintService = hardwareFingerprintService,
        _terminalIdentityService = terminalIdentityService,
        _deviceSyncCredentialStore = deviceSyncCredentialStore;

  static final RegExp _recoveryCodeRegex = RegExp(r'^\d{6}$');

  final AuthRepository _authRepository;
  final Future<void> Function(String slug) _persistTenantSlug;
  final Future<void> Function(String tenantId)? _persistTenantId;
  final HardwareFingerprintService? _hardwareFingerprintService;
  final TerminalIdentityService? _terminalIdentityService;
  final DeviceSyncCredentialStore? _deviceSyncCredentialStore;

  String _deviceId;

  /// Resolved terminal identity, shown on the linking screen so the owner
  /// can confirm which terminal is being linked. Updated when a canonical
  /// `terminalId` is restored via reactivation or factory-reset linking.
  String get deviceId => _deviceId;

  bool _isLoading = false;
  bool get isLoading => _isLoading;

  String? _error;
  String? get error => _error;

  bool _isCheckingReactivation = false;
  bool get isCheckingReactivation => _isCheckingReactivation;

  bool _isCompletingReactivation = false;
  bool get isCompletingReactivation => _isCompletingReactivation;

  DeviceReactivationLookupResult? _reactivationLookup;
  DeviceReactivationLookupResult? get reactivationLookup => _reactivationLookup;

  String? _reactivationError;
  String? get reactivationError => _reactivationError;

  String? _reactivationErrorCode;
  String? get reactivationErrorCode => _reactivationErrorCode;

  String? _cachedHardwareFingerprint;

  bool get hasPendingReactivation =>
      _reactivationLookup?.found == true &&
      (_reactivationLookup?.recoveryChallengeId?.trim().isNotEmpty ?? false);

  String? get reactivationMaskedHint => _reactivationLookup?.maskedHint;

  bool get isBusy => _isLoading || _isCompletingReactivation;

  /// Probes the backend for a previously activated terminal matching this
  /// device's hardware fingerprint (issue #566). Safe no-op when
  /// [HardwareFingerprintService] is unavailable or returns `null`.
  Future<void> checkReactivationAvailability() async {
    final fingerprintService = _hardwareFingerprintService;
    if (fingerprintService == null || _isCheckingReactivation) {
      return;
    }

    _isCheckingReactivation = true;
    _reactivationError = null;
    _reactivationErrorCode = null;
    notifyListeners();

    try {
      final fingerprint = await fingerprintService.getHardwareFingerprint();
      _cachedHardwareFingerprint = fingerprint;
      if (fingerprint == null) {
        _reactivationLookup = null;
        return;
      }

      final result =
          await _authRepository.lookupReactivationDevice(fingerprint);
      _reactivationLookup = result.found ? result : null;
    } on TerminalReactivationException catch (e) {
      _reactivationLookup = null;
      if (e.code != 'UNCONFIGURED_BACKEND') {
        _reactivationError = _resolveReactivationErrorMessage(e);
        _reactivationErrorCode = e.code;
      }
    } catch (_) {
      _reactivationLookup = null;
    } finally {
      _isCheckingReactivation = false;
      notifyListeners();
    }
  }

  /// Completes a pending reactivation challenge (approved via Dashboard or
  /// authorized with a one-time 6-digit [recoveryCode]).
  Future<bool> completeReactivation({String? recoveryCode}) async {
    final challengeId = _reactivationLookup?.recoveryChallengeId?.trim();
    if (challengeId == null || challengeId.isEmpty) {
      _reactivationError =
          'No hay una solicitud de reactivación activa. Tocá «Buscar nuevamente».';
      notifyListeners();
      return false;
    }

    final trimmedRecoveryCode = recoveryCode?.trim();
    if (trimmedRecoveryCode != null &&
        trimmedRecoveryCode.isNotEmpty &&
        !_recoveryCodeRegex.hasMatch(trimmedRecoveryCode)) {
      _reactivationError = 'Ingresá un código de recuperación de 6 dígitos.';
      _reactivationErrorCode = 'INVALID_RECOVERY_CODE_FORMAT';
      notifyListeners();
      return false;
    }

    final fingerprint = _cachedHardwareFingerprint ??
        await _hardwareFingerprintService?.getHardwareFingerprint();
    if (fingerprint == null) {
      _reactivationError =
          'No se pudo verificar la identidad física de este dispositivo.';
      notifyListeners();
      return false;
    }

    _isCompletingReactivation = true;
    _reactivationError = null;
    _reactivationErrorCode = null;
    notifyListeners();

    try {
      final completed = await _authRepository.completeReactivation(
        challengeId: challengeId,
        hardwareFingerprint: fingerprint,
        recoveryCode:
            (trimmedRecoveryCode != null && trimmedRecoveryCode.isNotEmpty)
                ? trimmedRecoveryCode
                : null,
      );
      await _finalizeReactivation(challengeId: challengeId, result: completed);
      _isCompletingReactivation = false;
      notifyListeners();
      return true;
    } on TerminalReactivationException catch (e) {
      _reactivationError = _resolveReactivationErrorMessage(e);
      _reactivationErrorCode = e.code;
      _isCompletingReactivation = false;
      notifyListeners();
      return false;
    } catch (_) {
      _reactivationError =
          'No se pudo completar la reactivación. Intentá de nuevo.';
      _isCompletingReactivation = false;
      notifyListeners();
      return false;
    }
  }

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
      final hardwareFingerprint =
          await _hardwareFingerprintService?.getHardwareFingerprint();
      _cachedHardwareFingerprint = hardwareFingerprint;

      final linking = hardwareFingerprint != null
          ? await _authRepository.claimLinkingCode(
              trimmedCode,
              _deviceId,
              hardwareFingerprint: hardwareFingerprint,
            )
          : await _authRepository.claimLinkingCode(trimmedCode, _deviceId);

      await _persistCanonicalDeviceIdIfPresent(linking.deviceId);
      await _persistTenantSlug(linking.slug);
      final persistTenantId = _persistTenantId;
      if (persistTenantId != null && linking.tenantId.isNotEmpty) {
        await persistTenantId(linking.tenantId);
      }

      final reactivationChallengeId = linking.reactivationChallengeId?.trim();
      if (reactivationChallengeId != null &&
          reactivationChallengeId.isNotEmpty &&
          hardwareFingerprint != null) {
        final completed = await _authRepository.completeReactivation(
          challengeId: reactivationChallengeId,
          hardwareFingerprint: hardwareFingerprint,
        );
        await _finalizeReactivation(
          challengeId: reactivationChallengeId,
          result: completed,
        );
      }

      _isLoading = false;
      notifyListeners();
      return true;
    } on LinkingClaimException catch (e) {
      _error = e.userMessage;
      _isLoading = false;
      notifyListeners();
      return false;
    } on TerminalReactivationException catch (e) {
      _error = _resolveReactivationErrorMessage(e);
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

  Future<void> _persistCanonicalDeviceIdIfPresent(String candidateId) async {
    final normalized = candidateId.trim();
    if (normalized.isEmpty) {
      return;
    }
    _deviceId = normalized;
    final terminalIdentityService = _terminalIdentityService;
    if (terminalIdentityService != null) {
      await terminalIdentityService.persistCanonicalDeviceId(normalized);
    }
  }

  Future<void> _finalizeReactivation({
    required String challengeId,
    required CompletedReactivationResult result,
  }) async {
    await _persistCanonicalDeviceIdIfPresent(result.terminalId);
    await _persistTenantSlug(result.slug);
    final persistTenantId = _persistTenantId;
    if (persistTenantId != null && result.tenantId.isNotEmpty) {
      await persistTenantId(result.tenantId);
    }

    await _authRepository.confirmReactivationCredential(
      challengeId: challengeId,
      credentialId: result.credentialId,
      version: result.version,
      renewalSecret: result.renewalSecret,
    );

    final credentialStore = _deviceSyncCredentialStore;
    if (credentialStore != null) {
      await credentialStore.writeCredential(
        DeviceSyncCredentialRecord(
          credentialId: result.credentialId,
          tenantId: result.tenantId,
          deviceId: result.terminalId,
          renewalSecret: result.renewalSecret,
          credentialVersion: result.version,
          expiresAt: result.expiresAt,
          slug: result.slug,
        ),
      );
    }
  }

  static String _resolveReactivationErrorMessage(
    TerminalReactivationException e,
  ) {
    switch (e.code) {
      case 'REACTIVATION_APPROVAL_REQUIRED':
        return 'Esperando aprobación desde el panel del negocio o ingresá tu código de recuperación de 6 dígitos.';
      case 'INVALID_RECOVERY_CODE':
        return 'Código de recuperación inválido o ya utilizado.';
      case 'REACTIVATION_CHALLENGE_EXPIRED':
        return 'La solicitud expiró. Tocá «Buscar nuevamente» para generar una nueva.';
      default:
        return e.userMessage.isNotEmpty
            ? e.userMessage
            : 'No se pudo completar la reactivación. Intentá de nuevo.';
    }
  }
}
