import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';
import 'package:pos_app/presentation/services/alert_service_impl.dart';

void main() {
  group('AlertServiceImpl', () {
    late AlertServiceImpl service;

    setUp(() {
      service = AlertServiceImpl();
    });

    tearDown(() {
      service.dispose();
    });

    test('should emit AlertMessage when notifyLowStock is called', () async {
      final expectation = expectLater(
        service.alertStream,
        emits(predicate((alert) => (alert as AlertMessage).message.contains('Café') && alert.message.contains('100'))),
      );

      service.notifyLowStock('Café', 100, 200);

      await expectation;
    });
  });
}
