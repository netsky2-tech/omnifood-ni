import 'package:flutter/foundation.dart';
import '../../domain/models/user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/user_dao.dart';
import '../services/local_auth_service.dart';
import '../mappers/user_mapper.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class AuthRepositoryImpl implements AuthRepository {
  final UserDao _userDao;
  final LocalAuthService _localAuth;
  final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  User? _currentUser;
  String? _accessToken;

  AuthRepositoryImpl(this._userDao, this._localAuth, this._dio);

  @override
  Future<User?> loginOnline(String email, String password) async {
    // FALLBACK: Emergencia para desarrollo/piloto si el backend está caído
    if (email == 'admin@omnifood.ni' && password == 'admin123') {
      _currentUser = const User(
        id: 'setup-admin',
        name: 'Admin Inicial',
        email: 'admin@omnifood.ni',
        role: UserRole.owner,
        pinHash: '123456', 
        isActive: true,
      );
      return _currentUser;
    }

    try {
      final response = await _dio.post('/identity/login', data: {
        'email': email,
        'pass': password,
      });
      
      final user = User.fromJson(response.data['user']);
      final token = response.data['access_token'];
      
      _currentUser = user;
      _accessToken = token;
      
      await _storage.write(key: 'access_token', value: token);
      _dio.options.headers['Authorization'] = 'Bearer $token';
      
      await syncStaff();
      return user;
    } catch (e) {
      debugPrint('[AuthRepository] Online login failed: $e');
      return null;
    }
  }

  @override
  Future<void> syncStaff() async {
    try {
      debugPrint('[AuthRepository] Syncing staff members...');
      final response = await _dio.get('/identity/staff');
      final List<dynamic> staffJson = response.data;
      
      final users = staffJson.map((json) => User.fromJson(json)).toList();
      final entities = users.map((u) => u.toEntity()).toList();
      
      await _userDao.deleteAllUsers();
      await _userDao.insertUsers(entities);
      debugPrint('[AuthRepository] Synced ${entities.length} staff members to local DB');
      
      // Verify first user hash length for debugging
      if (entities.isNotEmpty) {
        debugPrint('[AuthRepository] Debug: First synced user hash length: ${entities.first.pinHash.length}');
      }
    } catch (e) {
      debugPrint('[AuthRepository] Failed to sync staff: $e');
    }
  }

  @override
  Future<User?> loginOffline(String userId, String pin) async {
    debugPrint('[AuthRepository] Attempting offline login for user: $userId');
    
    // Setup Admin bypass
    if (userId == 'setup-admin' && pin == '123456') {
      debugPrint('[AuthRepository] Setup Admin bypass successful');
      _currentUser = const User(
        id: 'setup-admin',
        name: 'Admin Inicial',
        email: 'admin@omnifood.ni',
        role: UserRole.owner,
        pinHash: '123456',
        isActive: true,
      );
      return _currentUser;
    }

    final entity = await _userDao.findUserById(userId);
    if (entity == null) {
      debugPrint('[AuthRepository] User not found in local DB: $userId');
      return null;
    }

    debugPrint('[AuthRepository] User found in DB. Stored hash length: ${entity.pinHash.length}');
    
    if (entity.pinHash.isEmpty) {
      debugPrint('[AuthRepository] ERROR: Stored hash is empty. User needs to sync online.');
      return null;
    }

    try {
      final isPinValid = _localAuth.verifyPin(pin, entity.pinHash);
      debugPrint('[AuthRepository] PIN verification result: $isPinValid');

      if (isPinValid) {
        _currentUser = entity.toDomain();
        return _currentUser;
      }
    } catch (e) {
      debugPrint('[AuthRepository] Exception during PIN verification: $e');
    }
    
    return null;
  }

  @override
  Future<User?> getCurrentUser() async {
    return _currentUser;
  }

  Future<String?> getAccessToken() async {
    _accessToken ??= await _storage.read(key: 'access_token');
    return _accessToken;
  }

  @override
  Future<void> logout() async {
    _currentUser = null;
    _accessToken = null;
    await _storage.delete(key: 'access_token');
    _dio.options.headers.remove('Authorization');
  }
}
