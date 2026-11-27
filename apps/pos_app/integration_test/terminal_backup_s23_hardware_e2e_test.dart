import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pos_app/data/services/backup/audit_chain_verifier.dart';
import 'package:pos_app/data/services/backup/terminal_backup_service.dart';
import 'package:sqflite/sqflite.dart';

/// Real Android Hardware E2E Runner for #526 (Scenario A — Dead Terminal Backup,
/// Encrypted Restore, B5 Replay Tripwire, AC-6 Double-Boot Monotonicity, and
/// B6 Audit Hash-Chain Verification on Samsung Galaxy S23 ARM64).
///
/// Build & run on attached Android device:
///   flutter build apk --debug -t integration_test/terminal_backup_s23_hardware_e2e_test.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb logcat -c && adb shell am start -n com.example.pos_app/.MainActivity
///   adb logcat -d -s flutter
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _HardwareE2E526App());
}

class _HardwareE2E526App extends StatefulWidget {
  const _HardwareE2E526App();

  @override
  State<_HardwareE2E526App> createState() => _HardwareE2E526AppState();
}

class _HardwareE2E526AppState extends State<_HardwareE2E526App> {
  final List<String> _logs = [];
  String _status = 'RUNNING';

  @override
  void initState() {
    super.initState();
    _runAll();
  }

  void _log(String msg) {
    // ignore: avoid_print
    print('[S23_E2E_526] $msg');
    if (mounted) {
      setState(() => _logs.add(msg));
    }
  }

