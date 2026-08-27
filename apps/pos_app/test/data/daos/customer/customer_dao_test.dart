import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:pos_app/data/database/app_database.dart';
import 'package:pos_app/data/models/customer/customer_entity.dart';
import 'package:pos_app/data/mappers/customer_mapper.dart';
import 'package:pos_app/domain/models/customer/customer.dart';

void main() {
  late AppDatabase database;

  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  setUp(() async {
    database = await $FloorAppDatabase.inMemoryDatabaseBuilder().build();
  });

  tearDown(() async {
    await database.close();
  });

  group('CustomerDao & Mapper Integration', () {
    test('inserta y recupera clientes por ID, Cédula/RUC y teléfono', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final c1 = CustomerEntity(
        id: 'cust-001',
        name: 'Juan Pérez',
        taxId: '001-120590-0001A',
        phone: '8888-1234',
        email: 'juan@example.com',
        address: 'Managua, Los Robles',
        pointsBalance: 150.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
      );

      final c2 = CustomerEntity(
        id: 'cust-002',
        name: 'Comercial La Unión S.A.',
        taxId: 'J0310000000001',
        phone: '2222-5555',
        email: 'contabilidad@launion.com.ni',
        address: 'Carretera Norte Km 5',
        pointsBalance: 500.0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      );

      await database.customerDao.saveCustomers([c1, c2]);

      // Count
      final count = await database.customerDao.countCustomers();
      expect(count, equals(2));

      // Get by ID
      final retrieved1 = await database.customerDao.getCustomerById('cust-001');
      expect(retrieved1, isNotNull);
      expect(retrieved1!.name, equals('Juan Pérez'));
      expect(retrieved1.taxId, equals('001-120590-0001A'));

      // Get by Tax ID
      final retrievedByTax = await database.customerDao.getCustomerByTaxId('J0310000000001');
      expect(retrievedByTax, isNotNull);
      expect(retrievedByTax!.id, equals('cust-002'));

      // Get by Phone
      final retrievedByPhone = await database.customerDao.getCustomerByPhone('8888-1234');
      expect(retrievedByPhone, isNotNull);
      expect(retrievedByPhone!.id, equals('cust-001'));
    });

    test('búsqueda predictiva offline (LIKE por nombre, cédula/RUC y teléfono)', () async {
      final now = DateTime.now().millisecondsSinceEpoch;

      final customers = [
        CustomerEntity(
          id: 'c1',
          name: 'Carlos Ruiz',
          taxId: '001-010180-0001K',
          phone: '8765-4321',
          pointsBalance: 20.0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        ),
        CustomerEntity(
          id: 'c2',
          name: 'María Fernández',
          taxId: '281-150692-0002M',
          phone: '8999-1122',
          pointsBalance: 80.0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        ),
        CustomerEntity(
          id: 'c3',
          name: 'Inversiones Ruiz & Asoc.',
          taxId: 'J0310000000099',
          phone: '2270-0000',
          pointsBalance: 0.0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        ),
      ];

      await database.customerDao.saveCustomers(customers);

      // Search by partial name "ruiz"
      final byName = await database.customerDao.searchCustomers('ruiz', 10);
      expect(byName.length, equals(2));
      expect(byName.map((c) => c.name), containsAll(['Carlos Ruiz', 'Inversiones Ruiz & Asoc.']));

      // Search by partial taxId "281"
      final byTax = await database.customerDao.searchCustomers('281', 10);
      expect(byTax.length, equals(1));
      expect(byTax.first.name, equals('María Fernández'));

      // Search by phone "8999"
      final byPhone = await database.customerDao.searchCustomers('8999', 10);
      expect(byPhone.length, equals(1));
      expect(byPhone.first.name, equals('María Fernández'));
    });

    test('CustomerMapper convierte bidireccionalmente entre Domain y Entity', () {
      final domain = Customer(
        id: 'cust-123',
        name: 'Ana Morales',
        taxId: '001-201095-0003F',
        phone: '8222-3344',
        email: 'ana@gmail.com',
        address: 'Colonia Centroamérica',
        pointsBalance: 320.5,
        isActive: true,
        createdAt: DateTime(2026, 1, 1, 10, 0),
        updatedAt: DateTime(2026, 1, 1, 10, 0),
        syncStatus: 'synced',
      );

      final entity = CustomerMapper.toEntity(domain);
      expect(entity.id, equals('cust-123'));
      expect(entity.name, equals('Ana Morales'));
      expect(entity.pointsBalance, equals(320.5));

      final restored = CustomerMapper.toDomain(entity);
      expect(restored.id, equals(domain.id));
      expect(restored.name, equals(domain.name));
      expect(restored.taxId, equals(domain.taxId));
      expect(restored.phone, equals(domain.phone));
      expect(restored.email, equals(domain.email));
      expect(restored.pointsBalance, equals(domain.pointsBalance));
    });
  });
}
