import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/migrations.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test(
    'migration50_51 adds delivery_owner, delivery_state, sale_id, sale_correlation_id and triggers',
    () async {
      final db = await openDatabase(
        inMemoryDatabasePath,
        version: 50,
        onCreate: (db, version) async {
          await db.execute('''
          CREATE TABLE invoices (
            id TEXT PRIMARY KEY,
            sync_status TEXT NOT NULL DEFAULT 'pending'
          )
        ''');
          await db.execute('''
          CREATE TABLE invoice_items (
            id TEXT PRIMARY KEY,
            invoice_id TEXT NOT NULL
          )
        ''');
          await db.execute('''
          CREATE TABLE inventory_movements (
            id TEXT PRIMARY KEY,
            insumo_id TEXT NOT NULL,
            type TEXT NOT NULL,
            quantity REAL NOT NULL,
            previous_stock REAL NOT NULL,
            new_stock REAL NOT NULL,
            timestamp TEXT NOT NULL,
            reason TEXT,
            user_id TEXT,
            unit_cost_nio REAL,
            source_document_type TEXT,
            source_document_id TEXT,
            origin_movement_id TEXT,
            origin_invoice_item_id TEXT,
            batch_deductions TEXT,
            estado_costeo INTEGER NOT NULL DEFAULT 30,
            intentos_count INTEGER NOT NULL DEFAULT 0,
            bloqueo_motivo TEXT,
            autorizado_por_usuario_id TEXT,
            fecha_autorizacion TEXT
          )
        ''');
          await db.execute('''
          CREATE TABLE inventory_movement_sync_state (
            movement_id TEXT PRIMARY KEY,
            sync_status TEXT NOT NULL,
            last_attempted_at TEXT,
            synced_at TEXT,
            last_error TEXT,
            terminal_id TEXT,
            flow_type TEXT,
            local_sequence INTEGER,
            idempotency_key TEXT,
            last_result_code TEXT
          )
        ''');

          // Existing invoice
          await db.execute(
            "INSERT INTO invoices (id, sync_status) VALUES ('inv-1', 'pending')",
          );
          await db.execute(
            "INSERT INTO invoices (id, sync_status) VALUES ('inv-synced', 'synced')",
          );
          await db.execute(
            "INSERT INTO invoice_items (id, invoice_id) VALUES ('item-1', 'inv-1')",
          );

          // Movement 1: Clearly linked sale
          await db.execute('''
          INSERT INTO inventory_movements (id, insumo_id, type, quantity, previous_stock, new_stock, timestamp, source_document_type, source_document_id)
          VALUES ('mov-sale-1', 'ins-1', 'sale', -1.0, 10.0, 9.0, '2026-09-01T10:00:00Z', 'SALE', 'inv-1')
        ''');

          // Movement 2: Clearly linked sale via origin_invoice_item_id
          await db.execute('''
          INSERT INTO inventory_movements (id, insumo_id, type, quantity, previous_stock, new_stock, timestamp, origin_invoice_item_id)
          VALUES ('mov-sale-2', 'ins-1', 'sale', -2.0, 9.0, 7.0, '2026-09-01T10:05:00Z', 'item-1')
        ''');

          // Movement 3: Contradictory sale (type is sale but source_document_type is PURCHASE)
          await db.execute('''
          INSERT INTO inventory_movements (id, insumo_id, type, quantity, previous_stock, new_stock, timestamp, source_document_type, source_document_id)
          VALUES ('mov-bad-1', 'ins-1', 'sale', -1.0, 7.0, 6.0, '2026-09-01T10:10:00Z', 'PURCHASE', 'purch-1')
        ''');

          // Movement 4: Ambiguous sale (type is sale but no invoice link and source_document_id points to non-existent invoice)
          await db.execute('''
          INSERT INTO inventory_movements (id, insumo_id, type, quantity, previous_stock, new_stock, timestamp, source_document_type, source_document_id)
          VALUES ('mov-bad-2', 'ins-1', 'sale', -1.0, 6.0, 5.0, '2026-09-01T10:15:00Z', 'SALE', 'non-existent-inv')
        ''');

          // Movement 5: Non-sale movement (purchase)
          await db.execute('''
          INSERT INTO inventory_movements (id, insumo_id, type, quantity, previous_stock, new_stock, timestamp, source_document_type, source_document_id)
          VALUES ('mov-purch-1', 'ins-1', 'purchase', 5.0, 5.0, 10.0, '2026-09-01T10:20:00Z', 'PURCHASE', 'p-1')
        ''');

          // Movement 6: Synced sale
          await db.execute('''
          INSERT INTO inventory_movements (id, insumo_id, type, quantity, previous_stock, new_stock, timestamp, source_document_type, source_document_id)
          VALUES ('mov-sale-synced', 'ins-1', 'sale', -1.0, 10.0, 9.0, '2026-09-01T10:25:00Z', 'SALE', 'inv-synced')
        ''');
          await db.execute('''
          INSERT INTO inventory_movement_sync_state (movement_id, sync_status)
          VALUES ('mov-sale-synced', 'synced')
        ''');
        },
      );

      // Run migration 50 -> 51
      await migration50_51.migrate(db);

      // Verify columns exist
      final columns = await db.rawQuery(
        'PRAGMA table_info(inventory_movements)',
      );
      final colNames = columns.map((c) => c['name'] as String).toSet();
      expect(
        colNames,
        containsAll([
          'delivery_owner',
          'delivery_state',
          'sale_id',
          'sale_correlation_id',
        ]),
      );

      // Verify classification & quarantine
      final mov1 = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-sale-1'],
      )).first;
      expect(mov1['delivery_owner'], 'SALE_SYNC');
      expect(mov1['delivery_state'], 'LOCAL_APPLIED');
      expect(mov1['sale_id'], 'inv-1');

      final mov2 = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-sale-2'],
      )).first;
      expect(mov2['delivery_owner'], 'SALE_SYNC');
      expect(mov2['delivery_state'], 'LOCAL_APPLIED');
      expect(mov2['sale_id'], 'inv-1');

      final movBad1 = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-bad-1'],
      )).first;
      expect(movBad1['delivery_owner'], 'SALE_SYNC');
      expect(movBad1['delivery_state'], 'QUARANTINED');

      final movBad2 = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-bad-2'],
      )).first;
      expect(movBad2['delivery_owner'], 'SALE_SYNC');
      expect(movBad2['delivery_state'], 'QUARANTINED');

      final movPurch = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-purch-1'],
      )).first;
      expect(movPurch['delivery_owner'], 'DOCUMENT_SYNC');
      expect(movPurch['delivery_state'], 'LOCAL_APPLIED');

      final movSynced = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-sale-synced'],
      )).first;
      expect(movSynced['delivery_owner'], 'SALE_SYNC');
      expect(movSynced['delivery_state'], 'CLOUD_ACKNOWLEDGED');

      // Verify triggers:
      // 1. Updating delivery_state to CLOUD_ACKNOWLEDGED succeeds
      await db.update(
        'inventory_movements',
        {'delivery_state': 'CLOUD_ACKNOWLEDGED'},
        where: 'id = ?',
        whereArgs: ['mov-sale-1'],
      );
      final updatedMov1 = (await db.query(
        'inventory_movements',
        where: 'id = ?',
        whereArgs: ['mov-sale-1'],
      )).first;
      expect(updatedMov1['delivery_state'], 'CLOUD_ACKNOWLEDGED');

      // 2. Updating core fields (e.g. quantity) fails / throws DatabaseException
      expect(
        () => db.update(
          'inventory_movements',
          {'quantity': -99.0},
          where: 'id = ?',
          whereArgs: ['mov-sale-1'],
        ),
        throwsA(isA<DatabaseException>()),
      );

      // 3. Deleting movement fails / throws DatabaseException
      expect(
        () => db.delete(
          'inventory_movements',
          where: 'id = ?',
          whereArgs: ['mov-sale-1'],
        ),
        throwsA(isA<DatabaseException>()),
      );

      await db.close();
    },
  );
}
