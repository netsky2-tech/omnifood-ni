import 'package:flutter/foundation.dart';
import '../../domain/models/user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/user_dao.dart';
import '../daos/security_profile_dao.dart';
import '../models/security_profile_entity.dart';
import '../models/user_entity.dart';
import '../services/local_auth_service.dart';
import '../mappers/user_mapper.dart';
import '../security/local_totp_seed_cipher.dart';
import '../security/totp_seed_key_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthRepositoryImpl implements AuthRepository {
  final UserDao _userDao;
  final SecurityProfileDao _securityProfileDao;
  final LocalAuthService _localAuth;
  final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  SharedPreferences? _prefs;
  User? _currentUser;
  String? _accessToken;
  bool _isPendingSync = false;
  DateTime? _lastSyncTimestamp;
  final Map<String, List<DateTime>> _pinFailures = <String, List<DateTime>>{};
  final Map<String, DateTime> _pinLockedUntil = <String, DateTime>{};
  final TotpSeedKeyProvider _totpSeedKeyProvider;

  AuthRepositoryImpl(
    this._userDao,
    this._securityProfileDao,
    this._localAuth,
    this._dio, {
    TotpSeedKeyProvider? totpSeedKeyProvider,
  }) : _totpSeedKeyProvider =
           totpSeedKeyProvider ?? DeviceBoundTotpSeedKeyProvider();

  @override
  bool get isPendingSync => _isPendingSync;

  @override
  DateTime? get lastSyncTimestamp => _lastSyncTimestamp;

  Future<LocalTotpSeedCipher> _buildTotpSeedCipher() async {
    final keyMaterial = await _totpSeedKeyProvider.getKeyMaterial();
    return LocalTotpSeedCipher(keyMaterial: keyMaterial);
  }

  Future<void> normalizeLegacyPlaintextTotpSeeds() async {
    final legacyProfiles =
        await _securityProfileDao.findLegacyPlaintextTotpSeeds();
    if (legacyProfiles.isEmpty) {
      return;
    }

    final totpSeedCipher = await _buildTotpSeedCipher();
    for (final profile in legacyProfiles) {
      final rawSeed = profile.totpSecretSeed;
      if (rawSeed == null || rawSeed.isEmpty) continue;
      final encryptedSeed = totpSeedCipher.encryptNullable(rawSeed);
      if (encryptedSeed == null || encryptedSeed == rawSeed) {
        throw StateError(
          'Failed to normalize legacy plaintext TOTP seed for user ${profile.userId}',
        );
      }
      await _securityProfileDao.updateTotpSecretSeed(profile.userId, encryptedSeed);
    }
  }

  Future<void> _saveToken(String token) async {
    _accessToken = token;
    _dio.options.headers['Authorization'] = 'Bearer $token';

    try {
      // Intentar persistencia segura (funciona en móvil y Web con HTTPS/localhost)
      await _storage.write(key: 'access_token', value: token);
    } catch (e) {
      debugPrint(
        '[AuthRepository] Secure storage falló, usando SharedPreferences (Contexto no seguro): $e',
      );
      _prefs ??= await SharedPreferences.getInstance();
      await _prefs?.setString('access_token', token);
    }
  }

  @override
  Future<User?> loginOnline(String email, String password) async {
    try {
      final response = await _dio.post(
        '/identity/login',
        data: {'email': email, 'pass': password},
      );

      final user = User.fromJson(response.data['user']);
      final token = response.data['access_token'];

      _currentUser = user;
      _isPendingSync = false;
      await _saveToken(token);

      await syncStaff();
      return user;
    } on DioException catch (e) {
      final isUnauthorized = e.response?.statusCode == 401 || e.response?.statusCode == 403;
      if (isUnauthorized) {
        debugPrint('[AuthRepository] Online login rejected by backend: ${e.response?.statusCode}');
        return null;
      }

      final isFallbackAllowed =
          e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          (e.response?.statusCode != null && (e.response!.statusCode! >= 500));

      if (!isFallbackAllowed) {
        debugPrint('[AuthRepository] Online login failed without fallback eligibility: $e');
        return null;
      }

      final localUser = await _findLocalUserByIdentifier(email);
      if (localUser == null) {
        debugPrint('[AuthRepository] Offline fallback denied: unknown local user');
        return null;
      }

      final profile = await _securityProfileDao.findByUserId(localUser.id);
      final pinHash = profile?.pinHash;
      if (profile == null || !profile.isPinEnabled || pinHash == null || pinHash.isEmpty) {
        debugPrint('[AuthRepository] Offline fallback denied: missing local security profile');
        return null;
      }

      final isPinValid = _localAuth.verifyPin(password, pinHash);
      if (!isPinValid) {
        debugPrint('[AuthRepository] Offline fallback denied: invalid local credentials');
        return null;
      }

      _currentUser = localUser.toDomain();
      _isPendingSync = true;
      return _currentUser;
    } catch (e) {
      debugPrint('[AuthRepository] Online login failed: $e');
      return null;
    }
  }

  Future<UserEntity?> _findLocalUserByIdentifier(String identifier) async {
    final normalizedIdentifier = identifier.trim().toLowerCase();
    final directByEmail = await _userDao.findUserByEmail(normalizedIdentifier);
    if (directByEmail != null) {
      return directByEmail;
    }

    final allUsers = await _userDao.findAllUsers();
    for (final user in allUsers) {
      final userEmail = user.email?.trim().toLowerCase();
      if (userEmail == null || userEmail.isEmpty || !userEmail.contains('@')) {
        continue;
      }

      final username = userEmail.split('@').first;
      if (username == normalizedIdentifier) {
        return user;
      }
    }

    return null;
  }

  @override
  Future<void> syncStaff() async {
    try {
      await normalizeLegacyPlaintextTotpSeeds();
      final totpSeedCipher = await _buildTotpSeedCipher();
      debugPrint('[AuthRepository] Syncing staff members...');
      final response = await _dio.get(
        '/identity/staff',
        options: Options(
          headers: const {'x-offline-sync-scope': 'pos-auth-continuity'},
        ),
      );
      final payload = response.data;
      final List<dynamic> staffJson;
      DateTime? parsedSnapshot;

      if (payload is Map<String, dynamic>) {
        final metadata = payload['metadata'];
        if (metadata is Map<String, dynamic>) {
          final snapshotRaw = metadata['snapshot_timestamp'];
          if (snapshotRaw is String && snapshotRaw.isNotEmpty) {
            parsedSnapshot = DateTime.tryParse(snapshotRaw);
          }
        }
        final wrappedStaff = payload['staff'];
        staffJson = wrappedStaff is List<dynamic> ? wrappedStaff : <dynamic>[];
      } else if (payload is List<dynamic>) {
        staffJson = payload;
      } else {
        staffJson = <dynamic>[];
      }

      final users = staffJson
          .map((raw) => Map<String, dynamic>.from(raw as Map))
          .map((json) {
            final sanitized = Map<String, dynamic>.from(json)
              ..remove('security_profile');
            sanitized['pin_hash'] = '';
            return User.fromJson(sanitized);
          })
          .toList();
      final entities = users.map((u) => u.toEntity()).toList();
      final profiles = staffJson
          .map((raw) => Map<String, dynamic>.from(raw as Map))
          .map((json) {
            final profile = json['security_profile'] as Map<String, dynamic>?;
            return SecurityProfileEntity(
              userId: (profile?['user_id'] ?? json['id']) as String,
              pinHash: profile?['pin_hash'] as String?,
              totpSecretSeed: totpSeedCipher.encryptNullable(
                profile?['totp_secret_seed'] as String?,
              ),
              isTotpEnabled: (profile?['is_totp_enabled'] as bool?) ?? false,
              isPinEnabled: (profile?['is_pin_enabled'] as bool?) ?? true,
            );
          })
          .toList();

      await _userDao.deleteAllUsers();
      await _securityProfileDao.deleteAll();
      await _userDao.insertUsers(entities);
      await _securityProfileDao.insertProfiles(profiles);
      _lastSyncTimestamp = parsedSnapshot;
      _isPendingSync = false;
      debugPrint(
        '[AuthRepository] Synced ${entities.length} staff members to local DB',
      );
    } catch (e) {
      if (e is StateError) {
        rethrow;
      }
      debugPrint('[AuthRepository] Failed to sync staff: $e');
    }
  }

  @override
  Future<User?> loginOffline(String userId, String pin) async {
    debugPrint('[AuthRepository] Attempting offline login for user: $userId');

    final entity = await _userDao.findUserById(userId);
    if (entity == null) return null;

    final profile = await _securityProfileDao.findByUserId(userId);
    if (profile == null || !profile.isPinEnabled) {
      return null;
    }

    try {
      final pinHash = profile.pinHash;
      if (pinHash != null && pinHash.isNotEmpty) {
        final isPinValid = _localAuth.verifyPin(pin, pinHash);
        if (isPinValid) {
          _currentUser = entity.toDomain();
          return _currentUser;
        }
      }
    } catch (e) {
      debugPrint('[AuthRepository] Exception during PIN verification: $e');
    }
    return null;
  }

  @override
  Future<bool> authorizeOverride({
    required String supervisorId,
    String? pin,
    String? totpCode,
  }) async {
    if (pin == null && totpCode == null) return false;

    await normalizeLegacyPlaintextTotpSeeds();

    final profile = await _securityProfileDao.findByUserId(supervisorId);
    if (profile == null) return false;

    final now = DateTime.now();
    final lockedUntil = _pinLockedUntil[supervisorId];
    final pinLocked = lockedUntil != null && now.isBefore(lockedUntil);

    if (pin != null &&
        profile.isPinEnabled &&
        profile.pinHash != null &&
        !pinLocked) {
      if (_localAuth.verifyPin(pin, profile.pinHash!)) {
        _pinFailures.remove(supervisorId);
        _pinLockedUntil.remove(supervisorId);
        return true;
      }
      _registerPinFailure(supervisorId, now);
    }

    if (totpCode != null &&
        profile.isTotpEnabled &&
        profile.totpSecretSeed != null) {
      final totpSeedCipher = await _buildTotpSeedCipher();
      final decryptedSeed = totpSeedCipher.decryptNullable(
        profile.totpSecretSeed,
      );
      if (decryptedSeed != null &&
          _localAuth.verifyTotp(totpCode, decryptedSeed)) {
        // TOTP fallback remains available even during PIN lockout.
        return true;
      }
    }

    return false;
  }

  void _registerPinFailure(String supervisorId, DateTime now) {
    final windowStart = now.subtract(const Duration(seconds: 60));
    final failures = (_pinFailures[supervisorId] ?? <DateTime>[])
        .where((attempt) => attempt.isAfter(windowStart))
        .toList();
    failures.add(now);
    _pinFailures[supervisorId] = failures;

    if (failures.length >= 3) {
      _pinLockedUntil[supervisorId] = now.add(const Duration(minutes: 5));
      _pinFailures[supervisorId] = <DateTime>[];
    }
  }

  @override
  Future<User?> getCurrentUser() async {
    return _currentUser;
  }

  @override
  Future<String?> getAccessToken() async {
    if (_accessToken != null) return _accessToken;

    try {
      _accessToken = await _storage.read(key: 'access_token');
    } catch (e) {
      debugPrint(
        '[AuthRepository] Error leyendo secure storage, intentando SharedPreferences: $e',
      );
      _prefs ??= await SharedPreferences.getInstance();
      _accessToken = _prefs?.getString('access_token');
    }
    return _accessToken;
  }

  @override
  Future<void> logout() async {
    _currentUser = null;
    _accessToken = null;
    _dio.options.headers.remove('Authorization');

    try {
      await _storage.delete(key: 'access_token');
    } catch (e) {
      _prefs ??= await SharedPreferences.getInstance();
      await _prefs?.remove('access_token');
    }
  }

  @override
  Future<List<User>> getAllUsers() async {
    final entities = await _userDao.findAllUsers();
    return entities.map((e) => e.toDomain()).toList();
  }

  @override
  Future<void> saveUser(User user, {String? pin}) async {
    // If a new pin is provided, save it to SecurityProfile
    if (pin != null && pin.isNotEmpty) {
      final finalPinHash = _localAuth.hashPin(pin);

      var profile = await _securityProfileDao.findByUserId(user.id);
      if (profile != null) {
        await _securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: profile.userId,
            pinHash: finalPinHash,
            totpSecretSeed: profile.totpSecretSeed,
            isTotpEnabled: profile.isTotpEnabled,
            isPinEnabled: true,
          ),
        ]);
      } else {
        await _securityProfileDao.insertProfiles([
          SecurityProfileEntity(
            userId: user.id,
            pinHash: finalPinHash,
            isTotpEnabled: false,
            isPinEnabled: true,
          ),
        ]);
      }
    }

    await _userDao.insertUsers([user.toEntity()]);
  }

  @override
  Future<void> deleteUser(String userId) async {
    final user = await _userDao.findUserById(userId);
    if (user != null) {
      // In a real multi-tenant app, we might just mark as inactive
      // but here we follow the request.
      await _userDao.insertUsers([
        UserEntity(
          id: user.id,
          name: user.name,
          role: user.role,
          pinHash: user.pinHash,
          isActive: false, // Soft delete
          email: user.email,
          tenantId: user.tenantId,
        ),
      ]);
    }
  }
}
