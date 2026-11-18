import { NestFactory } from '@nestjs/core';
import { AppModule } from '../core/app/app.module';
import { DataSource } from 'typeorm';
import { Tenant } from '../modules/tenant/entities/tenant.entity';
import { User, UserRole } from '../modules/identity/entities/user.entity';
import { SecurityProfile } from '../modules/identity/entities/security-profile.entity';
import { Product, ProductType } from '../modules/inventory/entities/product.entity';
import { CatalogValue } from '../modules/catalog/entities/catalog-value.entity';
import { CATALOG_TYPE } from '../modules/catalog/catalog-type';
import { ModifierGroup } from '../modules/modifiers/entities/modifier-group.entity';
import { CategoryModifierGroup } from '../modules/modifiers/entities/category-modifier-group.entity';
import { CashShiftSession, CashShiftStatus } from '../modules/sales/entities/cash-shift.entity';
import { Invoice } from '../modules/sales/entities/invoice.entity';
import { InvoiceItem } from '../modules/sales/entities/invoice-item.entity';
import { Payment } from '../modules/sales/entities/payment.entity';
import { runInTenantTransaction } from '../core/database/tenant-transaction';
import * as bcrypt from 'bcrypt';

/**
 * GENERAL DEMO TENANT SEEDER: "NHILOS Market & Café"
 *
 * Prepares a clean, client-agnostic demo tenant with slug "demo",
 * spanning Gastronomía (cafetería, cocina, recetas, modificadores)
 * and Retail / Comercio de Mostrador (barcodes, conveniencia, abarrotes).
 *
 * Populates realistic sales and shift data for Owner Dashboard V2
 * (Net Sales, Tickets, Average Ticket, Attention Required panel).
 *
 * Usage: npm run seed:demo
 */

export const DEMO_TENANT_ID = 'd0000000-0000-4000-8000-000000000001';
export const DEMO_TENANT_NAME = 'NHILOS Market & Café';
export const DEMO_TENANT_SLUG = 'demo';

interface DemoCategorySeed {
  code: string;
  name: string;
  sortOrder: number;
}

const CATEGORIES: DemoCategorySeed[] = [
  { code: 'CAFE_CALIENTE', name: 'Café Caliente', sortOrder: 1 },
  { code: 'BEBIDAS_FRIAS', name: 'Bebidas Frías', sortOrder: 2 },
  { code: 'PANADERIA', name: 'Panadería & Repostería', sortOrder: 3 },
  { code: 'ESPECIALIDADES', name: 'Especialidades Nicas', sortOrder: 4 },
  { code: 'BEBIDAS_BOTELLA', name: 'Bebidas Embotelladas', sortOrder: 5 },
  { code: 'SNACKS_ABARROTES', name: 'Snacks & Abarrotes', sortOrder: 6 },
];

interface DemoProductSeed {
  id: string;
  name: string;
  categoryCode: string;
  uom: string;
  stock: number;
  averageCost: number;
  sellPrice: number;
  imageUrl?: string;
}

