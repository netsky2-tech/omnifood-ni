import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/mappers/audit_mapper.dart';
import 'package:pos_app/data/models/audit_log_entity.dart';

AuditLogEntity buildEntity({String? hashVersion}) => AuditLogEntity(
  id: 7,
  userId: 'user-1',
  action: 'DRAWER_OPEN',
  timestamp: '2023-01-01T00:00:00.000Z',
  deviceId: 'device-1',
  isSynced: false,
  sequenceNo: 1,
  prevHash: 'GENESIS',
  entryHash: 'entry-hash',
  remoteRefUuid: 'remote-ref',
  hashVersion: hashVersion,
);

void main() {
  test('preserves absent historical hash provenance through the mapper', () {
    final domain = AuditMapper.toDomain(buildEntity());

    expect(domain.hashVersion, isNull);
    expect(AuditMapper.toEntity(domain).hashVersion, isNull);
  });

  test(
    'preserves an explicit audit hash version exactly through the mapper',
    () {
      final domain = AuditMapper.toDomain(
        buildEntity(hashVersion: 'v3-jcs-rfc8785'),
      );

      expect(domain.hashVersion, 'v3-jcs-rfc8785');
      expect(AuditMapper.toEntity(domain).hashVersion, 'v3-jcs-rfc8785');
    },
  );
}
