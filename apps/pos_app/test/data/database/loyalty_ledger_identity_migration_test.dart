import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Covers the Loyalty ledger identity migration (tracker T2b, arch §5.3/§9.3).
///
/// The migration is exercised directly against a database at the previous
/// version, which is how this app covers every other migration. The point of
/// the assertions is that ledger integrity is a SCHEMA property: a duplicated
/// earn/redeem/idempotency key must be rejected by the database itself —
/// offline included — and a drifted same-named index must never silently
/// no-op the identity into nothing.
void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  /// Minimal pre-migration ledger shape: only the columns the migration and
  /// its triggers/indexes touch. Pre-V1 rows carry NULL `transaction_type`
  /// (the legacy/transitional namespace) and stay permitted.
  Future<Database> openAt70({Future<void> Function(Database db)? seed}) async {
    final directory = await Directory.systemTemp.createTemp('t2b_');
    return openDatabase(
      '${directory.path}/ledger.db',
      version: 70,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE customer_point_transactions (
            id TEXT PRIMARY KEY,
            customer_id TEXT NOT NULL,
            ticket_id TEXT,
            loyalty_program_id TEXT,
            transaction_type TEXT,
            reversal_of_transaction_id TEXT,
            idempotency_key TEXT,
            units INTEGER,
            origin TEXT
          )
        ''');
        if (seed != null) {
          await seed(db);
        }
      },
    );
  }

  Future<void> insertRow(
    Database db, {
    required String id,
    String? type,
    String? ticketId,
    String? programId,
    String? reversalOf,
    String? idempotencyKey,
    int? units,
    String? origin,
  }) async {
    await db.insert('customer_point_transactions', {
      'id': id,
      'customer_id': 'cust-1',
      'transaction_type': type,
      'ticket_id': ticketId,
      'loyalty_program_id': programId,
      'reversal_of_transaction_id': reversalOf,
      'idempotency_key': idempotencyKey,
      'units': units,
      'origin': origin,
    });
  }

  group('migration70_71 — ledger identities', () {
    test('creates the four partial unique indexes and the shape triggers',
        () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      final indexes = await db.rawQuery(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND "
        "tbl_name='customer_point_transactions'",
      );
      final names = indexes.map((row) => row['name'] as String).toSet();
      for (final expected in [
        'uq_loyalty_tx_idempotency',
        'uq_loyalty_earn_ticket_program',
        'uq_loyalty_redeem_ticket',
        'uq_loyalty_reversal_original',
      ]) {
        expect(names, contains(expected),
            reason: '$expected must exist after the migration');
      }
      final idempotency = indexes.singleWhere(
        (row) => row['name'] == 'uq_loyalty_tx_idempotency',
      );
      expect(idempotency['sql'], contains('WHERE idempotency_key IS NOT NULL'));

      final triggers = await db.rawQuery(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND "
        "tbl_name='customer_point_transactions'",
      );
      final triggerNames = triggers.map((row) => row['name'] as String).toSet();
      expect(triggerNames, contains('trg_customer_point_transactions_type_semantics_insert'));
      expect(triggerNames, contains('trg_customer_point_transactions_type_semantics_update'));

      await db.close();
    });

    test('rejects a second EARN for the same ticket and program', () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db,
          id: 'a1',
          type: 'earn',
          ticketId: 'tkt-1',
          programId: 'prog-1',
          idempotencyKey: 'ka1',
          units: 10);
      await expectLater(
        insertRow(db,
            id: 'a2',
            type: 'earn',
            ticketId: 'tkt-1',
            programId: 'prog-1',
            idempotencyKey: 'ka2',
            units: 10),
        throwsA(anything),
      );
      // A different ticket or program is a different earn — allowed.
      await insertRow(db,
          id: 'a3',
          type: 'earn',
          ticketId: 'tkt-2',
          programId: 'prog-1',
          idempotencyKey: 'ka3',
          units: 10);
      await insertRow(db,
          id: 'a4',
          type: 'earn',
          ticketId: 'tkt-1',
          programId: 'prog-2',
          idempotencyKey: 'ka4',
          units: 10);

      await db.close();
    });

    test('type matching is case-insensitive (backend enum vs spec forms)',
        () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db,
          id: 'a1',
          type: 'earn',
          ticketId: 'tkt-1',
          programId: 'prog-1',
          idempotencyKey: 'kc1',
          units: 10);
      await expectLater(
        insertRow(db,
            id: 'a2',
            type: 'EARN',
            ticketId: 'tkt-1',
            programId: 'prog-1',
            idempotencyKey: 'ka2',
            units: 10),
        throwsA(anything),
      );

      await db.close();
    });

    test('rejects a second REDEEM for the same ticket', () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db, id: 'r1',
          type: 'redeem',
          ticketId: 'tkt-1',
          idempotencyKey: 'kr1',
          units: -50);
      await expectLater(
        insertRow(db, id: 'r2',
            type: 'redeem',
            ticketId: 'tkt-1',
            idempotencyKey: 'kr2',
            units: -60),
        throwsA(anything),
      );

      await db.close();
    });

    test('rejects a second REVERSAL of the same original transaction',
        () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db, id: 'v1', type: 'reversal', reversalOf: 'orig-1', idempotencyKey: 'kv1');
      await expectLater(
        insertRow(db, id: 'v2', type: 'reversal', reversalOf: 'orig-1', idempotencyKey: 'kv2'),
        throwsA(anything),
      );

      await db.close();
    });

    test('rejects a duplicate idempotency key', () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db, id: 'i1', idempotencyKey: 'key-1');
      await expectLater(
        insertRow(db, id: 'i2', idempotencyKey: 'key-1'),
        throwsA(anything),
      );
      // A NULL key carries no idempotency claim: multiple NULLs stay allowed.
      await insertRow(db, id: 'i3');
      await insertRow(db, id: 'i4');

      await db.close();
    });

    test('NULL-type rows are the legacy namespace: same ticket, no conflict',
        () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db, id: 'l1', ticketId: 'tkt-1', programId: 'prog-1');
      await insertRow(db, id: 'l2', ticketId: 'tkt-1', programId: 'prog-1');

      await db.close();
    });

    test('the shape trigger aborts an EARN without ticket or program',
        () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await expectLater(
        insertRow(db, id: 's1', type: 'earn'),
        throwsA(
          predicate((e) =>
              e.toString().contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION')),
        ),
      );
      await expectLater(
        insertRow(db, id: 's2', type: 'redeem'),
        throwsA(
          predicate((e) =>
              e.toString().contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION')),
        ),
      );
      await expectLater(
        insertRow(db, id: 's3', type: 'reversal'),
        throwsA(
          predicate((e) =>
              e.toString().contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION')),
        ),
      );

      await db.close();
    });

    test('an UPDATE that breaks the key semantics is aborted by the trigger',
        () async {
      final db = await openAt70();
      await migration70_71.migrate(db);

      await insertRow(db,
          id: 'u1',
          type: 'earn',
          ticketId: 'tkt-1',
          programId: 'prog-1',
          idempotencyKey: 'ku1',
          units: 10);
      await expectLater(
        db.update(
          'customer_point_transactions',
          {'ticket_id': null},
          where: 'id = ?',
          whereArgs: ['u1'],
        ),
        throwsA(
          predicate((e) =>
              e.toString().contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION')),
        ),
      );

      await db.close();
    });

    test('fail-closed upgrade: pre-existing duplicate earn rows abort with a '
        'readable duplicate-identity report and delete nothing', () async {
      final db = await openAt70(seed: (seedDb) async {
        await seedDb.insert('customer_point_transactions', {
          'id': 'dup-1',
          'customer_id': 'cust-1',
          'transaction_type': 'earn',
          'ticket_id': 'tkt-1',
          'loyalty_program_id': 'prog-1',
          'idempotency_key': 'kd-1',
          'units': 10,
        });
        await seedDb.insert('customer_point_transactions', {
          'id': 'dup-2',
          'customer_id': 'cust-1',
          'transaction_type': 'earn',
          'ticket_id': 'tkt-1',
          'loyalty_program_id': 'prog-1',
          'idempotency_key': 'kd-2',
          'units': 10,
        });
      });

      await expectLater(
        migration70_71.migrate(db),
        throwsA(
          predicate((e) =>
              e.toString().contains('LOYALTY_LEDGER_DUPLICATE_IDENTITY') &&
              e.toString().contains('dup-1') &&
              e.toString().contains('dup-2')),
        ),
      );
      // Fail closed never deletes or rewrites the conflicting rows.
      final rows = await db.query('customer_point_transactions');
      expect(rows, hasLength(2));

      await db.close();
    });

    test('fail-closed upgrade: pre-existing shape violations abort with the '
        'semantics report', () async {
      final db = await openAt70(seed: (seedDb) async {
        await seedDb.insert('customer_point_transactions', {
          'id': 'bad-1',
          'customer_id': 'cust-1',
          'transaction_type': 'earn',
        });
      });

      await expectLater(
        migration70_71.migrate(db),
        throwsA(predicate(
            (e) => e.toString().contains('LOYALTY_LEDGER_TYPE_SEMANTICS'))),
      );

      await db.close();
    });

    test('drift guard: a same-named index on ANOTHER relation aborts the '
        'migration instead of silently no-oping', () async {
      final db = await openAt70(seed: (seedDb) async {
        await seedDb.execute(
          'CREATE TABLE other_table (idempotency_key TEXT)',
        );
        await seedDb.execute(
          'CREATE UNIQUE INDEX uq_loyalty_tx_idempotency '
          'ON other_table (idempotency_key)',
        );
      });

      await expectLater(
        migration70_71.migrate(db),
        throwsA(predicate((e) =>
            e.toString().contains('LOYALTY_LEDGER_INDEX_DRIFT') &&
            e.toString().contains('other_table'))),
      );

      await db.close();
    });

    test('drift guard: a same-named index on the ledger with a DIFFERENT '
        'definition aborts the migration', () async {
      final db = await openAt70(seed: (seedDb) async {
        await seedDb.execute(
          'CREATE UNIQUE INDEX uq_loyalty_tx_idempotency '
          'ON customer_point_transactions (idempotency_key)',
        );
      });

      await expectLater(
        migration70_71.migrate(db),
        throwsA(predicate((e) =>
            e.toString().contains('LOYALTY_LEDGER_INDEX_DRIFT') &&
            e.toString().contains('different definition'))),
      );

      await db.close();
    });

    group('residual §9.3 shape rules (follow-up #4, option A)', () {
      test('declared EARN requires units > 0', () async {
        final db = await openAt70();
        await migration70_71.migrate(db);

        await insertRow(db,
            id: 'ru1',
            type: 'earn',
            ticketId: 'tkt-1',
            programId: 'prog-1',
            idempotencyKey: 'k1',
            units: 20);
        await expectLater(
          insertRow(db,
              id: 'ru2',
              type: 'earn',
              ticketId: 'tkt-2',
              programId: 'prog-1',
              idempotencyKey: 'k2',
              units: 0),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );
        await expectLater(
          insertRow(db,
              id: 'ru3',
              type: 'earn',
              ticketId: 'tkt-3',
              programId: 'prog-1',
              idempotencyKey: 'k3',
              units: -5),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );
        await expectLater(
          insertRow(db,
              id: 'ru4',
              type: 'earn',
              ticketId: 'tkt-4',
              programId: 'prog-1',
              idempotencyKey: 'k4'),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );

        await db.close();
      });

      test('declared REDEEM requires units < 0', () async {
        final db = await openAt70();
        await migration70_71.migrate(db);

        await insertRow(db,
            id: 'rv1',
            type: 'redeem',
            ticketId: 'tkt-1',
            idempotencyKey: 'k1',
            units: -50);
        await expectLater(
          insertRow(db,
              id: 'rv2',
              type: 'redeem',
              ticketId: 'tkt-2',
              idempotencyKey: 'k2',
              units: 30),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );

        await db.close();
      });

      test('REVERSAL may mirror a legacy row (NULL units) but never a zero '
          'delta', () async {
        final db = await openAt70();
        await migration70_71.migrate(db);

        // units NULL is the legacy-mirror case (reversing a pre-V1 row).
        await insertRow(db,
            id: 'rx1',
            type: 'reversal',
            reversalOf: 'orig-1',
            idempotencyKey: 'k1');
        await expectLater(
          insertRow(db,
              id: 'rx2',
              type: 'reversal',
              reversalOf: 'orig-2',
              idempotencyKey: 'k2',
              units: 0),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );

        await db.close();
      });

      test('a declared row must carry an idempotency key', () async {
        final db = await openAt70();
        await migration70_71.migrate(db);

        await expectLater(
          insertRow(db,
              id: 'rk1',
              type: 'earn',
              ticketId: 'tkt-1',
              programId: 'prog-1',
              units: 10),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );
        // legacy rows keep needing nothing
        await insertRow(db, id: 'rk2', ticketId: 'tkt-2');

        await db.close();
      });

      test('origin, when present, is the POS/CLOUD domain', () async {
        final db = await openAt70();
        await migration70_71.migrate(db);

        await insertRow(db,
            id: 'ro1',
            type: 'earn',
            ticketId: 'tkt-1',
            programId: 'prog-1',
            idempotencyKey: 'k1',
            units: 10,
            origin: 'POS');
        await expectLater(
          insertRow(db,
              id: 'ro2',
              type: 'earn',
              ticketId: 'tkt-2',
              programId: 'prog-1',
              idempotencyKey: 'k2',
              units: 10,
              origin: 'IMPORT_SCRIPT'),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );

        await db.close();
      });

      test('a declared type outside the §9.3 domain is rejected (it would '
          'otherwise evade every shape rule)', () async {
        final db = await openAt70();
        await migration70_71.migrate(db);

        await expectLater(
          insertRow(db,
              id: 'td1',
              type: 'MILESTONE',
              ticketId: 'tkt-1',
              programId: 'prog-1',
              idempotencyKey: 'k1',
              units: 10),
          throwsA(predicate((e) => e
              .toString()
              .contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION'))),
        );
        // the NULL legacy namespace stays permitted
        await insertRow(db, id: 'td2', ticketId: 'tkt-2');

        await db.close();
      });

      test('fail-closed upgrade: pre-existing residual violations abort the '
          'migration with counts and sample ids', () async {
        final db = await openAt70(
          seed: (db) async {
            await insertRow(db,
                id: 'bad-1',
                type: 'earn',
                ticketId: 'tkt-1',
                programId: 'prog-1',
                idempotencyKey: 'k1',
                units: 0);
          },
        );

        await expectLater(
          migration70_71.migrate(db),
          throwsA(predicate((e) =>
              e.toString().contains('LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION') &&
              e.toString().contains('bad-1'))),
        );

        await db.close();
      });
    });

    test('parity: the fresh-install ensure helper produces the same schema '
        'as the migrated path', () async {
      final migrated = await openAt70();
      await migration70_71.migrate(migrated);

      final fresh = await openAt70();
      await ensureLoyaltyLedgerIdentitySchema(fresh);

      Future<Set<String>> schema(Database db) async {
        final objects = await db.rawQuery(
          "SELECT type, name FROM sqlite_master WHERE "
          "tbl_name='customer_point_transactions' AND "
          "((type='index' AND name LIKE 'uq_loyalty_%') OR type='trigger')",
        );
        return objects.map((row) => '${row['type']}:${row['name']}').toSet();
      }

      expect(await schema(fresh), await schema(migrated));

      // Behavioral parity: the fresh path rejects the same duplicates.
      await insertRow(fresh,
          id: 'p1',
          type: 'earn',
          ticketId: 'tkt-1',
          programId: 'prog-1',
          idempotencyKey: 'kp1',
          units: 10);
      await expectLater(
        insertRow(fresh,
            id: 'p2',
            type: 'earn',
            ticketId: 'tkt-1',
            programId: 'prog-1',
            idempotencyKey: 'kp2',
            units: 10),
        throwsA(anything),
      );

      await migrated.close();
      await fresh.close();
    });
  });
}