const PRODUCTS: DemoProductSeed[] = [
  // Gastronomía — Café & Bebidas
  {
    id: 'd1000000-0000-4000-8000-000000000001',
    name: 'Café Americano 12oz',
    categoryCode: 'CAFE_CALIENTE',
    uom: 'UND',
    stock: 120,
    averageCost: 14.5,
    sellPrice: 75.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000002',
    name: 'Capuchino Vainilla 12oz',
    categoryCode: 'CAFE_CALIENTE',
    uom: 'UND',
    stock: 100,
    averageCost: 26.0,
    sellPrice: 115.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000003',
    name: 'Latte Caramelo 16oz',
    categoryCode: 'CAFE_CALIENTE',
    uom: 'UND',
    stock: 90,
    averageCost: 32.0,
    sellPrice: 130.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000004',
    name: 'Smoothie Tropical de Pitahaya 16oz',
    categoryCode: 'BEBIDAS_FRIAS',
    uom: 'UND',
    stock: 75,
    averageCost: 24.0,
    sellPrice: 95.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000005',
    name: 'Iced Chai Latte 16oz',
    categoryCode: 'BEBIDAS_FRIAS',
    uom: 'UND',
    stock: 60,
    averageCost: 28.0,
    sellPrice: 105.0,
  },
  // Gastronomía — Alimentos & Repostería
  {
    id: 'd1000000-0000-4000-8000-000000000006',
    name: 'Croissant Horneado de Mantequilla',
    categoryCode: 'PANADERIA',
    uom: 'UND',
    stock: 45,
    averageCost: 22.0,
    sellPrice: 90.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000007',
    name: 'Pastel de Zanahoria Artesanal',
    categoryCode: 'PANADERIA',
    uom: 'UND',
    stock: 35,
    averageCost: 25.0,
    sellPrice: 95.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000008',
    name: 'Quesillo con Doble Crema',
    categoryCode: 'ESPECIALIDADES',
    uom: 'UND',
    stock: 50,
    averageCost: 38.0,
    sellPrice: 120.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000009',
    name: 'Tostón con Queso Frito y Ensalada',
    categoryCode: 'ESPECIALIDADES',
    uom: 'UND',
    stock: 40,
    averageCost: 45.0,
    sellPrice: 135.0,
  },
  // Retail / Comercio de Mostrador
  {
    id: 'd1000000-0000-4000-8000-000000000010',
    name: 'Cerveza Nacional Toña 350ml',
    categoryCode: 'BEBIDAS_BOTELLA',
    uom: 'UND',
    stock: 120,
    averageCost: 28.0,
    sellPrice: 45.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000011',
    name: 'Agua Purificada Fuente Pura 600ml',
    categoryCode: 'BEBIDAS_BOTELLA',
    uom: 'UND',
    stock: 150,
    averageCost: 12.0,
    sellPrice: 25.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000012',
    name: 'Gaseosa Coca-Cola 500ml NR',
    categoryCode: 'BEBIDAS_BOTELLA',
    uom: 'UND',
    stock: 96,
    averageCost: 22.0,
    sellPrice: 35.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000013',
    name: 'Jugo de Naranja del Valle 350ml',
    categoryCode: 'BEBIDAS_BOTELLA',
    uom: 'UND',
    stock: 80,
    averageCost: 18.0,
    sellPrice: 30.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000014',
    name: 'Chips Platanitos Caseros con Sal 60g',
    categoryCode: 'SNACKS_ABARROTES',
    uom: 'UND',
    stock: 100,
    averageCost: 16.0,
    sellPrice: 30.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000015',
    name: 'Galletas María Ricasa Paquete Familiar',
    categoryCode: 'SNACKS_ABARROTES',
    uom: 'UND',
    stock: 85,
    averageCost: 12.0,
    sellPrice: 20.0,
  },
  {
    id: 'd1000000-0000-4000-8000-000000000016',
    name: 'Chicles Trident Menta 14 Unidades',
    categoryCode: 'SNACKS_ABARROTES',
    uom: 'UND',
    stock: 140,
    averageCost: 14.0,
    sellPrice: 25.0,
  },
];

