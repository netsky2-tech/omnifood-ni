import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import 'package:uuid/uuid.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';
import 'package:pos_app/presentation/widgets/inventory_alert_overlay.dart';
import 'package:pos_app/data/repositories/inventory/inventory_repository_impl.dart';
import 'data/database/app_database.dart';
import 'data/database/migrations.dart';
import 'data/database/database_seeder.dart';
import 'data/network/cloud_auth_interceptor.dart';
import 'data/network/device_sync_auth_interceptor.dart';
import 'data/adapters/activation/dio_activation_priming_port.dart';
import 'data/adapters/activation/dio_activation_sync_port.dart';
import 'data/services/activation_attempt_discovery_service.dart';
import 'data/services/activation_controlled_sale_runner.dart';
import 'data/services/activation_pre_offline_runner.dart';
import 'data/services/activation_priming_service.dart';
import 'data/services/activation_reconnect_sync_runner.dart';
import 'data/services/activation_required_config_adapter.dart';
import 'data/services/activation_session_service.dart';
import 'data/security/app_private_device_sync_credential_store.dart';
import 'data/security/dio_device_sync_exchange_port.dart';
import 'data/security/flutter_secure_cloud_credential_store.dart';
import 'data/security/flutter_secure_device_sync_credential_store.dart';
import 'data/security/legacy_human_credential_fallback_cleaner.dart';
import 'data/security/resilient_device_sync_credential_store.dart';
import 'domain/security/cloud_credential_coordinator.dart';
import 'domain/security/device_sync_bootstrap_coordinator.dart';
import 'domain/security/device_sync_credential_coordinator.dart';
import 'data/security/shared_preferences_cloud_revocation_barrier_store.dart';
import 'data/repositories/auth_repository_impl.dart';
import 'core/clock/monotonic_clock.dart';
import 'core/config/production_transport_config.dart';
import 'core/navigation/route_observer.dart';
import 'data/repositories/tenant_capability_cache.dart';
import 'domain/repositories/auth_repository.dart';
import 'data/repositories/audit_repository_impl.dart';
import 'data/services/fiscal_projection_repair_service.dart';
import 'data/services/local_auth_service.dart';
import 'data/services/network_connectivity_service.dart';
import 'data/services/sync_service.dart';
import 'data/services/terminal_identity_service.dart';
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
import 'ui/features/inventory/alerts/stock_alerts_view.dart';
import 'ui/features/inventory/alerts/stock_alerts_view_model.dart';
import 'ui/features/inventory/production/production_order_view.dart';
import 'ui/features/inventory/recipes/recipe_view.dart';
import 'ui/features/inventory/reports/inventory_valuation_view.dart';
import 'ui/features/inventory/reports/inventory_valuation_view_model.dart';
import 'ui/features/inventory/reports/cogs_report_view.dart';
import 'ui/features/inventory/reports/cogs_report_view_model.dart';
import 'ui/features/inventory/suppliers/supplier_view.dart';
import 'ui/features/inventory/warehouses/warehouse_view.dart';
import 'data/repositories/sales/sales_repository_impl.dart';
import 'presentation/features/sales/view_models/sale_view_model.dart';
import 'ui/features/sales/sale_view.dart';
import 'ui/features/sales/sales_history_view.dart';
import 'presentation/features/sales/view_models/sales_history_view_model.dart';
import 'ui/features/sales/reports/dgi_report_view_model.dart';
import 'ui/features/sales/reports/dgi_report_view.dart';
import 'ui/features/cash/cash_shift_view.dart';
import 'ui/features/cash/cash_shift_view_model.dart';
import 'ui/features/config/business_profile/business_profile_view_model.dart';
import 'ui/features/config/business_profile/business_profile_view.dart';
import 'ui/features/config/hardware/hardware_settings_view_model.dart';
import 'ui/features/config/hardware/hardware_settings_view.dart';
import 'ui/features/config/terminal/terminal_identity_view_model.dart';
import 'ui/features/config/terminal/terminal_identity_view.dart';
import 'domain/services/config/printer_config_service.dart';
import 'domain/services/printer/printer_resolver.dart';
import 'ui/features/identity/audit/audit_log_view_model.dart';
import 'ui/features/identity/audit/audit_log_view.dart';
import 'ui/features/identity/users/user_management_view_model.dart';
import 'ui/features/identity/users/user_management_view.dart';
import 'ui/features/config/activation/activation_session_view_model.dart';
import 'ui/features/config/activation/activation_terminal_view.dart';
import 'ui/features/auth/views/login_view.dart';
import 'ui/features/auth/views/lock_screen_view.dart';
import 'domain/services/sales/dgi_numbering_service.dart';
import 'data/services/sales/dgi_numbering_service_impl.dart';
import 'domain/usecases/inventory/process_sale_inventory_use_case.dart';
import 'domain/usecases/inventory/reverse_sale_inventory_use_case.dart';
import 'domain/services/sales/table_order_service.dart';
import 'domain/services/kitchen/kitchen_order_service.dart';
import 'domain/services/config/tenant_config_service.dart';
import 'ui/features/sales/tables/table_layout_view.dart';
import 'ui/features/sales/tables/table_layout_view_model.dart';
import 'ui/features/kitchen/kitchen_display_view.dart';
import 'ui/features/kitchen/kitchen_display_view_model.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Purge credentials left by pre-secure-store builds before any cloud auth
  // component can recover state. Failure is fail-closed and must not block POS.
  final legacyHumanCredentialCleaner = LegacyHumanCredentialFallbackCleaner();
  await legacyHumanCredentialCleaner.clean();

  // Configuration (Could be loaded from .env)
  const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://127.0.0.1:3000/api',
  );
  const String provisionedDeviceId = String.fromEnvironment('DEVICE_ID');

  // Initialize Database
  final database = await $FloorAppDatabase
      .databaseBuilder('app_database.db')
      .addMigrations(allMigrations)
      .addCallback(inventoryMovementAppendOnlyCallback)
      .build();

  // Populate seed test data if not present
  await DatabaseSeeder.seedAll(database);

  // Offline startup backfill: rebuild incomplete/outdated fiscal projections from stored canonical snapshots.
  // Fails closed on snapshot read/repair failure to prevent initializing fiscal-dependent consumers in corrupt state.
  await FiscalBootstrapRunner.fromDatabase(database).run();

  // Initialize Services & Repositories
  final terminalIdentityService = TerminalIdentityService(
    database.localConfigDao,
  );
  final deviceId = await terminalIdentityService
      .resolveDeviceId(buildTimeDeviceId: provisionedDeviceId);
  final dio = Dio(productionTransportOptions(baseUrl));
  final localAuthService = LocalAuthService();
  final capabilityCache = TenantCapabilityCache(
    configDao: database.localConfigDao,
    clock: StopwatchMonotonicClock(),
    bootSessionId: const Uuid().v4(),
  );
  final credentialStore = FlutterSecureCloudCredentialStore();
  final barrierStore = SharedPreferencesCloudRevocationBarrierStore();
  final credentialCoordinator = CloudCredentialCoordinator(
    credentialStore,
    commitId: () => const Uuid().v4(),
    barrierStore: barrierStore,
  );
  final refreshDio = Dio(productionTransportOptions(baseUrl));

  // Tenant configuration store (slug write-through from provisioning, issue #556)
  final tenantConfigService = TenantConfigService(database.localConfigDao);

  // Dedicated Device Sync Infrastructure
  final deviceSyncExchangeDio = Dio(productionTransportOptions(baseUrl));
  final deviceSyncStore = ResilientDeviceSyncCredentialStore(
    preferredStore: FlutterSecureDeviceSyncCredentialStore(),
    fallbackStore: AppPrivateDeviceSyncCredentialStore(database.localConfigDao),
  );
  final deviceSyncExchangePort = DioDeviceSyncExchangePort(
    deviceSyncExchangeDio,
  );
  final deviceSyncCoordinator = DeviceSyncCredentialCoordinator(
    store: deviceSyncStore,
    exchangePort: deviceSyncExchangePort,
    resolveDeviceId: () async => deviceId,
  );
  final syncDio = Dio(productionTransportOptions(baseUrl));
  syncDio.interceptors.add(
    DeviceSyncAuthInterceptor(
      coordinator: deviceSyncCoordinator,
      clientDio: syncDio,
    ),
  );

  // Activation Sync Adapter & Bootstrap Coordinator (Derived one-shot provisioning for OWNER)
  final activationSyncPort = DioActivationSyncPort(dio, deviceSyncCoordinator);
  final deviceSyncBootstrapCoordinator = DeviceSyncBootstrapCoordinator(
    store: deviceSyncStore,
    activationSyncPort: activationSyncPort,
    resolveDeviceId: () async => deviceId,
    credentialCoordinator: deviceSyncCoordinator,
    onTenantSlugCaptured: (slug) => tenantConfigService.persistTenantSlug(slug),
  );

  final authRepository = AuthRepositoryImpl(
    database.userDao,
    database.securityProfileDao,
    localAuthService,
    dio,
    capabilityCache: capabilityCache,
    credentialCoordinator: credentialCoordinator,
    bootstrapCoordinator: deviceSyncBootstrapCoordinator,
    cleaner: legacyHumanCredentialCleaner,
  );

  // Add Cloud Auth, Automatic Refresh & Path Normalization Interceptor
  dio.interceptors.add(
    CloudAuthInterceptor(
      coordinator: credentialCoordinator,
      refreshDio: refreshDio,
      clientDio: dio,
      tokenFallback: () => authRepository.getAccessToken(),
      onReauthenticationRequired: () {
        debugPrint(
          "[CloudAuth] Reautenticación requerida: sesión cloud expirada o revocada.",
        );
      },
    ),
  );

  final auditRepository = AuditRepositoryImpl(
    database.auditDao,
    authRepository,
    dio,
    deviceId,
    capabilityCache: capabilityCache,
    forensicAlertDao: database.forensicAlertDao,
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
    productionTransactionDao: database.productionTransactionDao,
    dio: dio,
    database: database,
  );
  final alertService = AlertServiceImpl(inventoryRepository);
  await alertService.hydrateInbox();
  final movementEngine = MovementEngineImpl(inventoryRepository, alertService);

  // Sales Module Initialization
  final numberingService = DgiNumberingServiceImpl(
    database.localConfigDao,
    database.invoiceDao,
  );
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

  // Terminal Activation Stack: guided enrollment path dependencies. The
  // printer port is resolved from the STORED printer profile (read through
  // PrinterConfigService, offline-first), never from a hard-coded default.
  final activationConfigAdapter = ActivationRequiredConfigAdapter(
    database: database,
  );
  final activationPrinterConfigService = PrinterConfigService(
    database.localConfigDao,
  );
  final activationPrinterPort = PrinterResolver.resolve(
    await activationPrinterConfigService.getPrinterConfig(),
  );
  final activationPreOfflineRunner = ActivationPreOfflineRunner(
    database: database,
    configAdapter: activationConfigAdapter,
    terminalIdentityService: terminalIdentityService,
    printerPort: activationPrinterPort,
    printerConfigService: activationPrinterConfigService,
  );
  final activationControlledSaleRunner = ActivationControlledSaleRunner(
    database: database,
    salesRepository: salesRepository,
    printerPort: activationPrinterPort,
    printerConfigService: activationPrinterConfigService,
  );
  final activationReconnectSyncRunner = ActivationReconnectSyncRunner(
    database: database,
    syncPort: activationSyncPort,
  );
  final activationDiscoveryService = ActivationAttemptDiscoveryService(
    database: database,
    syncPort: activationSyncPort,
    terminalIdentityService: terminalIdentityService,
  );
  final activationSessionService = ActivationSessionService(
    database: database,
    discoveryService: activationDiscoveryService,
    preOfflineRunner: activationPreOfflineRunner,
    controlledSaleRunner: activationControlledSaleRunner,
    reconnectSyncRunner: activationReconnectSyncRunner,
  );
  // L1-10c: terminal priming before activation prepare(). Uses the same
  // human-authenticated Dio client as DioActivationSyncPort (the trust level
  // of the activation discovery call); the device path is untouched.
  final activationPrimingService = ActivationPrimingService(
    database: database,
    primingPort: DioActivationPrimingPort(dio),
  );

  final connectivityService = NetworkConnectivityService(dio);
  connectivityService.start();

  final syncService = SyncService(
    auditRepository,
    salesRepository,
    inventoryRepository,
    syncDio,
    database: database,
    connectivityService: connectivityService,
  );
  syncService.start();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => LoginViewModel(
            authRepository,
            resolveTenantSlug: () => tenantConfigService.getTenantSlug(),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => LockScreenViewModel(authRepository, database.userDao),
        ),
        ChangeNotifierProvider(
          create: (_) => SupplierViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => WarehouseViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              InsumoViewModel(inventoryRepository, alertService: alertService),
        ),
        ChangeNotifierProvider(
          create: (_) => PurchaseViewModel(inventoryRepository, movementEngine),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              ShrinkageViewModel(inventoryRepository, movementEngine),
        ),
        ChangeNotifierProvider(
          create: (_) => ForensicAlertViewModel(alertService),
        ),
        ChangeNotifierProvider(
          create: (_) =>
              PhysicalCountViewModel(inventoryRepository, movementEngine),
        ),
        ChangeNotifierProvider(
          create: (_) => KardexViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => ProductionOrderViewModel(
            inventoryRepository,
            movementEngine,
            authRepository: authRepository,
            terminalIdProvider: () => auditRepository.deviceId,
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => UserManagementViewModel(authRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => RecipeViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => InventoryValuationViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => CogsReportViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => StockAlertsViewModel(inventoryRepository),
        ),
        ChangeNotifierProvider(
          create: (_) => DgiReportViewModel(salesRepository, database),
        ),
        ChangeNotifierProvider(
          create: (_) => BusinessProfileViewModel(
            database.localConfigDao,
            inventoryRepository,
            syncService,
            database.fiscalConfigLocalDao,
          ),
          lazy: false,
        ),
        ChangeNotifierProvider(
          create: (_) => HardwareSettingsViewModel(
            configService: PrinterConfigService(database.localConfigDao),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => TerminalIdentityViewModel(
            configDao: database.localConfigDao,
            printerConfigService: PrinterConfigService(database.localConfigDao),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => ActivationSessionViewModel(
            sessionService: activationSessionService,
            primingService: activationPrimingService,
            authRepository: authRepository,
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => AuditLogViewModel(auditRepository),
        ),
        ChangeNotifierProvider(create: (_) => SalesHistoryViewModel(database)),
        ChangeNotifierProvider(
          create: (ctx) {
            final saleVm = ctx.read<SaleViewModel>();
            final vm = CashShiftViewModel.fromDatabase(
              database: database,
              currentUserId: 'user-cajero',
              currentUserRole: saleVm.currentUserRole,
            );
            vm.init();
            return vm;
          },
        ),
        ChangeNotifierProvider(
          create: (_) => TableLayoutViewModel(
            database: database,
            tableOrderService: TableOrderService(database),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => KitchenDisplayViewModel(
            kitchenOrderService: KitchenOrderService(database),
          ),
        ),
        ChangeNotifierProvider(
          create: (_) => SaleViewModel(
            salesRepository,
            inventoryRepository,
            authRepository,
            database,
            TableOrderService(database),
            true,
            null,
            null,
            null,
            null,
            syncService,
            null,
            null,
            deviceId,
          ),
        ),
        Provider<AppDatabase>.value(value: database),
        Provider<AuthRepository>.value(value: authRepository),
        Provider<AuditRepositoryImpl>.value(value: auditRepository),
        Provider<AlertService>.value(value: alertService),
        Provider<MovementEngineImpl>.value(value: movementEngine),
        Provider<SalesRepositoryImpl>.value(value: salesRepository),
        Provider<DgiNumberingService>.value(value: numberingService),
        Provider<SyncService>.value(value: syncService),
        Provider<DeviceSyncBootstrapCoordinator>.value(
          value: deviceSyncBootstrapCoordinator,
        ),
        Provider<NetworkConnectivityService>.value(value: connectivityService),
        Provider<TenantConfigService>(
          create: (_) => tenantConfigService,
        ),
        Provider<PrinterConfigService>(
          create: (_) => PrinterConfigService(database.localConfigDao),
        ),
      ],
      child: MyApp(alertService: alertService),
    ),
  );
}

class MyApp extends StatelessWidget {
  final AlertService alertService;
  final String initialRoute;
  const MyApp({super.key, required this.alertService, this.initialRoute = '/'});

  @override
  Widget build(BuildContext context) {
    return InventoryAlertOverlay(
      alertService: alertService,
      child: MaterialApp(
        title: 'NHILOS POS',
        navigatorObservers: [appRouteObserver],
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
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 12,
            ),
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
          '/inventory/alerts/stock': (context) => const BohRouteGuard(
            permission: BohPermission.alertsView,
            featureLabel: 'Alertas de Stock BOH',
            child: StockAlertsView(),
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
          '/inventory/reports/valuation': (context) => const BohRouteGuard(
            permission: BohPermission.valuationView,
            featureLabel: 'Existencias & Valorización BOH',
            child: InventoryValuationView(),
          ),
          '/inventory/reports/cogs': (context) => const BohRouteGuard(
            permission: BohPermission.cogsView,
            featureLabel: 'Costo de Ventas (COGS) BOH',
            child: CogsReportView(),
          ),
          '/sales/tables': (context) => const TableLayoutView(),
          '/kitchen': (context) => const KitchenDisplayView(),
          '/sales/reports': (context) => const DgiReportView(),
          '/sales/history': (context) => const SalesHistoryView(),
          '/sales/cash': (context) => const CashShiftView(),
          '/identity/users': (context) => const UserManagementView(),
          '/config/profile': (context) => const BusinessProfileView(),
          '/config/hardware': (context) => const HardwareSettingsView(),
          '/config/terminal': (context) => const TerminalIdentityView(),
          '/config/activation': (context) => const ActivationTerminalView(),
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
      appBar: AppBar(title: const Text('NHILOS POS')),
      body: const Center(child: Text('Bienvenido al Punto de Venta')),
    );
  }
}
