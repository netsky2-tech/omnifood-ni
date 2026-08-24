import 'package:floor/floor.dart';
import '../../models/inventory/kardex_correction_entity.dart';

@dao
abstract class KardexCorrectionDao {
  @Query('SELECT * FROM kardex_corrections WHERE insumo_id = :insumoId ORDER BY created_at DESC')
  Future<List<KardexCorrectionEntity>> findCorrectionsByInsumoId(String insumoId);

  @Query('SELECT * FROM kardex_corrections WHERE lineage_hash = :lineageHash LIMIT 1')
  Future<KardexCorrectionEntity?> findCorrectionByLineageHash(String lineageHash);

  @Query('SELECT * FROM kardex_corrections WHERE id = :id')
  Future<KardexCorrectionEntity?> findCorrectionById(String id);

  @Query('SELECT * FROM kardex_corrections ORDER BY created_at ASC')
  Future<List<KardexCorrectionEntity>> findAllCorrections();

  @Insert(onConflict: OnConflictStrategy.abort)
  Future<void> insertCorrection(KardexCorrectionEntity correction);

  @transaction
  Future<void> recordCorrectionWithLineage(
    KardexCorrectionEntity correction,
  ) async {
    final existing = await findCorrectionByLineageHash(correction.lineageHash);
    if (existing == null) {
      await insertCorrection(correction);
    }
  }
}
