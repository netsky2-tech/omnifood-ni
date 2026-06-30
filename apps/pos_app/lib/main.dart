import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:pos_app/presentation/widgets/inventory_alert_overlay.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'data/database/app_database.dart';
import 'data/database/migrations.dart';
import 'data/repositories/auth_repository_impl.dart';
import 'domain/repositories/auth_repository.dart';
import 'data/repositories/audit_repository_impl.dart';
import 'data/services/local_auth_service.dart';
import 'data/services/sync_service.dart';
import 'ui/features/auth/viewmodels/login_viewmodel.dart';
import 'ui/features/auth/viewmodels/lock_screen_viewmodel.dart';
import 'ui/features/inventory/items/insumo_view_model.dart';
import 'ui/features/inventory/purchases/purchase_view_model.dart';
import 'ui/features/inventory/shrinkage/shrinkage_view_model.dart';
import 'ui/features/inventory/alerts/forensic_alert_view_model.dart';
import 'ui/features/inventory/boh/boh_navigation_shell_view.dart';
import 'ui/features/inventory/boh/boh_permissions.dart';
import 'ui/features/inventory/counts/physical_count_view.dart';
import 'ui/features/inventory/counts/physical_count_view_model.dart';
import 'ui/features/inventory/kardex/kardex_view.dart';
import 'ui/features/inventory/kardex/kardex_view_model.dart';
import 'ui/features/inventory/production/production_order_view_model.dart';
import 'ui/features/inventory/recipes/recipe_view_model.dart';
import 'ui/features/inventory/suppliers/supplier_view_model.dart';
import 'ui/features/inventory/warehouses/warehouse_view_model.dart';
import 'ui/features/inventory/items/insumo_view.dart';
import 'ui/features/inventory/purchases/purchase_view.dart';
import 'ui/features/inventory/shrinkage/shrinkage_view.dart';
import 'ui/features/inventory/alerts/forensic_alert_view.dart';
import 'ui/features/inventory/production/production_order_view.dart';
import 'ui/features/inventory/recipes/recipe_view.dart';
import 'ui/features/inventory/suppliers/supplier_view.dart';
import 'ui/features/inventory/warehouses/warehouse_view.dart';
import 'data/repositories/sales/sales_repository_impl.dart';
import 'presentation/features/sales/view_models/sale_view_model.dart';
import 'ui/features/sales/sale_view.dart';
import 'ui/features/sales/sales_history_view.dart';
import 'presentation/features/sales/view_models/sales_history_view_model.dart';
import 'ui/features/sales/reports/dgi_report_view_model.dart';
import 'ui/features/sales/reports/dgi_report_view.dart';
import 'ui/features/config/business_profile/business_profile_view_model.dart';
import 'ui/features/config/business_profile/business_profile_view.dart';
import 'ui/features/identity/audit/audit_log_view_model.dart';
import 'ui/features/identity/audit/audit_log_view.dart';
import 'ui/features/identity/users/user_management_view_model.dart';
import 'ui/features/identity/users/user_management_view.dart';
import 'ui/features/auth/views/login_view.dart';
import 'ui/features/auth/views/lock_screen_view.dart';
import 'domain/services/sales/dgi_numbering_service.dart';
import 'data/services/sales/dgi_numbering_service_impl.dart';
import 'domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'domain/usecases/inventory/reverse_sale_inventory_use_case.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Configuration (Could be loaded from .env)
  //const String baseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://192.168.0.6:3000/api');
  const String baseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://127.0.0.1:3000/api');
  const String deviceId = String.fromEnvironment('DEVICE_ID', defaultValue: 'pos-terminal-001');

  // Initialize Database
  final database = await $FloorAppDatabase
      .databaseBuilder('app_database.db')
      .addMigrations(allMigrations)
      .addCallback(inventoryMovementAppendOnlyCallback)
      .build();
  
  // Initialize Services & Repositories
  final dio = Dio(BaseOptions(baseUrl: baseUrl));
  final localAuthService = LocalAuthService();
  final authRepository = AuthRepositoryImpl(
    database.userDao,
    database.securityProfileDao,
    localAuthService,
    dio,
  );

  // Add Auth Interceptor
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final token = await authRepository.getAccessToken();
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      return handler.next(options);
    },
  ));

  final auditRepository = AuditRepositoryImpl(
    database.auditDao,
    authRepository,
    dio,
    deviceId,
  );

  final inventoryRepository = InventoryRepositoryImpl(
    insumoDao: database.insumoDao,
    recipeDao: database.recipeDao,
    recipeVersionDocumentDao: database.recipeVersionDocumentDao,
    countSessionDao: database.countSessionDao,
    countLineDao: database.countLineDao,
    forensicAlertDao: database.forensicAlertDao,
    movementDao: database.movementDao,
    movementSyncStateDao: database.movementSyncStateDao,
    supplierDao: database.supplierDao,
    warehouseDao: database.warehouseDao,
    uomConversionDao: database.uomConversionDao,
    batchDao: database.batchDao,
    purchaseDao: database.purchaseDao,
    productionOrderDocumentDao: database.productionOrderDocumentDao,
    dio: dio,
    database: database,
  );
  final alertService = AlertServiceImpl(inventoryRepository);
  await alertService.hydrateInbox();
  final movementEngine = MovementEngineImpl(inventoryRepository, alertService);

  // Sales Module Initialization
  final numberingService = DgiNumberingServiceImpl(database.localConfigDao);
  // Provision initial DGI range for Pilot (Coffee Shop)
  await numberingService.initializeRange(
    prefix: '001-001-01-', 
    start: 1, 
    end: 1000,
  );

  final processInventoryUseCase = ProcessSaleInventoryUseCase(movementEngine);
  final reverseInventoryUseCase = ReverseSaleInventoryUseCase(movementEngine);

  final salesRepository = SalesRepositoryImpl(
    database: database,
    invoiceDao: database.invoiceDao,
    itemDao: database.invoiceItemDao,
    paymentDao: database.paymentDao,
    transactionDao: database.salesTransactionDao,
    numberingService: numberingService,
    movementEngine: movementEngine,
    auditRepository: auditRepository,
    processInventoryUseCase: processInventoryUseCase,
    reverseInventoryUseCase: reverseInventoryUseCase,
    inventoryRepository: inventoryRepository,
  );

  final syncService = SyncService(
    auditRepository,
    salesRepository,
    inventoryRepository,
    dio,
  );
  syncService.start();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => LoginViewModel(authRepository)),
        ChangeNotifierProvider(create: (_) => LockScreenViewModel(authRepository, database.userDao)),
        ChangeNotifierProvider(create: (_) => SupplierViewModel(inventoryRepository)),
        ChangeNotifierProvider(create: (_) => WarehouseViewModel(inventoryRepository)),
        ChangeNotifierProvider(create: (_) => InsumoViewModel(inventoryRepository, alertService: alertService)),
        ChangeNotifierProvider(create: (_) => PurchaseViewModel(inventoryRepository, movementEngine)),
        ChangeNotifierProvider(create: (_) => ShrinkageViewModel(inventoryRepository, movementEngine)),
        ChangeNotifierProvider(create: (_) => ForensicAlertViewModel(alertService)),
        ChangeNotifierProvider(create: (_) => PhysicalCountViewModel(inventoryRepository, movementEngine)),
        ChangeNotifierProvider(create: (_) => KardexViewModel(inventoryRepository)),
        ChangeNotifierProvider(create: (_) => ProductionOrderViewModel(inventoryRepository, movementEngine)),
        ChangeNotifierProvider(create: (_) => UserManagementViewModel(authRepository)),
        ChangeNotifierProvider(create: (_) => RecipeViewModel(inventoryRepository)),
        ChangeNotifierProvider(create: (_) => DgiReportViewModel(salesRepository, database)),
        ChangeNotifierProvider(create: (_) => BusinessProfileViewModel(database.localConfigDao)),
        ChangeNotifierProvider(create: (_) => AuditLogViewModel(auditRepository)),
        ChangeNotifierProvider(create: (_) => SalesHistoryViewModel(database)),
        ChangeNotifierProvider(create: (_) => SaleViewModel(
          salesRepository, 
          inventoryRepository, 
          authRepository,
          database,
        )),
        Provider<AuthRepository>.value(value: authRepository),
        Provider<AuditRepositoryImpl>.value(value: auditRepository),
        Provider<AlertService>.value(value: alertService),
        Provider<MovementEngineImpl>.value(value: movementEngine),
        Provider<SalesRepositoryImpl>.value(value: salesRepository),
        Provider<DgiNumberingService>.value(value: numberingService),
        Provider<SyncService>.value(value: syncService),
      ],
      child: MyApp(alertService: alertService),
    ),
  );
}