async function seed() {
  console.log('====================================================');
  console.log('  NHILOS POS: General Multi-Rubro Demo Tenant Seeder');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  try {
    await runInTenantTransaction(dataSource, DEMO_TENANT_ID, async (manager) => {
      // 1. Tenant Creation or Update
      let tenant = await manager.findOne(Tenant, { where: { id: DEMO_TENANT_ID } });
      if (!tenant) {
        tenant = manager.create(Tenant, {
          id: DEMO_TENANT_ID,
          name: DEMO_TENANT_NAME,
          slug: DEMO_TENANT_SLUG,
          ruc: 'J0310000000001',
          phone: '+505 8194 8526',
          email: 'soporte@nhilospos.com',
          address: 'Plaza Comercial Managua, Módulo 04',
          is_active: true,
        });
        await manager.save(tenant);
        console.log(`✅ Tenant created: "${DEMO_TENANT_NAME}" (slug: "${DEMO_TENANT_SLUG}")`);
      } else {
        tenant.name = DEMO_TENANT_NAME;
        tenant.slug = DEMO_TENANT_SLUG;
        tenant.ruc = 'J0310000000001';
        tenant.phone = '+505 8194 8526';
        tenant.email = 'soporte@nhilospos.com';
        tenant.address = 'Plaza Comercial Managua, Módulo 04';
        tenant.is_active = true;
        await manager.save(tenant);
        console.log(`♻️  Tenant updated: "${DEMO_TENANT_NAME}" (slug: "${DEMO_TENANT_SLUG}")`);
      }

      // 2. Users & Credentials
      const users = [
        {
          name: 'Propietario / Gerente',
          email: 'admin@nhilos.com',
          role: UserRole.OWNER,
          pin: '1234',
        },
        {
          name: 'Carlos Cajero',
          email: 'caja@nhilos.com',
          role: UserRole.CASHIER,
          pin: '1111',
        },
        {
          name: 'Sofía Supervisora',
          email: 'supervisor@nhilos.com',
          role: UserRole.MANAGER,
          pin: '9999',
        },
      ];

      const savedUsers: Record<string, User> = {};

      for (const u of users) {
        let user = await manager.findOne(User, { where: { email: u.email, tenant_id: DEMO_TENANT_ID } });
        const passwordHash = await bcrypt.hash('Admin1234!', 10);
        const pinHash = await bcrypt.hash(u.pin, 10);

        if (!user) {
          user = manager.create(User, {
            name: u.name,
            email: u.email,
            role: u.role,
            tenant_id: DEMO_TENANT_ID,
            password_hash: passwordHash,
            is_active: true,
          });
          user = await manager.save(user);

          const profile = manager.create(SecurityProfile, {
            user_id: user.id,
            pin_hash: pinHash,
            is_pin_enabled: true,
            is_totp_enabled: false,
          });
          await manager.save(profile);
          console.log(`✅ User created: ${u.name} (${u.role}) email=${u.email}`);
        } else {
          user.name = u.name;
          user.role = u.role;
          user.password_hash = passwordHash;
          user.is_active = true;
          user = await manager.save(user);

          let profile = await manager.findOne(SecurityProfile, { where: { user_id: user.id } });
          if (!profile) {
            profile = manager.create(SecurityProfile, {
              user_id: user.id,
              pin_hash: pinHash,
              is_pin_enabled: true,
              is_totp_enabled: false,
            });
          } else {
            profile.pin_hash = pinHash;
            profile.is_pin_enabled = true;
          }
          await manager.save(profile);
          console.log(`♻️  User updated: ${u.name} (${u.role}) email=${u.email}`);
        }
        savedUsers[u.role] = user;
      }

      // 3. Categories (Catalog Values of type SALES_PRODUCT_CATEGORY)
      const categoryEntities: Record<string, CatalogValue> = {};
      for (const c of CATEGORIES) {
        let cat = await manager.findOne(CatalogValue, {
          where: { tenant_id: DEMO_TENANT_ID, catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY, code: c.code },
        });
        if (!cat) {
          cat = manager.create(CatalogValue, {
            tenant_id: DEMO_TENANT_ID,
            catalog_type: CATALOG_TYPE.SALES_PRODUCT_CATEGORY,
            code: c.code,
            name: c.name,
            sort_order: c.sortOrder,
            is_active: true,
          });
          cat = await manager.save(cat);
          console.log(`✅ Category created: ${c.name} (${c.code})`);
        } else {
          cat.name = c.name;
          cat.sort_order = c.sortOrder;
          cat.is_active = true;
          cat = await manager.save(cat);
        }
        categoryEntities[c.code] = cat;
      }

      // 4. Products (Gastronomía + Retail)
      for (const p of PRODUCTS) {
        let prod = await manager.findOne(Product, { where: { id: p.id, tenant_id: DEMO_TENANT_ID } });
        if (!prod) {
          prod = manager.create(Product, {
            id: p.id,
            name: p.name,
            tenant_id: DEMO_TENANT_ID,
            product_type: ProductType.SIMPLE,
            uom: p.uom,
            category_code: p.categoryCode,
            stock: p.stock,
            averageCost: p.averageCost,
            sellPrice: p.sellPrice,
            is_active: true,
          });
          await manager.save(prod);
          console.log(`✅ Product created: ${p.name} (C$ ${p.sellPrice})`);
        } else {
          prod.name = p.name;
          prod.category_code = p.categoryCode;
          prod.sellPrice = p.sellPrice;
          prod.averageCost = p.averageCost;
          prod.stock = p.stock;
          prod.is_active = true;
          await manager.save(prod);
        }
      }

      // 4b. Opening kardex entries (INITIAL_STOCK) — required by the
      // running-balance trigger (issue #986). The seed sets stock values
      // directly, so every insumo that ends up with stock needs a ledger
      // opening row or the first recipe-driven sale is rejected with
      // "inventory_kardex balance invariant violated" and the terminal
      // retries forever. Entry shape mirrors src/scripts/seed-test-data.ts.
      //
      // Concurrency (review finding R3-001): the whole seed runs inside
      // runInTenantTransaction, so a partial failure rolls back — but that
      // alone does not serialize concurrent runs, because READ COMMITTED
      // gives every statement a fresh snapshot: two seed processes can both
      // observe an empty coverage set before either commits, then both race
      // the INSERTs. This block therefore takes a transaction-scoped
      // advisory lock keyed on the tenant BEFORE reading coverage. A second
      // run blocks here until the first commits or rolls back, and its
      // coverage read — a fresh snapshot in READ COMMITTED — then sees the
      // first run's committed opening rows and skips. The lock is released
      // automatically at commit/rollback, so a crashed process cannot leak
      // it across the pool. Cost: seed runs of the SAME tenant briefly
      // serialize at this block (seeding is an operator action, not a hot
      // path); different tenants never contend because the key includes the
      // tenant id. This mirrors the advisory-lock convention the
      // running-balance trigger itself uses (migration
      // 1774000000000-EnforceInventoryKardexRunningBalance). The lock only
      // guards this seed's decide-then-insert step: it never bypasses the
      // append-only or running-balance triggers, which still evaluate on
      // every INSERT below.
      //
      // Idempotency: an insumo with NO kardex rows gets an opening entry; an
      // insumo that already has ledger history is left untouched — inserting
      // an opening row over an existing chain would itself violate the
      // running-balance invariant. Insumos with zero or null stock get no
      // opening entry. Re-running the seed therefore never duplicates
      // opening entries or shifts balances — and with the lock above that
      // now holds for concurrent runs too, not only serial ones. Only
      // INSERTs happen here, so the append-only trigger is never bypassed.
      //
      // Ledger divergence (review finding R1-001): the mere presence of
      // history is NOT proof of a consistent chain. The first sale writes
      // stock_before from insumos.stock (invoices.service.ts), and the
      // running-balance trigger requires it to equal the ledger's latest
      // stock_after. An insumo whose chain ends at a balance different from
      // its insumos.stock (partial or drifted history) would fail its first
      // sale anyway, and this seed cannot repair an existing append-only
      // chain. Rather than skip that silently and hand over a tenant that
      // breaks on the first sale, the seed refuses with the exact insumos
      // listed. Consistent history (latest ledger balance == insumos.stock)
      // is skipped as before, so serial re-runs change nothing.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext('inventory_kardex_seed_opening'))`,
        [DEMO_TENANT_ID],
      );
      const kardexCovered = await manager.query(
        `SELECT DISTINCT ON (insumo_id) insumo_id, stock_after
           FROM inventory_kardex
          WHERE tenant_id = $1
          ORDER BY insumo_id, id DESC`,
        [DEMO_TENANT_ID],
      );
      interface KardexCoverageRow {
        insumo_id: string;
        stock_after: string;
      }
      const ledgerBalanceByInsumoId = new Map<string, number>(
        (Array.isArray(kardexCovered) ? kardexCovered : []).map(
          (row: KardexCoverageRow) => [row.insumo_id, Number(row.stock_after)],
        ),
      );
      interface DemoInsumoRow {
        id: string;
        name: string;
        stock: string;
        costo_promedio_nio: string;
      }
      const rawDemoInsumos: unknown = await manager.query(
        `SELECT id, name, stock, costo_promedio_nio FROM insumos WHERE tenant_id = $1`,
        [DEMO_TENANT_ID],
      );
      const demoInsumos = (
        Array.isArray(rawDemoInsumos) ? rawDemoInsumos : []
      ) as DemoInsumoRow[];
      // Compare at the ledger's numeric(14,4) scale, matching the
      // ROUND(..., 4) the running-balance trigger applies.
      const round4 = (value: number) => Math.round(value * 10000) / 10000;

      const divergentInsumos: string[] = [];
      let openingEntriesCreated = 0;
      for (const dbInsumo of demoInsumos) {
        const stock = Number(dbInsumo.stock);
        // No opening entry for insumos with zero or null stock.
        if (!(stock > 0)) {
          continue;
        }
        const ledgerBalance = ledgerBalanceByInsumoId.get(dbInsumo.id);
        if (ledgerBalance !== undefined) {
          // Insumo already has kardex history: left untouched. But if its
          // chain ends at a balance different from insumos.stock, the first
          // sale will violate the running-balance invariant — refuse loudly
          // instead of seeding a tenant that breaks (R1-001).
          if (round4(ledgerBalance) !== round4(stock)) {
            divergentInsumos.push(
              `"${dbInsumo.name}" (${dbInsumo.id}): latest ledger balance ${ledgerBalance} != insumos.stock ${stock}`,
            );
          }
          continue;
        }
        const avgCost = Number(dbInsumo.costo_promedio_nio);
        await manager.query(
          `INSERT INTO inventory_kardex (tenant_id, insumo_id, movement_type, quantity, unit_cost_nio, total_cost_nio, stock_before, stock_after, source_document_type, source_document_id, occurred_at)
           VALUES ($1, $2, 'INITIAL_STOCK', $3, $4, $5, 0.0000, $3, 'SEED', 'seed-initial', NOW())`,
          [DEMO_TENANT_ID, dbInsumo.id, stock, avgCost, stock * avgCost],
        );
        openingEntriesCreated++;
        console.log(`✅ Kardex init: ${dbInsumo.name} stock=${stock}`);
      }
      if (divergentInsumos.length > 0) {
        throw new Error(
          `DEMO_SEED_KARDEX_DIVERGENCE: ${divergentInsumos.length} insumo(s) have kardex history whose latest balance does not match insumos.stock. ` +
            `The first sale of each would fail with "inventory_kardex balance invariant violated", and this seed cannot repair an existing append-only ledger. ` +
            `Reconcile these insumos (align insumos.stock with the ledger or load the missing history) before seeding:\n  - ${divergentInsumos.join('\n  - ')}`,
        );
      }
      if (openingEntriesCreated === 0) {
        console.log('♻️  Kardex opening entries already present for all insumos with stock');
      }

      // 5. Modifier Groups for Hot Coffee & Beverages
      const lecheGroup = await manager.findOne(ModifierGroup, { where: { tenant_id: DEMO_TENANT_ID, name: 'Tipo de Leche' } });
      let modLeche: ModifierGroup;
      if (!lecheGroup) {
        modLeche = manager.create(ModifierGroup, {
          tenant_id: DEMO_TENANT_ID,
          name: 'Tipo de Leche',
          min_selected: 1,
          max_selected: 1,
          allow_quantities: false,
          sort_order: 1,
          is_active: true,
        });
        modLeche = await manager.save(modLeche);

        const lecheOptions = [
          { name: 'Leche Entera La Perfecta', priceDelta: 0, sortOrder: 1 },
          { name: 'Leche Deslactosada', priceDelta: 15, sortOrder: 2 },
          { name: 'Leche de Almendras', priceDelta: 25, sortOrder: 3 },
          { name: 'Leche de Avena', priceDelta: 25, sortOrder: 4 },
        ];
        for (const opt of lecheOptions) {
          await manager.query(
            `INSERT INTO modifier_options (tenant_id, group_id, name, price_delta, sort_order, is_active) VALUES ($1, $2, $3, $4, $5, $6)`,
            [DEMO_TENANT_ID, modLeche.id, opt.name, opt.priceDelta, opt.sortOrder, true],
          );
        }
        console.log('✅ Modifier Group created: Tipo de Leche (4 opciones)');
      } else {
        modLeche = lecheGroup;
      }

      // Attach modifier group to CAFE_CALIENTE category
      const cafeCat = categoryEntities['CAFE_CALIENTE'];
      if (cafeCat) {
        const existingAttach = await manager.findOne(CategoryModifierGroup, {
          where: { tenant_id: DEMO_TENANT_ID, catalog_value_id: cafeCat.id, group_id: modLeche.id },
        });
        if (!existingAttach) {
          await manager.save(manager.create(CategoryModifierGroup, {
            tenant_id: DEMO_TENANT_ID,
            catalog_value_id: cafeCat.id,
            group_id: modLeche.id,
            sort_order: 1,
          }));
          console.log('✅ Modifier Group attached to category "Café Caliente"');
        }
      }

      // 6. Cash Shift Session (Turno de Caja Activo)
      const cashier = savedUsers[UserRole.CASHIER];
      let shift = await manager.findOne(CashShiftSession, {
        where: { tenant_id: DEMO_TENANT_ID, status: CashShiftStatus.OPEN },
      });
      if (!shift) {
        shift = manager.create(CashShiftSession, {
          tenant_id: DEMO_TENANT_ID,
          terminal_id: 'CAJA-01',
          cashier_id: cashier.id,
          cashier_name: cashier.name,
          status: CashShiftStatus.OPEN,
          initial_float_nio: 2000.0,
          initial_float_usd: 50.0,
          expected_cash_nio: 8450.0,
        });
        shift = await manager.save(shift);
        console.log(`✅ Cash Shift Session opened: ID=${shift.id} on terminal CAJA-01`);
      }

      // 7. Sales Transactions (Invoices under DT 09-2007)
      // Generates 30 realistic invoices across the current month to populate KPIs and sales charts
      const existingInvoices = await manager.count(Invoice, { where: { tenant_id: DEMO_TENANT_ID } });
      if (existingInvoices < 20) {
        console.log('📦 Generating realistic transactions for Owner Dashboard metrics...');
        const now = new Date();
        const baseFolio = 400;

        for (let i = 1; i <= 28; i++) {
          const invoiceDate = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - (28 - i)), 8 + (i % 12), (i * 17) % 60);
          const folioStr = 'FAC-' + String(baseFolio + i).padStart(6, '0');

          // Pick 1 to 3 items
          const p1 = PRODUCTS[i % PRODUCTS.length];
          const p2 = PRODUCTS[(i + 4) % PRODUCTS.length];
          const qty1 = 1 + (i % 2);
          const qty2 = (i % 3 === 0) ? 1 : 0;

          const subtotal = (p1.sellPrice * qty1) + (qty2 ? (p2.sellPrice * qty2) : 0);
          const tax = subtotal * 0.15;
          const total = subtotal + tax;

          const inv = manager.create(Invoice, {
            tenant_id: DEMO_TENANT_ID,
            number: folioStr,
            userId: cashier.id,
            created_at: invoiceDate,
            subtotal,
            totalTax: tax,
            total,
            isCanceled: false,
            paymentStatus: 'PAID',
            shiftId: shift.id,
            localIssueDate: invoiceDate.toISOString().slice(0, 10),
            bcnOfficialRate: 36.80,
            totalUsd: Number((total / 36.80).toFixed(2)),
          });
          const savedInv = await manager.save(inv);

          // Add invoice items
          const item1 = manager.create(InvoiceItem, {
            tenant_id: DEMO_TENANT_ID,
            invoiceId: savedInv.id,
            productId: p1.id,
            productName: p1.name,
            quantity: qty1,
            unitPrice: p1.sellPrice,
            originalTaxRate: 0.15,
            appliedTaxRate: 0.15,
            taxAmount: (p1.sellPrice * qty1) * 0.15,
            total: (p1.sellPrice * qty1) * 1.15,
          });
          await manager.save(item1);

          if (qty2) {
            const item2 = manager.create(InvoiceItem, {
              tenant_id: DEMO_TENANT_ID,
              invoiceId: savedInv.id,
              productId: p2.id,
              productName: p2.name,
              quantity: qty2,
              unitPrice: p2.sellPrice,
              originalTaxRate: 0.15,
              appliedTaxRate: 0.15,
              taxAmount: (p2.sellPrice * qty2) * 0.15,
              total: (p2.sellPrice * qty2) * 1.15,
            });
            await manager.save(item2);
          }

          // Payment (varied methods: Cash NIO, Cash USD, BAC, Banpro)
          const method = (i % 4 === 0) ? 'CARD' : (i % 3 === 0) ? 'USD' : 'CASH';
          const bank = (method === 'CARD') ? ((i % 2 === 0) ? 'BAC' : 'BANPRO') : undefined;
          const isPendingVoucher = (method === 'CARD' && i === 28); // 1 voucher pending reconciliation!

          const pmt = manager.create(Payment, {
            invoiceId: savedInv.id,
            method,
            amount: (method === 'USD') ? Number((total / 36.80).toFixed(2)) : total,
            currency: (method === 'USD') ? 'USD' : 'NIO',
            exchangeRate: 36.80,
            amountNio: total,
            changeGiven: 0,
            bankPos: bank,
            voucherCode: bank ? `VOUCH-${1000 + i}` : undefined,
            cardBrand: bank ? 'VISA' : undefined,
            reconciliationStatus: isPendingVoucher ? 'PENDING_RECONCILIATION' : 'RECONCILED',
            reconciledAt: isPendingVoucher ? undefined : invoiceDate,
            createdAt: invoiceDate,
          });
          await manager.save(pmt);
        }
        console.log('✅ Generated 28 invoices with mixed payments and 1 pending voucher in Attention Required.');
      }

      console.log('----------------------------------------------------');
      console.log('  TENANT SEEDING COMPLETE!');
      console.log(`  Tenant Slug:   http://${DEMO_TENANT_SLUG}.localhost:5174`);
      console.log(`  Admin Login:   admin@nhilos.com / Admin1234! (PIN: 1234)`);
      console.log(`  Cashier Login: caja@nhilos.com  / Admin1234! (PIN: 1111)`);
      console.log('----------------------------------------------------');
    });
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

seed();
