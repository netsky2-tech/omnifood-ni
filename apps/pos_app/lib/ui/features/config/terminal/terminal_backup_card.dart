import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

import '../../../../data/database/app_database.dart';
import '../../../../data/services/backup/terminal_backup_service.dart';
import '../../../../domain/models/user.dart';
import '../../../../domain/repositories/audit_repository.dart';
import '../../../../domain/repositories/auth_repository.dart';
import '../config_permissions.dart';

/// OWNER/MANAGER-only card for encrypted SQLite backup export and staged restore
/// (#526 B3 / B5 / B6 — DT 09-2007 Ordinal SEGUNDO 1.4).
class TerminalBackupCard extends StatefulWidget {
  final TerminalBackupService? backupService;
  final Future<String?> Function()? pickBackupFilePath;
  final Future<String> Function()? resolveExportDirectory;
  final UserRole? currentUserRoleOverride;

  const TerminalBackupCard({
    super.key,
    this.backupService,
    this.pickBackupFilePath,
    this.resolveExportDirectory,
    this.currentUserRoleOverride,
  });

  @override
  State<TerminalBackupCard> createState() => _TerminalBackupCardState();
}

class _TerminalBackupCardState extends State<TerminalBackupCard> {
  bool _busy = false;
  String? _statusMessage;
  bool _statusIsError = false;
  Map<String, dynamic>? _lastRestoreMeta;
  UserRole? _resolvedRole;

  TerminalBackupService get _service =>
      widget.backupService ?? TerminalBackupService();

  @override
  void initState() {
    super.initState();
    _resolvedRole = widget.currentUserRoleOverride;
    _loadLastRestoreNotice();
    if (_resolvedRole == null) {
      _loadCurrentUserRole();
    }
  }

  Future<void> _loadCurrentUserRole() async {
    try {
      final authRepo = Provider.of<AuthRepository?>(context, listen: false);
      if (authRepo == null) return;
      final user = await authRepo.getCurrentUser();
      if (mounted) {
        setState(() => _resolvedRole = user?.role);
      }
    } catch (_) {
      // Fail closed (null role -> restricted notice).
    }
  }

  Future<void> _loadLastRestoreNotice() async {
    try {
      final db = Provider.of<AppDatabase?>(context, listen: false);
      if (db == null) return;
      final row =
          await db.localConfigDao.getConfigByKey('last_database_restore_json');
      if (row != null && row.value.trim().isNotEmpty && mounted) {
        setState(() {
          _lastRestoreMeta = jsonDecode(row.value) as Map<String, dynamic>;
        });
      }
    } catch (_) {
      // Non-fatal: card still renders normally without last restore banner.
    }
  }

