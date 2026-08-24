import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/alerts/stock_alerts_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late StockAlertsViewModel viewModel;

  final testInsumos = <Insumo>[
    const Insumo(
      id: 'ins-healthy',
      name: 'Café Grano',
      consumptionUom: 'kg',
      stock: 25.0,
      averageCost: 120.0,
      stockMin: 5.0,
      parLevel: 30.0,
    ),
    const Insumo(
      id: 'ins-warning',
      name: 'Leche Entera',
      consumptionUom: 'lt',
      stock: 4.0, // <= minStock 5.0 -> WARNING
      averageCost: 35.0,
      stockMin: 5.0,
      parLevel: 20.0,
    ),
    const Insumo(
      id: 'ins-critical',
      name: 'Vasos 8oz',
      consumptionUom: 'unit',
      stock: 0.0, // == 0 -> CRITICAL
      averageCost: 2.0,
      stockMin: 50.0,
      parLevel: 100.0,
    ),
    const Insumo(
      id: 'ins-negative',
      name: 'Azúcar Morena',
      consumptionUom: 'kg',
      stock: -2.5, // < 0 -> NEGATIVE_STOCK
      averageCost: 25.0,
      stockMin: 5.0,
      parLevel: 20.0,
    ),
  ];

  setUp(() {
    repository = _MockInventoryRepository();
    viewModel = StockAlertsViewModel(repository);
  });

  test('loadStockAlerts calculates critical, warning, and negative stock alerts correctly', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);

    await viewModel.loadStockAlerts();

    expect(viewModel.isLoading, isFalse);
    expect(viewModel.errorMessage, isNull);

    expect(viewModel.totalAlertsCount, 3);
    expect(viewModel.criticalCount, 1);
    expect(viewModel.negativeCount, 1);
    expect(viewModel.warningCount, 1);

    expect(viewModel.alerts, hasLength(3));

    // Negative stock is prioritized first
    expect(viewModel.alerts[0].insumoId, 'ins-negative');
    expect(viewModel.alerts[0].severity, StockAlertSeverity.negativeStock);
    expect(viewModel.alerts[0].suggestedReorderQuantity, 22.5); // 20 - (-2.5)

    // Critical stock is next
    expect(viewModel.alerts[1].insumoId, 'ins-critical');
    expect(viewModel.alerts[1].severity, StockAlertSeverity.critical);
    expect(viewModel.alerts[1].suggestedReorderQuantity, 100.0); // 100 - 0

    // Warning stock is last
    expect(viewModel.alerts[2].insumoId, 'ins-warning');
    expect(viewModel.alerts[2].severity, StockAlertSeverity.warning);
    expect(viewModel.alerts[2].suggestedReorderQuantity, 16.0); // 20 - 4
  });

  test('filters alerts by severity and search query', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
    await viewModel.loadStockAlerts();

    viewModel.setSeverityFilter(StockAlertSeverity.critical);
    expect(viewModel.filteredAlerts, hasLength(1));
    expect(viewModel.filteredAlerts.first.insumoId, 'ins-critical');

    viewModel.setSeverityFilter(null); // all
    viewModel.setSearchQuery('leche');
    expect(viewModel.filteredAlerts, hasLength(1));
    expect(viewModel.filteredAlerts.first.insumoId, 'ins-warning');
  });

  test('triangulates edge cases: missing parLevel, missing minStock, and unconfigured items', () async {
    final edgeInsumos = <Insumo>[
      // Case 1: missing parLevel -> defaults to minStock * 2 = 20
      const Insumo(
        id: 'ins-no-par',
        name: 'Té Negro',
        consumptionUom: 'box',
        stock: 3.0, // <= minStock 10.0 -> WARNING
        averageCost: 50.0,
        stockMin: 10.0,
        parLevel: null,
      ),
      // Case 2: missing minStock and parLevel with 0 stock -> CRITICAL, reorder = 10 - 0 = 10
      const Insumo(
        id: 'ins-raw-zero',
        name: 'Servilletas',
        consumptionUom: 'pack',
        stock: 0.0, // == 0 -> CRITICAL
        averageCost: 15.0,
        stockMin: null,
        parLevel: null,
      ),
      // Case 3: positive stock with no thresholds -> Healthy, no alert
      const Insumo(
        id: 'ins-raw-ok',
        name: 'Canela',
        consumptionUom: 'kg',
        stock: 5.0,
        averageCost: 80.0,
        stockMin: null,
        parLevel: null,
      ),
    ];

    when(() => repository.getActiveInsumos()).thenAnswer((_) async => edgeInsumos);

    await viewModel.loadStockAlerts();

    expect(viewModel.totalAlertsCount, 2);
    expect(viewModel.criticalCount, 1);
    expect(viewModel.warningCount, 1);

    final warningItem = viewModel.alerts.firstWhere((a) => a.insumoId == 'ins-no-par');
    expect(warningItem.suggestedReorderQuantity, 17.0); // (10 * 2) - 3 = 17

    final criticalItem = viewModel.alerts.firstWhere((a) => a.insumoId == 'ins-raw-zero');
    expect(criticalItem.suggestedReorderQuantity, 10.0); // 10 - 0 = 10
  });

  test('handles repository error cleanly', () async {
    when(() => repository.getActiveInsumos()).thenThrow(Exception('Network timeout'));

    await viewModel.loadStockAlerts();

    expect(viewModel.isLoading, isFalse);
    expect(viewModel.errorMessage, contains('Network timeout'));
    expect(viewModel.alerts, isEmpty);
  });
}
