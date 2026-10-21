import 'dart:async';

import 'package:flutter/material.dart';
import 'package:pos_app/domain/models/update/release_manifest.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';
import 'package:pos_app/domain/services/update/ota_discovery_service.dart';
import 'package:pos_app/domain/services/update/ota_update_coordinator.dart';

/// Card widget embedded in [TerminalIdentityView] allowing the operator to
/// check for remote software updates, view changelog notes, observe download
/// progress, and safely hand off verified APKs to the Android installer.
///
/// Designed to lay out cleanly within the Q80 logical width (533 px) and
/// strictly honors the [FiscalSafetyGatePort] (Rule R7).
class OtaUpdateCard extends StatefulWidget {
  const OtaUpdateCard({
    super.key,
    required this.coordinator,
    this.discoveryService,
  });

  final OtaUpdateCoordinator coordinator;

  /// Silent discovery surface (T3b). When provided, an offer observed by
  /// [OtaDiscoveryService.lastOffer] is rendered while the coordinator is
  /// still in [OtaInitial] — the operator has not run a manual check yet, so
  /// the silent offer is the only update information available. Once a manual
  /// check runs, the coordinator's own state wins and this offer never
  /// renders as a second competing block.
  final OtaDiscoveryService? discoveryService;

  @override
  State<OtaUpdateCard> createState() => _OtaUpdateCardState();
}

