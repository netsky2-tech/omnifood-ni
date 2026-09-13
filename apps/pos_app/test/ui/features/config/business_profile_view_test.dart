import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/domain/models/config/tenant_operation_mode.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view.dart';
import 'package:pos_app/ui/features/config/business_profile/business_profile_view_model.dart';
import 'package:provider/provider.dart';

class _MockLocalConfigDao extends Mock implements LocalConfigDao {}

void main() {
  late _MockLocalConfigDao mockDao;
  late BusinessProfileViewModel viewModel;

  setUpAll(() {
    registerFallbackValue(LocalConfigEntity(key: 'fallback', value: ''));
  });

  setUp(() {
    mockDao = _MockLocalConfigDao();
    viewModel = BusinessProfileViewModel(mockDao);
  });

  Widget buildWidget() {
    return ChangeNotifierProvider<BusinessProfileViewModel>.value(
      value: viewModel,
      child: const MaterialApp(
        home: BusinessProfileView(),
      ),
    );
  }

  testWidgets('BusinessProfileView synchronizes business_name and emits CONTROLLER_UPDATED: true without logging config map', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(find.text('Café Managua'), findsOneWidget);
      expect(printedLogs, contains('CONTROLLER_UPDATED: true'));
      // Ensure diagnostics do not print full ViewModel config map
      expect(printedLogs.any((log) => log.contains('loadConfig done, config:')), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('BusinessProfileView emits CONTROLLER_UPDATED: false when business_name is empty', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(printedLogs, contains('CONTROLLER_UPDATED: false'));
      expect(printedLogs.contains('CONTROLLER_UPDATED: true'), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('BusinessProfileView emits CONTROLLER_UPDATED: false on equal-config fast path', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(printedLogs, contains('CONTROLLER_UPDATED: true'));
      printedLogs.clear();

      // Trigger sync attempt when config is unchanged (equal-config fast path)
      viewModel.notifyListeners();
      await tester.pump();

      expect(printedLogs, contains('CONTROLLER_UPDATED: false'));
      expect(printedLogs.contains('CONTROLLER_UPDATED: true'), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });

  testWidgets('BusinessProfileView emits CONTROLLER_UPDATED: false when other config changes but business_name is unchanged', (tester) async {
    final printedLogs = <String>[];
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) printedLogs.add(message);
    };

    try {
      when(() => mockDao.getConfigByKey(any())).thenAnswer((_) async => null);
      when(() => mockDao.getConfigByKey('business_name'))
          .thenAnswer((_) async => LocalConfigEntity(key: 'business_name', value: 'Café Managua'));

      await tester.pumpWidget(buildWidget());
      await tester.pumpAndSettle();

      expect(printedLogs, contains('CONTROLLER_UPDATED: true'));
      printedLogs.clear();

      // Change operation_mode without changing business_name
      viewModel.setOperationMode(TenantOperationMode.restaurant);
      await tester.pump();

      expect(printedLogs, contains('CONTROLLER_UPDATED: false'));
      expect(printedLogs.contains('CONTROLLER_UPDATED: true'), isFalse);
    } finally {
      debugPrint = debugPrintSynchronously;
    }
  });
}