  Future<String?> _promptPassphrase({required bool confirm}) async {
    final passCtrl = TextEditingController();
    final confirmCtrl = TextEditingController();
    String? errorText;

    return showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(
            confirm
                ? 'Clave para cifrar respaldo'
                : 'Clave del archivo de respaldo',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                key: const Key('backup_passphrase_input'),
                controller: passCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'Contraseña (mínimo 8 caracteres)',
                  errorText: errorText,
                ),
              ),
              if (confirm) ...[
                const SizedBox(height: 12),
                TextField(
                  key: const Key('backup_passphrase_confirm_input'),
                  controller: confirmCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Confirmar contraseña',
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(null),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              key: const Key('backup_passphrase_submit_btn'),
              onPressed: () {
                final p = passCtrl.text.trim();
                if (p.length < TerminalBackupService.minPassphraseLength) {
                  setDialogState(() {
                    errorText = 'Debe tener al menos 8 caracteres.';
                  });
                  return;
                }
                if (confirm && p != confirmCtrl.text.trim()) {
                  setDialogState(() {
                    errorText = 'Las contraseñas no coinciden.';
                  });
                  return;
                }
                Navigator.of(ctx).pop(p);
              },
              child: const Text('Continuar'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleExport() async {
    final passphrase = await _promptPassphrase(confirm: true);
    if (passphrase == null || !mounted) return;

    setState(() {
      _busy = true;
      _statusMessage = null;
      _statusIsError = false;
    });

    try {
      final db = context.read<AppDatabase>();
      final dirPath = widget.resolveExportDirectory != null
          ? await widget.resolveExportDirectory!()
          : (await getExternalStorageDirectory() ??
                  await getApplicationDocumentsDirectory())
              .path;
      final now = DateTime.now();
      final stamp =
          '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}_'
          '${now.hour.toString().padLeft(2, '0')}${now.minute.toString().padLeft(2, '0')}${now.second.toString().padLeft(2, '0')}';
      final destPath = '$dirPath/nhilos_backup_$stamp.nhilosbak';

      final result = await _service.exportEncryptedBackup(
        sourceDb: db.database.database,
        destinationPath: destPath,
        passphrase: passphrase,
      );

      // #526 B6: Record explicit forensic audit entry on backup export.
      try {
        final auditRepo =
            Provider.of<AuditRepository?>(context, listen: false);
        await auditRepo?.log(
          'BACKUP_EXPORTED',
          metadata: jsonEncode({
            'invoiceCount': result.manifest.invoiceCount,
            'dgiCurrentNumber': result.manifest.dgiCurrentNumber,
            'auditChainStatus': result.auditChainReport.statusCode,
            'payloadSha256': result.manifest.payloadSha256,
          }),
        );
      } catch (_) {
        // Non-fatal: backup file is already safely written.
      }

      if (!mounted) return;
      setState(() {
        _statusIsError = false;
        _statusMessage = 'Respaldo cifrado guardado (${result.manifest.invoiceCount} facturas, '
            'consecutivo DGI ${result.manifest.dgiCurrentNumber ?? "-"}, '
            'auditoría: ${result.auditChainReport.statusCode}).\n'
            'Archivo: ${result.filePath}';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _statusIsError = true;
        _statusMessage = e.toString();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _handleRestore() async {
    String? pickedPath;
    if (widget.pickBackupFilePath != null) {
      pickedPath = await widget.pickBackupFilePath!();
    } else {
      final res = await FilePicker.platform.pickFiles(type: FileType.any);
      pickedPath = res?.files.single.path;
    }
    if (pickedPath == null || pickedPath.trim().isEmpty || !mounted) return;

    final passphrase = await _promptPassphrase(confirm: false);
    if (passphrase == null || !mounted) return;

    setState(() {
      _busy = true;
      _statusMessage = null;
      _statusIsError = false;
    });

    try {
      final db = context.read<AppDatabase>();
      final cloudHighRow = await db.localConfigDao
          .getConfigByKey('dgi_cloud_highest_sequence');
      final cloudHighest = int.tryParse(cloudHighRow?.value.trim() ?? '');
      final dbDir = await sqflite.getDatabasesPath();
      final targetPath = '$dbDir/app_database.db';
      final schemaRows = await db.database.rawQuery('PRAGMA user_version');
      final currentSchema = schemaRows.isNotEmpty
          ? (schemaRows.first.values.first as num?)?.toInt() ?? 86
          : 86;

      final staged = await _service.stageRestoreFromBackup(
        backupFilePath: pickedPath,
        passphrase: passphrase,
        targetDatabasePath: targetPath,
        currentSchemaVersion: currentSchema,
        cloudHighestSequence: cloudHighest,
      );

      if (!mounted) return;
      final chainWarning = staged.auditChainReport.isIntact
          ? 'Cadena forense íntegra.'
          : 'ADVERTENCIA: se detectaron ${staged.auditChainReport.issues.length} anomalía(s) en la cadena forense.';
      setState(() {
        _statusIsError = false;
        _statusMessage = 'Respaldo validado y preparado (${staged.manifest.invoiceCount} facturas). '
            '$chainWarning Cierre y vuelva a abrir NHILOS POS para aplicar la restauración.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _statusIsError = true;
        _statusMessage = e.toString();
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = widget.currentUserRoleOverride ?? _resolvedRole;
    final canManageBackup =
        hasConfigPermission(role, ConfigPermission.manageTerminalBackup);

    return Card(
      key: const Key('terminal_backup_card'),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Respaldo y Restauración de Terminal (DGI)',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(
              'Respaldo cifrado AES-256 de la base de datos local y consecutivo DGI (DT 09-2007 1.4).',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (_lastRestoreMeta != null) ...[
              const SizedBox(height: 10),
              Text(
                'Última restauración: ${_lastRestoreMeta!['restoredAtIso']} '
                '· Cadena forense: ${(_lastRestoreMeta!['auditChainReport'] as Map?)?['status'] ?? 'UNKNOWN'}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 12),
            if (!canManageBackup)
              Text(
                'Solo el Propietario o Gerente puede exportar o restaurar respaldos de terminal.',
                key: const Key('terminal_backup_restricted_notice'),
                style: Theme.of(context).textTheme.bodySmall,
              )
            else
              Wrap(
                spacing: 12,
                runSpacing: 8,
                children: [
                  FilledButton.icon(
                    key: const Key('terminal_backup_export_btn'),
                    onPressed: _busy ? null : _handleExport,
                    icon: const Icon(Icons.lock_outline),
                    label: const Text('Exportar respaldo cifrado'),
                  ),
                  OutlinedButton.icon(
                    key: const Key('terminal_backup_restore_btn'),
                    onPressed: _busy ? null : _handleRestore,
                    icon: const Icon(Icons.restore),
                    label: const Text('Restaurar desde respaldo'),
                  ),
                ],
              ),
            if (_busy) ...[
              const SizedBox(height: 12),
              const LinearProgressIndicator(),
            ],
            if (_statusMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                _statusMessage!,
                key: const Key('terminal_backup_status_text'),
                style: TextStyle(
                  color: _statusIsError
                      ? Colors.red.shade700
                      : Colors.green.shade800,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
