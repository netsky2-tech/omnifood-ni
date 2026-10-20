import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/inventory/authority_projection_entities.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/domain/models/config/supervision_policy.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/audit_repository.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/ui/features/sales/sale_view.dart';

/// R28 (decisión del owner: "el backoffice manda, el cajero marca") — el
/// diálogo de modificadores.
///
/// Tres propiedades son載 load-bearing:
///
///  1. **La verdad**: la línea anuncia SIEMPRE la cantidad que se va a
///     aplicar — la que configuró el backoffice, o la de la receta cuando no
///     hay ninguna. Y NUNCA dice «heredar» (§39.4).
///  2. **El cajero no escribe**: no hay campo de cantidad en el flujo normal.
///     Cuando el efecto no tiene cantidad, el diálogo lo dice con calma y
///     ofrece el override de supervisor; la venta no se bloquea.
///  3. **El diálogo es independiente de la resolución**: no desborda en el
///     terminal de mano (360 dp), en la tableta del food park (800 dp) ni en
///     apaisado (1280×800), y sus filas cumplen el target táctil de 48 dp.
class _CapturingSaleViewModel extends ChangeNotifier
    implements SaleViewModel {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

/// The authorization of a supervisor, as the override flow asks for it.
class _FakeAuthRepository extends Fake implements AuthRepository {
  bool authorized;
  String? lastSupervisorId;

  _FakeAuthRepository({this.authorized = true});

  @override
  Future<List<CredentialMatch>> identifyByCredential({
    required String credential,
    required SupervisionPolicy policy,
    String? userId,
  }) async {
    if (!authorized) return const [];
    if (credential.trim().isEmpty) return const [];
    return [
      CredentialMatch(
        userId: userId ?? 'usr-owner',
        userName: 'Maxwell Orozco',
        userRole: 'OWNER',
        isAuthorizingRole: policy.authorizes('OWNER'),
      ),
    ];
  }

  @override
  Future<List<User>> getAllUsers() async => const [
        User(
          id: 'usr-owner',
          name: 'Maxwell Orozco',
          role: UserRole.owner,
          isActive: true,
        ),
        User(
          id: 'usr-encargado',
          name: 'Mateo Rojas',
          role: UserRole.manager,
          isActive: true,
        ),
        User(
          id: 'usr-cajero',
          name: 'Cajero Temporal',
          role: UserRole.cashier,
          isActive: true,
        ),
      ];

  @override
  Future<bool> authorizeOverride({
    required String supervisorId,
    String? pin,
    String? totpCode,
  }) async {
    lastSupervisorId = supervisorId;
    return authorized;
  }
}

class _FakeAuditRepository extends Fake implements AuditRepository {
  final List<String> actions = [];

  @override
  Future<void> logForensic(
    String action, {
    String? metadata,
    String? metodoAutorizacion,
    String? usuarioAutorizadorId,
  }) async {
    actions.add(action);
  }
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  late AppDatabase database;

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    final dao = database.authorityProjectionDao;

    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-leche',
        name: 'R23 Leche entera',
        uom: 'ml',
      ),
    );
    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-almendras',
        name: 'Leche de Almondras',
        uom: 'ml',
      ),
    );
    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-cafe',
        name: 'R23 Cafe en grano',
        uom: 'g',
      ),
    );
    await dao.insertInsumo(
      const AuthorityInsumoEntity(
        tenantId: 'tenant-1',
        id: 'insumo-jarabe',
        name: 'Jarabe de fresa',
        uom: 'ml',
      ),
    );
    await dao.insertRecipeVersion(
      const AuthorityRecipeVersionEntity(
        tenantId: 'tenant-1',
        id: 'ver-1',
        productId: 'p-1',
        versionNumber: 1,
        isActive: true,
        publicationState: 'PUBLISHED',
        effectiveFrom: '2026-01-01T00:00:00Z',
        yieldQuantity: 1.0,
        technicalShrinkPct: 0.0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      ),
    );
    await dao.insertComponent(
      const AuthorityRecipeVersionComponentEntity(
        tenantId: 'tenant-1',
        id: 'comp-1',
        versionId: 'ver-1',
        ordinal: 0,
        insumoId: 'insumo-leche',
        grossQuantity: 150,
        technicalShrinkPct: 0,
        ingredientType: 'INSUMO',
        componentName: 'R23 Leche entera',
        componentUom: 'ml',
      ),
    );
    await database.localConfigDao.saveConfig(
      LocalConfigEntity(key: 'tenant_id', value: 'tenant-1'),
    );
  });

  tearDown(() async {
    await database.close();
  });

  Product productWithSwap({double? configuredQuantity}) => Product(
        id: 'p-1',
        name: 'R28 Capuccino',
        uom: 'UND',
        stock: 5,
        averageCost: 0,
        sellPrice: 60,
        availableModifierGroups: [
          EffectiveModifierGroup(
            id: 'grp-leche',
            name: 'Leche',
            minSelected: 0,
            maxSelected: 1,
            allowQuantities: false,
            source: 'category',
            options: [
              EffectiveModifierOption(
                id: 'opt-almendras',
                name: 'Almendras',
                priceDelta: 20,
                isDefault: false,
                inventoryEffect: 'SWAP',
                effectInsumoId: 'insumo-almendras',
                effectTargetInsumoId: 'insumo-leche',
                effectQuantity: configuredQuantity,
              ),
            ],
          ),
        ],
      );

  /// An option whose effect targets an insumo the recipe does NOT contain:
  /// there is no quantity to inherit and none configured, so the effect is
  /// PENDING (the extra sells; its stock effect waits).
  Product productWithPendingEffect() => Product(
        id: 'p-3',
        name: 'R28 Limonada',
        uom: 'UND',
        stock: 5,
        averageCost: 0,
        sellPrice: 40,
        availableModifierGroups: [
          EffectiveModifierGroup(
            id: 'grp-extras',
            name: 'Extras',
            minSelected: 0,
            maxSelected: 1,
            allowQuantities: false,
            source: 'category',
            options: [
              EffectiveModifierOption(
                id: 'opt-jarabe',
                name: 'Jarabe de fresa',
                priceDelta: 10,
                isDefault: false,
                inventoryEffect: 'ADD',
                effectInsumoId: 'insumo-jarabe',
                effectTargetInsumoId: 'insumo-jarabe',
              ),
            ],
          ),
        ],
      );

  Future<void> pumpDialog(
    WidgetTester tester, {
    Product? product,
    DateTime? now,
    Size? surface,
    _FakeAuthRepository? authRepository,
    _FakeAuditRepository? auditRepository,
  }) async {
    if (surface != null) {
      tester.view.physicalSize = surface;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
    }
    // The tree is unmounted at the end of the test: a field still mounted
    // when the NEXT test changes the metrics would look up its ancestor in a
    // deactivated tree and fail with an error that has nothing to do with
    // what the test is checking.
    addTearDown(() async {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    });
    await tester.pumpWidget(
      ChangeNotifierProvider<SaleViewModel>.value(
        value: _CapturingSaleViewModel(),
        child: Provider<AppDatabase>.value(
          value: database,
          child: MultiProvider(
            providers: [
              Provider<AuthRepository>.value(
                value: authRepository ?? _FakeAuthRepository(),
              ),
              Provider<AuditRepository>.value(
                value: auditRepository ?? _FakeAuditRepository(),
              ),
              // The tenant's policy: the default for the mode, which never
              // dead-ends the close box and treats the quantity of an extra
              // as data, not as a control.
              Provider<TenantConfigService>.value(
                value: TenantConfigService(database.localConfigDao),
              ),
            ],
            child: MaterialApp(
              home: Scaffold(
                body: Center(
                  child: ProductOptionsDialog(
                    product: product ?? productWithSwap(),
                    now: now,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // The dialog reads the authority projection asynchronously (a real
    // SQLite read); the fake clock does not advance it, so let the real
    // work run and paint again.
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pumpAndSettle();
  }

  testWidgets(
    'the SWAP copy names what leaves, what enters and the quantity applied',
    (tester) async {
      await pumpDialog(tester);

      expect(
        find.text(
          'No sale R23 Leche entera; '
          'entran 150 ml de Leche de Almondras en su lugar.',
        ),
        findsOneWidget,
      );
      // The operator never reads the implementation vocabulary.
      expect(find.textContaining('heredada'), findsNothing);
      expect(find.textContaining('Heredar'), findsNothing);
    },
  );

  testWidgets('the cashier NEVER types a quantity', (tester) async {
    await pumpDialog(tester);

    expect(find.text('Cantidad a aplicar'), findsNothing);
    expect(find.byKey(const Key('modifier_effect_quantity_opt-almendras')),
        findsNothing);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets(
    'the CONFIGURED quantity is the one announced (the backoffice manda)',
    (tester) async {
      await pumpDialog(
        tester,
        product: productWithSwap(configuredQuantity: 25),
      );

      expect(
        find.text(
          'No sale R23 Leche entera; '
          'entran 25 ml de Leche de Almondras en su lugar.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('150 ml'), findsNothing);
    },
  );

  testWidgets(
    'an effect with no quantity says so calmly and never blocks the sale',
    (tester) async {
      await pumpDialog(tester, product: productWithPendingEffect());

      expect(
        find.textContaining('todavía no tiene una cantidad configurada'),
        findsOneWidget,
      );
      expect(
        find.textContaining('se vende igual'),
        findsOneWidget,
      );
      // The supervisor's way to put a number on it (never the cashier's).
      expect(find.byKey(const Key('modifier_override_action')), findsOneWidget);
      // And the sale is possible: the action button is there.
      expect(find.text('AGREGAR'), findsOneWidget);
    },
  );

  testWidgets(
    'the quantity is marked with the amount and the reason, and NO credential '
    '(it is a data question, not a control one)',
    (tester) async {
      await pumpDialog(tester, product: productWithPendingEffect());

      await tester.tap(find.byKey(const Key('modifier_override_action')));
      // The policy is read from the LOCAL SQLite: the read is real async
      // I/O, so it needs the real event loop (the same reason the
      // authority read above needs runAsync).
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      await tester.pumpAndSettle();

      // The amount and the reason, in the insumo's own unit. No PIN: the
      // operator knows their own numbers.
      expect(find.byKey(const Key('modifier_quantity_value')), findsOneWidget);
      expect(find.byKey(const Key('modifier_quantity_reason')), findsOneWidget);
      expect(find.textContaining('Jarabe de fresa'), findsWidgets);
      expect(find.widgetWithText(TextField, 'Su PIN'), findsNothing);
    },
  );

  testWidgets(
    'the amount and the reason are required before the quantity applies',
    (tester) async {
      final auth = _FakeAuthRepository();
      final audit = _FakeAuditRepository();
      await pumpDialog(
        tester,
        product: productWithPendingEffect(),
        authRepository: auth,
        auditRepository: audit,
      );

      await tester.tap(find.byKey(const Key('modifier_override_action')));
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      await tester.pumpAndSettle();

      // The submit waits for the amount AND the reason.
      var submit = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'APLICAR'),
      );
      expect(submit.onPressed, isNull);

      await tester.enterText(
        find.byKey(const Key('modifier_quantity_value')),
        '30',
      );
      await tester.pumpAndSettle();
      submit = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'APLICAR'),
      );
      expect(submit.onPressed, isNull, reason: 'falta el motivo');

      await tester.enterText(
        find.byKey(const Key('modifier_quantity_reason')),
        'Doble jarabe',
      );
      await tester.pumpAndSettle();
      submit = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'APLICAR'),
      );
      expect(submit.onPressed, isNotNull);

      await tester.tap(find.widgetWithText(FilledButton, 'APLICAR'));
      await tester.pumpAndSettle();

      // The line now carries the authorized amount, and the evidence says who
      // did it and why.
      expect(
        find.text('Saca 30 ml de Jarabe de fresa del inventario.'),
        findsOneWidget,
      );
      expect(audit.actions, contains('MODIFIER_EFFECT_QUANTITY_ADJUSTED'));
    },
  );

  testWidgets(
    'a supervisor-authorized quantity is recorded with its forensic trace '
    '(the tenant policy can require one)',
    (tester) async {
      final audit = _FakeAuditRepository();
      final auth = _FakeAuthRepository();
      // The tenant's policy asks for a supervisor on this flow.
      final configService = TenantConfigService(database.localConfigDao);
      await tester.runAsync(() async {
        await configService.setSupervisionPolicy(
          const SupervisionPolicy(supervisorRequiredForModifierQuantity: true),
        );
      });
      await pumpDialog(
        tester,
        product: productWithPendingEffect(),
        auditRepository: audit,
        authRepository: auth,
      );

      await tester.tap(find.byKey(const Key('modifier_override_action')));
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('modifier_override_quantity')),
        '30',
      );
      await tester.enterText(
        find.byKey(const Key('modifier_override_reason')),
        'El cliente pidió doble jarabe',
      );
      await tester.pumpAndSettle();

      // The submit waits for the credential: an amount with nobody
      // authorizing it is not an authorization.
      var submit = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'AUTORIZAR'),
      );
      expect(submit.onPressed, isNull, reason: 'falta la credencial');

      await tester.enterText(
        find.widgetWithText(TextField, 'Su PIN'),
        '123456',
      );
      await tester.pumpAndSettle();

      submit = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'AUTORIZAR'),
      );
      expect(submit.onPressed, isNotNull);

      await tester.tap(find.widgetWithText(FilledButton, 'AUTORIZAR'));
      await tester.pumpAndSettle();
      expect(audit.actions, contains('MODIFIER_EFFECT_QUANTITY_OVERRIDE'));
      expect(
        find.text('Saca 30 ml de Jarabe de fresa del inventario.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'the dialog lays out without overflowing (the inherited quantity on '
    'screen used to overflow the option row)',
    (tester) async {
      await pumpDialog(tester);

      expect(tester.takeException(), isNull);
      expect(find.text('Almendras (+C\$ 20)'), findsOneWidget);
    },
  );

  testWidgets(
    'the dialog shows the quantity of a version published minutes '
    'ago (the authority is read in UTC)',
    (tester) async {
      // The rig's shape: the version became effective at 03:46:35Z and the
      // terminal read it at 04:00:00Z. Compared in the LOCAL frame the
      // version looked "not yet in force" and the operator lost the
      // quantity AND the insumo's name.
      final dao = database.authorityProjectionDao;
      await tester.runAsync(() async {
        await dao.insertRecipeVersion(
        const AuthorityRecipeVersionEntity(
          tenantId: 'tenant-1',
          id: 'ver-2',
          productId: 'p-1',
          versionNumber: 2,
          isActive: true,
          publicationState: 'PUBLISHED',
          effectiveFrom: '2026-10-20T03:46:35.999Z',
          yieldQuantity: 1.0,
          technicalShrinkPct: 0.0,
          createdAt: '2026-10-20T03:46:35.999Z',
          updatedAt: '2026-10-20T03:46:35.999Z',
        ),
        );
        await dao.insertComponent(
          const AuthorityRecipeVersionComponentEntity(
            tenantId: 'tenant-1',
            id: 'comp-2',
            versionId: 'ver-2',
            ordinal: 0,
            insumoId: 'insumo-leche',
            grossQuantity: 150,
            technicalShrinkPct: 0,
            ingredientType: 'INSUMO',
            componentName: 'R23 Leche entera',
            componentUom: 'ml',
          ),
        );
      });

      await pumpDialog(tester, now: DateTime.utc(2026, 10, 20, 4));

      expect(find.textContaining('150 ml'), findsOneWidget);
    },
  );

  group('the dialog is independent of the resolution', () {
    const sizes = <String, Size>{
      'handheld 360x640': Size(360, 640),
      'food park tablet 800x1280': Size(800, 1280),
      'landscape 1280x800': Size(1280, 800),
    };

    sizes.forEach((label, size) {
      testWidgets('no overflow on $label', (tester) async {
        await pumpDialog(tester, surface: size);

        expect(tester.takeException(), isNull);
        expect(find.text('Almendras (+C\$ 20)'), findsOneWidget);
      });

      testWidgets('the option row is a 48 dp target on $label', (tester) async {
        await pumpDialog(tester, surface: size);

        final row = tester.getSize(find.byType(RadioListTile<String>));
        expect(row.height, greaterThanOrEqualTo(48));
      });
    });

    testWidgets('the dialog takes the room the device has', (tester) async {
      await pumpDialog(tester, surface: const Size(360, 640));
      final narrow = tester.getSize(find.byType(AlertDialog)).width;

      await pumpDialog(tester, surface: const Size(800, 1280));
      final wide = tester.getSize(find.byType(AlertDialog)).width;

      expect(wide, greaterThan(narrow));
    });
  });
}
