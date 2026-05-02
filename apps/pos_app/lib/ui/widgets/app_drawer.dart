import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../domain/repositories/auth_repository.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

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
