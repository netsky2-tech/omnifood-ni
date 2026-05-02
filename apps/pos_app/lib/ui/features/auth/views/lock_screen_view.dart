import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../viewmodels/lock_screen_viewmodel.dart';
import '../../../widgets/pin_pad.dart';

class LockScreenView extends StatefulWidget {
  const LockScreenView({super.key});

  @override
  State<LockScreenView> createState() => _LockScreenViewState();
}

class _LockScreenViewState extends State<LockScreenView> {
  String _pin = '';

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) {
        context.read<LockScreenViewModel>().loadUsers();
      }
    });
  }

  void _onPinPressed(String digit) {
    if (_pin.length < 6) {
      setState(() {
        _pin += digit;
      });
      if (_pin.length == 6) {
        _attemptUnlock();
      }
    }
  }

  void _onDelete() {
    if (_pin.isNotEmpty) {
      setState(() {
        _pin = _pin.substring(0, _pin.length - 1);
      });
    }
  }

  void _onClear() {
    setState(() {
      _pin = '';
    });
  }

  Future<void> _attemptUnlock() async {
    debugPrint('Attempting unlock with PIN of length: ${_pin.length}');
    final navigator = Navigator.of(context);
    final success = await context.read<LockScreenViewModel>().unlock(_pin);
    
    if (success) {
      debugPrint('Unlock successful, navigating to /home');
      navigator.pushReplacementNamed('/home');
    } else {
      debugPrint('Unlock failed');
      // Give the user a moment to see the full PIN filled before clearing
      await Future.delayed(const Duration(milliseconds: 300));
      _onClear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<LockScreenViewModel>();
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: Row(
        children: [
          // Left Side: User List
          Expanded(
            flex: 1,
            child: Container(
              decoration: BoxDecoration(
                color: colorScheme.surfaceContainerHighest,
                border: const Border(
                  right: BorderSide(color: Color(0xFF767777), width: 1),
                ),
              ),
              child: viewModel.isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: viewModel.users.length,
                      separatorBuilder: (context, index) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final user = viewModel.users[index];
                        final isSelected = viewModel.selectedUser?.id == user.id;
                        return InkWell(
                          onTap: () => viewModel.selectUser(user),
                          child: Container(
                            height: 64, // high-efficiency row height
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            decoration: BoxDecoration(
                              color: isSelected ? colorScheme.primary : Colors.white,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(
                                color: const Color(0xFF767777),
                                width: 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                CircleAvatar(
                                  backgroundColor: isSelected ? Colors.white : colorScheme.primaryContainer,
                                  foregroundColor: isSelected ? colorScheme.primary : Colors.white,
                                  child: Text(user.name[0]),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        user.name,
                                        style: textTheme.labelLarge?.copyWith(
                                          color: isSelected ? Colors.white : colorScheme.onSurface,
                                        ),
                                      ),
                                      Text(
                                        user.role.toString().split('.').last.toUpperCase(),
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: isSelected ? Colors.white70 : colorScheme.onSurfaceVariant,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                if (isSelected)
                                  const Icon(Icons.chevron_right, color: Colors.white),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ),
          // Right Side: PIN Pad
          Expanded(
            flex: 2,
            child: Stack(
              children: [
                Container(
                  color: colorScheme.surface,
                  padding: const EdgeInsets.all(48.0),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (viewModel.selectedUser != null) ...[
                        Text(
                          'HOLA, ${viewModel.selectedUser!.name.toUpperCase()}',
                          style: textTheme.headlineMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'INGRESE SU PIN PARA CONTINUAR',
                          style: textTheme.bodyMedium?.copyWith(color: colorScheme.outline),
                        ),
                      ] else ...[
                        Text(
                          'SELECCIONE UN USUARIO',
                          style: textTheme.headlineMedium,
                        ),
                      ],
                      const SizedBox(height: 48),
                      // Masked PIN Display (Brutalist Style)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(6, (index) {
                          final hasDigit = index < _pin.length;
                          return Container(
                            margin: const EdgeInsets.symmetric(horizontal: 12),
                            width: 24,
                            height: 24,
                            decoration: BoxDecoration(
                              color: hasDigit ? colorScheme.primary : Colors.transparent,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(
                                color: const Color(0xFF767777),
                                width: 2,
                              ),
                            ),
                          );
                        }),
                      ),
                      const SizedBox(height: 48),
                      if (viewModel.error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 24),
                          child: Text(
                            viewModel.error!,
                            style: TextStyle(color: colorScheme.error, fontWeight: FontWeight.bold, fontSize: 18),
                          ),
                        ),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 450),
                        child: AbsorbPointer(
                          absorbing: viewModel.isLoading,
                          child: Opacity(
                            opacity: viewModel.isLoading ? 0.5 : 1.0,
                            child: PinPad(
                              onKeyPressed: _onPinPressed,
                              onDelete: _onDelete,
                              onClear: _onClear,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (viewModel.isLoading)
                  Container(
                    color: Colors.white.withOpacity(0.3),
                    child: const Center(
                      child: CircularProgressIndicator(),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
