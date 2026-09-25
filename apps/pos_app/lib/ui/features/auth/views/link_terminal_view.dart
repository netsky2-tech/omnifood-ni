import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../viewmodels/link_terminal_viewmodel.dart';

/// Pre-auth linking gate screen (issue #556): shown only for terminals
/// without a stored tenant slug. The owner generates the 6-char code in the
/// dashboard; claiming it binds the terminal to its tenant before any
/// login attempt.
class LinkTerminalView extends StatefulWidget {
  const LinkTerminalView({super.key});

  @override
  State<LinkTerminalView> createState() => _LinkTerminalViewState();
}

class _LinkTerminalViewState extends State<LinkTerminalView> {
  final _codeController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<LinkTerminalViewModel>();
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
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
                    height: 100,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Vincular Terminal',
                    style: textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Ingrese el código de vinculación generado por el panel del propietario para asociar este terminal a su comercio.',
                    style: textTheme.bodySmall
                        ?.copyWith(color: Colors.grey.shade700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Terminal: ${displayTerminalId(viewModel.deviceId)}',
                    style: textTheme.bodySmall?.copyWith(
                      fontFamily: 'monospace',
                      color: Colors.grey.shade700,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 28), // stack-lg
                  TextField(
                    controller: _codeController,
                    autofocus: true,
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
                    onSubmitted: (_) => _link(viewModel),
                  ),
                  if (viewModel.error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      viewModel.error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 28),
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
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _link(LinkTerminalViewModel viewModel) async {
    final navigator = Navigator.of(context);
    final success = await viewModel.link(_codeController.text);
    if (success) {
      // Terminal linked: the login screen becomes usable (issue #556).
      navigator.pushReplacementNamed('/');
    }
  }
}

/// Compact, monospace-friendly rendering of the terminal id: keeps the tail
/// (the distinguishing part of `pos-local-<uuid>`) and elides the rest.
String displayTerminalId(String deviceId) {
  final id = deviceId.trim();
  if (id.length <= 12) return id;
  return '…${id.substring(id.length - 12)}';
}
