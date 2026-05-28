import 'package:flutter/material.dart';

enum SupervisorAuthorizationMethod { pin, totp }

class SupervisorOverrideRequest {
  final String supervisorId;
  final String credential;
  final SupervisorAuthorizationMethod method;

  const SupervisorOverrideRequest({
    required this.supervisorId,
    required this.credential,
    required this.method,
  });
}

class SupervisorOverrideModal extends StatefulWidget {
  final Future<bool> Function(SupervisorOverrideRequest request) onAuthorize;
  final Future<void> Function(SupervisorOverrideRequest request)? onAuditSuccess;

  const SupervisorOverrideModal({
    super.key,
    required this.onAuthorize,
    this.onAuditSuccess,
  });

  @override
  State<SupervisorOverrideModal> createState() => _SupervisorOverrideModalState();
}

class _SupervisorOverrideModalState extends State<SupervisorOverrideModal> {
  final _supervisorCtrl = TextEditingController();
  final _credentialCtrl = TextEditingController();
  SupervisorAuthorizationMethod _method = SupervisorAuthorizationMethod.pin;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _supervisorCtrl.dispose();
    _credentialCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _submitting = true;
    });

    final request = SupervisorOverrideRequest(
      supervisorId: _supervisorCtrl.text.trim(),
      credential: _credentialCtrl.text.trim(),
      method: _method,
    );

    final ok = await widget.onAuthorize(request);
    if (!mounted) return;

    if (!ok) {
      setState(() {
        _submitting = false;
        _error = 'Credenciales de supervisor inválidas.';
      });
      return;
    }

    if (widget.onAuditSuccess != null) {
      await widget.onAuditSuccess!(request);
    }

    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Autorización de supervisor'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _supervisorCtrl,
            decoration: const InputDecoration(labelText: 'ID supervisor'),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<SupervisorAuthorizationMethod>(
            initialValue: _method,
            items: const [
              DropdownMenuItem(value: SupervisorAuthorizationMethod.pin, child: Text('PIN')),
              DropdownMenuItem(value: SupervisorAuthorizationMethod.totp, child: Text('TOTP')),
            ],
            onChanged: _submitting ? null : (value) => setState(() => _method = value ?? SupervisorAuthorizationMethod.pin),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _credentialCtrl,
            obscureText: true,
            decoration: InputDecoration(labelText: _method == SupervisorAuthorizationMethod.pin ? 'PIN' : 'Código TOTP'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: _submitting ? null : () => Navigator.of(context).pop(false), child: const Text('Cancelar')),
        FilledButton(onPressed: _submitting ? null : _submit, child: const Text('Autorizar')),
      ],
    );
  }
}
