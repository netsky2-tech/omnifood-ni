import 'package:floor/floor.dart';
import '../../models/sales/cashier_session_entity.dart';

@dao
abstract class CashierSessionDao {
  @Query('SELECT * FROM cashier_sessions WHERE id = :id')
  Future<CashierSessionEntity?> getSessionById(String id);

  @Query('SELECT * FROM cashier_sessions WHERE is_closed = 0 LIMIT 1')
  Future<CashierSessionEntity?> getActiveSession();

  /// B1a-4 (D-11): open session scoped to BOTH the requesting user and the
  /// terminal. The unscoped `getActiveSession()` would let two concurrent
  /// registers bind a cashier's invoice to another cashier's shift. Newest
  /// open session wins as a deterministic tie-breaker.
  @Query(
    'SELECT * FROM cashier_sessions '
    'WHERE is_closed = 0 AND user_id = :userId AND terminal_id = :terminalId '
    'ORDER BY opened_at DESC LIMIT 1',
  )
  Future<CashierSessionEntity?> getActiveSessionForUserAndTerminal(
    String userId,
    String terminalId,
  );

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertSession(CashierSessionEntity session);

  @Update(onConflict: OnConflictStrategy.replace)
  Future<void> updateSession(CashierSessionEntity session);

  @Query('SELECT * FROM cashier_sessions ORDER BY opened_at DESC')
  Future<List<CashierSessionEntity>> getAllSessions();

  @Query('SELECT COUNT(*) FROM cashier_sessions WHERE is_closed = 1')
  Future<int?> countClosedSessions();
}