class MyApp extends StatelessWidget {
  final AlertService alertService;
  final String initialRoute;
  const MyApp({
    super.key,
    required this.alertService,
    this.initialRoute = '/',
  });

  @override
  Widget build(BuildContext context) {
    return InventoryAlertOverlay(
      alertService: alertService,
      child: MaterialApp(
        title: 'OmniFood NI POS',
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: const ColorScheme(
            brightness: Brightness.light,
            primary: Color(0xFF3F6167), // Muted Teal
            onPrimary: Colors.white,
            primaryContainer: Color(0xFF577A80),
            onPrimaryContainer: Color(0xFFF7FEFF),
            secondary: Color(0xFF546163), // Cool Gray
            onSecondary: Colors.white,
            tertiary: Color(0xFF79573F), // Warm Brown
            onTertiary: Colors.white,
            error: Color(0xFFBA1A1A),
            onError: Colors.white,
            surface: Color(0xFFFAF9F9),
            onSurface: Color(0xFF1A1C1C),
            surfaceContainerHighest: Color(0xFFE3E2E2),
            onSurfaceVariant: Color(0xFF414849),
            outline: Color(0xFF71787A),
            outlineVariant: Color(0xFFC1C8C9),
          ),
          scaffoldBackgroundColor: const Color(0xFFFAF9F9),
          fontFamily: 'Inter',
          textTheme: const TextTheme(
            headlineLarge: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.64, // -0.02em
              height: 1.25, // 40px
            ),
            headlineMedium: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.24, // -0.01em
              height: 1.33, // 32px
            ),
            bodyLarge: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w400,
              height: 1.55, // 28px
            ),
            bodyMedium: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w400,
              height: 1.5, // 24px
            ),
            labelLarge: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              height: 1.42, // 20px
            ),
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
              elevation: 0,
              backgroundColor: const Color(0xFF3F6167),
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(4),
                side: const BorderSide(color: Color(0xFF767777), width: 1),
              ),
            ),
          ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: const BorderSide(color: Color(0xFF767777), width: 1),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: const BorderSide(color: Color(0xFF767777), width: 1),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(4),
              borderSide: const BorderSide(color: Color(0xFF3F6167), width: 2),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          ),
          cardTheme: CardThemeData(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(4),
              side: const BorderSide(color: Color(0xFF767777), width: 1),
            ),
            color: Colors.white,
          ),
        ),
        initialRoute: initialRoute,
        routes: {
          '/': (context) => const LoginView(),
          '/lock': (context) => const LockScreenView(),
          '/home': (context) => const SaleView(),
          '/sales': (context) => const SaleView(),
          '/inventory/boh': (context) => const BohRouteGuard(
            permission: BohPermission.shell,
            featureLabel: 'Inventario BOH',
            child: BohNavigationShellView(),
          ),
          '/inventory/items': (context) => const BohRouteGuard(
            permission: BohPermission.shell,
            featureLabel: 'Ítems BOH',
            child: InsumoView(),
          ),
          '/inventory/suppliers': (context) => const BohRouteGuard(
            permission: BohPermission.shell,
            featureLabel: 'Proveedores BOH',
            child: SupplierView(),
          ),
          '/inventory/warehouses': (context) => const BohRouteGuard(
            permission: BohPermission.shell,
            featureLabel: 'Almacenes BOH',
            child: WarehouseView(),
          ),
          '/inventory/purchases': (context) => const BohRouteGuard(
            permission: BohPermission.purchasesView,
            featureLabel: 'Compras BOH',
            child: PurchaseView(),
          ),
          '/inventory/shrinkage': (context) => const BohRouteGuard(
            permission: BohPermission.shrinkageView,
            featureLabel: 'Mermas BOH',
            child: ShrinkageView(),
          ),
          '/inventory/alerts': (context) => const BohRouteGuard(
            permission: BohPermission.alertsView,
            featureLabel: 'Alertas BOH',
            child: ForensicAlertView(),
          ),
          '/inventory/counts': (context) => const BohRouteGuard(
            permission: BohPermission.countsView,
            featureLabel: 'Conteos y ajustes BOH',
            child: PhysicalCountView(),
          ),
          '/inventory/kardex': (context) => const BohRouteGuard(
            permission: BohPermission.kardexView,
            featureLabel: 'Kardex BOH',
            child: KardexView(),
          ),
          '/inventory/production': (context) => const BohRouteGuard(
            permission: BohPermission.productionView,
            featureLabel: 'Producción BOH',
            child: ProductionOrderView(),
          ),
          '/inventory/recipes': (context) => const BohRouteGuard(
            permission: BohPermission.recipesView,
            featureLabel: 'Recetas BOH',
            child: RecipeView(),
          ),
          '/sales/reports': (context) => const DgiReportView(),
          '/sales/history': (context) => const SalesHistoryView(),
          '/identity/users': (context) => const UserManagementView(),
          '/config/profile': (context) => const BusinessProfileView(),
          '/identity/audit': (context) => const AuditLogView(),
          },
      ),
    );
  }
}

class PlaceholderHome extends StatelessWidget {
  const PlaceholderHome({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('OmniFood NI - POS')),
      body: const Center(child: Text('Bienvenido al Punto de Venta')),
    );
  }
}
