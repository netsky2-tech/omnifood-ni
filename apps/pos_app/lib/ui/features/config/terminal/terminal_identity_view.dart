import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'terminal_identity_view_model.dart';

/// Read-only screen that shows the terminal's canonical identity so the
/// operator can register the same id in the owner dashboard.
///
/// No editing controls: this surface never writes to the DAO nor resolves a
/// new device id (see [TerminalIdentityViewModel]).
class TerminalIdentityView extends StatelessWidget {
  const TerminalIdentityView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Identidad de la Terminal'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () =>
                context.read<TerminalIdentityViewModel>().load(),
            tooltip: 'Refrescar',
          ),
        ],
      ),
      body: Consumer<TerminalIdentityViewModel>(
        builder: (context, viewModel, child) {
          if (viewModel.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (viewModel.errorMessage != null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Text(
                  viewModel.errorMessage!,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.red.shade700),
                ),
              ),
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildIdentityCard(context, viewModel),
                const SizedBox(height: 16),
                _buildStatusCard(context, viewModel),
                const SizedBox(height: 16),
                _buildPrinterProfileCard(context, viewModel),
                const SizedBox(height: 24),
                _buildBackOfficeNotice(context),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildIdentityCard(
    BuildContext context,
    TerminalIdentityViewModel viewModel,
  ) {
    final terminalId = viewModel.terminalId;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Identificador de la Terminal',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Este es el identificador único de este dispositivo en OmniFood NI.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (terminalId == null || terminalId.isEmpty)
              Text(
                'Esta terminal todavía no tiene una identidad asignada.',
                style: TextStyle(
                  color: Colors.orange.shade800,
                  fontStyle: FontStyle.italic,
                ),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: SelectableText(
                      terminalId,
                      key: const Key('terminal_id_text'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                          ),
                    ),
                  ),
                  IconButton(
                    key: const Key('copy_terminal_id_button'),
                    icon: const Icon(Icons.copy),
                    tooltip: 'Copiar identificador',
                    onPressed: () async {
                      await Clipboard.setData(
                        ClipboardData(text: terminalId),
                      );
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text(
                              'Identificador copiado al portapapeles.',
                            ),
                          ),
                        );
                      }
                    },
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  /// Status card stating only what is knowable: whether the persisted
  /// identity equals the compiled build-time id. This is a factual string
  /// comparison, NOT provenance — the surface never asserts when or where
  /// the identity was generated because that is never stored.
  Widget _buildStatusCard(
    BuildContext context,
    TerminalIdentityViewModel viewModel,
  ) {
    final provisioned = viewModel.terminalId != null;
    final matchesBuildTimeId = viewModel.matchesBuildTimeId;

    final String statusTitle;
    final String statusDescription;
    final IconData statusIcon;
    final MaterialColor statusColor;

    if (!provisioned) {
      statusTitle = 'Sin identidad asignada';
      statusDescription = 'Esta terminal todavía no tiene un identificador '
          'guardado. Se generará uno automáticamente la primera vez que se '
          'utilice.';
      statusIcon = Icons.help_outline;
      statusColor = Colors.orange;
    } else if (matchesBuildTimeId == true) {
      statusTitle = 'Coincide con el identificador compilado';
      statusDescription = 'El identificador guardado coincide con el '
          'identificador compilado en la aplicación.';
      statusIcon = Icons.verified;
      statusColor = Colors.green;
    } else {
      statusTitle = 'No coincide con el identificador compilado';
      statusDescription = 'El identificador guardado no coincide con el '
          'identificador compilado en la aplicación. Antes de registrar la '
          'terminal, confirme que este sea el identificador correcto: puede '
          'ser una identidad previa de otra inscripción.';
      statusIcon = Icons.warning_amber_rounded;
      statusColor = Colors.orange;
    }

    return Card(
      key: const Key('terminal_status_card'),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(statusIcon, color: statusColor, size: 32),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Estado de la identidad',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    statusTitle,
                    key: const Key('terminal_status_title'),
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: statusColor.shade800,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    statusDescription,
                    key: const Key('terminal_status_description'),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPrinterProfileCard(
    BuildContext context,
    TerminalIdentityViewModel viewModel,
  ) {
    final paperWidth = viewModel.paperWidthMm;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Perfil de Impresora Activo',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.print, size: 20),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    viewModel.printerDriverLabel ?? 'Sin impresora configurada',
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ),
                if (paperWidth != null)
                  Chip(
                    label: Text('$paperWidth mm'),
                    avatar: const Icon(Icons.straighten, size: 16),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'El perfil se configura en la pantalla de Hardware e Impresora.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBackOfficeNotice(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.amber.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.amber.withOpacity(0.5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, color: Colors.amber),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Este identificador debe coincidir exactamente con la terminal '
              'registrada en el panel de administración (back office). '
              'Si no coincide, la terminal no podrá sincronizar.',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
