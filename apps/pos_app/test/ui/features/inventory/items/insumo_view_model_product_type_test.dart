import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/catalog/catalog_type.dart';
import 'package:pos_app/domain/models/catalog/catalog_value.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/items/insumo_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  const existingPreparedProduct = Product(
    id: 'prod-1',
    name: 'Hamburguesa',
    uom: 'un',
    stock: 3,
    averageCost: 45,
    sellPrice: 120,
    isPrepared: true,
  );

  setUpAll(() {
    registerFallbackValue(existingPreparedProduct);
    registerFallbackValue(CatalogType.uom);
    registerFallbackValue(
      const CatalogValue(
        id: 'catalog-fallback',
        catalogType: CatalogType.uom,
        code: 'un',
        name: 'Unidad',
      ),
    );
  });

  group('InsumoViewModel product type mapping', () {
    late _MockInventoryRepository repository;
    late InsumoViewModel viewModel;

    setUp(() async {
      repository = _MockInventoryRepository();
      when(
        () => repository.getActiveInsumos(),
      ).thenAnswer((_) async => const []);
      when(
        () => repository.getActiveProducts(),
      ).thenAnswer((_) async => const [existingPreparedProduct]);
      when(
        () => repository.getActiveWarehouses(),
      ).thenAnswer((_) async => const []);
      when(
        () => repository.getActiveCatalog(any()),
      ).thenAnswer((_) async => const []);
      when(() => repository.saveProduct(any())).thenAnswer((_) async {});

      viewModel = InsumoViewModel(repository);
      await viewModel.loadInitialData();
    });

    test(
      'changing an existing prepared product to REVENTA saves isPrepared false',
      () async {
        await viewModel.saveProduct(
          id: existingPreparedProduct.id,
          name: existingPreparedProduct.name,
          sku: existingPreparedProduct.sku,
          barcode: existingPreparedProduct.barcode,
          category: existingPreparedProduct.category,
          isPrepared: viewModel.isPreparedForTypeCode('REVENTA'),
          uom: existingPreparedProduct.uom,
          stock: existingPreparedProduct.stock,
          averageCost: existingPreparedProduct.averageCost,
          sellPrice: existingPreparedProduct.sellPrice,
        );

        final savedProduct =
            verify(() => repository.saveProduct(captureAny())).captured.single
                as Product;
        expect(savedProduct.id, existingPreparedProduct.id);
        expect(savedProduct.isPrepared, isFalse);
      },
    );

    test(
      'changing an existing product to PREPARADO saves isPrepared true',
      () async {
        await viewModel.saveProduct(
          id: existingPreparedProduct.id,
          name: existingPreparedProduct.name,
          sku: existingPreparedProduct.sku,
          barcode: existingPreparedProduct.barcode,
          category: existingPreparedProduct.category,
          isPrepared: viewModel.isPreparedForTypeCode('PREPARADO'),
          uom: existingPreparedProduct.uom,
          stock: existingPreparedProduct.stock,
          averageCost: existingPreparedProduct.averageCost,
          sellPrice: existingPreparedProduct.sellPrice,
        );

        final savedProduct =
            verify(() => repository.saveProduct(captureAny())).captured.single
                as Product;
        expect(savedProduct.id, existingPreparedProduct.id);
        expect(savedProduct.isPrepared, isTrue);
      },
    );
  });
}
