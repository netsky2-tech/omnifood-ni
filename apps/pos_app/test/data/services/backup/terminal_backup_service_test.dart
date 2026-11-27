import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/backup/audit_chain_verifier.dart';
import 'package:pos_app/data/services/backup/terminal_backup_service.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Future<Database> _createSeededFiscalDb(
  String dbPath, {
  int schemaVersion = 86,
  int invoiceCount = 3,
  int dgiCurrentNumber = 4,
  String dgiPrefix = '001-001-01-',
  bool breakAuditChain = false,
}) async {
  final db = await databaseFactoryFfi.openDatabase(
    dbPath,
    options: OpenDatabaseOptions(
      version: schemaVersion,
      onCreate: (d, _) async {
        await d.execute('''
          CREATE TABLE local_configs (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        ''');
        await d.execute('''
          CREATE TABLE invoices (
            id TEXT PRIMARY KEY,
            invoice_number TEXT NOT NULL,
            is_canceled INTEGER NOT NULL DEFAULT 0,
            total REAL NOT NULL
          )
        ''');
        await d.execute('''
          CREATE TABLE audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            sequence_no INTEGER NOT NULL,
            prev_hash TEXT NOT NULL,
            entry_hash TEXT NOT NULL
          )
        ''');
      },
    ),
  );

  await db.insert('local_configs', {'key': 'dgi_prefix', 'value': dgiPrefix});
  await db.insert(
    'local_configs',
    {'key': 'dgi_current_number', 'value': dgiCurrentNumber.toString()},
  );

  for (var i = 1; i <= invoiceCount; i++) {
    final numStr = i.toString().padLeft(8, '0');
    await db.insert('invoices', {
      'id': 'inv-$i',
      'invoice_number': '$dgiPrefix$numStr',
      'is_canceled': 0,
      'total': 100.0 * i,
    });
  }

  await db.insert('audit_logs', {
    'device_id': 'term-01',
    'user_id': 'owner-1',
    'action': 'SALE_CREATED',
    'sequence_no': 1,
    'prev_hash': 'GENESIS',
    'entry_hash': 'hash-1',
  });
  await db.insert('audit_logs', {
    'device_id': 'term-01',
    'user_id': 'owner-1',
    'action': 'SALE_CREATED',
    'sequence_no': 2,
    'prev_hash': breakAuditChain ? 'TAMPERED_PREV_HASH' : 'hash-1',
    'entry_hash': 'hash-2',
  });

  return db;
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('#526 B3/B5/B6: TerminalBackupService & AuditChainVerifier', () {
    test('exports encrypted .nhilosbak, stages restore, and swaps atomically preserving invoices and DGI counter', () async {
      final workDir = await Directory.systemTemp.createTemp('nhilos_526_test_');
      addTearDown(() async {
        if (await workDir.exists()) await workDir.delete(recursive: true);
      });

      final liveDbPath = '${workDir.path}/live_app_database.db';
      final backupPath = '${workDir.path}/terminal_backup.nhilosbak';
      final replacementDbPath = '${workDir.path}/replacement_app_database.db';

      final liveDb = await _createSeededFiscalDb(
        liveDbPath,
        invoiceCount: 5,
        dgiCurrentNumber: 6,
      );

      final service = TerminalBackupService(databaseFactory: databaseFactoryFfi);
      final exported = await service.exportEncryptedBackup(
        sourceDb: liveDb,
        destinationPath: backupPath,
        passphrase: 'ClaveSegura2026!',
        expectedSchemaVersion: 86,
      );
      await liveDb.close();

      expect(File(backupPath).existsSync(), isTrue);
      expect(exported.manifest.invoiceCount, 5);
      expect(exported.manifest.highestInvoiceSequence, 5);
      expect(exported.manifest.dgiCurrentNumber, 6);
      expect(exported.manifest.dgiPrefix, '001-001-01-');
      expect(exported.auditChainReport.isIntact, isTrue);

      // Verify ciphertext does not leak plaintext SQLite header.
      final rawText = await File(backupPath).readAsString();
      expect(rawText, isNot(contains('SQLite format 3')));

      // Stage restore on a fresh replacement terminal (cloud highest = 5, backup next = 6 -> ALLOWED).
      final staged = await service.stageRestoreFromBackup(
        backupFilePath: backupPath,
        passphrase: 'ClaveSegura2026!',
        targetDatabasePath: replacementDbPath,
        currentSchemaVersion: 86,
        cloudHighestSequence: 5,
      );
      expect(staged.auditChainReport.isIntact, isTrue);
      expect(File('$replacementDbPath.pending_restore').existsSync(), isTrue);

      // Apply before Floor opens AppDatabase.
      final applied = await TerminalBackupService.applyPendingRestoreIfPresent(
        databasePath: replacementDbPath,
      );
      expect(applied, isNotNull);
      expect(applied!.manifest.invoiceCount, 5);
      expect(applied.auditChainReport['status'], 'INTACT');
      expect(File('$replacementDbPath.pending_restore').existsSync(), isFalse);

      // Open restored DB and verify all 5 invoices + cursor 6 survived intact.
      final restoredDb = await databaseFactoryFfi.openDatabase(
        replacementDbPath,
        options: OpenDatabaseOptions(readOnly: true),
      );
      try {
        final invRows = await restoredDb.rawQuery('SELECT COUNT(*) AS c FROM invoices');
        expect((invRows.first['c'] as num).toInt(), 5);
        final cursorRows = await restoredDb.rawQuery(
          "SELECT value FROM local_configs WHERE key = 'dgi_current_number'",
        );
        expect(cursorRows.first['value'], '6');
      } finally {
        await restoredDb.close();
      }
    });

    test('fails closed on wrong passphrase or tampered ciphertext with zero writes', () async {
      final workDir = await Directory.systemTemp.createTemp('nhilos_526_tamper_');
      addTearDown(() async {
        if (await workDir.exists()) await workDir.delete(recursive: true);
      });

      final liveDbPath = '${workDir.path}/live.db';
      final backupPath = '${workDir.path}/backup.nhilosbak';
      final targetDbPath = '${workDir.path}/target.db';

      final liveDb = await _createSeededFiscalDb(liveDbPath);
      final service = TerminalBackupService(databaseFactory: databaseFactoryFfi);
      await service.exportEncryptedBackup(
        sourceDb: liveDb,
        destinationPath: backupPath,
        passphrase: 'ClaveSegura2026!',
      );
      await liveDb.close();

      // Wrong passphrase
      await expectLater(
        service.stageRestoreFromBackup(
          backupFilePath: backupPath,
          passphrase: 'ClaveIncorrecta99',
          targetDatabasePath: targetDbPath,
          currentSchemaVersion: 86,
        ),
        throwsA(isA<TerminalBackupException>()),
      );
      expect(File('$targetDbPath.pending_restore').existsSync(), isFalse);

      // Tamper with ciphertext
      final env = jsonDecode(await File(backupPath).readAsString())
          as Map<String, dynamic>;
      final cipher = env['ciphertext'] as String;
      env['ciphertext'] = '${cipher.substring(0, cipher.length - 4)}AAAA';
      await File(backupPath).writeAsString(jsonEncode(env));

      await expectLater(
        service.stageRestoreFromBackup(
          backupFilePath: backupPath,
          passphrase: 'ClaveSegura2026!',
          targetDatabasePath: targetDbPath,
          currentSchemaVersion: 86,
        ),
        throwsA(isA<TerminalBackupException>()),
      );
      expect(File('$targetDbPath.pending_restore').existsSync(), isFalse);
    });

    test('B5 tripwire (AC-1/AC-2/AC-3): refuses restore when backup sequence <= cloudHighestSequence without mutating DB', () async {
      final workDir = await Directory.systemTemp.createTemp('nhilos_526_b5_');
      addTearDown(() async {
        if (await workDir.exists()) await workDir.delete(recursive: true);
      });

      final liveDbPath = '${workDir.path}/live.db';
      final backupPath = '${workDir.path}/stale_backup.nhilosbak';
      final targetDbPath = '${workDir.path}/target.db';

      final liveDb = await _createSeededFiscalDb(
        liveDbPath,
        invoiceCount: 3,
        dgiCurrentNumber: 4,
      );
      final service = TerminalBackupService(databaseFactory: databaseFactoryFfi);
      await service.exportEncryptedBackup(
        sourceDb: liveDb,
        destinationPath: backupPath,
        passphrase: 'ClaveSegura2026!',
      );
      await liveDb.close();

      // Cloud already holds invoice 10; restoring backup with next=4 must fail loudly.
      await expectLater(
        service.stageRestoreFromBackup(
          backupFilePath: backupPath,
          passphrase: 'ClaveSegura2026!',
          targetDatabasePath: targetDbPath,
          currentSchemaVersion: 86,
          cloudHighestSequence: 10,
        ),
        throwsA(
          isA<FiscalSequenceReplayRestoreException>()
              .having((e) => e.message, 'message', contains('4'))
              .having((e) => e.message, 'message', contains('10'))
              .having((e) => e.message, 'message', contains('No facture')),
        ),
      );
      expect(File('$targetDbPath.pending_restore').existsSync(), isFalse);
    });

    test('B6 (AC-10): AuditChainVerifier reports broken hash chain explicitly (never silent)', () async {
      final workDir = await Directory.systemTemp.createTemp('nhilos_526_b6_');
      addTearDown(() async {
        if (await workDir.exists()) await workDir.delete(recursive: true);
      });

      final dbPath = '${workDir.path}/broken_chain.db';
      final backupPath = '${workDir.path}/broken_chain.nhilosbak';
      final db = await _createSeededFiscalDb(dbPath, breakAuditChain: true);

      final service = TerminalBackupService(databaseFactory: databaseFactoryFfi);
      final exported = await service.exportEncryptedBackup(
        sourceDb: db,
        destinationPath: backupPath,
        passphrase: 'ClaveSegura2026!',
      );
      await db.close();

      expect(exported.auditChainReport.isIntact, isFalse);
      expect(exported.auditChainReport.statusCode, 'BROKEN_STREAMS_DETECTED');
      expect(exported.auditChainReport.issues.single.reason, 'prev_hash_mismatch');
    });
  });
}
