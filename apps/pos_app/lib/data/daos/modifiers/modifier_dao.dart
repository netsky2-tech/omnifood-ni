import 'package:floor/floor.dart';
import '../../models/modifiers/modifier_group_entity.dart';
import '../../models/modifiers/modifier_option_entity.dart';
import '../../models/modifiers/category_modifier_group_entity.dart';
import '../../models/modifiers/product_modifier_group_entity.dart';

@dao
abstract class ModifierDao {
  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertModifierGroups(List<ModifierGroupEntity> groups);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertModifierOptions(List<ModifierOptionEntity> options);

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertCategoryModifierGroups(
    List<CategoryModifierGroupEntity> attachments,
  );

  @Insert(onConflict: OnConflictStrategy.replace)
  Future<void> insertProductModifierGroups(
    List<ProductModifierGroupEntity> attachments,
  );

  @Query('DELETE FROM modifier_groups')
  Future<void> deleteAllModifierGroups();

  @Query('DELETE FROM modifier_options')
  Future<void> deleteAllModifierOptions();

  @Query('DELETE FROM category_modifier_groups')
  Future<void> deleteAllCategoryModifierGroups();

  @Query('DELETE FROM product_modifier_groups')
  Future<void> deleteAllProductModifierGroups();

  /// Replaces the whole modifier mirror inside ONE transaction: DELETE all
  /// four tables, then INSERT the given rows. The cloud delta is a FULL
  /// snapshot per type, so replace-all is what propagates removals — the
  /// backend hard-DELETEs attachment rows on detach, meaning an incremental
  /// read could never see a removal.
  ///
  /// Positional arguments are mandatory for Floor `@transaction` methods in
  /// this project; named arguments break generated `.g.dart` code.
  @transaction
  Future<void> replaceAllModifierData(
    List<ModifierGroupEntity> groups,
    List<ModifierOptionEntity> options,
    List<CategoryModifierGroupEntity> categoryAttachments,
    List<ProductModifierGroupEntity> productAttachments,
  ) async {
    await deleteAllModifierOptions();
    await deleteAllModifierGroups();
    await deleteAllCategoryModifierGroups();
    await deleteAllProductModifierGroups();
    await insertModifierGroups(groups);
    await insertModifierOptions(options);
    await insertCategoryModifierGroups(categoryAttachments);
    await insertProductModifierGroups(productAttachments);
  }

  @Query(
    'SELECT * FROM modifier_groups ORDER BY sort_order ASC, name ASC, id ASC',
  )
  Future<List<ModifierGroupEntity>> getAllModifierGroups();

  @Query(
    'SELECT * FROM modifier_options ORDER BY sort_order ASC, name ASC, id ASC',
  )
  Future<List<ModifierOptionEntity>> getAllModifierOptions();

  @Query(
    'SELECT * FROM category_modifier_groups '
    'WHERE catalog_value_id = :catalogValueId '
    'ORDER BY sort_order ASC, id ASC',
  )
  Future<List<CategoryModifierGroupEntity>> getCategoryAttachmentsByCatalogValue(
    String catalogValueId,
  );

  @Query(
    'SELECT * FROM product_modifier_groups '
    'WHERE product_id = :productId '
    'ORDER BY sort_order ASC, id ASC',
  )
  Future<List<ProductModifierGroupEntity>> getProductAttachmentsByProduct(
    String productId,
  );

  @Query('SELECT * FROM category_modifier_groups ORDER BY sort_order ASC, id ASC')
  Future<List<CategoryModifierGroupEntity>> getAllCategoryModifierGroups();

  @Query('SELECT * FROM product_modifier_groups ORDER BY sort_order ASC, id ASC')
  Future<List<ProductModifierGroupEntity>> getAllProductModifierGroups();
}
