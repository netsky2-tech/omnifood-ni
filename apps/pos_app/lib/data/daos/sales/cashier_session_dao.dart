import 'package:floor/floor.dart';
import '../../models/sales/cashier_session_entity.dart';

@dao
abstract class CashierSessionDao {
  @Query('SELECT * FROM cashier_sessions WHERE is_closed = 0 LIMIT 1')
  Future<CashierSessionEntity?> getActiveSession();

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertSession(CashierSessionEntity session);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateSession(CashierSessionEntity session);

  @Query('SELECT * FROM cashier_sessions ORDER BY opened_at DESC')
  Future<List<CashierSessionEntity>> getAllSessions();
}
