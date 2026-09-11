import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DataSource } from 'typeorm';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { Product } from '../modules/inventory/entities/product.entity';
import {
  Insumo,
  NEGATIVE_STOCK_POLICY,
} from '../modules/inventory/entities/insumo.entity';
import { UomConversion } from '../modules/inventory/entities/uom-conversion.entity';
import * as bcrypt from 'bcrypt';

/**
 * TEST DATA SEEDER
 *
 * Creates the same test data that the POS seeder creates locally,
 * so recipe version sync, sales validation, etc. work against a fresh backend.
 *
 * Usage: npm run seed:test
 */

const TENANT_ID = 'e05bf002-b1d3-45f2-a46a-3592e1cc1431';
const TENANT_NAME = 'Pilot Café - Pruebas';

interface InsumoSeed {
  id: string;
  name: string;
  consumptionUom: string;
  stock: number;
  averageCost: number;
  parLevel: number;
  minStock: number;
  maxStock: number;
  isPerishable: boolean;
}

const INSUMOS: InsumoSeed[] = [
  {
    id: 'c1000000-0000-4000-8000-000000000001',
    name: 'Café en Grano Matagalpa',
    consumptionUom: 'kg',
    stock: 24.5,
    averageCost: 180.0,
    parLevel: 30.0,
    minStock: 5.0,
    maxStock: 50.0,
    isPerishable: false,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000002',
    name: 'Leche Entera La Perfecta',
    consumptionUom: 'L',
    stock: 38.0,
    averageCost: 38.0,
    parLevel: 50.0,
    minStock: 10.0,
    maxStock: 80.0,
    isPerishable: true,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000003',
    name: 'Azúcar Sulfitada San Antonio',
    consumptionUom: 'kg',
    stock: 48.0,
    averageCost: 22.0,
    parLevel: 60.0,
    minStock: 10.0,
    maxStock: 100.0,
    isPerishable: false,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000004',
    name: 'Queso Chontaleño Fresco',
    consumptionUom: 'kg',
    stock: 14.0,
    averageCost: 115.0,
    parLevel: 20.0,
    minStock: 3.0,
    maxStock: 30.0,
    isPerishable: true,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000005',
    name: 'Arroz 80/20 Calidad Superior',
    consumptionUom: 'kg',
    stock: 58.0,
    averageCost: 24.0,
    parLevel: 80.0,
    minStock: 15.0,
    maxStock: 120.0,
    isPerishable: false,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000006',
    name: 'Frijol Rojo de Seda Nacional',
    consumptionUom: 'kg',
    stock: 42.0,
    averageCost: 36.0,
    parLevel: 60.0,
    minStock: 10.0,
    maxStock: 90.0,
    isPerishable: false,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000007',
    name: 'Crema Ácida Nicaragüense',
    consumptionUom: 'L',
    stock: 11.5,
    averageCost: 68.0,
    parLevel: 18.0,
    minStock: 3.0,
    maxStock: 25.0,
    isPerishable: true,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000008',
    name: 'Vaso Térmico 12oz con Tapa',
    consumptionUom: 'UND',
    stock: 220.0,
    averageCost: 3.5,
    parLevel: 350.0,
    minStock: 50.0,
    maxStock: 500.0,
    isPerishable: false,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000009',
    name: 'Vaso Térmico 16oz con Tapa',
    consumptionUom: 'UND',
    stock: 175.0,
    averageCost: 4.2,
    parLevel: 300.0,
    minStock: 40.0,
    maxStock: 400.0,
    isPerishable: false,
  },
  {
    id: 'c1000000-0000-4000-8000-000000000010',
    name: 'Pulpa de Pitahaya Congelada',
    consumptionUom: 'kg',
    stock: 12.0,
    averageCost: 45.0,
    parLevel: 18.0,
    minStock: 3.0,
    maxStock: 30.0,
    isPerishable: true,
  },
  // Recipe component ingredient IDs (POS seeder uses different IDs in recipe components)
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Leche Entera La Perfecta',
    consumptionUom: 'L',
    stock: 38.0,
    averageCost: 38.0,
    parLevel: 50.0,
    minStock: 10.0,
    maxStock: 80.0,
    isPerishable: true,
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    name: 'Vaso Térmico 12oz',
    consumptionUom: 'UND',
    stock: 220.0,
    averageCost: 3.5,
    parLevel: 350.0,
    minStock: 50.0,
    maxStock: 500.0,
    isPerishable: false,
  },
  // POS-origin insumos (created by POS users, synced to backend)
  {
    id: '05e90cc0-f981-4c40-96e0-ecb5f0dad404',
    name: 'Granos de Café Especial',
    consumptionUom: 'g',
    stock: 500.0,
    averageCost: 250.0,
    parLevel: 800.0,
    minStock: 200.0,
    maxStock: 1500.0,
    isPerishable: false,
  },
  {
    id: '23656ba0-3ee6-4f81-ae78-1a45faf57258',
    name: 'Leche Entera',
    consumptionUom: 'L',
    stock: 20.0,
    averageCost: 35.0,
    parLevel: 30.0,
    minStock: 8.0,
    maxStock: 50.0,
    isPerishable: true,
  },
  {
    id: '81bfb7b7-fe20-4816-b3bb-bb45972a2d98',
    name: 'Leche de Almendras',
    consumptionUom: 'L',
    stock: 10.0,
    averageCost: 55.0,
    parLevel: 15.0,
    minStock: 5.0,
    maxStock: 30.0,
    isPerishable: true,
  },
  {
    id: '1a457811-4dcf-4431-ad17-967aa603d3af',
    name: 'Azúcar Blanca',
    consumptionUom: 'kg',
    stock: 15.0,
    averageCost: 20.0,
    parLevel: 25.0,
    minStock: 5.0,
    maxStock: 40.0,
    isPerishable: false,
  },
  {
    id: 'b583fc29-b3e0-4eff-9543-950c672ad5e6',
    name: 'Vaso Descartable 8oz con Tapa',
    consumptionUom: 'UND',
    stock: 200.0,
    averageCost: 1.5,
    parLevel: 300.0,
    minStock: 50.0,
    maxStock: 500.0,
    isPerishable: false,
  },
  {
    id: '6c6736e6-c4da-41f3-bf21-c0a97518aef4',
    name: 'Vaso Descartable 12oz con Tapa',
    consumptionUom: 'UND',
    stock: 180.0,
    averageCost: 2.0,
    parLevel: 250.0,
    minStock: 40.0,
    maxStock: 400.0,
    isPerishable: false,
  },
  {
    id: '43ae246e-8829-4f89-8bfb-ef0edc95f5db',
    name: 'Servilletas',
    consumptionUom: 'UND',
    stock: 500.0,
    averageCost: 0.1,
    parLevel: 800.0,
    minStock: 200.0,
    maxStock: 1000.0,
    isPerishable: false,
  },
  {
    id: '41a62be7-7f77-49bc-9473-f1ab4b2f6a21',
    name: 'Pan Brioche para Hamburguesa',
    consumptionUom: 'UND',
    stock: 30.0,
    averageCost: 8.0,
    parLevel: 50.0,
    minStock: 10.0,
    maxStock: 80.0,
    isPerishable: true,
  },
  {
    id: '945a9985-73e3-48c9-810a-703475beedcf',
    name: 'Torta de Carne de Res 150g',
    consumptionUom: 'UND',
    stock: 25.0,
    averageCost: 28.0,
    parLevel: 40.0,
    minStock: 10.0,
    maxStock: 60.0,
    isPerishable: true,
  },
  {
    id: 'cddf5c59-f78b-44b2-9ad8-c635afec3eba',
    name: 'Queso Cheddar en Láminas',
    consumptionUom: 'UND',
    stock: 40.0,
    averageCost: 3.5,
    parLevel: 60.0,
    minStock: 15.0,
    maxStock: 100.0,
    isPerishable: true,
  },
  {
    id: '87598904-2b38-44e7-8232-577192c89bf7',
    name: 'Lechuga Romana',
    consumptionUom: 'kg',
    stock: 5.0,
    averageCost: 45.0,
    parLevel: 8.0,
    minStock: 2.0,
    maxStock: 15.0,
    isPerishable: true,
  },
  {
    id: 'a71ec16d-31b2-413e-a09f-bffe49d54f53',
    name: 'Tomate Manzano',
    consumptionUom: 'kg',
    stock: 8.0,
    averageCost: 30.0,
    parLevel: 12.0,
    minStock: 3.0,
    maxStock: 20.0,
    isPerishable: true,
  },
  {
    id: '4935d2b1-900d-4d25-b472-1e186f354739',
    name: 'Papas Prefritas Congeladas',
    consumptionUom: 'kg',
    stock: 10.0,
    averageCost: 55.0,
    parLevel: 15.0,
    minStock: 5.0,
    maxStock: 25.0,
    isPerishable: true,
  },
  {
    id: 'e99653d0-66e6-4b70-b1cb-c9c65116e0f6',
    name: 'Aceite Vegetal',
    consumptionUom: 'L',
    stock: 8.0,
    averageCost: 28.0,
    parLevel: 12.0,
    minStock: 3.0,
    maxStock: 20.0,
    isPerishable: false,
  },
  {
    id: 'ef1a13bb-17a8-4d46-af4f-dda4113812d4',
    name: 'Cerveza Nacional Toña 350ml',
    consumptionUom: 'UND',
    stock: 48.0,
    averageCost: 12.0,
    parLevel: 60.0,
    minStock: 20.0,
    maxStock: 100.0,
    isPerishable: false,
  },
  {
    id: 'c3954bc0-acf9-4760-84c1-db80b5fce5be',
    name: 'Ron Flor de Caña 7 Años 750ml',
    consumptionUom: 'UND',
    stock: 6.0,
    averageCost: 350.0,
    parLevel: 10.0,
    minStock: 3.0,
    maxStock: 15.0,
    isPerishable: false,
  },
  {
    id: 'cac80200-a2d8-444a-b159-5a41bc63ccc6',
    name: 'Bolsa Plástica Biodegradable Mediana',
    consumptionUom: 'UND',
    stock: 300.0,
    averageCost: 0.5,
    parLevel: 500.0,
    minStock: 100.0,
    maxStock: 800.0,
    isPerishable: false,
  },
];