class _OtaUpdateCardState extends State<OtaUpdateCard>
    with WidgetsBindingObserver {
  /// versionCode of the silent offer hidden for the REST OF THIS CARD
  /// INSTANCE (T3b, "Ahora no"). Deliberately in-memory only, never persisted:
  /// the card never touches the suppression store.
  ///
  /// Honest scope (since T3c): "Ahora no" hides the offer for this card
  /// instance only. The offer REAPPEARS after a process restart, because
  /// [OtaDiscoveryService] persists suppression exclusively on explicit
  /// dismissal ([OtaDiscoveryService.suppressOffer], the "No avisarme de
  /// esta versión" action) — merely surfacing an offer never persists it.
  /// The two buttons therefore have genuinely different reach: session-only
  /// vs. permanent for that versionCode.
  int? _dismissedSilentVersionCode;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        widget.coordinator.state is OtaPermissionRequired) {
      widget.coordinator.resumeInstallAfterPermission();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The fiscal verdict is a snapshot taken when the offer was
    // discovered. The operator closes the cash register on ANOTHER screen
    // and comes back here: without this refresh the card keeps showing
    // the stale "cierra la caja antes de actualizar" message even though
    // the terminal is quiet now (device-reported).
    //
    // Re-evaluating the VERDICT only — no network I/O, no re-discovery.
    widget.coordinator.refreshFiscalVerdict();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([widget.coordinator, widget.discoveryService]),
      builder: (context, _) {
        final state = widget.coordinator.state;
        final theme = Theme.of(context);

        return Card(
          key: const Key('ota_update_card'),
          margin: const EdgeInsets.only(bottom: 16),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.system_update_outlined),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Actualización del Sistema (OTA)',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Canal remoto para actualizar el software del POS sin conexión cableada.',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: Colors.grey.shade700,
                  ),
                ),
                const SizedBox(height: 16),
                _buildStateBody(context, state, theme),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildStateBody(
    BuildContext context,
    OtaUpdateState state,
    ThemeData theme,
  ) {
    switch (state) {
      case OtaInitial():
        final silentOffer = _visibleSilentOffer();
        if (silentOffer != null) {
          // T3b: surface the silently discovered offer with the SAME visual
          // language and keys as OtaUpdateAvailable, plus the two dismissal
          // affordances. One offer, one action — it replaces the idle check
          // button, it is not stacked below it.
          return _buildOfferBody(
            context,
            silentOffer.manifest,
            silentOffer.fiscalVerdict,
            canInstall: silentOffer.canInstallNow,
            showDismissals: true,
          );
        }
        return _buildCheckAction(
          buttonLabel: 'Buscar actualizaciones',
          isLoading: false,
        );

      case OtaChecking():
        return _buildCheckAction(
          buttonLabel: 'Buscando actualizaciones...',
          isLoading: true,
        );

      case OtaUpToDate(:final versionCode):
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.green.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.green.shade300),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline, color: Colors.green.shade800),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'El sistema está al día (compilación $versionCode).',
                      style: TextStyle(
                        color: Colors.green.shade900,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _buildCheckAction(
              buttonLabel: 'Buscar de nuevo',
              isLoading: false,
            ),
          ],
        );

      case OtaUpdateAvailable(:final manifest, :final fiscalVerdict):
        return _buildOfferBody(
          context,
          manifest,
          fiscalVerdict,
          canInstall: fiscalVerdict is FiscalGateClear,
          showDismissals: false,
        );

      case OtaDownloading(:final manifest, :final progress, :final receivedBytes, :final totalBytes):
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Descargando v${manifest.versionName}...',
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 8),
            LinearProgressIndicator(
              key: const Key('ota_download_progress'),
              value: progress,
              minHeight: 8,
              borderRadius: BorderRadius.circular(4),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${(progress * 100).toStringAsFixed(0)}%',
                  style: theme.textTheme.bodySmall,
                ),
                Text(
                  '${(receivedBytes / (1024 * 1024)).toStringAsFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toStringAsFixed(1)} MB',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ],
        );

      case OtaReadyToInstall():
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.green.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.green.shade300),
          ),
          child: const Row(
            children: [
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Archivo verificado. Despachando al instalador de Android...',
                  style: TextStyle(fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        );

      case OtaHandoffDispatched():
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.green.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.green.shade300),
          ),
          child: const Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Instalación iniciada en pantalla. Siga las instrucciones del sistema.',
                  style: TextStyle(fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
        );

      case OtaPermissionRequired():
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.red.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.red.shade300),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Permiso requerido para actualizar',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Colors.red.shade900,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Android requiere que se autorice la instalación de aplicaciones desconocidas para NHILOS POS.',
                style: TextStyle(color: Colors.red.shade900, fontSize: 13),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton.icon(
                    icon: const Icon(Icons.settings),
                    label: const Text('Abrir Ajustes de Seguridad'),
                    onPressed: widget.coordinator.openInstallSettings,
                  ),
                  ElevatedButton.icon(
                    key: const Key('ota_continue_install_button'),
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('Continuar con la instalación'),
                    onPressed: widget.coordinator.resumeInstallAfterPermission,
                  ),
                ],
              ),
            ],
          ),
        );

      case OtaFailed(:final message, :final reasonCode):
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade200),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.error_outline, color: Colors.red.shade700),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          message,
                          style: TextStyle(
                            color: Colors.red.shade900,
                            fontWeight: FontWeight.w500,
                            fontSize: 13,
                          ),
                        ),
                        if (reasonCode != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            'Código: $reasonCode',
                            style: TextStyle(
                              color: Colors.red.shade700,
                              fontSize: 11,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            _buildCheckAction(
              buttonLabel: 'Reintentar búsqueda',
              isLoading: false,
            ),
          ],
        );
    }
  }

  /// The silent offer currently visible on this card, or `null` when there
  /// is nothing to show: no discovery service, no offer, or the offer's
  /// version was already dismissed this session.
  OtaSilentOffer? _visibleSilentOffer() {
    final offer = widget.discoveryService?.lastOffer;
    if (offer == null) return null;
    if (offer.manifest.versionCode == _dismissedSilentVersionCode) return null;
    return offer;
  }

  void _dismissSilentOffer(int versionCode, {required bool persist}) {
    setState(() => _dismissedSilentVersionCode = versionCode);
    if (persist) {
      // T3b: persistent suppression goes through the discovery service API —
      // never through the suppression store directly.
      unawaited(widget.discoveryService!.suppressOffer(versionCode));
    }
  }

  /// Shared body for a pending update offer, used by BOTH the manual
  /// [OtaUpdateAvailable] branch and the T3b silent-offer branch so the
  /// operator always sees one visual language for "there is an update".
  Widget _buildOfferBody(
    BuildContext context,
    ReleaseManifest manifest,
    FiscalSafetyVerdict fiscalVerdict, {
    required bool canInstall,
    required bool showDismissals,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue.shade50,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.blue.shade200),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Versión ${manifest.versionName}',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.blue.shade900,
                      fontSize: 16,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade100,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      'build ${manifest.versionCode}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.blue.shade900,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                'Tamaño: ${(manifest.sizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB',
                style: TextStyle(color: Colors.blue.shade900, fontSize: 13),
              ),
              if (manifest.notes != null && manifest.notes!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  manifest.notes!,
                  style: TextStyle(
                    fontStyle: FontStyle.italic,
                    color: Colors.blue.shade900,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (!canInstall && fiscalVerdict is FiscalGateBlocked) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.amber.shade400),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.warning_amber_rounded,
                  color: Colors.amber.shade900,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Instalación temporalmente pausada',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.amber.shade900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        fiscalVerdict.summary,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.amber.shade900,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Main's blocked-state recheck affordance (kept on the port): an
          // operator reading a paused MANUAL offer can re-check from the card
          // itself. The silent-offer branch carries the dismissal controls
          // instead, so this button only renders on the manual surface.
          if (!showDismissals)
            OutlinedButton.icon(
              key: const Key('ota_recheck_button'),
              icon: const Icon(Icons.refresh),
              label: const Text('Buscar actualizaciones'),
              onPressed: () => widget.coordinator.checkForUpdate(),
            ),
          if (!showDismissals) const SizedBox(height: 12),
        ],
        ElevatedButton.icon(
          key: const Key('ota_install_button'),
          icon: const Icon(Icons.download_for_offline),
          label: const Text('Descargar e Instalar'),
          onPressed: canInstall
              ? () => widget.coordinator.downloadAndInstall(manifest)
              : null,
        ),
        if (showDismissals) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                key: const Key('ota_offer_dismiss_now'),
                icon: const Icon(Icons.schedule),
                label: const Text('Ahora no'),
                // POS standard §18.3: secondary buttons >= 48 x 48 dp.
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(48, 48),
                ),
                onPressed: () =>
                    _dismissSilentOffer(manifest.versionCode, persist: false),
              ),
              OutlinedButton.icon(
                key: const Key('ota_offer_suppress_version'),
                icon: const Icon(Icons.visibility_off_outlined),
                label: const Text('No avisarme de esta versión'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(48, 48),
                ),
                onPressed: () =>
                    _dismissSilentOffer(manifest.versionCode, persist: true),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildCheckAction({
    required String buttonLabel,
    required bool isLoading,
  }) {
    return ElevatedButton.icon(
      key: const Key('ota_check_button'),
      icon: isLoading
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : const Icon(Icons.refresh),
      label: Text(buttonLabel),
      onPressed: isLoading ? null : () => widget.coordinator.checkForUpdate(),
    );
  }
}
