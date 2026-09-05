import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/security/flutter_secure_cloud_credential_store.dart';
import 'package:pos_app/domain/security/cloud_credential_store.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late _Storage storage;
  late FlutterSecureCloudCredentialStore store;

  setUp(() {
    storage = _Storage();
    store = FlutterSecureCloudCredentialStore(storage);
  });

  test('delegates read write and delete to the one secure backend', () async {
    when(() => storage.read(key: 'key')).thenAnswer((_) async => 'value');
    when(
      () => storage.write(key: 'key', value: 'value'),
    ).thenAnswer((_) async {});
    when(() => storage.delete(key: 'key')).thenAnswer((_) async {});
    expect(await store.read('key'), 'value');
    await store.write('key', 'value');
    await store.delete('key');
    verify(() => storage.read(key: 'key')).called(1);
    verify(() => storage.write(key: 'key', value: 'value')).called(1);
    verify(() => storage.delete(key: 'key')).called(1);
  });

  test(
    'wraps failures with only safe operation and type diagnostics',
    () async {
      const secret = 'access-secret';
      when(() => storage.read(key: 'key')).thenThrow(StateError(secret));
      when(
        () => storage.write(key: 'key', value: secret),
      ).thenThrow(StateError(secret));
      for (final action in [
        () => store.read('key'),
        () => store.write('key', secret),
      ]) {
        try {
          await action();
          fail('expected storage failure');
        } catch (error) {
          final failure = error as CloudCredentialStoreFailure;
          expect(failure.toString(), isNot(contains(secret)));
          expect(failure.operation, anyOf('read', 'write'));
          expect(failure.errorType, 'StateError');
        }
      }
    },
  );
}
