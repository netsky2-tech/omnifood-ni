import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';

/// SPEC: odd/tasks/identidad-empresa-paridad.md S7 (verbatim owner constraint
/// in L3): "hay gente en produccion ... no podemos darnos el lujo de
/// interferir en la productividad de un cliente". The print path must NEVER
/// depend on the cloud: a terminal with local identity and NO cloud identity
/// prints EXACTLY the same as before the change.
///
/// This is a CHARACTERIZATION test over a REAL Floor/SQLite database. It does
/// not prescribe; it captures. If it fails, the production ticket header
/// would change, and that failure is the finding.
///
/// Production scenario, per the P1 snapshot builder
/// (fiscal-config-version.service.ts: `phone: tenant.phone || null`, same for
/// address and email): the snapshot ALWAYS carries the identity keys, so a
/// terminal whose cloud columns are NULL (they were dead fields until P1)
/// receives `address: null, phone: null, email: null` — present-and-null,
/// which the P2 projection (006d8080) treats as CLEARS (delete the local key).
void main() {
  late AppDatabase database;
  late FiscalInboxHandler handler;
  late PrinterConfigService printerConfigService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    handler = FiscalInboxHandler(database);
    printerConfigService = PrinterConfigService(database.localConfigDao);
  });

  tearDown(() async {
    await database.close();
  });

  const tenantId = 'tenant-prod-1';

  /// The pre-P1 snapshot shape the production terminal already holds: no
  /// identity keys at all (absent = no-op, so operator-entered values were
  /// safe until P2).
  Map<String, dynamic> envelope({
    required int revision,
    required String fingerprint,
    Object? address = _absent,
    Object? phone = _absent,
    Object? email = _absent,
    Object? ruc = _absent,
  }) {
    final e = <String, dynamic>{
      'tenantId': tenantId,
      'businessName': 'Fritanga Doña Maria',
      'ruc': 'J0310000000001',
      'fiscalRegime': 'CUOTA_FIJA',
      'taxRate': 0.0,
      'pricesIncludeTax': true,
      'commercialFxSpread': 36.5,
      'configVersion': {
        'revision': revision,
        'fingerprint': fingerprint,
      },
      'generatedAt': '2026-03-30T10:00:00.000Z',
    };
    // P1 builder semantics: keys are ALWAYS present, null when the cloud
    // column has no value (tenant.address || null).
    if (!identical(address, _absent)) e['address'] = address;
    if (!identical(phone, _absent)) e['phone'] = phone;
    if (!identical(email, _absent)) e['email'] = email;
    if (!identical(ruc, _absent)) e['ruc'] = ruc;
    return e;
  }

  Future<void> seedLegacyOperatorIdentity() async {
    // What the operator typed into the business profile on the terminal,
    // never sent to the cloud: plain fallback keys, NO printer_header_*
    // override (that is exactly the production tenant's shape).
    await database.localConfigDao.saveConfig(LocalConfigEntity(
      key: 'address',
      value: 'Km 12 Carretera a Masaya, Semáforos El Zumen 1c al lago',
      description: 'Business profile address entered by the operator',
    ));
    await database.localConfigDao.saveConfig(LocalConfigEntity(
      key: 'phone',
      value: '505 8888 7777',
      description: 'Business profile phone entered by the operator',
    ));
  }

  Future<void> seedHeaderOverrides() async {
    await database.localConfigDao.saveConfig(LocalConfigEntity(
      key: 'printer_header_address',
      value: 'Km 12 Carretera a Masaya, Semáforos El Zumen 1c al lago',
      description: 'Explicit local header override',
    ));
    await database.localConfigDao.saveConfig(LocalConfigEntity(
      key: 'printer_header_phone',
      value: '505 8888 7777',
      description: 'Explicit local header override',
    ));
  }

  /// Resolves EXACTLY what a printed ticket header would carry, through the
  /// real read path (printer_config_service.dart:111-114):
  /// `printer_header_address ?? address`, `printer_header_phone ?? phone`.
  /// The printed RUC is `fiscalRuc` — the plain `ruc` key (printer_config.dart:
  /// "the sale and reprint paths print; [headerRuc] must never shadow it"),
  /// which the projection writes and the operator may edit.
  Future<({String? address, String? phone, String? ruc})> resolveHeader() async {
    final config = await printerConfigService.getPrinterConfig();
    return (
      address: config.headerAddress,
      phone: config.headerPhone,
      ruc: config.fiscalRuc,
    );
  }

  group('CHARACTERIZATION: printed header is inert for a cloud with NO identity (S7/L3)', () {
    test('legacy terminal WITHOUT printer_header_* override: priming with '
        'address:null/phone:null (the exact payload the production tenant '
        'receives today) must NOT change the resolved header', () async {
      // --- Pre-projection state -------------------------------------------
      // The terminal already holds a pre-P1 snapshot (identity keys absent)
      // and has operator-entered identity in the plain fallback keys.
      await handler.handleFiscalEnvelope(envelope(
        revision: 1,
        fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ));
      await seedLegacyOperatorIdentity();

      final before = await resolveHeader();
      expect(before.address, 'Km 12 Carretera a Masaya, Semáforos El Zumen 1c al lago');
      expect(before.phone, '505 8888 7777');

      // --- The next priming: P1/P2 payload with cloud columns NULL --------
      final outcome = await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        address: null,
        phone: null,
        email: null,
      ));
      expect(outcome.status, FiscalInboxStatus.applied);

      // --- CHARACTERIZATION: the header must resolve identically ----------
      final after = await resolveHeader();
      // S7/L3 verbatim: "una terminal con logo local y sin logo en la nube
      // imprime exactamente lo mismo que antes del cambio".
      expect(after.address, before.address,
          reason: 'The printed ticket ADDRESS changed after priming with a '
              'cloud that has NO identity configured — this violates the '
              'owner constraint in S7/L3.');
    });

    test('legacy terminal WITHOUT printer_header_* override: the PHONE of the '
        'ticket must also survive the same priming', () async {
      await handler.handleFiscalEnvelope(envelope(
        revision: 1,
        fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ));
      await seedLegacyOperatorIdentity();

      await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        address: null,
        phone: null,
        email: null,
      ));

      final after = await resolveHeader();
      expect(after.phone, '505 8888 7777',
          reason: 'The printed ticket PHONE changed after priming with a '
              'cloud that has NO identity configured — this violates the '
              'owner constraint in S7/L3.');
    });

    test('legacy terminal WITHOUT printer_header_* override: the RUC typed by '
        'the operator must survive priming with a cloud that has NO ruc '
        '(post-P1 builder sends ruc:null) — the plain `ruc` key is what the '
        'sale and reprint paths print', () async {
      // Rev 1: the cloud has never asserted a ruc (ruc:null, the P1 builder
      // shape for a tenant whose `tenant.ruc` column is NULL).
      await handler.handleFiscalEnvelope(envelope(
        revision: 1,
        fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ruc: null,
      ));
      // The operator typed the RUC into the business profile: the plain
      // `ruc` key, NO printer_header_ruc override.
      await database.localConfigDao.saveConfig(LocalConfigEntity(
        key: 'ruc',
        value: 'J0310000000001',
        description: 'RUC entered by the operator in the business profile',
      ));

      final before = await resolveHeader();
      expect(before.ruc, 'J0310000000001');

      final outcome = await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ruc: null,
      ));
      expect(outcome.status, FiscalInboxStatus.applied);

      final after = await resolveHeader();
      expect(after.ruc, 'J0310000000001',
          reason: 'The printed RUC changed after priming with a cloud that '
              'NEVER asserted a ruc — the projection destroyed an '
              'operator-entered value that fiscal documents print '
              '(S7/L3 + option B production-safety half).');
    });

    test('legacy terminal WITH printer_header_* override: the same priming '
        'must not change the resolved header (S6 precedence shields it)', () async {
      await handler.handleFiscalEnvelope(envelope(
        revision: 1,
        fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ));
      await seedHeaderOverrides();

      final before = await resolveHeader();
      expect(before.address, 'Km 12 Carretera a Masaya, Semáforos El Zumen 1c al lago');
      expect(before.phone, '505 8888 7777');

      final outcome = await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        address: null,
        phone: null,
        email: null,
      ));
      expect(outcome.status, FiscalInboxStatus.applied);

      final after = await resolveHeader();
      expect(after.address, before.address);
      expect(after.phone, before.phone);
    });
  });

  group('CHARACTERIZATION: repair path (P2 fix, repair half)', () {
    test('re-receiving the SAME null-carrying snapshot forces the repair '
        'projection and must not delete the operator-entered keys', () async {
      // Terminal already applied the null-carrying snapshot, then the
      // operator typed identity locally (address/phone) and email exists too.
      await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        address: null,
        phone: null,
        email: null,
      ));
      await seedLegacyOperatorIdentity();
      await database.localConfigDao.saveConfig(LocalConfigEntity(
        key: 'email',
        value: 'fritanga@local.ni',
        description: 'Business profile email entered by the operator',
      ));

      // Force the repair path: corrupt a REQUIRED mirror so
      // isProjectionComplete returns false and the repair transaction
      // actually executes (otherwise the replay is an idempotent no-op and
      // proves nothing about the transaction's delete behavior).
      await database.localConfigDao.saveConfig(LocalConfigEntity(
        key: 'tax_regime',
        value: 'CORRUPTED',
        description: 'Corrupted to force a repair transaction',
      ));

      final outcome = await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        address: null,
        phone: null,
        email: null,
      ));
      expect(outcome.status, FiscalInboxStatus.projectionRepaired,
          reason: 'The repair transaction must have actually run for this '
              'test to prove anything.');

      final after = await resolveHeader();
      expect(after.address, 'Km 12 Carretera a Masaya, Semáforos El Zumen 1c al lago',
          reason: 'repairProjectionFromSnapshot must not delete the '
              'operator-entered address.');
      expect(after.phone, '505 8888 7777',
          reason: 'repairProjectionFromSnapshot must not delete the '
              'operator-entered phone.');
      final email = await database.localConfigDao.getConfigByKey('email');
      expect(email?.value, 'fritanga@local.ni',
          reason: 'repairProjectionFromSnapshot must not delete the '
              'operator-entered email.');
    });
  });

  group('CHARACTERIZATION: cloud genuinely owns identity (legitimate intent, must survive any fix)', () {
    test('cloud SETS values: the fallback mirrors them (S1/S6)', () async {
      await handler.handleFiscalEnvelope(envelope(
        revision: 1,
        fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ));
      await seedLegacyOperatorIdentity();

      final outcome = await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        address: 'Nueva Dirección desde la nube',
        phone: '505 2222 3333',
        email: 'hola@fritanga.ni',
      ));
      expect(outcome.status, FiscalInboxStatus.applied);

      final after = await resolveHeader();
      expect(after.address, 'Nueva Dirección desde la nube');
      expect(after.phone, '505 2222 3333');
    });

    test('cloud CLEARS a value it genuinely owns: the stale local value does '
        'not survive the clearing revision', () async {
      // Revision 1: cloud DID have identity and the terminal mirrored it.
      await handler.handleFiscalEnvelope(envelope(
        revision: 1,
        fingerprint: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        address: 'Dirección anterior de la nube',
        phone: '505 1111 0000',
      ));
      final before = await resolveHeader();
      expect(before.address, 'Dirección anterior de la nube');
      expect(before.phone, '505 1111 0000');

      // Revision 2: the cloud clears the field it owns.
      await handler.handleFiscalEnvelope(envelope(
        revision: 2,
        fingerprint: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        address: null,
        phone: null,
        email: null,
      ));

      final after = await resolveHeader();
      expect(after.address, isNull,
          reason: 'A cloud-cleared value must not survive as a stale local '
              'value once the cloud genuinely owns the field (S3).');
      expect(after.phone, isNull,
          reason: 'A cloud-cleared value must not survive as a stale local '
              'value once the cloud genuinely owns the field (S3).');
    });
  });
}

/// Sentinel distinguishing "key absent" from "key present with null value".
const _absent = Object();
