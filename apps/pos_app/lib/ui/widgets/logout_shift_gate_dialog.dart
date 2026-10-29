import 'package:flutter/material.dart';
import '../design_system/nhilos_tokens.dart';

enum LogoutShiftDecision { closeShiftNow, abandonTemporarily }

Future<LogoutShiftDecision?> showLogoutShiftGateDialog(BuildContext context) {
  return showDialog<LogoutShiftDecision>(
    context: context,
    barrierDismissible: false,
    builder: (dialogContext) => AlertDialog(
      shape: const RoundedRectangleBorder(
        borderRadius: NhilosRadii.modalRadius,
      ),
      icon: const Icon(
        Icons.point_of_sale_outlined,
        color: NhilosColors.warning,
      ),
      title: const Text('Caja abierta — Cerrar sesión'),
      content: const Text(
        'Hay un turno de caja abierto en esta terminal.\n\n'
        'Para cerrar sesión debe elegir una acción explícita: hacer el Corte Z '
        'ahora, o confirmar el abandono temporal del turno con un motivo que '
        'quedará registrado en la bitácora de auditoría.',
      ),
      actionsOverflowDirection: VerticalDirection.down,
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialogContext).pop(),
          child: const Text('CANCELAR'),
        ),
        OutlinedButton(
          onPressed: () => Navigator.of(
            dialogContext,
          ).pop(LogoutShiftDecision.abandonTemporarily),
          style: OutlinedButton.styleFrom(
            foregroundColor: NhilosColors.danger,
            side: const BorderSide(color: NhilosColors.dangerBorder),
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.buttonRadius,
            ),
          ),
          child: const Text('ABANDONAR TURNO TEMPORALMENTE'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(
            dialogContext,
          ).pop(LogoutShiftDecision.closeShiftNow),
          style: FilledButton.styleFrom(
            backgroundColor: NhilosColors.brandPrimary,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.buttonRadius,
            ),
          ),
          child: const Text('HACER CORTE Z AHORA'),
        ),
      ],
    ),
  );
}

Future<String?> showShiftAbandonReasonDialog(BuildContext context) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const _ShiftAbandonReasonDialog(),
  );
}

class _ShiftAbandonReasonDialog extends StatefulWidget {
  const _ShiftAbandonReasonDialog();

  @override
  State<_ShiftAbandonReasonDialog> createState() =>
      _ShiftAbandonReasonDialogState();
}

class _ShiftAbandonReasonDialogState extends State<_ShiftAbandonReasonDialog> {
  final _reasonController = TextEditingController();
  String? _error;
  bool _submitting = false;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  void _confirm() {
    if (_submitting) return;
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() {
        _error = 'El motivo es obligatorio para registrar el abandono.';
      });
      return;
    }
    if (reason.length < 4) {
      setState(() {
        _error = 'Ingrese un motivo descriptivo (mínimo 4 caracteres).';
      });
      return;
    }
    setState(() => _submitting = true);
    Navigator.of(context).pop(reason);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: const RoundedRectangleBorder(
        borderRadius: NhilosRadii.modalRadius,
      ),
      icon: const Icon(Icons.warning_amber_rounded, color: NhilosColors.danger),
      title: const Text('Motivo del abandono temporal'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'El turno quedará abierto. Al volver a iniciar sesión podrá '
            'retomarlo y cerrarlo con Corte Z.\n\n'
            'El motivo se guardará en la bitácora de auditoría.',
          ),
          const SizedBox(height: 16),
          TextField(
            key: const Key('shift_abandon_reason_input'),
            controller: _reasonController,
            autofocus: true,
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Motivo del abandono',
              hintText: 'Ej: cambio de turno, emergencia del operador...',
              errorText: _error,
              border: const OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (_) {
              if (_error != null) {
                setState(() {
                  _error = null;
                });
              }
            },
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _submitting ? null : () => Navigator.of(context).pop(),
          child: const Text('CANCELAR'),
        ),
        FilledButton(
          key: const Key('shift_abandon_confirm_button'),
          onPressed: _submitting ? null : _confirm,
          style: FilledButton.styleFrom(
            backgroundColor: NhilosColors.danger,
            foregroundColor: Colors.white,
            shape: const RoundedRectangleBorder(
              borderRadius: NhilosRadii.buttonRadius,
            ),
          ),
          child: const Text('CONFIRMAR Y CERRAR SESIÓN'),
        ),
      ],
    );
  }
}
