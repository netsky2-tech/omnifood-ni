import 'package:flutter/material.dart';
import 'package:pos_app/data/adapters/customer_identification_adapters.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/domain/models/customer/customer.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/sales/customer_identification_service.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/presentation/features/sales/widgets/customer_select_dialog.dart';

/// On-device harness for the POS customer-selection modal.
///
/// Runs the REAL dialog against the REAL Android SQLite database, bypassing
/// the terminal-linking gate (the backend may be unreachable). Detection of a
/// camera QR is logged to logcat for evidence:
///
///   flutter build apk --debug -t tool/customer_modal_device_check.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb shell am start -n com.nhilos.pos_app/.MainActivity
///   adb logcat -d | grep -E "CUSTOMER_QR|MODAL_E2E"
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final database = await $FloorAppDatabase
      .databaseBuilder('app_database.db')
      .addMigrations(allMigrations)
      .build();

  final identification = CustomerIdentificationService([
    QrIdentificationAdapter(database.customerDao),
    CustomerCodeIdentificationAdapter(database.customerDao),
    PhoneIdentificationAdapter(database.customerDao),
    SearchIdentificationAdapter(database.customerDao),
  ]);

  final viewModel = SaleViewModel(
    _UnusedSalesRepository(),
    _UnusedInventoryRepository(),
    _UnusedAuthRepository(),
    database,
    null, // TableOrderService
    false, // autoLoad: keep the harness focused on the modal
    null, // TenantConfigService
    null, // KitchenOrderService
    null, // PrinterConfigService
    null, // PrinterPort
    null, // SyncService
    null, // PromotionsEngine
    null, // LoyaltyService
    '', // terminalId
    identification,
  );

  debugPrint('MODAL_E2E_READY db=${database.hashCode}');
  runApp(_HarnessApp(viewModel: viewModel));
}

class _HarnessApp extends StatelessWidget {
  final SaleViewModel viewModel;

  const _HarnessApp({required this.viewModel});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: _HarnessHome(viewModel: viewModel),
    );
  }
}

class _HarnessHome extends StatefulWidget {
  final SaleViewModel viewModel;

  const _HarnessHome({required this.viewModel});

  @override
  State<_HarnessHome> createState() => _HarnessHomeState();
}

class _HarnessHomeState extends State<_HarnessHome> {
  Customer? _selected;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Modal de cliente — harness')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Valida: carga paginada (50), scroll para más, teclado sin '
              'overflow, búsqueda unificada y escaneo QR.',
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () async {
                final result = await CustomerSelectDialog.show(
                  context,
                  widget.viewModel,
                );
                setState(() => _selected = result);
                debugPrint(
                  'MODAL_E2E_SELECTED id=${result?.id} '
                  'name=${result?.name} type=${result?.customerType}',
                );
              },
              icon: const Icon(Icons.person_search),
              label: const Text('Abrir modal de cliente'),
            ),
            const SizedBox(height: 24),
            Text(
              _selected == null
                  ? 'Ningún cliente seleccionado.'
                  : 'Seleccionado: ${_selected!.name} '
                      '(${_selected!.customerType ?? "sin tipo"})',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _UnusedSalesRepository implements SalesRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedInventoryRepository implements InventoryRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _UnusedAuthRepository implements AuthRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
