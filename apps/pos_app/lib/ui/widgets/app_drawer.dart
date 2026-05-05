import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../domain/repositories/auth_repository.dart';
import '../../../domain/models/user.dart';

class AppDrawer extends StatefulWidget {
  const AppDrawer({super.key});

  @override
  State<AppDrawer> createState() => _AppDrawerState();
}

class _AppDrawerState extends State<AppDrawer> {
  User? _currentUser;
  int _userCount = 0;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final authRepo = context.read<AuthRepository>();
    final user = await authRepo.getCurrentUser();
    final users = await authRepo.getAllUsers();
    if (mounted) {
      setState(() {
        _currentUser = user;
        _userCount = users.where((u) => u.isActive).length;
      });
    }
  }

  bool get _isAdminOrManager =>
      _currentUser != null &&
      (_currentUser!.role == UserRole.owner ||
          _currentUser!.role == UserRole.manager);

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Drawer(
      backgroundColor: colorScheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      child: Column(
        children: [
          DrawerHeader(
            decoration: BoxDecoration(
              color: colorScheme.primary,
            ),
            child: Center(
              child: Text(
                'OmniFood NI',
                style: textTheme.headlineMedium?.copyWith(color: colorScheme.onPrimary),
              ),
            ),
          ),
          ListTile(
            leading: const Icon(Icons.shopping_cart),
            title: const Text('VENTAS (POS)'),
            onTap: () {
              Navigator.pop(context);
              Navigator.pushReplacementNamed(context, '/sales');
            },
          ),
          ListTile(
            leading: const Icon(Icons.receipt),
            title: const Text('Historial de Ventas'),
            onTap: () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '/sales/history');
            },
          ),
          ListTile(
            leading: const Icon(Icons.analytics),
            title: const Text('Reportes DGI'),
            onTap: () {
              Navigator.pop(context);
              Navigator.pushNamed(context, '/sales/reports');
            },
          ),
          const Divider(),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text('INVENTARIO', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          ),
          ListTile(
            leading: const Icon(Icons.inventory_2),
            title: const Text('Insumos'),
            onTap: () => Navigator.pushNamed(context, '/inventory/items'),
          ),
          ListTile(
            leading: const Icon(Icons.local_shipping),
            title: const Text('Proveedores'),
            onTap: () => Navigator.pushNamed(context, '/inventory/suppliers'),
          ),
          ListTile(
            leading: const Icon(Icons.warehouse),
            title: const Text('Bodegas'),
            onTap: () => Navigator.pushNamed(context, '/inventory/warehouses'),
          ),
          ListTile(
            leading: const Icon(Icons.add_shopping_cart),
            title: const Text('Compras'),
            onTap: () => Navigator.pushNamed(context, '/inventory/purchases'),
          ),
          ListTile(
            leading: const Icon(Icons.remove_shopping_cart),
            title: const Text('Mermas'),
            onTap: () => Navigator.pushNamed(context, '/inventory/shrinkage'),
          ),
          ListTile(
            leading: const Icon(Icons.receipt_long),
            title: const Text('Recetas'),
            onTap: () => Navigator.pushNamed(context, '/inventory/recipes'),
          ),
          const Divider(),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text('CONFIGURACIÓN', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          ),
          ListTile(
            leading: const Icon(Icons.business),
            title: const Text('Perfil del Negocio'),
            onTap: () => Navigator.pushNamed(context, '/config/profile'),
          ),
          if (_userCount > 0)
            ListTile(
              leading: const Icon(Icons.people),
              title: const Text('Gestión de Usuarios'),
              onTap: () {
                Navigator.pop(context);
                Navigator.pushNamed(context, '/identity/users');
              },
            ),
          if (_isAdminOrManager)
            ListTile(
              leading: const Icon(Icons.history),
              title: const Text('Bitácora de Auditoría'),
              onTap: () {
                Navigator.pop(context);
                Navigator.pushNamed(context, '/identity/audit');
              },
            ),
          const Spacer(),
          const Divider(),
          ListTile(
            leading: Icon(Icons.logout, color: colorScheme.error),
            title: Text('CERRAR SESIÓN', style: TextStyle(color: colorScheme.error, fontWeight: FontWeight.bold)),
            onTap: () async {
              await context.read<AuthRepository>().logout();
              if (context.mounted) {
                Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
              }
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
