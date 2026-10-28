import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

enum SupervisorAuthorizationMethod { pin, totp }

/// A person who may authorize an override, as the operator sees them: BY
/// NAME.
///
/// The id never reaches the screen: it is an opaque UUID that nobody
/// memorizes and nobody should transcribe (Nhilos backoffice §17.6: a field
/// whose datum is a foreign key is never a free-text input; the control must
/// be a selector with a flexible textual search).
class SupervisorCandidate {
  final String id;
  final String name;

  /// The role, shown so the operator knows WHO is authorizing (a manager
  /// authorizing is a different fact than an owner authorizing).
  final String role;

  const SupervisorCandidate({
    required this.id,
    required this.name,
    required this.role,
  });
}

class SupervisorOverrideRequest {
  /// The person, when the credential was ambiguous and the operator already
  /// said which one they are. Empty when the credential identified them.
  final String supervisorId;
  final String credential;
  final SupervisorAuthorizationMethod method;

  const SupervisorOverrideRequest({
    required this.supervisorId,
    required this.credential,
    required this.method,
  });
}

/// What the authorization came back as.
///
/// The credential (the PIN) identifies the person: nobody types an
/// identifier. When the SAME PIN belongs to more than one member of the
/// staff, the operation asks WHICH one — by name, never by id.
class SupervisorOverrideOutcome {
  const SupervisorOverrideOutcome.authorized({
    required this.userId,
    required this.userName,
    required this.isAuthorizingRole,
    required this.method,
  })  : authorized = true,
        ambiguous = false,
        candidates = const [];

  const SupervisorOverrideOutcome.ambiguous(
    this.candidates, {
    required this.userId,
    required this.userName,
    required this.isAuthorizingRole,
    required this.method,
  })  : ambiguous = true,
        authorized = false;

  const SupervisorOverrideOutcome.invalid()
      : ambiguous = false,
        authorized = false,
        candidates = const [],
        userId = null,
        userName = null,
        isAuthorizingRole = false,
        method = 'PIN';

  /// The operation may proceed.
  final bool authorized;

  /// The credential belongs to more than one person: ask which.
  final bool ambiguous;

  /// The people the credential could be.
  final List<SupervisorCandidate> candidates;

  final String? userId;
  final String? userName;

  /// The person counts as a supervisor under the tenant's policy.
  final bool isAuthorizingRole;

  /// How the person proved it: PIN or TOTP. The record says which.
  final String method;
}

class SupervisorOverrideModal extends StatefulWidget {
  final Future<SupervisorOverrideOutcome> Function(
    SupervisorOverrideRequest request,
  ) onAuthorize;
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

  /// Extra validation: while it is false, the submit button stays disabled.
  ///
  /// It is a LISTENABLE, not a callback: the extra fields live in [content],
  /// which owns its own state, and the modal has to REBUILD when that state
  /// changes (otherwise the submit button would stay disabled forever after
  /// the operator typed the missing field).
  final ValueListenable<bool>? extraValid;

  /// The label of the submit button.
  final String submitLabel;

  const SupervisorOverrideModal({
    super.key,
    required this.onAuthorize,
    this.onAuditSuccess,
    this.title = 'Autorización de supervisor',
    this.content,
    this.extraValid,
    this.submitLabel = 'Autorizar',
  });

  @override
  State<SupervisorOverrideModal> createState() => _SupervisorOverrideModalState();
}

class _SupervisorOverrideModalState extends State<SupervisorOverrideModal> {
  final _credentialCtrl = TextEditingController();
  SupervisorAuthorizationMethod _method = SupervisorAuthorizationMethod.pin;
  bool _submitting = false;
  String? _error;

  /// The people the credential could belong to, when the SAME PIN is shared
  /// by more than one member of the staff: the operator says which one they
  /// are, by name.
  List<SupervisorCandidate> _candidates = const [];

  /// The person the operator picked among the candidates.
  String? _selectedId;

  @override
  void initState() {
    super.initState();
    widget.extraValid?.addListener(_onExtraValidChanged);
  }

  /// The extra fields changed their verdict: rebuild so the submit button
  /// follows it (an authorization that cannot be submitted is a dead end).
  void _onExtraValidChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.extraValid?.removeListener(_onExtraValidChanged);
    _credentialCtrl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant SupervisorOverrideModal oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.extraValid != widget.extraValid) {
      oldWidget.extraValid?.removeListener(_onExtraValidChanged);
      widget.extraValid?.addListener(_onExtraValidChanged);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _submitting = true;
    });

    final request = SupervisorOverrideRequest(
      supervisorId: _selectedId ?? '',
      credential: _credentialCtrl.text.trim(),
      method: _method,
    );

    final outcome = await widget.onAuthorize(request);
    if (!mounted) return;

    if (outcome.authorized) {
      if (widget.onAuditSuccess != null) {
        await widget.onAuditSuccess!(request);
      }
      if (!mounted) return;
      Navigator.of(context).pop(outcome);
      return;
    }

    if (outcome.ambiguous) {
      // The same PIN belongs to more than one person: ask which one, by
      // NAME. The identifier never reaches the screen.
      setState(() {
        _candidates = outcome.candidates;
        _selectedId = null;
        _submitting = false;
      });
      return;
    }

    setState(() {
      _submitting = false;
      _error = 'Credenciales de supervisor inválidas.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = widget.extraValid?.value ?? true;
    // Nothing is authorized without a credential.
    final canAuthorize = _credentialCtrl.text.trim().isNotEmpty;
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
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: _method == SupervisorAuthorizationMethod.pin
                    ? 'Su PIN'
                    : 'Su código TOTP',
                helperText: _candidates.isEmpty
                    ? null
                    : 'Su PIN es el mismo de varias personas: diga cuál es.',
              ),
            ),
            if (_candidates.isNotEmpty) ...[
              const SizedBox(height: 8),
              ..._candidates.map(
                (candidate) => ListTile(
                  key: Key('supervisor_option_${candidate.id}'),
                  minTileHeight: 48,
                  selected: candidate.id == _selectedId,
                  leading: Icon(
                    candidate.id == _selectedId
                        ? Icons.radio_button_checked
                        : Icons.radio_button_unchecked,
                    color: candidate.id == _selectedId
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  title: Text(candidate.name),
                  subtitle: Text(candidate.role),
                  onTap: () => setState(() => _selectedId = candidate.id),
                ),
              ),
            ],
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
          onPressed: (_submitting || !canSubmit || !canAuthorize)
              ? null
              : _submit,
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}
