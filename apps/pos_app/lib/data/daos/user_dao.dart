import 'package:floor/floor.dart';
import '../models/user_entity.dart';

@dao
abstract class UserDao {
  @Query('SELECT * FROM users WHERE is_active = 1')
  Future<List<UserEntity>> findAllActiveUsers();

  @Query('SELECT * FROM users')
  Future<List<UserEntity>> findAllUsers();

  @Query('SELECT * FROM users WHERE id = :id')
  Future<UserEntity?> findUserById(String id);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertUsers(List<UserEntity> users);

  @Query('DELETE FROM users')
  Future<void> deleteAllUsers();
}
