import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

enum SupervisorAuthorizationMethod { pin, totp }

/// A person who may authorize an override, as the operator sees them: BY
/// NAME.
///
/// The id never reaches the screen: it is an opaque UUID that nobody memorizes
/// and nobody should transcribe (Nhilos backoffice §17.6: a field whose datum
/// is a foreign key is never a free-text input; the control must be a
/// selector with a flexible textual search).
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

  /// Extra validation: while it is false, the submit button stays disabled.
  ///
  /// It is a LISTENABLE, not a callback: the extra fields live in [content],
  /// which owns its own state, and the modal has to REBUILD when that state
  /// changes (otherwise the submit button would stay disabled forever after
  /// the operator typed the missing field).
  final ValueListenable<bool>? extraValid;

  /// The label of the submit button.
  final String submitLabel;

  /// The people who may authorize, FROM THE LOCAL STAFF TEMPLATE.
  ///
  /// The operator picks the person by name and proves it with the credential.
  /// Nothing about the identity is transcribed: the id is the template's, and
  /// it never reaches the screen.
  final List<SupervisorCandidate> candidates;

  const SupervisorOverrideModal({
    super.key,
    required this.onAuthorize,
    this.onAuditSuccess,
    this.title = 'Autorización de supervisor',
    this.content,
    this.extraValid,
    this.submitLabel = 'Autorizar',
    this.candidates = const [],
  });

  @override
  State<SupervisorOverrideModal> createState() => _SupervisorOverrideModalState();
}

class _SupervisorOverrideModalState extends State<SupervisorOverrideModal> {
  final _credentialCtrl = TextEditingController();
  final _searchCtrl = TextEditingController();
  SupervisorAuthorizationMethod _method = SupervisorAuthorizationMethod.pin;
  bool _submitting = false;
  String? _error;

  /// The supervisor the operator chose BY NAME. Null = nobody chosen yet.
  String? _selectedId;

  /// The candidates that match what the operator typed.
  ///
  /// The search is tolerant: case, accents and partial names all work, so
  /// "max" finds "Maxwell" and "máx" finds "Maxwell" too.
  List<SupervisorCandidate> get _matchingCandidates {
    final query = _normalize(_searchCtrl.text);
    if (query.isEmpty) return widget.candidates;
    return widget.candidates
        .where((c) => _normalize(c.name).contains(query))
        .toList(growable: false);
  }

  static String _normalize(String value) {
    const accents = 'áàäâãåéèëêíìïîóòöôõúùüûñç';
    const plain = 'aaaaaaeeeeiiiiooooouuuun c';
    var out = value.toLowerCase();
    for (var i = 0; i < accents.length; i++) {
      out = out.replaceAll(accents[i], plain[i]);
    }
    return out.trim();
  }

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
    _searchCtrl.dispose();
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

  /// WHO authorizes, chosen by NAME.
  ///
  /// A search box and the matching people, each one a target of its own. The
  /// operator never sees, nor types, an identifier: the uuid stays in the
  /// template and travels with the request.
  Widget _supervisorSelector() {
    if (widget.candidates.isEmpty) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _searchCtrl,
            decoration: const InputDecoration(
              labelText: 'Buscar supervisor',
              hintText: 'Escriba el nombre',
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'No hay supervisores cargados en este terminal: pida al '
            'encargado que configure la plantilla de usuarios.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      );
    }
    final matching = _matchingCandidates;
    final selected = widget.candidates
        .where((c) => c.id == _selectedId)
        .cast<SupervisorCandidate?>()
        .firstWhere((_) => true, orElse: () => null);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          key: const Key('supervisor_search'),
          controller: _searchCtrl,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: 'Supervisor que autoriza',
            hintText: 'Escriba el nombre',
            prefixIcon: const Icon(Icons.search),
          ),
        ),
        const SizedBox(height: 4),
        if (matching.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Text(
              'Ningún supervisor coincide con «${_searchCtrl.text.trim()}».',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          )
        else
          // A plain column, not a lazy list: the dialog's own scroll view
          // handles the overflow, and a shrink-wrapping viewport cannot
          // report intrinsic dimensions inside an AlertDialog.
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final candidate in matching)
                ListTile(
                  key: Key('supervisor_option_${candidate.id}'),
                  // The row IS the target: a name, a role, and a 48 dp
                  // height (§18.3).
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
            ],
          ),
        if (selected != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                const Icon(Icons.verified_user_outlined, size: 18),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'Autoriza: ${selected.name} (${selected.role})',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = widget.extraValid?.value ?? true;
    // Nothing is authorized without a person and a credential.
    final canAuthorize = _selectedId != null &&
        _credentialCtrl.text.trim().isNotEmpty;
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
            _supervisorSelector(),
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
              onChanged: (_) => setState(() {}),
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
          onPressed: (_submitting || !canSubmit || !canAuthorize)
              ? null
              : _submit,
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}
