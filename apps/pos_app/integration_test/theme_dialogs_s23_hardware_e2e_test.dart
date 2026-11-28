import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/fulfillment/fulfillment_checkout_context.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/sales/invoice.dart';
import 'package:pos_app/domain/models/sales/invoice_item.dart';
import 'package:pos_app/domain/models/sales/payment.dart';
import 'package:pos_app/domain/models/user.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/repositories/sales/sales_repository.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/config/tenant_config_service.dart';
import 'package:pos_app/domain/services/kitchen/kitchen_order_service.dart';
import 'package:pos_app/domain/services/sales/table_order_service.dart';
import 'package:pos_app/main.dart';
import 'package:pos_app/presentation/features/sales/view_models/sale_view_model.dart';
import 'package:pos_app/ui/features/sales/widgets/tip_dialog.dart';
import 'package:pos_app/ui/widgets/pin_pad.dart';
import 'package:provider/provider.dart';

/// Real Android Hardware E2E Runner for #950 (Global Theme `Size(0, 48)`
/// ElevatedButton fix & Dialogs on Samsung Galaxy S23 SM-S918B ARM64).
///
/// Mounts a real `MaterialApp(theme: buildNhilosPosTheme(), ...)`, installs a
/// `FlutterError.onError` trap capturing any layout/rendering error
/// (`BoxConstraints forces an infinite width`, `RenderFlex overflowed`, etc.),
/// and measures real `RenderBox`es on the live device screen across 3 cases.
///
/// Build & run on attached Android device:
///   flutter build apk --debug -t integration_test/theme_dialogs_s23_hardware_e2e_test.dart
///   adb install -r build/app/outputs/flutter-apk/app-debug.apk
///   adb logcat -c && adb shell am start -n com.example.pos_app/.MainActivity
///   adb logcat -d -s flutter
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const _HardwareE2EThemeDialogsApp());
}

class _StubSalesRepository implements SalesRepository {
  @override
  Future<void> saveSale({
    FulfillmentCheckoutContext? fulfillmentContext,
    required Invoice invoice,
    required List<InvoiceItem> items,
    required List<Payment> payments,
  }) async {}

