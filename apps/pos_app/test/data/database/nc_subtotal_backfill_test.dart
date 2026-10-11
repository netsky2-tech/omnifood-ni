import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Round-2 F-8d: credit notes stored the GROSS negated as their subtotal
/// while regular sales store the subtotal NET of the discounts, so the day
/// summary never reconciled once a discounted invoice was credited. The S23
/// round measured it live: the day header read Subtotal C$5414.75 against
/// Total C$5526.00 with IVA 0 — the gap was exactly the note's hidden
/// discount.
///
/// `migration68_69` rewrites ONLY the credit notes
/// (`subtotal = total - total_tax`, the same identity the sale path keeps);
/// regular invoices are untouched and the update is idempotent.
void main() {
  late String dbPath;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    dbPath =
        '${await databaseFactory.getDatabasesPath()}/nc_subtotal_backfill_test.db';
    await databaseFactory.deleteDatabase(dbPath);
  });

  tearDown(() async {
    await databaseFactory.deleteDatabase(dbPath);
  });

  /// Minimal version-68 shape of `invoices` with a discounted credit note
  /// (the rig's note 44), a regular sale and a tax-carrying credit note.
  Future<dynamic> openV68Database() async {
    final db = await databaseFactory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 68,
        onCreate: (database, version) async {
          await database.execute('''
            CREATE TABLE invoices (
              id TEXT NOT NULL PRIMARY KEY,
              invoice_number TEXT NOT NULL,
              subtotal REAL NOT NULL,
              total_tax REAL NOT NULL,
              total REAL NOT NULL,
              type TEXT NOT NULL
            )
          ''');
        },
      ),
    );
    // The rig's note 44: gross negated (-125) against a net total (-13.75).
    await db.insert('invoices', {
      'id': 'nc-44',
      'invoice_number': '44',
      'subtotal': -125.0,
      'total_tax': 0.0,
      'total': -13.75,
      'type': 'creditNote',
    });
    // A regular sale: subtotal is already net — must NOT be touched.
    await db.insert('invoices', {
      'id': 'sale-41',
      'invoice_number': '41',
      'subtotal': 13.75,
      'total_tax': 0.0,
      'total': 13.75,
      'type': 'regular',
    });
    // A tax-carrying credit note (General-regime shape): net is total - tax.
    await db.insert('invoices', {
      'id': 'nc-tax',
      'invoice_number': '90',
      'subtotal': -200.0,
      'total_tax': -30.0,
      'total': -230.0,
      'type': 'creditNote',
    });
    return db;
  }

  test('migration68_69 rewrites only credit-note subtotals to the net',
      () async {
    final db = await openV68Database();

    await migration68_69.migrate(db);

    final rows = await db.rawQuery('SELECT id, subtotal FROM invoices');
    final byId = {for (final row in rows) row['id'] as String: row['subtotal']};

    expect(
      byId['nc-44'],
      -13.75,
      reason: 'the discounted note now reverses the NET the customer paid',
    );
    expect(
      byId['sale-41'],
      13.75,
      reason: 'regular invoices already store the net and are untouched',
    );
    expect(
      byId['nc-tax'],
      -200.0,
      reason: 'subtotal = total - total_tax = -230 - (-30); the General-'
          'regime note was already consistent',
    );

    await db.close();
  });

  test('migration68_69 is idempotent', () async {
    final db = await openV68Database();

    await migration68_69.migrate(db);
    await migration68_69.migrate(db);

    final rows = await db.rawQuery(
      'SELECT subtotal FROM invoices WHERE id = ?',
      ['nc-44'],
    );
    expect(rows.single['subtotal'], -13.75);

    await db.close();
  });
}
