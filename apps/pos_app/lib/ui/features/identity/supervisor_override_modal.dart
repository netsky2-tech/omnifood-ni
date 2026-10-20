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

  /// The title of the dialog. The default is the generic authorization one;
  /// a flow that overrides something specific says WHAT it is authorizing
  /// (§39.4: no implementation vocabulary, but also no ambiguity).
  final String title;

  /// Extra fields the flow needs besides the credentials (for example: the
  /// amount being authorized and the reason).
  ///
  /// They are rendered ABOVE the credential fields, so the operator reads what
  /// is being authorized before authorizing it.
  final Widget? content;

  /// Extra validation: when it returns false, the submit button stays
  /// disabled. The credentials alone are not always enough to authorize.
  final bool Function()? canSubmit;

  /// The label of the submit button.
  final String submitLabel;

  const SupervisorOverrideModal({
    super.key,
    required this.onAuthorize,
    this.onAuditSuccess,
    this.title = 'Autorización de supervisor',
    this.content,
    this.canSubmit,
    this.submitLabel = 'Autorizar',
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
    final canSubmit = widget.canSubmit?.call() ?? true;
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.content != null) ...[
              widget.content!,
              const SizedBox(height: 12),
            ],
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
      ),
      actions: [
        TextButton(onPressed: _submitting ? null : () => Navigator.of(context).pop(false), child: const Text('Cancelar')),
        FilledButton(
          onPressed: (_submitting || !canSubmit) ? null : _submit,
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}
