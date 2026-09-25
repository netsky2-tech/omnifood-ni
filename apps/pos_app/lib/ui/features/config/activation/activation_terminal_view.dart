import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../../core/localization/label_map.dart';
import 'activation_session_view_model.dart';

/// Guided terminal-activation screen: an operator completes activation from
/// the terminal itself, phase by phase, driven entirely by the injected
/// [ActivationSessionViewModel]. This surface renders exactly what the view
/// model exposes — it never recomputes checks, never fabricates statuses and
/// never calls the session service directly.
class ActivationTerminalView extends StatefulWidget {
  const ActivationTerminalView({super.key});

  @override
  State<ActivationTerminalView> createState() =>
      _ActivationTerminalViewState();
}

class _ActivationTerminalViewState extends State<ActivationTerminalView> {
  final TextEditingController _pinController = TextEditingController();

  /// Screen-local flag covering only the initial prepare() round-trip.
  /// Phase ordering, outcomes and refusals live in the view model and in the
  /// session; this flag never gates a phase action.
  bool _isPreparing = true;

  @override
  void initState() {
    super.initState();
    // prepare() notifies synchronously; defer it so the first build completes.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _prepare();
      }
    });
  }

  Future<void> _prepare() async {
    final viewModel = context.read<ActivationSessionViewModel>();
    setState(() => _isPreparing = true);
    await viewModel.prepare();
    if (mounted) {
      setState(() => _isPreparing = false);
    }
  }

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Activar Terminal'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _isPreparing ? null : _prepare,
            tooltip: 'Reintentar preparación',
          ),
        ],
      ),
      body: Consumer<ActivationSessionViewModel>(
        builder: (context, viewModel, child) {
          if (_isPreparing) {
            return const Center(child: CircularProgressIndicator());
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildPreparationCard(context, viewModel),
                const SizedBox(height: 16),
                _buildPreOfflineCard(context, viewModel),
                const SizedBox(height: 16),
                _buildControlledSaleCard(context, viewModel),
                const SizedBox(height: 16),
                _buildReconnectCard(context, viewModel),
                if (viewModel.errorMessage != null &&
                    !_isErrorAlreadyRenderedInBlockers(viewModel)) ...[
                  const SizedBox(height: 16),
                  _buildErrorCard(context, viewModel.errorMessage!),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  /// Preparation outcome: either the resolved attempt (terminal id and
  /// status) or the blocker with its code and human message, exactly as
  /// prepare() reported them.
  Widget _buildPreparationCard(
    BuildContext context,
    ActivationSessionViewModel viewModel,
  ) {
    final attempt = viewModel.attempt;
    final blockerCode = viewModel.blockerCode;
    final blockerMessage = viewModel.blockerMessage;

    return Card(
      key: const Key('activation_preparation_card'),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Preparación de la activación',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            if (blockerCode != null) ...[
              Row(
                children: [
                  Icon(Icons.block, color: Colors.red.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      localize(blockerCode, kActivationBlockerLabels),
                      key: const Key('activation_blocker_code'),
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontFamily: 'monospace',
                        color: Colors.red.shade700,
                      ),
                    ),
                  ),
                ],
              ),
              if (blockerMessage != null) ...[
                const SizedBox(height: 4),
                Text(
                  blockerMessage,
                  key: const Key('activation_blocker_message'),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ] else if (viewModel.isPrepared && attempt != null) ...[
              Row(
                children: [
                  Icon(Icons.verified_outlined,
                      color: Colors.green.shade700, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      attempt.candidateTerminalId,
                      key: const Key('activation_terminal_id'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                          ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Estado del intento',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              Text(
                localize(attempt.localStatus, kActivationAttemptStatusLabels),
                key: const Key('activation_attempt_status'),
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ] else ...[
              Text(
                'No hay un intento de activación resuelto para esta terminal.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Phase 1: pre-offline checks. Requires the operator's authorized PIN
  /// entered on screen; the field is obscured and never prefilled. While the
  /// phase has not succeeded — including after a failure — the field stays
  /// available with a cleared value so the operator can fix the cause and
  /// retry with a fresh entry. Once the phase has succeeded the field is no
  /// longer needed and is hidden. The entered PIN is cleared when a run
  /// starts and is never logged, persisted or re-displayed.
  Widget _buildPreOfflineCard(
    BuildContext context,
    ActivationSessionViewModel viewModel,
  ) {
    final outcome = viewModel.preOfflineChecksSucceeded;
    final checks = viewModel.preOfflineChecksResult?.checks ?? const {};
    final blockers = viewModel.preOfflineChecksResult?.blockers ?? const [];
    final pinVisible = viewModel.isPrepared && outcome != true;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Fase 1 · Verificaciones previas (sin conexión)',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'Comprueba localmente la identidad de la terminal, la '
              'configuración requerida, el usuario autorizado con su PIN, '
              'la impresora y la durabilidad de la base de datos local.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (pinVisible) ...[
              TextField(
                key: const Key('activation_pin_field'),
                controller: _pinController,
                obscureText: true,
                obscuringCharacter: '•',
                keyboardType: TextInputType.number,
                autocorrect: false,
                enableSuggestions: false,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'PIN autorizado',
                ),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                key: const Key('run_pre_offline_button'),
                onPressed: viewModel
                            .isPhaseLoading(
                                ActivationSessionPhase.preOfflineChecks) ||
                        _pinController.text.trim().isEmpty
                    ? null
                    : () {
                        // Capture the PIN for this single call and clear the
                        // field immediately: the screen never retains the
                        // credential, not even while the phase runs.
                        final pin = _pinController.text;
                        _pinController.clear();
                        setState(() {});
                        viewModel.runPreOfflineChecks(
                          authorizedUserPin: pin,
                        );
                      },
                child: viewModel.isPhaseLoading(
                        ActivationSessionPhase.preOfflineChecks)
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Ejecutar verificaciones previas'),
              ),
            ],
            if (checks.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Verificaciones reportadas',
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              ...checks.entries
                  .map((entry) => _buildCheckRow(entry.key, entry.value.status)),
            ],
            if (blockers.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Impedimentos reportados',
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              Text(
                blockers.map(_localizeBlocker).join('\n'),
                key: const Key('pre_offline_blockers'),
                style: TextStyle(
                  color: Colors.red.shade700,
                  fontSize: 13,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Phase 2: the controlled offline verification sale. This sale is
  /// recorded locally and does not need the connection; the reconnect phase
  /// follows it. No connectivity state is claimed or verified here.
  Widget _buildControlledSaleCard(
    BuildContext context,
    ActivationSessionViewModel viewModel,
  ) {
    final result = viewModel.controlledSaleResult;
    final checks = result?.checks ?? const {};

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Fase 2 · Venta de verificación sin conexión',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'La venta de verificación se registra localmente y no necesita '
              'conexión. Después de esta fase sigue la reconexión para '
              'enviar la evidencia al backend.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (result != null) ...[
              Text(
                'Ticket de verificación',
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              SelectableText(
                result.verificationTicketId ?? '-',
                key: const Key('verification_ticket_id'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontFamily: 'monospace',
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'Estado del intento: '
                '${localize(result.attemptStatus, kActivationAttemptStatusLabels)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (checks.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  'Verificaciones reportadas',
                  style: Theme.of(context).textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.bold),
                ),
                ...checks.entries.map(
                    (entry) => _buildCheckRow(entry.key, entry.value.status)),
              ],
              const SizedBox(height: 12),
            ],
            ElevatedButton(
              key: const Key('run_controlled_sale_button'),
              onPressed: _controlledSaleAction(viewModel),
              child: viewModel.isPhaseLoading(
                      ActivationSessionPhase.controlledOfflineSale)
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Ejecutar venta de verificación'),
            ),
            if (viewModel.preOfflineChecksSucceeded != true) ...[
              const SizedBox(height: 8),
              Text(
                'Disponible cuando la fase 1 termine correctamente.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontStyle: FontStyle.italic,
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Phase 3: reconnect, send the evidence and surface the backend's
  /// reported final status. Credential provisioning and terminal readiness
  /// are what follow; this screen never claims the device credential was
  /// created unless a runner reported it.
  Widget _buildReconnectCard(
    BuildContext context,
    ActivationSessionViewModel viewModel,
  ) {
    final result = viewModel.reconnectSyncResult;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Fase 3 · Reconexión y finalización',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 4),
            Text(
              'Al reconectar, la evidencia de la activación se envía al '
              'backend y este informa el estado final del proceso.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (result != null) ...[
              Text(
                'Estado final reportado',
                style: Theme.of(context).textTheme.titleSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
              ),
              Text(
                localize(result.attemptStatus, kActivationAttemptStatusLabels),
                key: const Key('finalized_status'),
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'Sobres sincronizados: ${result.syncedEnvelopesCount} · '
                'Pendientes: ${result.pendingEnvelopesCount}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (result.backendFinalizeResult != null)
                Text(
                  'Veredicto del backend: '
                  '${localize(result.backendFinalizeResult!.status, kActivationBackendVerdictLabels)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: 8),
              Container(
                key: const Key('finalization_next_steps'),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                  border:
                      Border.all(color: Colors.amber.withOpacity(0.5)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, color: Colors.amber),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'La activación continúa con el aprovisionamiento de '
                        'credenciales del dispositivo y con la confirmación '
                        'de que la terminal está lista para operar.',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            ElevatedButton(
              key: const Key('run_reconnect_button'),
              onPressed: _reconnectAction(viewModel),
              child: viewModel.isPhaseLoading(
                      ActivationSessionPhase.reconnectSync)
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Reconectar y finalizar'),
            ),
            if (viewModel.controlledSaleSucceeded != true) ...[
              const SizedBox(height: 8),
              Text(
                'Disponible cuando la fase 2 termine correctamente.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontStyle: FontStyle.italic,
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// A failed pre-offline phase reports its blockers in the phase card AND in
  /// [ActivationSessionViewModel.errorMessage] (same text, two deliberate
  /// channels). The screen renders a given message once: when the error is
  /// exactly the blockers text already shown in the phase card, the global
  /// error card is skipped.
  bool _isErrorAlreadyRenderedInBlockers(
    ActivationSessionViewModel viewModel,
  ) {
    final error = viewModel.errorMessage;
    if (error == null) return false;
    final blockers = viewModel.preOfflineChecksResult?.blockers ?? const [];
    if (blockers.isEmpty) return false;
    return error.trim() == blockers.join('\n').trim();
  }

  /// Localizes one raw runner blocker string. Blockers are reported either
  /// as a bare code (`NO_ACTIVE_ATTEMPT`) or as `CODE: raw detail`; the code
  /// head is translated through [kActivationBlockerLabels] and the reported
  /// detail tail is preserved verbatim so no reported information is lost.
  String _localizeBlocker(String blocker) {
    final separatorIndex = blocker.indexOf(':');
    if (separatorIndex <= 0) {
      return localize(blocker, kActivationBlockerLabels);
    }
    final head = blocker.substring(0, separatorIndex).trim();
    final tail = blocker.substring(separatorIndex + 1).trim();
    final localizedHead = localize(head, kActivationBlockerLabels);
    return tail.isEmpty ? localizedHead : '$localizedHead — $tail';
  }

  /// One row per check the runner actually reported: its localized code and
  /// its localized status. Nothing is invented and no count is fabricated.
  Widget _buildCheckRow(String code, String status) {
    final Color statusColor;
    switch (status) {
      case 'PASS':
        statusColor = Colors.green.shade700;
        break;
      case 'WARNING':
        statusColor = Colors.orange.shade800;
        break;
      case 'FAIL':
        statusColor = Colors.red.shade700;
        break;
      default:
        statusColor = Colors.grey.shade700;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        key: Key('check_row_$code'),
        children: [
          Expanded(
            child: Text(
              localize(code, kActivationCheckCodeLabels),
              style: const TextStyle(fontFamily: 'monospace'),
            ),
          ),
          Text(
            localize(status, kActivationCheckStatusLabels),
            style: TextStyle(
              color: statusColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  VoidCallback? _controlledSaleAction(ActivationSessionViewModel viewModel) {
    if (viewModel.preOfflineChecksSucceeded != true ||
        viewModel.isPhaseLoading(ActivationSessionPhase.controlledOfflineSale)) {
      return null;
    }
    return viewModel.executeControlledOfflineSale;
  }

  VoidCallback? _reconnectAction(ActivationSessionViewModel viewModel) {
    if (viewModel.controlledSaleSucceeded != true ||
        viewModel
            .isPhaseLoading(ActivationSessionPhase.reconnectSync)) {
      return null;
    }
    return viewModel.syncActivationEvidence;
  }

  Widget _buildErrorCard(BuildContext context, String errorMessage) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.red.withOpacity(0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.red.withOpacity(0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade700),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              errorMessage,
              key: const Key('activation_error'),
              style: TextStyle(
                fontSize: 13,
                color: Colors.red.shade900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
