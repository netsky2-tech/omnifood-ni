import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../viewmodels/login_viewmodel.dart';

class LoginView extends StatefulWidget {
  const LoginView({super.key});

  @override
  State<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends State<LoginView> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<LoginViewModel>();
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 32.0, vertical: 16.0),
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
                    'Aprovisionamiento Inicial del Terminal',
                    style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Inicie sesión con credenciales de administrador para autenticar el tenant y descargar la plantilla de usuarios para operar offline.',
                    style: textTheme.bodySmall?.copyWith(color: Colors.grey.shade700),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 28), // stack-lg
                  TextField(
                    controller: _emailController,
                    decoration: const InputDecoration(
                      labelText: 'Correo Electrónico',
                      prefixIcon: Icon(Icons.email_outlined),
                    ),
                  ),
                  const SizedBox(height: 16), // stack-md
                  TextField(
                    controller: _passwordController,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Contraseña',
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  if (viewModel.error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      viewModel.error!,
                      style: TextStyle(color: Theme.of(context).colorScheme.error),
                      textAlign: TextAlign.center,
                    ),
                  ],
                  const SizedBox(height: 28),
                  ElevatedButton(
                    onPressed: viewModel.isLoading
                        ? null
                        : () async {
                            final navigator = Navigator.of(context);
                            final success = await viewModel.login(
                              _emailController.text,
                              _passwordController.text,
                            );
                            if (success) {
                              navigator.pushReplacementNamed('/lock');
                            }
                          },
                    child: viewModel.isLoading
                        ? const SizedBox(
                            height: 24,
                            width: 24,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : const Text('SINCRONIZAR Y CONFIGURAR'),
                  ),
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(context).pushReplacementNamed('/lock');
                    },
                    icon: const Icon(Icons.dialpad, size: 20),
                    label: const Text('Modo Operativo (Cajeros con PIN)'),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
}
