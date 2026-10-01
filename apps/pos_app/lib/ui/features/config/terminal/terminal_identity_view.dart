import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pos_app/data/services/api_base_url_service.dart';
import 'package:provider/provider.dart';

import 'terminal_identity_view_model.dart';

/// Screen showing the terminal's canonical identity (read-only) and the
/// backend server URL configuration.
///
/// The identity cards never write to the DAO nor resolve a new device id (see
/// [TerminalIdentityViewModel]). The server configuration card is the one
/// write surface: it saves or clears the backend URL through
/// [ApiBaseUrlService]. The URL is resolved once at startup, so a change
/// applies on the NEXT app start — the card says so plainly and never implies
/// a live change.
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
                const SizedBox(height: 16),
                const _ServerConfigCard(),
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

/// Operator-facing labels for the backend URL provenance. The label is
/// derived from [ApiBaseUrlResolution.source], never guessed from the value.
String _serverSourceLabel(ApiBaseUrlSource source) {
  switch (source) {
    case ApiBaseUrlSource.persistedConfig:
      return 'Configuración guardada en este dispositivo';
    case ApiBaseUrlSource.buildDefine:
      return 'Definida al compilar la aplicación';
    case ApiBaseUrlSource.developmentDefault:
      return 'Valor por defecto de desarrollo';
    case ApiBaseUrlSource.unconfigured:
      return 'Sin servidor configurado';
  }
}

/// Backend server configuration card: shows the effective URL and the source
/// that produced it, lets the operator save a validated new URL or clear the
/// persisted one, and states plainly that a change applies after restarting
/// the app (startup resolution is a deliberate design decision).
///
/// TRANSPORT ONLY: saving or clearing here must never touch the sale path,
/// the DGI numbering path, or any fiscal operation. Failures surface an
/// error message; the view never crashes on a config read/write failure.
class _ServerConfigCard extends StatefulWidget {
  const _ServerConfigCard();

  @override
  State<_ServerConfigCard> createState() => _ServerConfigCardState();
}

class _ServerConfigCardState extends State<_ServerConfigCard> {
  final TextEditingController _urlController = TextEditingController();

  @override
  void dispose() {
    _urlController.dispose();
    super.dispose();
  }

  Future<void> _save(TerminalIdentityViewModel viewModel) async {
    final messenger = ScaffoldMessenger.of(context);
    await viewModel.saveServerUrl(_urlController.text);
    if (!mounted) return;
    if (viewModel.serverErrorMessage == null) {
      _urlController.clear();
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Servidor guardado. El cambio se aplicará después de reiniciar '
            'la aplicación.',
          ),
        ),
      );
    }
  }

  Future<void> _clear(TerminalIdentityViewModel viewModel) async {
    final messenger = ScaffoldMessenger.of(context);
    await viewModel.clearServerUrl();
    if (!mounted) return;
    if (viewModel.serverErrorMessage == null) {
      _urlController.clear();
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Configuración borrada. El cambio se aplicará después de '
            'reiniciar la aplicación.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<TerminalIdentityViewModel>();
    final resolution = viewModel.serverResolution;
    final unconfigured = resolution != null && !resolution.isConfigured;
    final sourceLabel =
        resolution == null ? null : _serverSourceLabel(resolution.source);
    final canClear =
        resolution?.source == ApiBaseUrlSource.persistedConfig;
    final serverError = viewModel.serverErrorMessage;

    return Card(
      key: const Key('server_config_card'),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Servidor del Backend',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Dirección del servidor al que esta terminal envía sus ventas '
              'para sincronizar.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 12),
            if (unconfigured) ...[
              Text(
                'Esta terminal no tiene un servidor configurado. Las ventas '
                'siguen funcionando sin conexión, pero la sincronización no '
                'está disponible.',
                key: const Key('server_url_unconfigured_message'),
                style: TextStyle(
                  color: Colors.orange.shade800,
                  fontStyle: FontStyle.italic,
                ),
              ),
              const SizedBox(height: 8),
            ] else if (resolution?.url != null) ...[
              Row(
                children: [
                  const Icon(Icons.dns, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SelectableText(
                      resolution!.url!,
                      key: const Key('server_url_text'),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                            fontFamily: 'monospace',
                          ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
            ],
            if (sourceLabel != null)
              Text(
                sourceLabel,
                key: const Key('server_url_source'),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      fontStyle: FontStyle.italic,
                    ),
              ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('server_url_field'),
              controller: _urlController,
              decoration: const InputDecoration(
                labelText: 'Nueva URL del servidor',
                hintText: 'https://api.ejemplo.com/api',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'El cambio se aplicará después de reiniciar la aplicación.',
              key: const Key('server_url_restart_notice'),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.amber.shade900,
                  ),
            ),
            const SizedBox(height: 8),
            if (serverError != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8.0),
                child: Text(
                  serverError,
                  key: const Key('server_url_error'),
                  style: TextStyle(color: Colors.red.shade700),
                ),
              ),
            // Wrap, not Row: on the real terminal width (Q80 is 800x1280 px at
            // 240 dpi, i.e. 533 logical) the two labels together are ~190 px
            // wider than the viewport. A Row overflowed and pushed "Borrar
            // configuración guardada" off-screen, which also made "Guardar"
            // unhittable, so an operator could not persist a server URL at all.
            // Wrapping lets the actions flow onto a second line and keeps both
            // reachable at any width.
            Wrap(
              spacing: 12,
              runSpacing: 8,
              children: [
                ElevatedButton.icon(
                  key: const Key('save_server_url_button'),
                  icon: const Icon(Icons.save_outlined),
                  label: const Text('Guardar'),
                  onPressed: () => _save(viewModel),
                ),
                OutlinedButton.icon(
                  key: const Key('clear_server_url_button'),
                  icon: const Icon(Icons.delete_outline),
                  label: const Text('Borrar configuración guardada'),
                  onPressed:
                      canClear ? () => _clear(viewModel) : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
