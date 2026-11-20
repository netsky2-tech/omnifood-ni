import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';

import '../../../../data/services/install_app_link_service.dart';
import '../../../design_system/nhilos_tokens.dart';
import '../utils/install_kit_link_parser.dart';
import '../viewmodels/link_terminal_viewmodel.dart';

/// Reports a raw scanned QR payload once it has been detected.
typedef LinkingScannerViewBuilder = Widget Function(
  BuildContext context,
  ValueChanged<String> onCodeDetected,
  VoidCallback onManualEntryFallback,
);

/// Pre-auth linking gate screen (issue #556, #958): shown only for terminals
/// without a stored tenant slug. The owner generates the 6-char code (or
/// install-kit QR / App Link) in the dashboard; claiming it binds the terminal
/// to its tenant before any login attempt.
class LinkTerminalView extends StatefulWidget {
  const LinkTerminalView({
    super.key,
    this.scannerViewBuilder,
    this.initialLinkingCode,
    this.appLinkService,
  });

  /// Camera layer seam for widget tests. Defaults to the production
  /// `mobile_scanner` camera preview.
  final LinkingScannerViewBuilder? scannerViewBuilder;

  /// Optional initial linking code or URI payload to prefill and claim.
  final String? initialLinkingCode;

  /// Optional Android App Link bridge override for widget tests.
  final InstallAppLinkService? appLinkService;

  @override
  State<LinkTerminalView> createState() => _LinkTerminalViewState();
}

class _LinkTerminalViewState extends State<LinkTerminalView> {
  final _codeController = TextEditingController();
  final _recoveryCodeController = TextEditingController();
  late final InstallAppLinkService _appLinkService;
  late final bool _ownsAppLinkService;
  StreamSubscription<String>? _appLinkSubscription;

  bool _isScannerOpen = false;
  bool _showRecoveryCodeInput = false;
  String? _scanError;

