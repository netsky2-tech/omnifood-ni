import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../../../domain/models/user.dart';
import 'user_management_view_model.dart';

class UserManagementView extends StatefulWidget {
  const UserManagementView({super.key});

  @override
  State<UserManagementView> createState() => _UserManagementViewState();
}

class _UserManagementViewState extends State<UserManagementView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<UserManagementViewModel>().loadUsers();
    });
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.watch<UserManagementViewModel>();
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Gestión de Usuarios'),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      body: viewModel.isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: viewModel.users.length,
              itemBuilder: (context, index) {
                final user = viewModel.users[index];
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: _getRoleColor(user.role),
                      child: Text(user.name[0].toUpperCase(), style: const TextStyle(color: Colors.white)),
                    ),
                    title: Text(user.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Text('Rol: ${user.role.name.toUpperCase()} • ${user.isActive ? "ACTIVO" : "INACTIVO"}'),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.lock_reset),
                          tooltip: 'Resetear PIN',
                          onPressed: () => _showResetPinDialog(context, user),
                        ),
                        Switch(
                          value: user.isActive,
                          onChanged: (_) => viewModel.toggleUserStatus(user),
                        ),
                        IconButton(
                          icon: const Icon(Icons.edit),
                          onPressed: () => _showUserDialog(context, user: user),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showUserDialog(context),
        icon: const Icon(Icons.add),
        label: const Text('NUEVO USUARIO'),
      ),
    );
  }

  Color _getRoleColor(UserRole role) {
    switch (role) {
      case UserRole.owner: return Colors.purple;
      case UserRole.manager: return Colors.blue;
      case UserRole.cashier: return Colors.green;
      case UserRole.waiter: return Colors.orange;
    }
  }

  void _showUserDialog(BuildContext context, {User? user}) {
    showDialog(
      context: context,
      builder: (context) => UserDialog(user: user),
    );
  }

  void _showResetPinDialog(BuildContext context, User user) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Resetear PIN para ${user.name}'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Nuevo PIN (4-6 dígitos)'),
          keyboardType: TextInputType.number,
          obscureText: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
          ElevatedButton(
            onPressed: () {
              if (controller.text.length >= 4) {
                context.read<UserManagementViewModel>().resetPin(user.id, controller.text);
                Navigator.pop(context);
              }
            },
            child: const Text('RESETEAR'),
          ),
        ],
      ),
    );
  }
}

class UserDialog extends StatefulWidget {
  final User? user;
  const UserDialog({super.key, this.user});

  @override
  State<UserDialog> createState() => _UserDialogState();
}

class _UserDialogState extends State<UserDialog> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _pinController = TextEditingController();
  UserRole _selectedRole = UserRole.cashier;

  @override
  void initState() {
    super.initState();
    if (widget.user != null) {
      _nameController.text = widget.user!.name;
      _emailController.text = widget.user!.email ?? '';
      _selectedRole = widget.user!.role;
    }
  }

  @override
  Widget build(BuildContext context) {
    final viewModel = context.read<UserManagementViewModel>();

    return AlertDialog(
      title: Text(widget.user == null ? 'Nuevo Usuario' : 'Editar Usuario'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(labelText: 'Nombre Completo'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email (Opcional)'),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<UserRole>(
              initialValue: _selectedRole,
              decoration: const InputDecoration(labelText: 'Rol'),
              items: UserRole.values.map((r) => DropdownMenuItem(
                value: r,
                child: Text(r.name.toUpperCase()),
              )).toList(),
              onChanged: (val) => setState(() => _selectedRole = val!),
            ),
            if (widget.user == null) ...[
              const SizedBox(height: 16),
              TextField(
                controller: _pinController,
                decoration: const InputDecoration(labelText: 'PIN Inicial'),
                keyboardType: TextInputType.number,
                obscureText: true,
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('CANCELAR')),
        ElevatedButton(
          onPressed: () {
            final user = User(
              id: widget.user?.id ?? viewModel.generateId(),
              name: _nameController.text,
              email: _emailController.text.isEmpty ? null : _emailController.text,
              role: _selectedRole,
              isActive: widget.user?.isActive ?? true,
              pinHash: widget.user?.pinHash,
            );
            viewModel.saveUser(user, pin: _pinController.text.isEmpty ? null : _pinController.text);
            Navigator.pop(context);
          },
          child: const Text('GUARDAR'),
        ),
      ],
    );
  }
}
