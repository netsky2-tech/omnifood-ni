import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/database/migrations.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';

/// Covers `CustomerDao.saveCustomer` conflict semantics (tracker T2a).
///
/// `OnConflictStrategy.replace` compiles to INSERT OR REPLACE, which DELETES
/// the colliding row — silently destroying an existing customer and the
/// points balance the loyalty ledger hangs off it. Production callers only
/// insert freshly generated customers, so a duplicate id or a duplicate
/// device-global case-insensitive `customer_code` must RAISE, never replace.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late AppDatabase database;

  setUp(() async {
    database = await $FloorAppDatabase
        .inMemoryDatabaseBuilder()
        .addCallback(inventoryMovementAppendOnlyCallback)
        .build();
  });

  tearDown(() async {
    await database.close();
  });

  CustomerEntity customer(String id, {String? code}) => CustomerEntity(
        id: id,
        name: 'Cliente $id',
        createdAt: 0,
        updatedAt: 0,
        customerCode: code,
      );

  test('a duplicate customer id raises instead of silently replacing',
      () async {
    await database.customerDao.saveCustomer(customer('same-id', code: 'CL-1'));

    await expectLater(
      database.customerDao.saveCustomer(
        customer('same-id', code: 'CL-2'),
      ),
      throwsA(anything),
      reason: 'INSERT OR REPLACE would delete the first row and its points '
          'balance; the abort strategy surfaces the conflict instead',
    );

    final kept = await database.customerDao.getCustomerById('same-id');
    expect(kept!.customerCode, 'CL-1',
        reason: 'the original customer survives the conflict');
  });

  test('a duplicate case-insensitive customer_code raises (schema v71 index)',
      () async {
    await database.customerDao.saveCustomer(customer('c1', code: 'CL-0001'));

    await expectLater(
      database.customerDao.saveCustomer(customer('c2', code: 'CL-0001')),
      throwsA(anything),
    );
    await expectLater(
      database.customerDao.saveCustomer(customer('c3', code: 'cl-0001')),
      throwsA(anything),
      reason: 'the index is COLLATE NOCASE: case variants are the same code',
    );

    // Different codes and NULL codes coexist.
    await database.customerDao.saveCustomer(customer('c4', code: 'CL-0002'));
    await database.customerDao.saveCustomer(customer('c5'));
    await database.customerDao.saveCustomer(customer('c6'));

    final all = await database.customerDao.getAllCustomers();
    expect(all, hasLength(4),
        reason: "c2/c3 were correctly rejected; c1/c4/c5/c6 survive");
  });

  test('the original row keeps its points after a rejected duplicate insert',
      () async {
    await database.customerDao.saveCustomer(customer('keep', code: 'CL-9'));

    await expectLater(
      database.customerDao.saveCustomer(customer('keep', code: 'CL-9')),
      throwsA(anything),
    );

    final kept = await database.customerDao.getCustomerById('keep');
    expect(kept, isNotNull);
    expect(kept!.pointsBalance, 0.0);
  });
}