  @override
  Future<Invoice?> getInvoiceById(String id) async => null;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _StubInventoryRepository implements InventoryRepository {
  @override
  Future<List<Product>> getActiveProducts() async => [];

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _StubAuthRepository implements AuthRepository {
  @override
  Future<User?> getCurrentUser() async => const User(
        id: 'e2e-cashier',
        name: 'Cajero E2E',
        email: 'cajero@omnifood.ni',
        role: UserRole.cashier,
        isActive: true,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _HardwareE2EThemeDialogsApp extends StatefulWidget {
  const _HardwareE2EThemeDialogsApp();

  @override
  State<_HardwareE2EThemeDialogsApp> createState() =>
      _HardwareE2EThemeDialogsAppState();
}

class _HardwareE2EThemeDialogsAppState
    extends State<_HardwareE2EThemeDialogsApp> {
  final GlobalKey<NavigatorState> _navKey = GlobalKey<NavigatorState>();
  final List<String> _logs = [];
  final List<FlutterErrorDetails> _capturedErrors = [];
  void Function(FlutterErrorDetails)? _previousOnError;

  String _status = 'RUNNING';
  Widget _stageWidget = const SizedBox.shrink();

  @override
  void initState() {
    super.initState();
    _previousOnError = FlutterError.onError;
    FlutterError.onError = (FlutterErrorDetails details) {
      _capturedErrors.add(details);
      debugPrint(
        '[S23_E2E_THEME_DIALOGS] FLUTTER_ERROR_CAPTURED: ${details.exceptionAsString()}',
      );
    };
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _runAll();
    });
  }

  @override
  void dispose() {
    FlutterError.onError = _previousOnError;
    super.dispose();
  }

  void _log(String msg) {
    debugPrint('[S23_E2E_THEME_DIALOGS] $msg');
    if (mounted) {
      setState(() => _logs.add(msg));
    }
  }

  void _assertTrue(bool condition, String label) {
    if (!condition) {
      throw StateError('Assertion failed [$label]');
    }
  }

  void _assertNoFlutterErrors(String caseLabel) {
    if (_capturedErrors.isNotEmpty) {
      final summary = _capturedErrors
          .map((e) => e.exceptionAsString().split('\n').first)
          .join(' | ');
      throw StateError(
        '$caseLabel captured ${_capturedErrors.length} FlutterError(s): $summary',
      );
    }
  }

  RenderBox _requireRenderBox(GlobalKey key, String label) {
    final context = key.currentContext;
    if (context == null) {
      throw StateError('Missing BuildContext for [$label]');
    }
    final renderObject = context.findRenderObject();
    if (renderObject is! RenderBox || !renderObject.hasSize) {
      throw StateError('RenderBox not laid out for [$label]');
    }
    return renderObject;
  }

  Element? _findElementByKey(Element root, Key targetKey) {
    Element? found;
    void visitor(Element element) {
      if (found != null) return;
      if (element.widget.key == targetKey) {
        found = element;
        return;
      }
      element.visitChildren(visitor);
    }

    root.visitChildren(visitor);
    return found;
  }

  Future<void> _waitForFrames({int settleMs = 150}) async {
    await WidgetsBinding.instance.endOfFrame;
    await Future<void>.delayed(Duration(milliseconds: settleMs));
    await WidgetsBinding.instance.endOfFrame;
  }

  Future<void> _runAll() async {
    int passed = 0;
    const int total = 3;

    final docsDir = await getApplicationDocumentsDirectory();
    final workDir = Directory(
      '${docsDir.path}/s23_e2e_theme_dialogs_${DateTime.now().millisecondsSinceEpoch}',
    );
    await workDir.create(recursive: true);
    final dbPath = '${workDir.path}/theme_dialogs_e2e.db';

    AppDatabase? db;
    SaleViewModel? saleVm;

    try {
      db = await $FloorAppDatabase.databaseBuilder(dbPath).build();
      await db.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'tax_regime', value: 'REGIMEN_GENERAL'),
      );
      await db.localConfigDao.saveConfig(
        LocalConfigEntity(key: 'commercial_exchange_rate', value: '36.50'),
      );
      await db.localConfigDao.saveConfig(
        LocalConfigEntity(
          key: 'bcn_official_exchange_rate',
          value: '36.6241',
        ),
      );

      saleVm = SaleViewModel(
        _StubSalesRepository(),
        _StubInventoryRepository(),
        _StubAuthRepository(),
        db,
        TableOrderService(db),
        false,
        TenantConfigService(db.localConfigDao),
        KitchenOrderService(db),
        PrinterConfigService(db.localConfigDao),
      );

      final navContext = _navKey.currentContext;
      if (navContext == null) {
        throw StateError('Navigator context is null');
      }

      // =======================================================================
      // CASE 1 — Global Theme + Non-stretch Column / IntrinsicWidth / Row / Wrap
      //          inside AlertDialog
      // =======================================================================
      _capturedErrors.clear();
      _log(
        'E2E_CASE: [1/3] Global Theme + Non-stretch Column / IntrinsicWidth / Row / Wrap inside AlertDialog',
      );

      final colIconBtnKey = GlobalKey();
      final intrinsicBtnKey = GlobalKey();
      final rowBtnKey = GlobalKey();
      final wrapBtnKey = GlobalKey();

      // ignore: use_build_context_synchronously
      showDialog<void>(
        context: navContext,
        barrierDismissible: false,
        builder: (_) => AlertDialog(
          title: const Text('Prueba de Tema #950'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ElevatedButton.icon(
                  key: colIconBtnKey,
                  onPressed: () {},
                  icon: const Icon(Icons.person_add),
                  label: const Text('Nuevo'),
                ),
                const SizedBox(height: 8),
                IntrinsicWidth(
                  child: ElevatedButton(
                    key: intrinsicBtnKey,
                    onPressed: () {},
                    child: const Text('Intrínseco'),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    ElevatedButton(
                      key: rowBtnKey,
                      onPressed: () {},
                      child: const Text('En Fila'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    ElevatedButton(
                      key: wrapBtnKey,
                      onPressed: () {},
                      child: const Text('En Wrap'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );

      await _waitForFrames(settleMs: 300);
      _assertNoFlutterErrors('Case 1');

      for (final entry in <String, GlobalKey>{
        'Column ElevatedButton.icon(Nuevo)': colIconBtnKey,
        'IntrinsicWidth ElevatedButton': intrinsicBtnKey,
        'Row non-Expanded ElevatedButton': rowBtnKey,
        'Wrap ElevatedButton': wrapBtnKey,
      }.entries) {
        final box = _requireRenderBox(entry.value, entry.key);
        final size = box.size;
        _log('Case 1 [${entry.key}] size=${size.width.toStringAsFixed(1)}x${size.height.toStringAsFixed(1)}');
        _assertTrue(
          size.height >= 48.0,
          'Case 1 [${entry.key}] height >= 48.0 (got ${size.height})',
        );
        _assertTrue(
          size.width.isFinite && size.width > 0,
          'Case 1 [${entry.key}] finite positive width (got ${size.width})',
        );
      }

      _navKey.currentState?.pop();
      await _waitForFrames(settleMs: 250);
      _assertNoFlutterErrors('Case 1 teardown');

      passed++;
      _log(
        'E2E_RESULT: PASS [1/3] AlertDialog with non-stretch Column, IntrinsicWidth, Row, Wrap rendered with 0 FlutterErrors and height >= 48dp',
      );

      // =======================================================================
      // CASE 2 — Real TipDialog & PinPad under buildNhilosPosTheme()
      // =======================================================================
      _capturedErrors.clear();
      _log('E2E_CASE: [2/3] Real TipDialog & PinPad under buildNhilosPosTheme()');

      final pinPadContainerKey = GlobalKey();
      setState(() {
        _stageWidget = SizedBox(
          key: pinPadContainerKey,
          width: 320,
          height: 260,
          child: PinPad(
            onKeyPressed: (_) {},
            onDelete: () {},
            onClear: () {},
          ),
        );
      });

      await _waitForFrames(settleMs: 150);

      // Open real TipDialog via showDialog with ChangeNotifierProvider<SaleViewModel>
      // ignore: use_build_context_synchronously
      showDialog<void>(
        context: navContext,
        barrierDismissible: false,
        builder: (_) => ChangeNotifierProvider<SaleViewModel>.value(
          value: saleVm!,
          child: const TipDialog(),
        ),
      );

      await _waitForFrames(settleMs: 300);
      _assertNoFlutterErrors('Case 2');

      final pinPadBox = _requireRenderBox(pinPadContainerKey, 'PinPad');
      _log(
        'Case 2 [PinPad] size=${pinPadBox.size.width.toStringAsFixed(1)}x${pinPadBox.size.height.toStringAsFixed(1)}',
      );
      _assertTrue(
        pinPadBox.size.width.isFinite && pinPadBox.size.width > 0,
        'Case 2 PinPad finite positive width',
      );
      _assertTrue(
        pinPadBox.size.height > 0,
        'Case 2 PinPad positive height',
      );

      final rootElement = WidgetsBinding.instance.rootElement;
      if (rootElement == null) {
        throw StateError('WidgetsBinding.instance.rootElement is null');
      }

      final tipDialogEl = _findElementByKey(
        rootElement,
        const Key('tip_dialog'),
      );
      final tipApplyEl = _findElementByKey(
        rootElement,
        const Key('tip_dialog_apply'),
      );
      if (tipDialogEl == null || tipApplyEl == null) {
        throw StateError('Could not locate TipDialog or tip_dialog_apply element');
      }

      final tipApplyBox = tipApplyEl.findRenderObject() as RenderBox?;
      if (tipApplyBox == null || !tipApplyBox.hasSize) {
        throw StateError('tip_dialog_apply RenderBox not laid out');
      }

      // TipDialog wraps its Column(crossAxisAlignment: CrossAxisAlignment.stretch)
      // inside Container(padding: EdgeInsets.all(20)).
      final tipDialogBox = tipDialogEl.findRenderObject() as RenderBox?;
      if (tipDialogBox == null || !tipDialogBox.hasSize) {
        throw StateError('tip_dialog RenderBox not laid out');
      }

      // Find the Column ancestor of tip_dialog_apply to get exact inner width.
      RenderBox? innerColumnBox;
      tipApplyEl.visitAncestorElements((ancestor) {
        if (ancestor.widget is Column) {
          final ro = ancestor.findRenderObject();
          if (ro is RenderBox && ro.hasSize) {
            innerColumnBox = ro;
          }
          return false;
        }
        return true;
      });
      if (innerColumnBox == null) {
        throw StateError('Could not find Column ancestor of tip_dialog_apply');
      }

      final applyWidth = tipApplyBox.size.width;
      final applyHeight = tipApplyBox.size.height;
      final dialogInnerWidth = innerColumnBox!.size.width;

      _log(
        'Case 2 [tip_dialog_apply] size=${applyWidth.toStringAsFixed(1)}x${applyHeight.toStringAsFixed(1)}, dialogInnerWidth=${dialogInnerWidth.toStringAsFixed(1)}',
      );

      _assertTrue(
        applyHeight >= 48.0,
        'Case 2 tip_dialog_apply height >= 48.0 (got $applyHeight)',
      );
      _assertTrue(
        (applyWidth - dialogInnerWidth).abs() <= 1.0,
        'Case 2 tip_dialog_apply spans full dialog inner width ($applyWidth vs $dialogInnerWidth)',
      );

      _navKey.currentState?.pop();
      await _waitForFrames(settleMs: 250);
      _assertNoFlutterErrors('Case 2 teardown');

      passed++;
      _log(
        'E2E_RESULT: PASS [2/3] Real TipDialog & PinPad rendered with 0 FlutterErrors, tip_dialog_apply >= 48dp and full dialog inner width',
      );

      // =======================================================================
      // CASE 3 — Explicit Full-Width CTA vs Content-Width CTA under
      //          buildNhilosPosTheme()
      // =======================================================================
      _capturedErrors.clear();
      _log(
        'E2E_CASE: [3/3] Explicit Full-Width CTA (SizedBox(width: double.infinity)) vs Content-Width CTA',
      );

      final cardInnerKey = GlobalKey();
      final fullWidthBtnKey = GlobalKey();
      final contentWidthBtnKey = GlobalKey();

      setState(() {
        _stageWidget = Card(
          margin: const EdgeInsets.all(16),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              key: cardInnerKey,
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    key: fullWidthBtnKey,
                    onPressed: () {},
                    child: const Text('Confirmar Venta'),
                  ),
                ),
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  key: contentWidthBtnKey,
                  onPressed: () {},
                  icon: const Icon(Icons.add),
                  label: const Text('Nuevo'),
                ),
              ],
            ),
          ),
        );
      });

      await _waitForFrames(settleMs: 200);
      _assertNoFlutterErrors('Case 3');

      final containerBox = _requireRenderBox(cardInnerKey, 'Card inner Column');
      final fullBtnBox = _requireRenderBox(fullWidthBtnKey, 'Full-width CTA');
      final contentBtnBox = _requireRenderBox(
        contentWidthBtnKey,
        'Content-width CTA',
      );

      final containerWidth = containerBox.size.width;
      final fullWidth = fullBtnBox.size.width;
      final fullHeight = fullBtnBox.size.height;
      final contentWidth = contentBtnBox.size.width;
      final contentHeight = contentBtnBox.size.height;

      _log(
        'Case 3 containerWidth=${containerWidth.toStringAsFixed(1)}, fullWidth=${fullWidth.toStringAsFixed(1)}x${fullHeight.toStringAsFixed(1)}, contentWidth=${contentWidth.toStringAsFixed(1)}x${contentHeight.toStringAsFixed(1)}',
      );

      _assertTrue(
        (fullWidth - containerWidth).abs() <= 1.0,
        'Case 3 fullWidth ($fullWidth) fills containerWidth ($containerWidth)',
      );
      _assertTrue(
        contentWidth < containerWidth,
        'Case 3 contentWidth ($contentWidth) < containerWidth ($containerWidth)',
      );
      _assertTrue(
        fullHeight >= 48.0,
        'Case 3 fullHeight >= 48.0 (got $fullHeight)',
      );
      _assertTrue(
        contentHeight >= 48.0,
        'Case 3 contentHeight >= 48.0 (got $contentHeight)',
      );

      passed++;
      _log(
        'E2E_RESULT: PASS [3/3] Explicit full-width CTA filled container width and content-width CTA stayed compact with 0 FlutterErrors',
      );

      _log('E2E_RESULT: $passed/$total ALL_TESTS_PASSED');
      if (mounted) {
        setState(() => _status = 'ALL_TESTS_PASSED ($passed/$total)');
      }
    } catch (e, st) {
      _log('TEST_FAILED: $e\n$st');
      if (mounted) {
        setState(() => _status = 'TEST_FAILED: $e');
      }
    } finally {
      saleVm?.dispose();
      await db?.close();
      if (await workDir.exists()) {
        await workDir.delete(recursive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navKey,
      theme: buildNhilosPosTheme(),
      home: Scaffold(
        appBar: AppBar(title: Text('#950 S23 E2E — $_status')),
        body: Column(
          children: [
            _stageWidget,
            const Divider(height: 1),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: _logs.map((l) => Text(l)).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