  Future<void> _runAll() async {
    int passed = 0;
    const int total = 5;

    final docsDir = await getApplicationDocumentsDirectory();
    final workDir = Directory('${docsDir.path}/s23_e2e_526_${DateTime.now().millisecondsSinceEpoch}');
    await workDir.create(recursive: true);

    final liveDbPath = '${workDir.path}/live_terminal.db';
    final backupPath = '${workDir.path}/nhilos_s23_backup.nhilosbak';
    final replacementDbPath = '${workDir.path}/replacement_terminal.db';
    final service = TerminalBackupService();

    try {
      // Seed realistic Android SQLite database on device storage.
      final db = await openDatabase(
        liveDbPath,
        version: 86,
        onCreate: (d, _) async {
          await d.execute('CREATE TABLE local_configs (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          await d.execute('CREATE TABLE invoices (id TEXT PRIMARY KEY, invoice_number TEXT NOT NULL, is_canceled INTEGER NOT NULL DEFAULT 0, total REAL NOT NULL)');
          await d.execute('CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, sequence_no INTEGER NOT NULL, prev_hash TEXT NOT NULL, entry_hash TEXT NOT NULL)');
        },
      );
      await db.insert('local_configs', {'key': 'dgi_prefix', 'value': '001-001-01-'});
      await db.insert('local_configs', {'key': 'dgi_current_number', 'value': '8'});
      for (var i = 1; i <= 7; i++) {
        await db.insert('invoices', {
          'id': 's23-inv-$i',
          'invoice_number': '001-001-01-${i.toString().padLeft(8, '0')}',
          'is_canceled': 0,
          'total': 125.0 * i,
        });
      }
      await db.insert('audit_logs', {
        'device_id': 'S23-TERM-01',
        'user_id': 'owner-s23',
        'action': 'SALE_CREATED',
        'sequence_no': 1,
        'prev_hash': 'GENESIS',
        'entry_hash': 's23-hash-1',
      });
      await db.insert('audit_logs', {
        'device_id': 'S23-TERM-01',
        'user_id': 'owner-s23',
        'action': 'SALE_CREATED',
        'sequence_no': 2,
        'prev_hash': 's23-hash-1',
        'entry_hash': 's23-hash-2',
      });

      // TEST 1: Export encrypted .nhilosbak via real Android VACUUM INTO + AES-256/HMAC-SHA256
      final exported = await service.exportEncryptedBackup(
        sourceDb: db,
        destinationPath: backupPath,
        passphrase: 'S23BackupClave2026!',
        expectedSchemaVersion: 86,
      );
      await db.close();
      final raw = await File(backupPath).readAsString();
      if (exported.manifest.invoiceCount == 7 &&
          exported.manifest.dgiCurrentNumber == 8 &&
          exported.auditChainReport.isIntact &&
          !raw.contains('SQLite format 3')) {
        passed++;
        _log('PASS [1/5] B3/AC-8: Encrypted .nhilosbak exported on real Android storage (${exported.sizeBytes} bytes, 7 invoices, cursor=8, chain=INTACT)');
      } else {
        throw StateError('Test 1 failed: manifest=${exported.manifest.toJson()}');
      }

      // TEST 2: Simulate dead tablet wipe & atomic restore on replacement terminal
      await File(liveDbPath).delete();
      final staged = await service.stageRestoreFromBackup(
        backupFilePath: backupPath,
        passphrase: 'S23BackupClave2026!',
        targetDatabasePath: replacementDbPath,
        currentSchemaVersion: 86,
        cloudHighestSequence: 7,
      );
      final applied = await TerminalBackupService.applyPendingRestoreIfPresent(
        databasePath: replacementDbPath,
      );
      if (staged.auditChainReport.isIntact && applied != null) {
        final restoredDb = await openDatabase(replacementDbPath, readOnly: true);
        final cnt = (await restoredDb.rawQuery('SELECT COUNT(*) AS c FROM invoices')).first['c'] as int;
        final cursor = (await restoredDb.rawQuery("SELECT value FROM local_configs WHERE key = 'dgi_current_number'")).first['value'];
        final chain = await AuditChainVerifier.verifyDatabase(restoredDb);
        await restoredDb.close();
        if (cnt == 7 && cursor == '8' && chain.isIntact) {
          passed++;
          _log('PASS [2/5] AC-4/AC-8/AC-10: Dead-terminal wipe & atomic restore preserved 7 invoices, cursor=8 (>7), and INTACT audit chain');
        } else {
          throw StateError('Test 2 mismatch: cnt=$cnt cursor=$cursor intact=${chain.isIntact}');
        }
      } else {
        throw StateError('Test 2 staging/apply failed');
      }

      // TEST 3: B5 Replay Tripwire refuses stale restore when cloudHighestSequence = 12
      bool refusedReplay = false;
      try {
        await service.stageRestoreFromBackup(
          backupFilePath: backupPath,
          passphrase: 'S23BackupClave2026!',
          targetDatabasePath: '${workDir.path}/should_not_exist.db',
          currentSchemaVersion: 86,
          cloudHighestSequence: 12,
        );
      } on FiscalSequenceReplayRestoreException catch (e) {
        refusedReplay = e.message.contains('8') &&
            e.message.contains('12') &&
            e.message.contains('No facture');
      }
      if (refusedReplay &&
          !File('${workDir.path}/should_not_exist.db.pending_restore').existsSync()) {
        passed++;
        _log('PASS [3/5] B5/AC-1/AC-2/AC-3: Replay tripwire refused cursor 8 <= cloud 12 in Spanish with zero writes');
      } else {
        throw StateError('Test 3 B5 replay tripwire failed');
      }

      // TEST 4: AC-6 Double-boot monotonic cursor check on real Android SQLite
      final boot1 = await openDatabase(replacementDbPath);
      final c1 = (await boot1.rawQuery("SELECT value FROM local_configs WHERE key = 'dgi_current_number'")).first['value'];
      await boot1.close();
      final boot2 = await openDatabase(replacementDbPath);
      final c2 = (await boot2.rawQuery("SELECT value FROM local_configs WHERE key = 'dgi_current_number'")).first['value'];
      await boot2.close();
      if (c1 == '8' && c2 == '8') {
        passed++;
        _log('PASS [4/5] AC-6: Double-boot cursor remained monotonic at 8 (never reset to 1)');
      } else {
        throw StateError('Test 4 double-boot mismatch: c1=$c1 c2=$c2');
      }

      // TEST 5: Wrong passphrase fails closed with zero writes on real Android
      bool refusedBadPass = false;
      try {
        await service.stageRestoreFromBackup(
          backupFilePath: backupPath,
          passphrase: 'ClaveIncorrecta99',
          targetDatabasePath: '${workDir.path}/bad_pass.db',
          currentSchemaVersion: 86,
        );
      } on TerminalBackupException {
        refusedBadPass = true;
      }
      if (refusedBadPass &&
          !File('${workDir.path}/bad_pass.db.pending_restore').existsSync()) {
        passed++;
        _log('PASS [5/5] Crypto MAC: Wrong passphrase rejected fail-closed with zero writes');
      } else {
        throw StateError('Test 5 wrong passphrase did not fail closed');
      }

      _log('RESULT: $passed/$total ALL_TESTS_PASSED');
      if (mounted) setState(() => _status = 'ALL_TESTS_PASSED ($passed/$total)');
    } catch (e, st) {
      _log('FAILED: $e\n$st');
      if (mounted) setState(() => _status = 'FAILED: $e');
    } finally {
      if (await workDir.exists()) {
        await workDir.delete(recursive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: Text('#526 S23 E2E — $_status')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: _logs.map((l) => Text(l)).toList(),
        ),
      ),
    );
  }
}
