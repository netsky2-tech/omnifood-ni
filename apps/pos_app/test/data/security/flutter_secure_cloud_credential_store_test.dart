import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/data/security/flutter_secure_cloud_credential_store.dart';
import 'package:pos_app/domain/security/cloud_credential_store.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

FlutterSecureCloudCredentialStore _freshStore([_Storage? s]) {
  final storage = s ?? _Storage();
  return FlutterSecureCloudCredentialStore(storage);
}

void main() {
  late _Storage storage;
  late FlutterSecureCloudCredentialStore store;

  setUp(() {
    storage = _Storage();
    store = _freshStore(storage);
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
    'wraps read failure with safe diagnostics (no secret leak)',
    () async {
      const secret = 'access-secret';
      when(() => storage.read(key: 'key')).thenThrow(StateError(secret));
      try {
        await store.read('key');
        fail('expected storage failure');
      } catch (error) {
        final failure = error as CloudCredentialStoreReadFailure;
        expect(failure.toString(), isNot(contains(secret)));
        expect(failure.operation, 'read');
        expect(failure.errorType, 'StateError');
      }
    },
  );

  test(
    'wraps write failure with safe diagnostics (no secret leak)',
    () async {
      const secret = 'access-secret';
      when(
        () => storage.write(key: 'key', value: secret),
      ).thenThrow(StateError(secret));
      try {
        await store.write('key', secret);
        fail('expected storage failure');
      } catch (error) {
        final failure = error as CloudCredentialStoreWriteFailure;
        expect(failure.toString(), isNot(contains(secret)));
        expect(failure.operation, 'write');
        expect(failure.errorType, 'StateError');
      }
    },
  );

  group('Circuit Breaker', () {
    test('read failure opens circuit — second read fails instantly', () async {
      final s = _Storage();
      final st = _freshStore(s);
      var callCount = 0;
      when(() => s.read(key: 'key')).thenAnswer((_) async {
        callCount++;
        throw StateError('hung');
      });
      try {
        await st.read('key');
        fail('should throw');
      } on CloudCredentialStoreReadFailure catch (_) {}
      expect(callCount, 1);
      // Second read: circuit is open, no native call
      try {
        await st.read('key');
        fail('should throw');
      } on CloudCredentialStoreReadFailure catch (_) {}
      expect(callCount, 1);
    });

    test('write failure opens circuit — second write fails instantly', () async {
      final s = _Storage();
      final st = _freshStore(s);
      var callCount = 0;
      when(() => s.write(key: 'key', value: 'val')).thenAnswer((_) async {
        callCount++;
        throw StateError('hung');
      });
      try {
        await st.write('key', 'val');
        fail('should throw');
      } on CloudCredentialStoreWriteFailure catch (_) {}
      expect(callCount, 1);
      try {
        await st.write('key', 'val');
        fail('should throw');
      } on CloudCredentialStoreWriteFailure catch (_) {}
      expect(callCount, 1);
    });

    test('delete failure opens circuit — second delete fails instantly', () async {
      final s = _Storage();
      final st = _freshStore(s);
      var callCount = 0;
      when(() => s.delete(key: 'key')).thenAnswer((_) async {
        callCount++;
        throw StateError('hung');
      });
      try {
        await st.delete('key');
        fail('should throw');
      } on CloudCredentialStoreWriteFailure catch (_) {}
      expect(callCount, 1);
      try {
        await st.delete('key');
        fail('should throw');
      } on CloudCredentialStoreWriteFailure catch (_) {}
      expect(callCount, 1);
    });

    test('circuit reset allows native calls again', () async {
      final s = _Storage();
      final st = _freshStore(s);
      when(() => s.read(key: 'key')).thenThrow(StateError('hung'));
      try {
        await st.read('key');
      } on CloudCredentialStoreReadFailure catch (_) {}
      st.resetCircuit();
      when(() => s.read(key: 'key')).thenAnswer((_) async => 'ok');
      expect(await st.read('key'), 'ok');
    });

    test('error type is circuit_degraded after circuit opens', () async {
      final s = _Storage();
      final st = _freshStore(s);
      when(() => s.read(key: 'key')).thenThrow(StateError('hung'));
      try {
        await st.read('key');
        fail('should throw');
      } on CloudCredentialStoreReadFailure catch (_) {}
      try {
        await st.read('key');
        fail('should throw');
      } on CloudCredentialStoreReadFailure catch (e) {
        expect(e.errorType, 'circuit_degraded');
      }
    });
  });

  group('Single-Flight', () {
    test('concurrent reads serialize through the gate', () async {
      when(() => storage.read(key: 'a')).thenAnswer((_) async => 'val-a');
      when(() => storage.read(key: 'b')).thenAnswer((_) async => 'val-b');
      final results = await Future.wait([
        store.read('a'),
        store.read('b'),
      ]);
      expect(results, ['val-a', 'val-b']);
      verify(() => storage.read(key: 'a')).called(1);
      verify(() => storage.read(key: 'b')).called(1);
    });

    test('failed operation releases gate for next caller', () async {
      final s = _Storage();
      final st = _freshStore(s);
      when(() => s.read(key: 'fail')).thenThrow(StateError('boom'));
      when(() => s.read(key: 'ok')).thenAnswer((_) async => 'value');
      try {
        await st.read('fail');
      } on CloudCredentialStoreReadFailure catch (_) {}
      st.resetCircuit();
      expect(await st.read('ok'), 'value');
    });
  });
}
