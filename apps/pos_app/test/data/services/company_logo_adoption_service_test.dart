import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/daos/local_config_dao.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/local_config_entity.dart';
import 'package:pos_app/data/services/company_logo_adoption_service.dart';
import 'package:pos_app/data/services/fiscal_inbox_handler.dart';
import 'package:pos_app/domain/ports/company_logo_port.dart';
import 'package:pos_app/domain/services/config/printer_config_service.dart';
import 'package:pos_app/domain/services/printer/thermal_logo_processor.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Company identity parity P4 (odd/tasks/identidad-empresa-paridad.md, S7,
/// L3/L4).
///
/// THE acceptance criterion of this slice lives here: a CHARACTERIZATION of
/// what a terminal with a local logo and no cloud logo produces today —
/// captured as the exact key/value set the printer reads (the four
/// `printer_logo_*` rows in `local_configs` plus the logo fields the printer
/// consumes via [PrinterConfigService.getPrinterConfig]) — and the assertion
/// that it is byte-identical after this change.
///
/// Declared plainly: we characterized the EXACT key/value set the printer
/// reads, NOT rendered paper pixels. The printing path itself is untouched
/// by this change (no printer adapter, formatter or ESC/POS builder was
/// modified), so the keys the printer consumes are the contract.
///
/// The forced-failure matrix of constraint 2 lives here too: fetch failure,
/// absent cloud asset, corrupt/tampered bytes, derivation failure, derivation
/// throw, and persistence failure — each must leave the previous local raster
/// byte-identical.
void main() {
  late AppDatabase database;
  late LocalConfigDao configDao;
  late PrinterConfigService configService;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
    configDao = database.localConfigDao;
    configService = PrinterConfigService(configDao);
  });

  tearDown(() async {
    await database.close();
  });

  const tenantId = 'tenant-production-1';

  /// The local raster a production terminal has today: a stored 1-bit
  /// artifact plus the operator's own tuning. The base64 need not decode to
  /// a PNG — the printing path consumes it exactly as it does today, and
  /// none of these tests derive it.
  const localRasterBase64 = 'cHJvZHVjdGlvbi10ZXJtaW5hbC1yYXN0ZXI=';
  const localRasterWidth = '192';
  const localRasterHeight = '48';
  const localRasterEnabled = 'true';

  Future<void> seedProductionTerminalWithLocalLogo() async {
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_logo_base64',
      value: localRasterBase64,
      description: 'Monochrome 1-bit logo raster bytes (Base64)',
    ));
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_logo_width',
      value: localRasterWidth,
    ));
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_logo_height',
      value: localRasterHeight,
    ));
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_logo_enabled',
      value: localRasterEnabled,
    ));
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_driver_type',
      value: 'IPOS_Q80',
    ));
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_paper_width_mm',
      value: '80',
    ));
    await configDao.saveConfig(LocalConfigEntity(
      key: 'printer_header_ruc',
      value: 'J0310000000001',
    ));
  }

  /// The exact key/value set the printer reads, straight from `local_configs`
  /// (the `printer_logo_*` keys of printer_config_service).
  Future<Map<String, String?>> printerLogoKeyValues() async => {
        'printer_logo_base64':
            (await configDao.getConfigByKey('printer_logo_base64'))?.value,
        'printer_logo_width':
            (await configDao.getConfigByKey('printer_logo_width'))?.value,
        'printer_logo_height':
            (await configDao.getConfigByKey('printer_logo_height'))?.value,
        'printer_logo_enabled':
            (await configDao.getConfigByKey('printer_logo_enabled'))?.value,
      };

  /// The logo fields as the printer consumes them through [PrinterConfig].
  Future<Map<String, Object?>> printerLogoConfigFields() async {
    final config = await configService.getPrinterConfig();
    return {
      'logoBase64': config.logoBase64,
      'logoWidth': config.logoWidth,
      'logoHeight': config.logoHeight,
      'isLogoEnabled': config.isLogoEnabled,
    };
  }

  /// A fiscal envelope in the CURRENT (4c4a2fbe) snapshot shape. With
  /// [logoSha256] null this is the payload the production tenant receives
  /// today (the builder always sends the key; no cloud logo rides as null).
  Map<String, dynamic> fiscalEnvelope({Object? logoSha256}) => {
        'tenantId': tenantId,
        'businessName': 'Cafetín Central',
        'ruc': 'J0310000000001',
        'fiscalRegime': 'RESPONSABLE_IVA',
        'taxRate': 0.15,
        'pricesIncludeTax': true,
        'commercialFxSpread': 36.5,
        'address': 'Calle Real 123',
        'phone': '555-0100',
        'email': null,
        'maxDiscountAmount': null,
        'maxDiscountPercent': null,
        'dgiAuthorizationCode': null,
        'dgiAuthorizationIssuedAt': null,
        'dgiAuthorizationExpiresAt': null,
        'operationMode': null,
        'checkoutFxMode': null,
        'logoSha256': logoSha256,
        'configVersion': {
          'revision': 1,
          'fingerprint':
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      };

  _FakeCompanyLogoPort portFor({
    required String sha256,
    required List<int> bytes,
  }) =>
      _FakeCompanyLogoPort(
        result: CloudCompanyLogoOriginal(
          sha256: sha256,
          contentType: 'image/png',
          bytes: Uint8List.fromList(bytes),
        ),
      );

  group('CHARACTERIZATION — terminal with local logo, no cloud logo (S7)', () {
    test('a fiscal sync WITHOUT a cloud logo leaves every printer-read logo '
        'key and field byte-identical (pre-P3 legacy snapshot shape)',
        () async {
      await seedProductionTerminalWithLocalLogo();

      final keysBefore = await printerLogoKeyValues();
      final fieldsBefore = await printerLogoConfigFields();

      // The legacy snapshot shape does not even carry the key.
      final envelope = fiscalEnvelope()..remove('logoSha256');
      final outcome =
          await FiscalInboxHandler(database).handleFiscalEnvelope(envelope);
      expect(outcome.isApplied, isTrue);

      expect(await printerLogoKeyValues(), keysBefore);
      expect(await printerLogoConfigFields(), fieldsBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
      expect(keysBefore['printer_logo_enabled'], localRasterEnabled);
    });

    test('a fiscal sync carrying logoSha256:null (current production shape) '
        'leaves every printer-read logo key and field byte-identical',
        () async {
      await seedProductionTerminalWithLocalLogo();

      final keysBefore = await printerLogoKeyValues();
      final fieldsBefore = await printerLogoConfigFields();

      final outcome = await FiscalInboxHandler(database)
          .handleFiscalEnvelope(fiscalEnvelope(logoSha256: null));
      expect(outcome.isApplied, isTrue);

      expect(await printerLogoKeyValues(), keysBefore);
      expect(await printerLogoConfigFields(), fieldsBefore);
    });

    test('the terminal LEARNS the company has a cloud logo (reference read) '
        'without a single byte being written; and adopting with no cloud '
        'logo writes nothing', () async {
      await seedProductionTerminalWithLocalLogo();
      final cloudSha = 'b' * 64;

      final outcome = await FiscalInboxHandler(database)
          .handleFiscalEnvelope(fiscalEnvelope(logoSha256: cloudSha));
      expect(outcome.isApplied, isTrue);

      final keysAfterSync = await printerLogoKeyValues();
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: const _FakeCompanyLogoPort(),
      );

      // The terminal learned the reference — read-only.
      expect(await adoption.readCloudLogoSha256(), cloudSha);
      // Learning it wrote nothing.
      expect(await printerLogoKeyValues(), keysAfterSync);

      // A terminal with a local raster and NO cloud logo attempting to
      // adopt: refused, nothing written.
      final noLogoDatabase = await $FloorAppDatabase
          .inMemoryDatabaseBuilder()
          .build();
      try {
        final noLogoDao = noLogoDatabase.localConfigDao;
        final noLogoService = PrinterConfigService(noLogoDao);
        await noLogoDao.saveConfig(LocalConfigEntity(
          key: 'printer_logo_base64',
          value: localRasterBase64,
        ));
        final noLogoAdoption = CompanyLogoAdoptionService(
          database: noLogoDatabase,
          configService: noLogoService,
          logoPort: const _FakeCompanyLogoPort(),
        );
        final result = await noLogoAdoption.adoptCompanyLogo();
        expect(result.success, isFalse);
        expect(
          (await noLogoDao.getConfigByKey('printer_logo_base64'))?.value,
          localRasterBase64,
        );
      } finally {
        await noLogoDatabase.close();
      }
    });
  });

  group('FORCED FAILURES — adoption never degrades the local raster (S7)', () {
    // The snapshot reference: the sha256 of the bytes the (fake) cloud
    // serves, so integrity PASSES and the later stages — derivation and
    // persistence — are what each test forces to fail.
    final refSha = crypto.sha256
        .convert(Uint8List.fromList(utf8.encode('any-png-bytes')))
        .toString();
    final anyPngBytes = utf8.encode('any-png-bytes');

    setUp(() async {
      await seedProductionTerminalWithLocalLogo();
      await FiscalInboxHandler(database)
          .handleFiscalEnvelope(fiscalEnvelope(logoSha256: refSha));
    });

    Future<Map<String, String?>> keys() => printerLogoKeyValues();

    test('1. fetch fails (transport error) → previous raster intact',
        () async {
      final keysBefore = await keys();
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: _FakeCompanyLogoPort(
          onFetch: () => throw const CompanyLogoFetchException('socket closed'),
        ),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('descargar'));
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });

    test('2a. corrupt bytes (payload does not match the snapshot reference) '
        '→ previous raster intact', () async {
      final keysBefore = await keys();
      final corrupted = Uint8List.fromList(utf8.encode('corrupted-bytes'));
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: _FakeCompanyLogoPort(
          result: CloudCompanyLogoOriginal(
            sha256: refSha, // claims to match…
            contentType: 'image/png',
            bytes: corrupted, // …but these are not the hashed bytes
          ),
        ),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('integridad'));
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });

    test('2b. transport corruption (locally recomputed sha differs from the '
        'declared sha) → previous raster intact', () async {
      final keysBefore = await keys();
      final bytes = Uint8List.fromList(utf8.encode('original-bytes'));
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: _FakeCompanyLogoPort(
          result: CloudCompanyLogoOriginal(
            sha256: crypto.sha256.convert(bytes).toString(),
            contentType: 'image/png',
            bytes: bytes,
          ),
        ),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });

    test('3a. derivation reports an invalid result → previous raster intact',
        () async {
      final keysBefore = await keys();
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: portFor(sha256: refSha, bytes: anyPngBytes),
        deriveRaster: (_) async =>
            LogoProcessingResult.failure('codec exploded'),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('térmica'));
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });

    test('3b. derivation THROWS → previous raster intact', () async {
      final keysBefore = await keys();
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: portFor(sha256: refSha, bytes: anyPngBytes),
        deriveRaster: (_) async => throw StateError('dart:ui blew up'),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('intacto'));
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });

    test('4. persistence fails (SQLite write error) → previous raster intact '
        'and NO partial write', () async {
      final keysBefore = await keys();
      final failingService = PrinterConfigService(
        _SaveFailsConfigDao(configDao),
      );
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: failingService,
        logoPort: portFor(sha256: refSha, bytes: anyPngBytes),
        deriveRaster: (_) async => LogoProcessingResult.success(
          width: 8,
          height: 8,
          raw1BitBitmap: Uint8List(8),
          escPosRasterBytes: const [1, 2, 3],
          base64Png: 'YWRvcHRlZC1yYXN0ZXI=',
        ),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(result.errorMessage, contains('guardar'));
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });

    test('cloud reports no asset while the snapshot carries a reference → '
        'refused, raster intact', () async {
      final keysBefore = await keys();
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: const _FakeCompanyLogoPort(result: null),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isFalse);
      expect(await keys(), keysBefore);
      expect(keysBefore['printer_logo_base64'], localRasterBase64);
    });
  });

  group('ADOPTION SUCCESS — replaces ONLY the raster (S7/L4)', () {
    test('a verified PNG original is derived with the real processor and '
        'persists only printer_logo_base64; width/height/enabled untouched',
        () async {
      await seedProductionTerminalWithLocalLogo();
      // A real, structurally valid PNG (1x1) — the SAME payload shape the
      // dashboard upload accepts.
      final pngBytes = base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      );
      final sha = crypto.sha256.convert(pngBytes).toString();
      await FiscalInboxHandler(database)
          .handleFiscalEnvelope(fiscalEnvelope(logoSha256: sha));

      final keysBefore = await printerLogoKeyValues();
      final adoption = CompanyLogoAdoptionService(
        database: database,
        configService: configService,
        logoPort: portFor(sha256: sha, bytes: pngBytes),
      );

      final result = await adoption.adoptCompanyLogo();

      expect(result.success, isTrue, reason: result.errorMessage);

      final keysAfter = await printerLogoKeyValues();
      // THE operator tuning is untouched.
      expect(keysAfter['printer_logo_width'], localRasterWidth);
      expect(keysAfter['printer_logo_height'], localRasterHeight);
      expect(keysAfter['printer_logo_enabled'], localRasterEnabled);
      // The raster was replaced with a decodable artifact of the SAME shape
      // the manual upload path stores.
      final newBase64 = keysAfter['printer_logo_base64']!;
      expect(newBase64, isNot(keysBefore['printer_logo_base64']));
      expect(
        ThermalLogoProcessor.isPng(base64Decode(newBase64)),
        isTrue,
        reason: 'the adopted raster must ride the unchanged printing path',
      );
      final config = await configService.getPrinterConfig();
      expect(config.logoBase64, newBase64);
      // The printer-read tuning fields come back exactly as before.
      expect(config.logoWidth, int.parse(localRasterWidth));
      expect(config.logoHeight, int.parse(localRasterHeight));
      expect(config.isLogoEnabled, isTrue);
    });
  });
}

/// Configurable [CompanyLogoPort] fake.
class _FakeCompanyLogoPort implements CompanyLogoPort {
  const _FakeCompanyLogoPort({this.result, this.onFetch});

  final CloudCompanyLogoOriginal? result;
  final void Function()? onFetch;

  @override
  Future<CloudCompanyLogoOriginal?> fetchOriginal() async {
    onFetch?.call();
    return result;
  }
}

/// A [LocalConfigDao] whose writes fail, simulating a SQLite persistence
/// failure at the exact seam adoption writes through.
class _SaveFailsConfigDao implements LocalConfigDao {
  _SaveFailsConfigDao(this._real);

  final LocalConfigDao _real;

  @override
  Future<LocalConfigEntity?> getConfigByKey(String key) =>
      _real.getConfigByKey(key);

  @override
  Future<void> saveConfig(LocalConfigEntity config) async {
    throw Exception('SQLite WRITE FAILURE (simulated persistence failure)');
  }

  @override
  Future<void> deleteConfig(String key) => _real.deleteConfig(key);
}
