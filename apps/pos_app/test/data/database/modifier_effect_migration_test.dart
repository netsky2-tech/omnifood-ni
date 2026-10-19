import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// R28 — the local migration 78→79: the modifier option's INVENTORY effect
/// and the invoice line's DEVIATION RECORD.
///
/// Two properties are load-bearing:
///  1. The effect columns are NULLABLE and default to the price-only
///     behaviour, so a terminal that receives a catalogue WITHOUT the effect
///     (an older backend) keeps behaving exactly as before.
///  2. The line's DEVIATION columns are nullable too: the identity of the
///     sold option was never stored, so there is nothing to reconstruct, and
///     inventing it would put a fiction in a fiscal record.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test(
    'migration78_79 adds the effect columns to modifier_options and the deviation columns to invoice_item_modifiers',
    () async {
      final db = await openDatabase(
        inMemoryDatabasePath,
        version: 78,
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE modifier_options (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              name TEXT NOT NULL,
              price_delta REAL NOT NULL,
              is_default INTEGER NOT NULL,
              sort_order INTEGER NOT NULL,
              is_active INTEGER NOT NULL
            )
          ''');
          await db.execute('''
            CREATE TABLE invoice_item_modifiers (
              id TEXT PRIMARY KEY,
              invoice_item_id TEXT NOT NULL,
              name TEXT NOT NULL,
              extra_price REAL NOT NULL,
              quantity INTEGER NOT NULL
            )
          ''');
        },
      );

      await migration78_79.migrate(db);

      final optionColumns = await db.rawQuery('PRAGMA table_info(modifier_options)');
      final optionColumnNames =
          optionColumns.map((c) => c['name'] as String).toSet();
      expect(optionColumnNames, contains('inventory_effect'));
      expect(optionColumnNames, contains('effect_insumo_id'));
      expect(optionColumnNames, contains('effect_target_insumo_id'));
      expect(optionColumnNames, contains('effect_quantity'));
      expect(optionColumnNames, contains('effect_factor'));

      final itemModifierColumns =
          await db.rawQuery('PRAGMA table_info(invoice_item_modifiers)');
      final itemModifierColumnNames =
          itemModifierColumns.map((c) => c['name'] as String).toSet();
      expect(itemModifierColumnNames, contains('option_id'));
      expect(itemModifierColumnNames, contains('group_id'));
      expect(itemModifierColumnNames, contains('inventory_effect'));
      expect(itemModifierColumnNames, contains('effect_insumo_id'));
      expect(itemModifierColumnNames, contains('effect_target_insumo_id'));
      expect(itemModifierColumnNames, contains('effect_quantity'));
      expect(itemModifierColumnNames, contains('effect_factor'));

      await db.close();
    },
  );

  test(
    'the effect defaults to NONE and the deviation columns stay NULL for the existing rows',
    () async {
      final db = await openDatabase(
        inMemoryDatabasePath,
        version: 78,
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE modifier_options (
              id TEXT PRIMARY KEY,
              group_id TEXT NOT NULL,
              name TEXT NOT NULL,
              price_delta REAL NOT NULL,
              is_default INTEGER NOT NULL,
              sort_order INTEGER NOT NULL,
              is_active INTEGER NOT NULL
            )
          ''');
          await db.execute('''
            CREATE TABLE invoice_item_modifiers (
              id TEXT PRIMARY KEY,
              invoice_item_id TEXT NOT NULL,
              name TEXT NOT NULL,
              extra_price REAL NOT NULL,
              quantity INTEGER NOT NULL
            )
          ''');
          await db.insert('modifier_options', {
            'id': 'opt-1',
            'group_id': 'grp-1',
            'name': 'Entera',
            'price_delta': 5.0,
            'is_default': 1,
            'sort_order': 0,
            'is_active': 1,
          });
          await db.insert('invoice_item_modifiers', {
            'id': 'row-1',
            'invoice_item_id': 'line-1',
            'name': 'Entera',
            'extra_price': 5.0,
            'quantity': 1,
          });
        },
      );

      await migration78_79.migrate(db);

      // The existing option reads as price-only: the behaviour before R28.
      final option = await db.query('modifier_options', where: 'id = ?', whereArgs: ['opt-1']);
      expect((option.first['inventory_effect'] as String), 'NONE');
      expect(option.first['effect_insumo_id'], isNull);
      expect(option.first['effect_quantity'], isNull);

      // The existing line carries no deviation: nothing is invented.
      final row = await db.query('invoice_item_modifiers', where: 'id = ?', whereArgs: ['row-1']);
      expect(row.first['option_id'], isNull);
      expect(row.first['inventory_effect'], isNull);
      expect(row.first['effect_quantity'], isNull);
      // The historical fact is untouched.
      expect(row.first['name'], 'Entera');
      expect(row.first['extra_price'], 5.0);
      expect(row.first['quantity'], 1);

      await db.close();
    },
  );
}