async function seed() {
  console.log('--- OmniFood NI: Test Data Seeder ---');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    await dataSource.transaction(async (manager) => {
      // 1. Tenant
      let tenant = await manager.findOne(Tenant, { where: { id: TENANT_ID } });
      if (!tenant) {
        tenant = manager.create(Tenant, {
          id: TENANT_ID,
          name: TENANT_NAME,
          is_active: true,
        });
        await manager.save(tenant);
        console.log(`✅ Tenant created: ${TENANT_ID}`);
      } else {
        console.log(`ℹ️  Tenant already exists: ${TENANT_ID}`);
      }

      // 2. Users (IDs auto-generated as UUIDs; POS gets them from login response)
      const users = [
        {
          name: 'Admin Principal',
          email: 'admin@omnifood.ni',
          role: UserRole.MANAGER,
          pin: '1234',
        },
        {
          name: 'Carlos Cajero',
          email: 'carlos@omnifood.ni',
          role: UserRole.CASHIER,
          pin: '1111',
        },
        {
          name: 'Mario Mesero',
          email: 'mario@omnifood.ni',
          role: UserRole.WAITER,
          pin: '2222',
        },
        {
          name: 'Chef Roberto',
          email: 'roberto@omnifood.ni',
          role: UserRole.MANAGER,
          pin: '3333',
        },
        {
          name: 'Sofía Supervisora',
          email: 'sofia@omnifood.ni',
          role: UserRole.OWNER,
          pin: '9999',
        },
      ];

      for (const u of users) {
        const existing = await manager.findOne(User, {
          where: { email: u.email },
        });
        if (!existing) {
          const user = manager.create(User, {
            name: u.name,
            email: u.email,
            role: u.role,
            tenant_id: TENANT_ID,
            password_hash: await bcrypt.hash('password123', 10),
            is_active: true,
          });
          const savedUser = await manager.save(user);

          const profile = manager.create(SecurityProfile, {
            user_id: savedUser.id,
            pin_hash: await bcrypt.hash(u.pin, 10),
            is_pin_enabled: true,
            is_totp_enabled: false,
          });
          await manager.save(profile);
          console.log(
            `✅ User created: ${u.name} (${u.role}) id=${savedUser.id}`,
          );
        } else {
          console.log(`ℹ️  User already exists: ${u.name} id=${existing.id}`);
        }
      }

      // 3. Products
      const products = [
        {
          id: 'f1000000-0000-4000-8000-000000000001',
          name: 'Café Americano',
          uom: 'UND',
          stock: 100,
          averageCost: 12.5,
          sellPrice: 60.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000002',
          name: 'Cappuccino Artesanal',
          uom: 'UND',
          stock: 100,
          averageCost: 22.0,
          sellPrice: 85.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000003',
          name: 'Desayuno Típico Nica',
          uom: 'UND',
          stock: 50,
          averageCost: 42.0,
          sellPrice: 130.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000004',
          name: 'Quesillo Doble Especial',
          uom: 'UND',
          stock: 50,
          averageCost: 31.0,
          sellPrice: 95.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000005',
          name: 'Nacatamal de Cerdo Tradicional',
          uom: 'UND',
          stock: 30,
          averageCost: 48.0,
          sellPrice: 120.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000006',
          name: 'Jugo Natural de Pitahaya',
          uom: 'UND',
          stock: 60,
          averageCost: 16.0,
          sellPrice: 55.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000007',
          name: 'Pastel Tres Leches Artesanal',
          uom: 'UND',
          stock: 25,
          averageCost: 28.0,
          sellPrice: 90.0,
        },
        {
          id: 'f1000000-0000-4000-8000-000000000008',
          name: 'Agua Purificada 600ml',
          uom: 'UND',
          stock: 80,
          averageCost: 12.0,
          sellPrice: 30.0,
        },
      ];

      for (const p of products) {
        const exists = await manager.findOne(Product, {
          where: { id: p.id, tenant_id: TENANT_ID },
        });
        if (!exists) {
          await manager.save(
            manager.create(Product, {
              ...p,
              tenant_id: TENANT_ID,
              is_active: true,
            }),
          );
          console.log(`✅ Product created: ${p.name}`);
        }
      }

      // 4. Insumos
      for (const i of INSUMOS) {
        const exists = await manager.findOne(Insumo, {
          where: { id: i.id, tenant_id: TENANT_ID },
        });
        if (!exists) {
          await manager.save(
            manager.create(Insumo, {
              ...i,
              tenant_id: TENANT_ID,
              purchaseUom: i.consumptionUom,
              conversionFactor: 1.0,
              existenciaActual: i.stock,
              is_active: true,
              negativeStockPolicy: NEGATIVE_STOCK_POLICY.RESTRICT,
            }),
          );
          console.log(`✅ Insumo created: ${i.name}`);
        }
      }

      // 4b. Initial kardex entries (required by running balance trigger)
      // Temporarily disable ALL triggers to clear old test data
      await manager.query(
        `DROP TRIGGER IF EXISTS trg_inventory_kardex_immutable ON inventory_kardex`,
      );
      await manager.query(
        `DROP TRIGGER IF EXISTS inventory_kardex_append_only_guard ON inventory_kardex`,
      );
      await manager.query(
        `DROP TRIGGER IF EXISTS trg_inventory_kardex_credit_note_provenance_immutable ON inventory_kardex`,
      );
      await manager.query(
        `DROP TRIGGER IF EXISTS trg_inventory_kardex_running_balance ON inventory_kardex`,
      );
      await manager.query(`DELETE FROM inventory_kardex WHERE tenant_id = $1`, [
        TENANT_ID,
      ]);
      // Re-enable all triggers
      await manager.query(`
        CREATE TRIGGER trg_inventory_kardex_immutable
        BEFORE UPDATE OR DELETE ON inventory_kardex
        FOR EACH ROW
        EXECUTE FUNCTION reject_inventory_kardex_mutation()
      `);
      await manager.query(`
        CREATE TRIGGER inventory_kardex_append_only_guard
        BEFORE UPDATE OR DELETE ON inventory_kardex
        FOR EACH ROW
        EXECUTE FUNCTION reject_inventory_kardex_mutation()
      `);
      await manager.query(`
        CREATE TRIGGER trg_inventory_kardex_credit_note_provenance_immutable
        BEFORE UPDATE OR DELETE ON inventory_kardex
        FOR EACH ROW
        EXECUTE FUNCTION reject_credit_note_kardex_provenance_mutation()
      `);
      await manager.query(`
        CREATE TRIGGER trg_inventory_kardex_running_balance
        BEFORE INSERT ON inventory_kardex
        FOR EACH ROW
        EXECUTE FUNCTION enforce_inventory_kardex_running_balance()
      `);
      console.log('🗑️  Cleared existing kardex entries');

      // Read actual insumo.stock from DB (POS-origin insumos may differ from INSUMOS array)
      interface InsumoRow {
        id: string;
        name: string;
        stock: string;
        costo_promedio_nio: string;
      }
      const rawInsumos: unknown = await manager.query(
        `SELECT id, name, stock, costo_promedio_nio FROM insumos WHERE tenant_id = $1`,
        [TENANT_ID],
      );
      const allInsumos = (
        Array.isArray(rawInsumos) ? rawInsumos : []
      ) as InsumoRow[];
      for (const dbInsumo of allInsumos) {
        const stock = Number(dbInsumo.stock);
        const avgCost = Number(dbInsumo.costo_promedio_nio);
        await manager.query(
          `INSERT INTO inventory_kardex (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio, total_cost_nio, stock_before, stock_after, source_document_type, source_document_id, occurred_at)
           VALUES ($1, $2, 'INITIAL_STOCK', $3, $4, $5, 0.0000, $3, 'SEED', 'seed-initial', NOW())`,
          [TENANT_ID, dbInsumo.id, stock, avgCost, stock * avgCost],
        );
        console.log(`✅ Kardex init: ${dbInsumo.name} stock=${stock}`);
      }

      // 5. UOM Conversions (key ones for recipe validation)
      const conversions = [
        {
          insumoId: 'c1000000-0000-4000-8000-000000000001',
          unitName: 'kg',
          factor: 1.0,
        },
        {
          insumoId: 'c1000000-0000-4000-8000-000000000001',
          unitName: 'lb',
          factor: 0.453592,
        },
        {
          insumoId: 'c1000000-0000-4000-8000-000000000001',
          unitName: 'g',
          factor: 0.001,
        },
        {
          insumoId: 'c1000000-0000-4000-8000-000000000002',
          unitName: 'L',
          factor: 1.0,
        },
        {
          insumoId: 'c1000000-0000-4000-8000-000000000002',
          unitName: 'ml',
          factor: 0.001,
        },
        {
          insumoId: 'c1000000-0000-4000-8000-000000000008',
          unitName: 'UND',
          factor: 1.0,
        },
        {
          insumoId: 'c1000000-0000-4000-8000-000000000008',
          unitName: 'paq',
          factor: 50.0,
        },
        // Recipe component insumo UOM conversions
        {
          insumoId: '10000000-0000-4000-8000-000000000002',
          unitName: 'L',
          factor: 1.0,
        },
        {
          insumoId: '10000000-0000-4000-8000-000000000002',
          unitName: 'ml',
          factor: 0.001,
        },
        {
          insumoId: '10000000-0000-4000-8000-000000000008',
          unitName: 'UND',
          factor: 1.0,
        },
        {
          insumoId: '10000000-0000-4000-8000-000000000008',
          unitName: 'paq',
          factor: 50.0,
        },
      ];

      for (const c of conversions) {
        const exists = await manager.findOne(UomConversion, {
          where: {
            tenant_id: TENANT_ID,
            insumo_id: c.insumoId,
            unit_name: c.unitName,
          },
        });
        if (!exists) {
          await manager.save(
            manager.create(UomConversion, {
              tenant_id: TENANT_ID,
              insumo_id: c.insumoId,
              unit_name: c.unitName,
              factor: c.factor,
              is_default: c.factor === 1.0,
            }),
          );
          console.log(
            `✅ UOM conversion: ${c.insumoId} ${c.unitName} = ${c.factor}`,
          );
        }
      }
    });

    console.log('\n--- Seed completed ---');
  } catch (error) {
    console.error('❌ Seed failed:', error);
  } finally {
    await app.close();
  }
}

void seed();
