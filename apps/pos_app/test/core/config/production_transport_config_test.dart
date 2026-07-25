import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/core/config/production_transport_config.dart';

void main() {
  test('uses finite explicit timeouts for the shared production transport', () {
    final options = productionTransportOptions('https://sync.example.test/api');

    expect(options.baseUrl, 'https://sync.example.test/api');
    expect(options.connectTimeout, posSyncTransportTimeout);
    expect(options.sendTimeout, posSyncTransportTimeout);
    expect(options.receiveTimeout, posSyncTransportTimeout);
    expect(options.connectTimeout, isNotNull);
    expect(options.sendTimeout, isNotNull);
    expect(options.receiveTimeout, isNotNull);
  });
}
