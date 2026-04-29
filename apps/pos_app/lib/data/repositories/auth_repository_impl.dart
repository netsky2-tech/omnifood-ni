import '../../domain/models/user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../daos/user_dao.dart';
import '../services/local_auth_service.dart';
import '../mappers/user_mapper.dart';
import 'package:dio/dio.dart'; // Assuming Dio for API

class AuthRepositoryImpl implements AuthRepository {
  final UserDao _userDao;
  final LocalAuthService _localAuth;
  final Dio _dio;
  User? _currentUser;

  AuthRepositoryImpl(this._userDao, this._localAuth, this._dio);

  @override
  Future<User?> loginOnline(String email, String password) async {
    try {
      final response = await _dio.post('/identity/login', data: {
        'email': email,
        'pass': password,
      });
      
      final user = User.fromJson(response.data['user']);
      // final token = response.data['access_token'];
      
      // Save token securely (omitted for brevity, use flutter_secure_storage)
      _currentUser = user;
      
      // Sync staff after successful login
      await syncStaff();
      
      return user;
    } catch (e) {
      return null;
    }
  }

  @override
  Future<void> syncStaff() async {
    try {
      final response = await _dio.get('/identity/staff');
      final List<dynamic> staffJson = response.data;
      
      final users = staffJson.map((json) => User.fromJson(json)).toList();
      final entities = users.map((u) => u.toEntity()).toList();
      
      await _userDao.deleteAllUsers();
      await _userDao.insertUsers(entities);
    } catch (e) {
      // Log error or handle offline
    }
  }

  @override
  Future<User?> loginOffline(String userId, String pin) async {
    final entity = await _userDao.findUserById(userId);
    if (entity != null && _localAuth.verifyPin(pin, entity.pinHash)) {
      _currentUser = entity.toDomain();
      return _currentUser;
    }
    return null;
  }

  @override
  Future<User?> getCurrentUser() async {
    return _currentUser;
  }

  @override
  Future<void> logout() async {
    _currentUser = null;
    // Clear tokens
  }
}
