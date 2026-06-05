import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/ui/features/inventory/boh/boh_permissions.dart';
import 'package:pos_app/ui/widgets/app_drawer.dart';

class BohNavigationShellView extends StatelessWidget {
  const BohNavigationShellView({super.key});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User?>(
      future: context.read<AuthRepository>().getCurrentUser(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        final role = snapshot.data?.role;

        return Scaffold(
          appBar: AppBar(title: const Text('Inventario BOH')),
          drawer: const AppDrawer(),
          body: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Espacio BOH para compras, trazabilidad y control operativo.',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Accedé solo a los módulos habilitados para tu rol actual.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 24),
              _BohDestinationCard(
                title: 'Ítems',
                description: 'Catálogo operativo, PAR y atributos inventariables.',
                routeName: '/inventory/items',
                enabled: hasBohPermission(role, BohPermission.shell),
              ),
              _BohDestinationCard(
                title: 'Proveedores',
                description: 'Directorio BOH y condiciones operativas de compra.',
                routeName: '/inventory/suppliers',
                enabled: hasBohPermission(role, BohPermission.shell),
              ),
              _BohDestinationCard(
                title: 'Almacenes',
                description: 'Ubicaciones y contexto de conteo/recepción.',
                routeName: '/inventory/warehouses',
                enabled: hasBohPermission(role, BohPermission.shell),
              ),
              _BohDestinationCard(
                title: 'Compras',
                description: 'Recepción, revisión y seguimiento de compras.',
                routeName: '/inventory/purchases',
                enabled: hasBohPermission(role, BohPermission.purchasesView),
              ),
              _BohDestinationCard(
                title: 'Producción',
                description: 'Órdenes internas, consumos y recepciones.',
                routeName: '/inventory/production',
                enabled: hasBohPermission(role, BohPermission.productionView),
              ),
              _BohDestinationCard(
                title: 'Conteos y ajustes',
                description: 'Conteos físicos con control operativo.',
                routeName: '/inventory/counts',
                enabled: hasBohPermission(role, BohPermission.countsView),
              ),
              _BohDestinationCard(
                title: 'Alertas BOH',
                description: 'Incidencias y señales de atención prioritaria.',
                routeName: '/inventory/alerts',
                enabled: hasBohPermission(role, BohPermission.alertsView),
              ),
              _BohDestinationCard(
                title: 'Kardex BOH',
                description: 'Movimientos y trazabilidad auditable.',
                routeName: '/inventory/kardex',
                enabled: hasBohPermission(role, BohPermission.kardexView),
              ),
              _BohDestinationCard(
                title: 'Recetas',
                description: 'Versionado y control de fórmulas operativas.',
                routeName: '/inventory/recipes',
                enabled: hasBohPermission(role, BohPermission.recipesView),
              ),
              _BohDestinationCard(
                title: 'Mermas',
                description: 'Registros de merma, destrucción y control operativo.',
                routeName: '/inventory/shrinkage',
                enabled: hasBohPermission(role, BohPermission.shrinkageView),
              ),
            ],
          ),
        );
      },
    );
  }
}

class BohAccessDeniedView extends StatelessWidget {
  const BohAccessDeniedView({super.key, required this.featureLabel});

  final String featureLabel;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Acceso restringido')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 48),
              const SizedBox(height: 16),
              Text(
                'No tenés permisos para acceder a $featureLabel.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 12),
              const Text(
                'Esta superficie BOH está reservada para administración y gerencia.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class BohRouteGuard extends StatelessWidget {
  const BohRouteGuard({
    super.key,
    required this.permission,
    required this.featureLabel,
    required this.child,
  });

  final String permission;
  final String featureLabel;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User?>(
      future: context.read<AuthRepository>().getCurrentUser(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (hasBohPermission(snapshot.data?.role, permission)) {
          return child;
        }

        return BohAccessDeniedView(featureLabel: featureLabel);
      },
    );
  }
}

class _BohDestinationCard extends StatelessWidget {
  const _BohDestinationCard({
    required this.title,
    required this.description,
    required this.routeName,
    required this.enabled,
  });

  final String title;
  final String description;
  final String routeName;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Icon(enabled ? Icons.arrow_outward : Icons.lock_outline),
        title: Text(title),
        subtitle: Text(
          enabled ? description : 'Sin permiso para este módulo.',
        ),
        enabled: enabled,
        onTap: enabled ? () => Navigator.pushNamed(context, routeName) : null,
      ),
    );
  }
}
