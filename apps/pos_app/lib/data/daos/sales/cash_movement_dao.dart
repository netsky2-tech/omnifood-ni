import 'package:floor/floor.dart';
import '../../models/sales/cash_movement_entity.dart';

@dao
abstract class CashMovementDao {
  @Query('SELECT * FROM cash_movements WHERE id = :id')
  Future<CashMovementEntity?> getMovementById(String id);

  @Query('SELECT * FROM cash_movements WHERE shift_id = :shiftId ORDER BY timestamp ASC')
  Future<List<CashMovementEntity>> getMovementsByShiftId(String shiftId);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertMovement(CashMovementEntity movement);

  @Query('SELECT * FROM cash_movements WHERE sync_status = :status')
  Future<List<CashMovementEntity>> getMovementsBySyncStatus(String status);

  @Query('UPDATE cash_movements SET sync_status = :status WHERE id = :id')
  Future<void> updateSyncStatus(String id, String status);
}