  @override
  void initState() {
    super.initState();
    _ownsAppLinkService = widget.appLinkService == null;
    _appLinkService = widget.appLinkService ?? InstallAppLinkService();
    _appLinkSubscription =
        _appLinkService.onLink.listen(_handleIncomingAppLink);

    final initialCode = widget.initialLinkingCode != null
        ? extractLinkingCodeFromPayload(widget.initialLinkingCode!)
        : null;
    if (initialCode != null) {
      _codeController.text = initialCode;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final viewModel = context.read<LinkTerminalViewModel>();
        if (!viewModel.isLoading) {
          _link(viewModel);
        }
      });
    } else {
      _checkInitialAppLink();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.read<LinkTerminalViewModel>().checkReactivationAvailability();
      });
    }
  }

  @override
  void dispose() {
    _appLinkSubscription?.cancel();
    if (_ownsAppLinkService) {
      _appLinkService.dispose();
    }
    _codeController.dispose();
    _recoveryCodeController.dispose();
    super.dispose();
  }

  Future<void> _checkInitialAppLink() async {
    final link = await _appLinkService.getInitialLink();
    if (!mounted || link == null) return;
    _handleIncomingAppLink(link);
  }

  void _handleIncomingAppLink(String rawLink) {
    final code = extractLinkingCodeFromPayload(rawLink);
    if (code == null || !mounted) return;
    setState(() {
      _scanError = null;
      _isScannerOpen = false;
      _codeController.text = code;
    });
    final viewModel = context.read<LinkTerminalViewModel>();
    if (!viewModel.isLoading) {
      _link(viewModel);
    }
  }

  void _handleScannedPayload(String raw, LinkTerminalViewModel viewModel) {
    final code = extractLinkingCodeFromPayload(raw);
    if (code == null) {
      setState(() {
        _isScannerOpen = false;
        _scanError =
            'El código QR escaneado no contiene un código de vinculación válido.';
      });
      return;
    }

    setState(() {
      _isScannerOpen = false;
      _scanError = null;
      _codeController.text = code;
    });
    if (!viewModel.isLoading) {
      _link(viewModel);
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<LinkTerminalViewModel>();

    if (_isScannerOpen) {
      return LinkingQrScanOverlay(
        scannerBuilder: widget.scannerViewBuilder,
        onCodeDetected: (raw) => _handleScannedPayload(raw, viewModel),
        onClose: () => setState(() => _isScannerOpen = false),
      );
    }

    final textTheme = Theme.of(context).textTheme;
    final activeError = _scanError ?? viewModel.error;
    final isUnconfigured = _scanError == null &&
        viewModel.error != null &&
        (viewModel.error!.contains('servidor configurado') ||
            viewModel.error!.contains('no tiene un servidor'));

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            key: const Key('terminal_config_button'),
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Ajustes Técnicos / Servidor',
            onPressed: () => Navigator.pushNamed(context, '/config/terminal'),
          ),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding:
                const EdgeInsets.symmetric(horizontal: 32.0, vertical: 16.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Image.asset(
                    'assets/icons/app_icon.png',
                    height: 84,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Vincular Terminal',
                    style: textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Ingrese el código de vinculación o escanee el QR del panel del propietario.',
                    style: textTheme.bodySmall
                        ?.copyWith(color: Colors.grey.shade700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    alignment: WrapAlignment.center,
                    children: [
                      Text(
                        'Terminal: ',
                        style: textTheme.bodySmall?.copyWith(
                          color: Colors.grey.shade700,
                        ),
                      ),
                      SelectableText(
                        viewModel.deviceId,
                        style: textTheme.bodySmall?.copyWith(
                          fontFamily: 'monospace',
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                  if (viewModel.hasPendingReactivation) ...[
                    const SizedBox(height: 20),
                    _buildReactivationCard(context, viewModel),
                  ],
                  const SizedBox(height: 20),
                  TextField(
                    key: const Key('linking_code_input'),
                    controller: _codeController,
                    autofocus: !viewModel.hasPendingReactivation,
                    textCapitalization: TextCapitalization.characters,
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                    ],
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: 'Código de vinculación',
                      prefixIcon: Icon(Icons.link_outlined),
                      counterText: '',
                    ),
                    onChanged: (_) {
                      if (_scanError != null) {
                        setState(() => _scanError = null);
                      }
                    },
                    onSubmitted: (_) => _link(viewModel),
                  ),
                  if (activeError != null) ...[
                    const SizedBox(height: 16),
                    if (isUnconfigured) ...[
                      Container(
                        key: const Key('unconfigured_server_card'),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: NhilosColors.warningLight,
                          borderRadius: NhilosRadii.cardRadius,
                          border: Border.all(color: NhilosColors.warningBorder),
                        ),
                        child: Column(
                          children: [
                            const Row(
                              children: [
                                Icon(Icons.cloud_off,
                                    size: 20, color: NhilosColors.warning),
                                SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'Servidor no configurado',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      color: NhilosColors.warning,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(
                              activeError,
                              style: const TextStyle(
                                fontSize: 13,
                                color: NhilosColors.warning,
                              ),
                              textAlign: TextAlign.left,
                            ),
                            const SizedBox(height: 10),
                            OutlinedButton.icon(
                              key: const Key('open_server_config_button'),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: NhilosColors.brandPrimary,
                                side: const BorderSide(
                                    color: NhilosColors.brandPrimary),
                                shape: const RoundedRectangleBorder(
                                  borderRadius: NhilosRadii.buttonRadius,
                                ),
                              ),
                              icon: const Icon(Icons.settings, size: 16),
                              label: const Text('Configurar Servidor'),
                              onPressed: () {
                                Navigator.pushNamed(
                                    context, '/config/terminal');
                              },
                            ),
                          ],
                        ),
                      ),
                    ] else ...[
                      Text(
                        activeError,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ],
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed:
                        viewModel.isLoading ? null : () => _link(viewModel),
                    child: viewModel.isLoading
                        ? const SizedBox(
                            height: 24,
                            width: 24,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2),
                          )
                        : const Text('VINCULAR TERMINAL'),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    key: const Key('scan_linking_qr_button'),
                    onPressed: viewModel.isLoading
                        ? null
                        : () => setState(() {
                              _scanError = null;
                              _isScannerOpen = true;
                            }),
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('Escanear QR'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildReactivationCard(
    BuildContext context,
    LinkTerminalViewModel viewModel,
  ) {
    final textTheme = Theme.of(context).textTheme;
    final maskedHint = viewModel.reactivationMaskedHint;
    final reactivationError = viewModel.reactivationError;
    final isExpired =
        viewModel.reactivationErrorCode == 'REACTIVATION_CHALLENGE_EXPIRED';

    return Container(
      key: const Key('reactivate_terminal_card'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: NhilosColors.brandPrimary.withValues(alpha: 0.06),
        borderRadius: NhilosRadii.cardRadius,
        border: Border.all(
          color: NhilosColors.brandPrimary.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.phonelink_setup_outlined,
                color: NhilosColors.brandPrimary,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Reactivar terminal',
                  style: textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: NhilosColors.brandPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Reconocimos esta terminal de una instalación anterior. Aprobá la solicitud desde el panel del negocio o usá tu código de recuperación.',
            style: textTheme.bodySmall?.copyWith(color: Colors.grey.shade800),
          ),
          if (maskedHint != null && maskedHint.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              maskedHint,
              key: const Key('reactivation_masked_hint'),
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade900,
              ),
            ),
          ],
          if (reactivationError != null) ...[
            const SizedBox(height: 10),
            Text(
              reactivationError,
              key: const Key('reactivation_error_text'),
              style: textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ],
          const SizedBox(height: 12),
          ElevatedButton(
            key: const Key('complete_reactivation_button'),
            onPressed: viewModel.isBusy
                ? null
                : () => _completeReactivation(viewModel),
            child: viewModel.isCompletingReactivation
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Text('Completar reactivación'),
          ),
          if (isExpired) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              key: const Key('retry_reactivation_lookup_button'),
              onPressed: viewModel.isCheckingReactivation || viewModel.isBusy
                  ? null
                  : () => viewModel.checkReactivationAvailability(),
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Buscar nuevamente'),
            ),
          ],
          const SizedBox(height: 8),
          TextButton(
            key: const Key('toggle_recovery_code_button'),
            onPressed: viewModel.isBusy
                ? null
                : () => setState(() {
                      _showRecoveryCodeInput = !_showRecoveryCodeInput;
                    }),
            child: Text(
              _showRecoveryCodeInput
                  ? 'Ocultar código de recuperación'
                  : 'Usar código de recuperación de 6 dígitos',
            ),
          ),
          if (_showRecoveryCodeInput) ...[
            const SizedBox(height: 8),
            TextField(
              key: const Key('recovery_code_input'),
              controller: _recoveryCodeController,
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(6),
              ],
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: 'Código de recuperación',
                hintText: '6 dígitos',
                prefixIcon: Icon(Icons.pin_outlined),
                counterText: '',
              ),
              onSubmitted: (_) => _completeReactivation(
                viewModel,
                recoveryCode: _recoveryCodeController.text,
              ),
            ),
            const SizedBox(height: 8),
            OutlinedButton(
              key: const Key('submit_recovery_code_button'),
              onPressed: viewModel.isBusy
                  ? null
                  : () => _completeReactivation(
                        viewModel,
                        recoveryCode: _recoveryCodeController.text,
                      ),
              child: const Text('Reactivar con código'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _completeReactivation(
    LinkTerminalViewModel viewModel, {
    String? recoveryCode,
  }) async {
    final navigator = Navigator.of(context);
    final success = await viewModel.completeReactivation(
      recoveryCode: recoveryCode,
    );
    if (success && mounted) {
      navigator.pushReplacementNamed('/');
    }
  }

  Future<void> _link(LinkTerminalViewModel viewModel) async {
    if (_scanError != null) {
      setState(() => _scanError = null);
    }
    final navigator = Navigator.of(context);
    final success = await viewModel.link(_codeController.text);
    if (success && mounted) {
      // Terminal linked: the login screen becomes usable (issue #556).
      navigator.pushReplacementNamed('/');
    }
  }
}

/// Production scanner builder: hosts the `mobile_scanner` camera preview with
/// a permission-denied / camera-error fallback to manual entry.
Widget _defaultLinkingScannerBuilder(
  BuildContext context,
  ValueChanged<String> onCodeDetected,
  VoidCallback onManualEntryFallback,
) {
  return MobileScanner(
    onDetect: (capture) {
      for (final barcode in capture.barcodes) {
        final rawValue = barcode.rawValue;
        if (rawValue != null && rawValue.isNotEmpty) {
          onCodeDetected(rawValue);
          return;
        }
      }
    },
    errorBuilder: (context, error) {
      final permissionDenied =
          error.errorCode == MobileScannerErrorCode.permissionDenied;
      return _LinkingScannerMessageView(
        icon: permissionDenied
            ? Icons.no_photography_outlined
            : Icons.error_outline,
        message: permissionDenied
            ? 'No se puede acceder a la cámara. Escriba el código de vinculación manualmente.'
            : 'No se pudo iniciar la cámara. Intente de nuevo o escriba el código manualmente.',
        actionLabel: 'Escribir código manualmente',
        onAction: onManualEntryFallback,
      );
    },
  );
}

/// Full-screen camera overlay for scanning the install-kit QR code.
///
/// Deduplicates repeated frame detections so the first readable QR wins.
class LinkingQrScanOverlay extends StatefulWidget {
  const LinkingQrScanOverlay({
    super.key,
    required this.onCodeDetected,
    required this.onClose,
    this.scannerBuilder,
  });

  final ValueChanged<String> onCodeDetected;
  final VoidCallback onClose;
  final LinkingScannerViewBuilder? scannerBuilder;

  @override
  State<LinkingQrScanOverlay> createState() => _LinkingQrScanOverlayState();
}

class _LinkingQrScanOverlayState extends State<LinkingQrScanOverlay> {
  bool _codeHandled = false;

  void _handleCodeDetected(String rawValue) {
    if (_codeHandled || rawValue.isEmpty) return;
    _codeHandled = true;
    widget.onCodeDetected(rawValue);
  }

  @override
  Widget build(BuildContext context) {
    final scannerBuilder =
        widget.scannerBuilder ?? _defaultLinkingScannerBuilder;

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): widget.onClose,
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            foregroundColor: Colors.white,
            title: const Text('Escanear QR'),
            leading: IconButton(
              key: const Key('linking_qr_scan_close_button'),
              icon: const Icon(Icons.close),
              tooltip: 'Cerrar escáner',
              onPressed: widget.onClose,
            ),
          ),
          body: Column(
            children: [
              Expanded(
                child: scannerBuilder(
                  context,
                  _handleCodeDetected,
                  widget.onClose,
                ),
              ),
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text(
                  'Apunte la cámara al código QR del kit de instalación',
                  style: TextStyle(color: Colors.white70),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LinkingScannerMessageView extends StatelessWidget {
  const _LinkingScannerMessageView({
    required this.icon,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white70, size: 48),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.keyboard),
              label: Text(actionLabel),
            ),
          ],
        ),
      ),
    );
  }
}
