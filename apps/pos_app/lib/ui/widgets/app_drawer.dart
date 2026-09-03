import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../domain/repositories/auth_repository.dart';
import '../../../domain/models/user.dart';
import '../../../domain/services/config/tenant_config_service.dart';
import '../features/inventory/boh/boh_permissions.dart';

class AppDrawer extends StatefulWidget {
  const AppDrawer({super.key});

  @override
  State<AppDrawer> createState() => _AppDrawerState();
}

class _AppDrawerState extends State<AppDrawer> {
  User? _currentUser;
  int _userCount = 0;
  bool _supportsTables = false;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final authRepo = context.read<AuthRepository>();
    final user = await authRepo.getCurrentUser();
    final users = await authRepo.getAllUsers();

    bool supportsTables = false;
    try {
      final configService = context.read<TenantConfigService>();
      final config = await configService.getTenantConfig();
      supportsTables = config.supportsTables;
    } catch (_) {}

    if (mounted) {
      setState(() {
        _currentUser = user;
        _userCount = users.where((u) => u.isActive).length;
        _supportsTables = supportsTables;
      });
    }
  }

  bool get _isAdminOrManager =>
      _currentUser != null &&
      (_currentUser!.role == UserRole.owner ||
          _currentUser!.role == UserRole.manager);

  bool get _canAccessDgiReports =>
      _currentUser != null &&
      (_currentUser!.role == UserRole.owner ||
          _currentUser!.role == UserRole.manager);

  bool get _canAccessBohShell => canAccessAnyBoh(_currentUser?.role);

  String _getRoleLabel(UserRole? role) {
    switch (role) {
      case UserRole.owner:
        return 'DUEÑO / ADMIN';
      case UserRole.manager:
        return 'GERENTE';
      case UserRole.cashier:
        return 'CAJERO';
      case UserRole.waiter:
        return 'MESERO';
      default:
        return 'USUARIO';
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Drawer(
      backgroundColor: colorScheme.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      child: SafeArea(
        child: Column(
          children: [
            // Header with User Profile
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: colorScheme.primary,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 18,
                        backgroundColor: Colors.white,
                        child: Icon(
                          Icons.restaurant,
                          color: colorScheme.primary,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'OmniFood NI',
                              style: textTheme.titleLarge?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (_currentUser != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            _currentUser!.name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.white.withOpacity(0.4), width: 0.8),
                          ),
                          child: Text(
                            _getRoleLabel(_currentUser!.role),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),

            // Navigation Options
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  // --- SECTION 1: FOH SALES & SALON ---
                  ListTile(
                    leading: const Icon(Icons.shopping_cart),
                    title: const Text('VENTAS (POS)'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.pushReplacementNamed(context, '/sales');
                    },
                  ),
                  if (_supportsTables)
                    ListTile(
                      leading: const Icon(Icons.table_restaurant),
                      title: const Text('Salón y Mesas'),
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.pushNamed(context, '/sales/tables');
                      },
                    ),
                  ListTile(
                    leading: const Icon(Icons.kitchen),
                    title: const Text('KDS - Pantalla de Cocina'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.pushNamed(context, '/kitchen');
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
                    leading: const Icon(Icons.point_of_sale),
                    title: const Text('Control de Caja y Turnos'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.pushNamed(context, '/sales/cash');
                    },
                  ),

                  // --- SECTION 2: GERENCIA & REPORTES (ADMIN / DUEÑO) ---
                  if (_canAccessDgiReports)
                    ListTile(
                      leading: const Icon(Icons.analytics),
                      title: const Text('Reportes DGI'),
                      onTap: () {
                        Navigator.pop(context);
                        Navigator.pushNamed(context, '/sales/reports');
                      },
                    ),

                  // --- SECTION 3: INVENTARIO BOH ---
                  const Divider(),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text('INVENTARIO', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  ),
                  ListTile(
                    leading: const Icon(Icons.account_tree_outlined),
                    title: const Text('Inventario BOH'),
                    subtitle: Text(
                      _canAccessBohShell
                          ? 'Ítems, proveedores, almacenes, compras, producción, conteos, alertas, kardex, recetas y mermas.'
                          : 'Disponible solo para administración y gerencia.',
                    ),
                    enabled: _canAccessBohShell,
                    onTap: _canAccessBohShell
                        ? () {
                            Navigator.pop(context);
                            Navigator.pushNamed(context, '/inventory/boh');
                          }
                        : null,
                  ),

                  // --- SECTION 4: CONFIGURACIÓN & SEGURIDAD ---
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
                  ListTile(
                    leading: const Icon(Icons.print),
                    title: const Text('Hardware e Impresora'),
                    onTap: () {
                      Navigator.pop(context);
                      Navigator.pushNamed(context, '/config/hardware');
                    },
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
                ],
              ),
            ),

            // Footer / Logout
            const Divider(),
            ListTile(
              leading: Icon(Icons.logout, color: colorScheme.error),
              title: Text(
                'CERRAR SESIÓN',
                style: TextStyle(
                  color: colorScheme.error,
                  fontWeight: FontWeight.bold,
                ),
              ),
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
      ),
    );
  }
}
