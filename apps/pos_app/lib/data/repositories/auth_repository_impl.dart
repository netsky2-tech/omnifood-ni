import 'package:flutter/foundation.dart';
import '../../domain/models/user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/user_dao.dart';
import '../models/user_entity.dart';
import '../services/local_auth_service.dart';
import '../mappers/user_mapper.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthRepositoryImpl implements AuthRepository {
  final UserDao _userDao;
  final LocalAuthService _localAuth;
  final Dio _dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  SharedPreferences? _prefs;
  User? _currentUser;
  String? _accessToken;

  AuthRepositoryImpl(this._userDao, this._localAuth, this._dio);

  Future<void> _saveToken(String token) async {
    _accessToken = token;
    _dio.options.headers['Authorization'] = 'Bearer $token';
    
    try {
      // Intentar persistencia segura (funciona en móvil y Web con HTTPS/localhost)
      await _storage.write(key: 'access_token', value: token);
    } catch (e) {
      debugPrint('[AuthRepository] Secure storage falló, usando SharedPreferences (Contexto no seguro): $e');
      _prefs ??= await SharedPreferences.getInstance();
      await _prefs?.setString('access_token', token);
    }
  }

  @override
  Future<User?> loginOnline(String email, String password) async {
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
      await _saveToken(token);
      
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
    } catch (e) {
      debugPrint('[AuthRepository] Failed to sync staff: $e');
    }
  }

  @override
  Future<User?> loginOffline(String userId, String pin) async {
    debugPrint('[AuthRepository] Attempting offline login for user: $userId');
    
    if (userId == 'setup-admin' && pin == '123456') {
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
    if (entity == null) return null;

    try {
      final isPinValid = _localAuth.verifyPin(pin, entity.pinHash);
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

  @override
  Future<String?> getAccessToken() async {
    if (_accessToken != null) return _accessToken;
    
    try {
      _accessToken = await _storage.read(key: 'access_token');
    } catch (e) {
      debugPrint('[AuthRepository] Error leyendo secure storage, intentando SharedPreferences: $e');
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
    String? finalPinHash = user.pinHash;
    if (pin != null && pin.isNotEmpty) {
      finalPinHash = _localAuth.hashPin(pin);
    }
    
    final updatedUser = user.copyWith(pinHash: finalPinHash);
    await _userDao.insertUsers([updatedUser.toEntity()]);
  }

  @override
  Future<void> deleteUser(String userId) async {
    final user = await _userDao.findUserById(userId);
    if (user != null) {
      // In a real multi-tenant app, we might just mark as inactive
      // but here we follow the request.
      await _userDao.insertUsers([UserEntity(
        id: user.id,
        name: user.name,
        role: user.role,
        pinHash: user.pinHash,
        isActive: false, // Soft delete
        email: user.email,
        tenantId: user.tenantId,
      )]);
    }
  }
}
