# NHILOS Loyalty V1 — Gap Audit

**Documento:** `loyalty_gap_audit.md`  
**Estado:** L0 CERRADO — inspección de código completada (2026-09-02).  
**Fecha cierre:** 2026-09-02  
**Objetivo de decisión:** evitar duplicación de dominio y decidir, por componente, qué **KEEP / EXTEND / REFACTOR / ADD / REMOVE**.

> **Regla de evidencia:** este audit diferencia entre (a) capacidad documentada como implementada, (b) comportamiento propuesto para Loyalty V1 y (c) detalle no verificable sin inspeccionar el repositorio. **L0 cerrado**: todos los ítems P0 tienen evidencia de archivo/clase/test.

---

## 1. Objetivo

Auditar el núcleo real ya entregado en **Batch 14.2 — Customers** y **Batch 14.3 — Loyalty Points** antes de escribir el PRD formal de NHILOS Loyalty V1.

El resultado debe responder, de forma ejecutable, cinco preguntas:

1. ¿Qué dominio de clientes/lealtad ya existe y debe conservarse?
2. ¿Qué piezas son reutilizables pero deben evolucionar para soportar múltiples programas?
3. ¿Qué piezas actuales quedarían conceptualmente incorrectas si Loyalty V1 se monta encima sin refactor?
4. ¿Qué capacidades nuevas necesita SOHO V1 para que la experiencia sea comercialmente completa?
5. ¿Qué supuestos siguen abiertos porque la documentación no sustituye una inspección de código?

### Principio rector

**No construir un segundo sistema de fidelización.** El ledger existente de Batch 14.3 debe permanecer como source of truth de Loyalty. Los sellos, puntos, progreso y recompensas deben ser proyecciones o interpretaciones programáticas del mismo ledger, no balances paralelos.

### Boundary de dominio

Loyalty **no** debe escribir directamente inventario ni Kardex.

Flujo correcto:

```text
Loyalty
  -> evalúa programa / elegibilidad / recompensa
  -> agrega o aplica recompensa al Ticket
Sales
  -> finaliza Ticket
Inventory
  -> ejecuta BOM / Kardex / costo
```

---

## 2. Baseline evaluado

### 2.1 Fuentes de producto

1. **Analisis inicial - Fidelizacion - NHILOS POS**
   - Declara Batch 14.2 y 14.3 como completados.
   - Establece que el núcleo existente ya cubre clientes, puntos offline-first, ledger inmutable, redención en checkout y sincronización cloud.
   - Recomienda el track **L0 Gap Audit -> L1 Loyalty Program Model -> L2 SOHO POS Experience -> L3 Profit-Aware Rewards -> L4 Owner Loyalty**.
   - Recomienda que el ledger existente siga siendo el source of truth.

2. **Analisis NHILOS Loyalty V1**
   - Define el target conceptual `LoyaltyProgram` con tipos `SPEND_POINTS`, `PRODUCT_STAMPS` y `VISIT_STAMPS`.
   - Propone saldo/progreso derivado del ledger filtrado por `programId`.
   - Propone `CustomerIdentificationPort` como abstracción de identificación.
   - Define el E2E comercial objetivo para SOHO: identificar -> vender -> cobrar -> earning local -> imprimir progreso -> persistir offline -> sincronizar -> visualizar en portal -> redimir -> anular y revertir.

3. **Master Execution Roadmap**
   - Batch 14.2: directorio offline de clientes, validación fiscal y asociación de cliente al flujo FOH/DGI.
   - Batch 14.3: puntos offline-first, ledger inmutable, redención en checkout y sync cloud.
   - Evidencia declarada: tests de `loyalty_service`, `customer_point_transaction_dao`, integración de Loyalty y E2E backend.

4. **Owner Dashboard Execution Roadmap**
   - El backend ya documenta `customers.controller.ts` con CRUD de clientes + ajuste de puntos.
   - W10 contempla perfiles, historial de puntos y ajustes manuales.
   - Existen endpoints genéricos de sync POS (`/v1/sync/batch`), pero la documentación no demuestra aún qué payloads Loyalty usan cada dirección.

### 2.2 Estado de ejecución relevante

- Batch 14.2: **COMPLETADO** según roadmap.
- Batch 14.3: **COMPLETADO** según roadmap.
- W7 Recipes/BOM: **finalizado**, según estado actual informado para esta auditoría.
- W10 Customers & Loyalty: debe adelantarse como siguiente superficie owner relevante para SOHO.

---

## 3. Capacidades existentes de Batch 14.2

### 3.1 Customer directory offline

**EXISTE.** Entidad de cliente en `customer_entity.dart` (Floor) y `customer.entity.ts` (TypeORM) con persistencia local SQLite + backend PostgreSQL.

- **Backend**: `apps/admin_backend/src/modules/customers/entities/customer.entity.ts:17` — campos: `id`, `tenant_id`, `name`, `tax_id`, `phone`, `email`, `address`, `points_balance`, `is_active`
- **POS**: `apps/pos_app/lib/data/models/customer/customer_entity.dart:11` — espejo Floor con `sync_status`
- **DAO**: `apps/pos_app/lib/data/daos/customer/customer_dao.dart` — CRUD + búsqueda por `tax_id`, `phone`, búsqueda textual (`name`, `tax_id`, `phone`)
- **Tests**: `customer_dao_test.dart`, `customers.e2e-spec.ts`

**KEEP** como bounded capability de Customer/CRM básico.

### 3.2 Validación fiscal Customer

**EXISTE.** Validación de Cédula/RUC de Nicaragua en `customer_select_dialog.dart:98` via `NicaraguaFiscalValidator.isValidRuc()`.

**KEEP**. Loyalty no debe duplicar validadores fiscales ni crear una entidad paralela de consumidor.

### 3.3 Asociación Customer -> Ticket / factura

**EXISTE.** `SaleViewModel` asocia `selectedCustomer` al invoice:
- `sale_view_model.dart:843` — `if (_selectedCustomer != null)` antes de procesar loyalty
- `invoice.customerId` se persiste en la factura
- `customer_select_dialog.dart:328` — `widget.viewModel.selectCustomer(customer)`

**EXTEND** para convertir la asociación en el punto de entrada estándar de Loyalty:

```text
Ticket.customerId
  -> Loyalty evaluates active programs
  -> eligible earning/redemption projections
```

No debe existir una asociación Loyalty separada del cliente vinculado al ticket.

### 3.4 UX de selección de cliente

**EXISTE** en `customer_select_dialog.dart:6-446`:
- Búsqueda por Nombre, Teléfono o Cédula (`customer_dao.dart:18-29`)
- Seleccionar existente o crear nuevo inline
- Validación fiscal de Cédula/RUC
- Muestra badge de puntos en la lista (`customer_select_dialog.dart:290-312`)

**GAP confirmado**: No existe identificación por QR/código/customer_code.

**EXTEND** hacia un `CustomerIdentificationPort` o abstracción equivalente con adaptadores:

- `PHONE` (ya funciona)
- `QR` (**FALTA**)
- `CUSTOMER_CODE` (**FALTA**)
- futuro: `NFC`
- futuro: `WALLET_TOKEN`

Para SOHO V1, QR/código + teléfono como fallback son suficientes.

---

## 4. Capacidades existentes de Batch 14.3

### 4.1 Loyalty service

**EXISTE** en `apps/pos_app/lib/domain/services/sales/loyalty_service.dart:31-145`.

Responsabilidad actual verificada:
- `calculatePointsEarned(netAmount)` — fórmula: `netAmount * earnRate` (default 0.1 = 1pt/10 NIO)
- `calculateDiscountFromPoints(points)` — fórmula: `points * redeemRate` (default 0.1)
- `validateRedemption()` — valida mínimo, saldo y exceso vs total de orden
- `createEarnTransaction()` — construye transacción EARN con UUID y balanceAfter
- `createRedeemTransaction()` — construye transacción REDEEM con points negativos
- `createAdjustmentTransaction()` — construye transacción ADJUST con razón

**GAPs críticos**:
- No hay `programId` — es un motor mono-programa
- No hay estrategias (`SPEND_POINTS`, `PRODUCT_STAMPS`, `VISIT_STAMPS`)
- No hay `eligibility` evaluable
- No hay `rewardId` en redención
- No hay `idempotencyKey` en transacciones
- `earnRate` / `redeemRate` son hardcodeados en constructor

**EXTEND**, no reemplazar. Debe evolucionar desde "motor de puntos" hacia "motor de programas" sin romper el ledger actual.

### 4.2 Customer point transaction ledger

**EXISTE** en dos capas:

**Backend (TypeORM)**: `apps/admin_backend/src/modules/customers/entities/customer-point-transaction.entity.ts:19-92`
- Campos: `id` (UUID), `tenant_id`, `customer_id`, `invoice_id?`, `type` (enum: earn/redeem/adjust), `points` (numeric 12,2), `balance_after` (numeric 12,2), `conversion_rate` (numeric 8,4), `reason?`, `created_at`
- Índices: `idx_point_transactions_tenant_customer`, `idx_point_transactions_tenant_invoice`, `idx_point_transactions_created_at`

**POS (Floor/SQLite)**: `apps/pos_app/lib/data/models/customer/customer_point_transaction_entity.dart:11-51`
- Mismos campos + `sync_status` ('pending'/'synced'/'error')
- Índices en `customer_id`, `invoice_id`, `created_at`

**DAO**: `customer_point_transaction_dao.dart:5-34`
- `getTransactionsByCustomer()` — ORDER BY created_at DESC
- `getTransactionsByInvoice()` — búsqueda por factura
- `getTransactionsBySyncStatus()` — para sync
- `recordPointTransactionAndUpdateBalance()` — **@transaction** atómica: insert + update balance
- `insertTransactions()` — batch insert

**Tests**: 
- `customer_point_transaction_dao_test.dart` — transacción atómica, historial inmutable, mapper bidireccional
- `loyalty-flow_integration_test.dart` — E2E: REDEEM + EARN en processSale

**KEEP + EXTEND**.

Debe conservar:
- append-only;
- historial inmutable;
- relación con cliente;
- sincronización offline-first.

**GAPs confirmados por inspección de código**:

| Campo requerido V1 | Estado actual | Veredicto |
|---|---|---|
| `programId` | **NO EXISTE** | **ADD** — requerido para multi-programa |
| `transactionType` (EARN/REDEEM/ADJUST/REVERSAL) | **EXISTE** como enum `earn/redeem/adjust` | **EXTEND** — añadir `REVERSAL` |
| `ticketId` | **NO EXISTE** — usa `invoice_id` | **EXTEND** — renombrar o mapear a `ticketId` V1 |
| `rewardId` | **NO EXISTE** | **ADD** — para redenciones con catálogo |
| `reversalOfTransactionId` | **NO EXISTE** | **ADD** — para reversos compensatorios |
| `idempotencyKey` | **NO EXISTE** en ledger de puntos | **ADD** — unique constraint por evento |
| `actorUserId` | **NO EXISTE** | **ADD** — para ajustes manuales |
| `terminalId` / `branchId` | **NO EXISTE** | **ADD** — trazabilidad multi-sucursal |

### 4.3 Redención en checkout

**EXISTE** en `sale_view_model.dart:846-862`:
- `applyLoyaltyPoints(100.0)` valida y aplica descuento al subtotal
- `processSale()` ejecuta REDEEM antes de EARN
- Descuento se refleja en `subtotal` del invoice (`salesRepo.lastSavedInvoice?.subtotal`)

**GAPs**:
- No hay catálogo de rewards — solo redención genérica de "puntos por descuento"
- No hay `programId` en la redención
- No hay `rewardId`
- No hay audit trail de redención en el ledger (solo transacción de tipo `redeem`)

**EXTEND** para que la redención sea program-scoped y reward-scoped.

### 4.4 Sync cloud

**EXISTE** infraestructura general:
- `sync-batch.controller.ts` — endpoint `POST /v1/sync/batch` con `SyncBatchEnvelopeDto`
- `idempotencyKey` en invoices y movements
- `inventory-sync-outbox.entity.ts` con outbox pattern

**GAP confirmado**: No existe sync de point transactions al backend.
- El `customer_point_transactions` local se persiste en SQLite pero no se sincroniza vía `/v1/sync/batch`
- El backend no tiene receptor para transacciones de puntos

**EXTEND** para separar claramente:
- **outbound transactional sync:** ledger local -> cloud
- **inbound master-data sync:** programas/recompensas/reglas activas -> POS
- cursores/versionado/idempotencia por stream

### 4.5 Offline-first

**EXISTE** como propiedad del sistema. Verificado:
- Ledger SQLite como source of truth local
- `sync_status` en CustomerPointTransactionEntity ('pending' default)
- DAO `getTransactionsBySyncStatus()` para filtrar pendientes
- `SaleViewModel` procesa loyalty 100% local en `processSale()`

**KEEP** como invariantes de V1:
- earning debe funcionar sin WAN
- consulta de progreso debe funcionar sin WAN
- redención SOHO V1 debe funcionar sin WAN en la topología de un solo terminal
- eventos pendientes deben sobrevivir reinicio de la app
- sync posterior no debe duplicar movimientos

### 4.6 E2E/integration evidence

Evidencia verificada:
- `loyalty_service_test.dart` — 8 tests: accumulation, redemption, balances
- `customer_point_transaction_dao_test.dart` — 3 tests: atomic transaction, immutable history, mapper
- `loyalty_flow_integration_test.dart` — 3 tests: FOH validation, rejection, atomic E2E
- `loyalty-points.e2e-spec.ts` — 3 tests: backend adjust, 401 auth, tenant isolation

**KEEP** esas suites y **EXTEND** con los E2E de programas/sellos/reversos de Loyalty V1.

---

## 5. Modelo de datos actual

## Customer

### Estado

**EXISTE.** Entidad/dominio de cliente previo a Loyalty V1.

### Evidencia de código

**Backend** (`customer.entity.ts`):
```text
id: UUID (PK)
tenant_id: varchar (FK -> tenants)
name: varchar
tax_id?: varchar (nullable) — Cédula/RUC
phone?: varchar (nullable)
email?: varchar (nullable)
address?: varchar (nullable)
points_balance: numeric(12,2) default 0.0  ← GAP: balance global, no por programa
is_active: boolean default true
created_at: timestamp
updated_at: timestamp
```
Índices: `idx_customers_tenant_tax_id`, `idx_customers_tenant_phone`, `idx_customers_tenant_name`

**POS** (`customer_entity.dart`): espejo Floor con `sync_status` adicional.

### Decisión

**KEEP.** No crear `LoyaltyCustomer`.

### Gaps resueltos por inspección

- método(s) de identificación exactos: **RESUELTO** — phone, tax_id, búsqueda textual. No QR/code.
- índice/unique por teléfono/código/QR: phone index existe; no hay unique constraint
- relación con tenant/sucursal: multi-tenant vía `tenant_id`; sin relación a branch
- lifecycle de customer inactivo/merge: `is_active` soft delete existe; merge fuera de scope

---

## CustomerPointTransaction

### Estado

**EXISTE.** Ledger inmutable en dos capas (backend TypeORM + POS Floor).

### Evidencia de código

**Backend** (`customer-point-transaction.entity.ts`):
```text
id: UUID (PK)
tenant_id: varchar (FK -> tenants)
customer_id: uuid (FK -> customers)
invoice_id?: varchar (nullable)  ← usa "invoice_id", no "ticketId"
type: enum('earn', 'redeem', 'adjust')  ← falta 'reversal'
points: numeric(12,2)
balance_after: numeric(12,2)  ← GAP: balance materializado, no derivado
conversion_rate: numeric(8,4) default 0.1
reason?: varchar (nullable)
created_at: timestamp (auto)
```
Índices: `idx_point_transactions_tenant_customer`, `idx_point_transactions_tenant_invoice`, `idx_point_transactions_created_at`

**POS** (`customer_point_transaction_entity.dart`): espejo Floor + `sync_status` (pending/synced/error).

### Decisión

**EXTEND.** Es el activo técnico central de Loyalty V1.

### Contrato mínimo V1 — GAPs vs現實

| Campo V1 | Estado actual | Acción |
|---|---|---|
| `id` | ✅ UUID | KEEP |
| `customerId` | ✅ uuid FK | KEEP |
| `programId` | ❌ No existe | **ADD** — REQUIRED V1 |
| `transactionType` | 🟨 `earn/redeem/adjust` | **EXTEND** — añadir `reversal` |
| `amount` (signed) | ✅ `points` numeric(12,2) | KEEP — ya es signed |
| `ticketId` | 🟨 `invoice_id` (nullable) | **EXTEND** — renombrar/mapear; hacer obligatorio en automáticos |
| `rewardId` | ❌ No existe | **ADD** — para REDEEM con catálogo |
| `reversalOfTransactionId` | ❌ No existe | **ADD** — para REVERSAL |
| `idempotencyKey` | ❌ No existe | **ADD** — unique constraint |
| `reason` | ✅ nullable | KEEP — hacer required para ADJUST |
| `actorUserId` | ❌ No existe | **ADD** — para ajustes manuales |
| `terminalId` / `branchId` | ❌ No existe | **ADD** — trazabilidad |
| `occurredAt` | ✅ `created_at` auto | KEEP |
| sync metadata | ✅ POS: `sync_status` | KEEP + EXTEND cursors |

---

## Balance / cálculo de puntos

### Estado

La inspección confirma que **SÍ EXISTE** un `points_balance` global en la entidad `Customer`:
- Backend: `customer.entity.ts:53` — `points_balance: numeric(12,2) default 0.0`
- POS: `customer_entity.dart:21` — `pointsBalance: double default 0.0`
- Se actualiza atómicamente en `customer_point_transaction_dao.dart:21-22`
- Se lee en `loyalty_service.dart:68` — `customer.pointsBalance`

**GAP CRÍTICO**: El balance es un **valor materializado global**, no derivado del ledger por programa.

### Decisión

**REFACTOR** cualquier balance global único por cliente que no esté particionado por programa.

Target:

```text
balance(customerId, programId) = SUM(ledger.amount WHERE programId = X)
```

Se puede mantener una proyección/cache materializada por performance, pero:
- el ledger sigue siendo source of truth;
- la proyección debe ser reconstruible;
- no crear una tabla "stamp balance" paralela.

### Resolución P0

- **¿Existe `Customer.pointsBalance`?** → SÍ, confirmado en `customer.entity.ts:53` y `customer_entity.dart:21`
- **¿El balance se calcula por SUM del ledger?** → NO. Se calcula como `previous_balance + delta` en `customers.service.ts:108` y `sale_view_model.dart:861`
- **¿Hay cache/projection table?** → NO, es campo denormalizado en la tabla customers
- **¿Qué precisión/tipo usa `amount`?** → `numeric(12,2)` backend, `double` Flutter

---

## Ticket relationship

### Estado

- Customer -> Ticket: **EXISTE** — `invoice.customerId` se persiste en `invoices` table
- PointTransaction -> Ticket: **EXISTE parcialmente** — `invoice_id` en `CustomerPointTransaction` es nullable

### Evidencia

- `sale_view_model.dart:851` — `invoiceId: invoiceId` se pasa al crear REDEEM
- `sale_view_model.dart:873` — `invoiceId: invoiceId` se pasa al crear EARN
- `loyalty_service_test.dart:143` — `expect(tx.invoiceId, equals('inv-101'))`
- `loyalty_flow_integration_test.dart:193-198` — E2E verifica `invoice_id` en ledger

### Decisión

**EXTEND** el ledger para que el origen automático sea trazable al ticket.

Regla V1:

- `EARN` automático requiere `ticketId` (ya existe como `invoice_id`)
- `REDEEM` aplicada en checkout requiere `ticketId` + `rewardId`
- `REVERSAL` por VOID requiere `ticketId` y referencia al movimiento compensado
- `ADJUSTMENT` manual puede no tener `ticketId`, pero exige motivo + actor

---

## Sync / Outbox

### Estado

**EXISTS** infraestructura general, **NO EXISTE** sync de loyalty transactions.

Verificado:
- `sync-batch.controller.ts` — `POST /v1/sync/batch` procesa `SyncBatchEnvelopeDto`
- `invoices.service.ts` — `syncBatch()` maneja idempotency, dedup, cursor
- `inventory-sync-outbox.entity.ts` — outbox pattern para inventory
- **NO EXISTE** receptor de `customer_point_transactions` en el sync batch
- **NO EXISTE** inbound de `LoyaltyProgram` config

### Decisión

**KEEP** infraestructura de sync. **EXTEND** contracts de Loyalty.

#### Outbound

```text
Local ledger event (customer_point_transactions)
 -> Outbox / sync_status = 'pending'
 -> /v1/sync/batch (nuevo flowType para loyalty)
 -> cloud dedupe por idempotencyKey
 -> ACK/cursor
```

#### Inbound

```text
Cloud LoyaltyProgram / Reward / Eligibility config
 -> inbound master-data stream
 -> SQLite
 -> local evaluation
```

---

## 6. Casos de uso existentes

## Earn

### Evidencia actual

**EXISTE** — earning manual desde `SaleViewModel.processSale()`:

```text
sale_view_model.dart:842-884
  if (_selectedCustomer != null) {
    // 1. Process redemption if points were used
    if (_pointsToRedeem > 0) { ... }
    // 2. Process accumulation on the final net subtotal
    final pointsEarned = _loyaltyService.calculatePointsEarned(subtotal);
    if (pointsEarned > 0) { ... }
  }
```

### GAPs

- Earning es disparado por `processSale()`, no por un evento `TicketPaid`
- No es idempotente — no hay `idempotencyKey` en las transacciones
- No verifica "active programs" — es mono-programa hardcodeado
- Fórmula hardcodeada: `netAmount * 0.1`

### Target V1

```text
TicketPaid
  -> customer associated?
  -> active programs for this customer
  -> eligibility evaluation (per program)
  -> earning calculation (per strategy)
  -> append EARN transactions idempotently (with programId)
```

**Acción:** EXTEND.

---

## Redeem

### Evidencia actual

**EXISTE** — redención en checkout:
- `sale_view_model.dart:846-862` — REDEEM antes de EARN
- `loyalty_service.dart:57-82` — `validateRedemption()`
- `loyalty_service.dart:105-123` — `createRedeemTransaction()`

### GAPs

- No hay catálogo de rewards — solo "puntos por descuento monetario"
- No hay scope por `programId`
- No hay reward eligibility rules
- No hay `rewardId` en la transacción
- No hay trazabilidad de reward/ticket/actor
- No hay manejo offline de concurrencia multi-terminal futuro

**Acción:** EXTEND.

---

## Adjustment

### Evidencia actual

**EXISTE** backend y frontend:
- `customers.controller.ts:69-81` — `POST /customers/:id/points/adjust`
- `customers.service.ts:101-126` — `adjustPoints()` append-only con `PointTransactionType.ADJUST`
- `adjust-points.dto.ts` — requiere `points_delta` + `reason`, opcional `invoice_id`
- `loyalty-points.e2e-spec.ts:143-171` — E2E test de adjust

### GAPs

- No hay `actorUserId` en la transacción (solo se infiere del JWT en el controller)
- No hay `programId`
- No hay supervisor override para umbrales
- No hay audit trail dedicado de ajustes (solo la transacción en el ledger)

### Target V1

Toda corrección manual crea `ADJUSTMENT` append-only; nunca sobrescribe balance.

Requerir:
- razón (✅ ya existe)
- actor (🟨 viene del JWT, no se persiste en la transacción)
- tenant (✅ ya existe)
- timestamp (✅ ya existe)
- auditoría (🟨 transversal existe, pero no registra eventos loyalty específicos)
- supervisor/permiso según umbral configurable

**Acción:** EXTEND.

---

## Reversal

### Evidencia actual

**NO EXISTE** reversal automático de Loyalty al anular (`VOID`) un ticket.

Verificado en:
- `sale_view_model.dart:1151-1171` — `voidInvoice()` solo llama `_salesRepository.voidInvoice()`
- `sales_repository_impl.dart:242-319` — `voidInvoice()` revierte inventario + audit, **no toca loyalty points**
- No hay llamada a `loyaltyService` en el flujo de VOID
- No hay tipo `REVERSAL` en el enum `PointTransactionType`

### Estado

**FALTA** — confirmado por inspección.

### Target V1

```text
Ticket VOID
  -> locate loyalty transactions originated by ticket (via invoice_id)
  -> append REVERSAL compensating events
  -> do not delete original EARN/REDEEM
```

Si un ticket redimió una recompensa y además ganó puntos, el reversal debe compensar ambas consecuencias según la política definida.

**Acción:** ADD.

---

## Customer association

### Evidencia actual

**EXISTE** en Batch 14.2 y verificada en código.

### Target V1

La identificación debe ocurrir antes del cierre del ticket y la asociación `ticket.customerId` debe ser la única fuente de identidad consumida por Loyalty.

**Acción:** KEEP + EXTEND UX/ports.

---

## 7. POS UX actual

### Confirmado por inspección

- ✅ selección/asociación de Customer en el flujo POS (`customer_select_dialog.dart`)
- ✅ redención de puntos en checkout (`sale_view_model.dart:149-167`)
- ✅ operación offline-first del motor de puntos
- ✅ badge de puntos en la lista de clientes (`customer_select_dialog.dart:290-312`)

### No confirmado (GAPs de UX)

- ❌ visualización de saldo/progreso antes de cobrar
- ❌ earning notification posterior al pago
- ❌ progreso por programa/sellos (star bars, etc.)
- ❌ reward card/CTA de reward elegible
- ❌ impresión de progreso en ticket (receipt solo muestra "Puntos Lealtad: C$ X")
- ❌ identificación QR/código
- ❌ UX de reversal
- ❌ mensajes de sync pending/confirmed

### Target SOHO V1

```text
1. Identificar cliente (QR/código o búsqueda; teléfono fallback)
2. Vender normalmente
3. Mostrar reward elegible si aplica
4. Aplicar reward opcionalmente
5. Cobrar
6. Earning automático al PAID
7. Mostrar progreso actualizado
8. Imprimir progreso
```

### Decisión

**EXTEND** la UX existente. No crear una pantalla paralela de "sellar tarjeta".

---

## 8. Backend APIs actuales

### Inventario completo por inspección

| Method | Route | Roles | DTO | Tenant | Descripción |
|---|---|---|---|---|---|
| `GET` | `/customers` | OWNER, MANAGER, CASHIER, WAITER | `CustomerQueryDto` (search, limit, offset) | ✅ RLS | Listar/buscar clientes |
| `GET` | `/customers/:id` | OWNER, MANAGER, CASHIER, WAITER | — | ✅ RLS | Detalle cliente |
| `GET` | `/customers/:id/points/transactions` | OWNER, MANAGER, CASHIER | — | ✅ RLS | Historial de transacciones |
| `POST` | `/customers/:id/points/adjust` | OWNER, MANAGER | `AdjustPointsDto` (points_delta, reason, invoice_id?) | ✅ RLS | Ajuste manual de puntos |
| `POST` | `/customers` | OWNER, MANAGER, CASHIER | `CreateCustomerDto` | ✅ RLS | Crear cliente |
| `PATCH` | `/customers/:id` | OWNER, MANAGER, CASHIER | `UpdateCustomerDto` | ✅ RLS | Actualizar cliente |
| `DELETE` | `/customers/:id` | OWNER, MANAGER | — | ✅ RLS | Soft delete (is_active=false) |
| `POST` | `/v1/sync/batch` | Auth | `SyncBatchEnvelopeDto` | ✅ RLS | Sync general (no loyalty) |

### GAPs de API

- **NO EXISTE** `POST /loyalty-programs` (CRUD de programas)
- **NO EXISTE** `GET /customers/:id/points/balance?programId=X` (saldo por programa)
- **NO EXISTE** endpoint de redención con reward scope
- **NO EXISTE** endpoint de reversal
- **NO EXISTE** receptor de loyalty transactions en sync batch
- **NO EXISTE** inbound de programas/rewards al POS

### Decisión

**KEEP** endpoints actuales que representen dominio correcto.
**EXTEND** contracts si necesitan `programId`, reward, history o audit metadata.
**ADD** endpoints nuevos para LoyaltyProgram, rewards, reversal, sync loyalty.

---

## 9. Owner Dashboard APIs actuales

### Confirmado

El backend tiene:
- CRUD de Customer completo (`customers.controller.ts`)
- Ajuste de puntos (`/customers/:id/points/adjust`)
- Historial de transacciones (`/customers/:id/points/transactions`)
- Audit trail transversal (`audit-log.entity.ts` con hash-chaining)
- RBAC/permissions (`permissions.enum.ts`, `roles.guard.ts`)

### Gap principal

**NO EXISTE** CRUD de `LoyaltyProgram` ni reward catalog porque esas abstracciones son nuevas para Loyalty V1.

### Target W10 adelantado

Owner debe poder:

1. listar/crear/editar/activar/desactivar `LoyaltyProgram`
2. configurar tipo de programa
3. definir earning rule
4. definir eligibility
5. gestionar reward catalog
6. ver clientes y progreso por programa
7. ver ledger/history
8. ejecutar adjustment autorizado
9. revisar costo estimado de recompensa/profit-aware metric
10. revisar audit trail de cambios y redenciones

### Decisión

- Customer APIs: **KEEP / EXTEND**
- Program APIs: **ADD**
- Reward APIs: **ADD**
- History APIs: **KEEP si existen / EXTEND por programId**

---

## 10. Auditoría / RBAC actual

### Auditoría

**EXISTE** infraestructura de audit trail con hash-chaining forense:
- `audit-log.entity.ts` — campos: `tenant_id`, `user_id`, `action`, `target_type`, `target_id`, `device_id`, `sequence_no`, `prev_hash`, `entry_hash`, `timestamp`, `metadata`, `forensic_status`
- `audit-trail.service.ts` — logging con hash chain
- `audit-integrity.service.ts` — verificación de integridad
- `audit-verification.service.ts` — verificación forense
- `audit-metrics.service.ts` — métricas

**Eventos audit existentes relevantes**: `SALE_VOIDED` (verificado en `sales_repository_impl.dart:272`)

**KEEP** infraestructura transversal.

**EXTEND** con tipos de evento Loyalty:

```text
LOYALTY_PROGRAM_CREATED
LOYALTY_PROGRAM_UPDATED
LOYALTY_PROGRAM_ACTIVATED
LOYALTY_PROGRAM_DEACTIVATED
LOYALTY_REWARD_CREATED
LOYALTY_REWARD_UPDATED
LOYALTY_ADJUSTMENT
LOYALTY_REDEMPTION
LOYALTY_REVERSAL
```

### RBAC

**EXISTE** infraestructura de roles/permisos granulares:
- `UserRole`: OWNER, MANAGER, CASHIER, WAITER
- `AppPermission`: 8 permisos actuales (SALES_*, CASH_*, INVENTORY_*, REPORTS_*)
- `PermissionsGuard` + `@Permissions()` decorator
- `DEFAULT_ROLE_PERMISSIONS` por rol

**GAP confirmado**: No hay permisos de dominio Loyalty.

**KEEP** engine RBAC. **EXTEND** permisos de dominio:

```text
loyalty.program.read
loyalty.program.write
loyalty.reward.read
loyalty.reward.write
loyalty.customer.read
loyalty.history.read
loyalty.adjust
loyalty.redeem
```

Target recomendado:

- OWNER: todos
- MANAGER: read + program/reward management según política + adjustment bajo límites
- CASHIER: identify + read minimal progress + redeem at checkout; sin adjustment
- WAITER: según modo de negocio; por defecto identify/read, redeem solo si puede cobrar

---

## 11. Offline behavior actual

### Confirmado

Batch 14.3 es explícitamente offline-first y sincroniza a cloud.

### KEEP

- ledger local (Floor/SQLite);
- persistencia SQLite;
- sync eventual (sync_status + triggerManualSync);
- redención local para el alcance fundador de un solo terminal.

### EXTEND

- programas/rewards deben estar cacheados inbound;
- toda evaluación usada en checkout debe ser local;
- idempotencia debe sobrevivir restart;
- progreso debe reconstruirse localmente;
- estado `pending sync` no debe bloquear venta.

### Riesgo futuro multi-terminal

Con un solo terminal SOHO, la redención offline puede serializarse localmente. Con Bloques 17/18 y múltiples terminales, **double-spend de puntos/rewards** se vuelve un problema de concurrencia distribuida.

Fuera de V1 fundador, pero registrar como deuda arquitectónica:

```text
MULTI_TERMINAL_REDEMPTION_SERIALIZATION
owner: Local Edge / LAN Broker
```

No resolver con "último balance gana".

---

## 12. Matriz de gaps — ESTADO CERRADO

Leyenda:

- ✅ Existe: sustentado por evidencia de código inspeccionado.
- 🟨 Parcial: existe infraestructura/capacidad relacionada, pero falta el contrato V1 o hay un detalle crítico por verificar.
- ❌ Falta: no existe evidencia de que esté implementado y el análisis lo introduce como capacidad nueva.

| Capability | Existe | Parcial | Falta | Acción | Evidencia |
|---|:---:|:---:|:---:|---|---|
| `Customer` | ✅ |  |  | **KEEP** entidad existente | `customer.entity.ts:17`, `customer_entity.dart:11` |
| Customer association al ticket | ✅ |  |  | **KEEP + EXTEND** como trigger de Loyalty | `sale_view_model.dart:843`, `invoice.customerId` |
| `CustomerPointTransaction` ledger | ✅ |  |  | **KEEP + EXTEND**; source of truth único | `customer-point-transaction.entity.ts:19`, `customer_point_transaction_entity.dart:11` |
| `LoyaltyProgram` |  |  | ❌ | **ADD** sobre el ledger existente | — |
| `programId` en el ledger |  |  | ❌ | **ADD** REQUIRED V1 | No existe en ningún archivo |
| `SPEND_POINTS` |  | 🟨 |  | **EXTEND** motor actual bajo estrategia explícita | `loyalty_service.dart:42-45` (fórmula hardcodeada) |
| `PRODUCT_STAMPS` |  |  | ❌ | **ADD** como estrategia, no como segundo ledger | — |
| `VISIT_STAMPS` |  |  | ❌ | **ADD** como estrategia | — |
| reglas de elegibilidad |  |  | ❌ | **ADD** `eligibility` evaluable offline | — |
| catálogo de recompensas |  |  | ❌ | **ADD** reward model + owner CRUD | — |
| progress calculation |  |  | ❌ | **ADD** como proyección del ledger por programa | No hay UI de progreso |
| reward eligibility |  |  | ❌ | **ADD** regla explícita por reward/program | `validateRedemption()` solo valida saldo global |
| earning automático por ticket |  | 🟨 |  | **EXTEND** — funciona pero es manual, no event-driven | `sale_view_model.dart:866` (en processSale) |
| `ticketId` como origen de earning | 🟨 |  |  | **EXTEND** — existe como `invoice_id`, hacer obligatorio | `loyalty_service.dart:88` (nullable) |
| idempotencia de earning |  |  | ❌ | **ADD** unique business key | No existe `idempotencyKey` en ledger |
| redemption en checkout | ✅ |  |  | **KEEP + EXTEND** a reward/program scope | `sale_view_model.dart:846-862` |
| reversal por `VOID` |  |  | ❌ | **ADD** compensating `REVERSAL` | `voidInvoice()` NO toca loyalty |
| adjustment | ✅ |  |  | **EXTEND** append-only + reason + audit + programId | `customers.controller.ts:69` |
| identificación por cliente | ✅ |  |  | **KEEP + EXTEND** hacia `CustomerIdentificationPort` | `customer_select_dialog.dart` (phone/tax_id/search) |
| QR / customer code |  |  | ❌ | **ADD** para SOHO V1 | No existe en código |
| impresión de progreso |  |  | ❌ | **ADD** al receipt formatter | `receipt_58mm_formatter.dart:380` solo muestra "Puntos Lealtad: C$ X" |
| offline earning/progress | ✅ |  |  | **KEEP + EXTEND** a programas y rewards | `sale_view_model.dart:842-884` 100% local |
| offline redemption single-terminal | ✅ |  |  | **KEEP** alcance SOHO | `loyalty_flow_integration_test.dart` |
| outbound sync | ✅ |  |  | **EXTEND** con programId/idempotencia | `sync-batch.controller.ts` (no incluye loyalty) |
| inbound sync |  |  | ❌ | **ADD** para LoyaltyProgram/Reward master data | No existe receptor loyalty |
| Owner Customer CRUD | ✅ |  |  | **KEEP** API; UI W10 debe exponerse | `customers.controller.ts` |
| Owner LoyaltyProgram CRUD |  |  | ❌ | **ADD** | — |
| Owner Reward CRUD |  |  | ❌ | **ADD** | — |
| historial | ✅ |  |  | **EXTEND** por programId | `customers.controller.ts:57-67` + `getPointTransactions()` |
| auditoría transversal | ✅ |  |  | **KEEP + EXTEND** con eventos Loyalty | `audit-log.entity.ts`, `audit-trail.service.ts` |
| permisos / RBAC | ✅ |  |  | **KEEP + EXTEND** permisos Loyalty granulares | `permissions.enum.ts` (8 permisos, 0 loyalty) |
| profit-aware reward |  |  | ❌ | **ADD** en L3 usando Sales + BOM/CPP | — |
| reward como línea/tratamiento económico del ticket |  |  | ❌ | **ADD** — descuento actual es genérico | `loyaltyDiscount` en SaleViewModel |
| saldo paralelo de sellos |  |  | ❌ | **DO NOT ADD** | No existe |
| Loyalty escribiendo Kardex |  |  | ❌ | **DO NOT ADD** | No existe |

---

## 13. Disposición final por componente: KEEP / EXTEND / REFACTOR / ADD / REMOVE

| Componente | Disposición | Decisión concreta |
|---|---|---|
| `Customer` | **KEEP** | Reutilizar entidad y reglas de Batch 14.2. |
| Customer fiscal validation | **KEEP** | Loyalty no duplica Cédula/RUC ni identidad fiscal. |
| Customer selection / ticket association | **EXTEND** | Mantener asociación; añadir identificación desacoplada QR/código/teléfono. |
| `CustomerPointTransaction` | **EXTEND** | Mantener ledger; añadir/validar `programId`, tipos, references e idempotencia. |
| Global customer `pointsBalance` | **REFACTOR** | Migrar a saldo derivado/proyección por `(customerId, programId)`. |
| `LoyaltyService` | **EXTEND** | Convertir de motor de puntos a orquestador de estrategias por `LoyaltyProgram`. |
| Existing checkout redemption | **EXTEND** | Conectar reward catalog, eligibility, programId y audit metadata. |
| Existing offline ledger | **KEEP** | Es ventaja estructural; no mover source of truth operativo a cloud. |
| Existing Loyalty outbound sync | **EXTEND** | Dedupe/idempotencia + program-scoped payloads. |
| Existing inbound sync infrastructure | **EXTEND** | Distribuir `LoyaltyProgram`, rewards y reglas al POS. |
| Existing Customer backend CRUD | **KEEP** | Exponer en W10; no crear API paralela para "miembros Loyalty". |
| Existing points adjustment backend | **EXTEND** | Hacer append-only `ADJUSTMENT` con reason, actor, RBAC, audit y programId. |
| Existing Audit Trail | **KEEP** | Reusar subsystem transversal con hash-chaining. |
| Audit event catalog | **EXTEND** | Añadir eventos administrativos, adjustment, redemption y reversal. |
| Existing RBAC/permissions engine | **KEEP** | Reusar autenticación/autorización existente. |
| Loyalty permissions | **ADD** | Añadir permisos granulares de programas, rewards, history, adjust y redeem. |
| `LoyaltyProgram` | **ADD** | Entidad/config agregadora de Loyalty V1. |
| `SPEND_POINTS` strategy | **EXTEND** | Encapsular comportamiento de puntos actual como estrategia explícita. |
| `PRODUCT_STAMPS` strategy | **ADD** | Derivar sellos por unidades/productos elegibles. |
| `VISIT_STAMPS` strategy | **ADD** | Derivar sello por ticket/visita elegible. |
| Eligibility engine | **ADD** | Evaluación local determinista y sincronizable. |
| Reward catalog | **ADD** | Recompensa referenciable por programa y aplicable al ticket. |
| Progress projection | **ADD** | `current/target` derivado del ledger, no saldo paralelo. |
| Reward eligibility evaluator | **ADD** | Normalizar criterio previo a redención. |
| TicketPaid auto-earning | **ADD** | Debe ser automático e idempotente; reemplazar el actual manual. |
| VOID reversal | **ADD** | Movimiento compensatorio; jamás borrar ledger histórico. |
| Progress printing | **ADD** | Integrar a receipt formatter 58/80mm. |
| Owner LoyaltyProgram CRUD | **ADD** | W10 adelantado para SOHO. |
| Owner Reward CRUD | **ADD** | W10 Loyalty V1. |
| Owner history/progress UI | **ADD** | Reutilizar endpoints existentes y filtrar por programa. |
| Profit-aware rewards | **ADD** | Calcular costo del incentivo con producto + BOM/CPP, sin tocar inventario. |
| Separate stamp ledger/balance | **DO NOT ADD** | Un solo ledger de Loyalty. |
| Direct Loyalty -> Kardex writes | **DO NOT ADD** | Inventory mantiene ownership exclusivo de stock. |
| Manual cashier "Agregar sello/punto" para earning normal | **DO NOT ADD** | Earning normal deriva del ticket; ajustes son operación supervisada separada. |

---

## 14. P0 — Code verification checklist — CERRADO

Respuesta contra el código real:

### 1. Customer model
- **campos e índices**: UUID, tenant_id, name, tax_id, phone, email, address, points_balance, is_active, created_at, updated_at. Índices: tenant+tax_id, tenant+phone, tenant+name
- **identifiers soportados**: phone, tax_id (Cédula/RUC), búsqueda textual (name/tax_id/phone). **NO QR/code.**
- **relación exacta con ticket**: `invoices.customer_id` FK nullable

### 2. CustomerPointTransaction
- **campos reales**: id(UUID), tenant_id, customer_id, invoice_id(nullable), type(earn/redeem/adjust), points(numeric 12,2), balance_after(numeric 12,2), conversion_rate(numeric 8,4), reason(nullable), created_at
- **tipos de transacción**: earn, redeem, adjust. **NO reversal.**
- **relación con ticket**: via `invoice_id` nullable
- **balance calculation**: `previous_balance + delta` (denormalizado en `Customer.points_balance`)
- **constraints de inmutabilidad**: append-only (no hay UPDATE/DELETE en DAO)
- **sync metadata**: `sync_status` (pending/synced/error) en POS; no en backend

### 3. LoyaltyService
- **fórmula actual de earning**: `netAmount * earnRate` (default 0.1)
- **trigger exacto**: manual desde `SaleViewModel.processSale()`, no event-driven
- **idempotencia**: NO EXISTE
- **validación de saldo**: `customer.pointsBalance >= pointsToRedeem`
- **redemption contract**: validateRedemption() + createRedeemTransaction()
- **reversal actual o ausencia**: AUSENCIA CONFIRMADA — `voidInvoice()` no toca loyalty

### 4. POS UX
- **pantalla/flujo de customer selection**: `CustomerSelectDialog` con búsqueda + creación inline
- **punto de entrada de redemption**: `SaleViewModel.applyLoyaltyPoints()`
- **saldo/progreso mostrado**: badge de puntos en lista de clientes; no hay progreso por programa
- **receipt formatter integration**: solo "Puntos Lealtad: C$ X" en cierre de caja; no en ticket de venta

### 5. Sync
- **outbound route/event type**: `/v1/sync/batch` con `SyncBatchEnvelopeDto`. **NO incluye loyalty transactions.**
- **inbound master data disponible**: NO para loyalty programs
- **dedupe key**: `idempotencyKey` en invoices/movements
- **retry/ACK/cursor**: existe en `invoices.service.ts:syncBatch()`
- **behavior tras restart offline**: `sync_status = 'pending'` persiste; `triggerManualSync()` reenvía

### 6. Backend API
- **paths exactos**: `GET/POST/PATCH/DELETE /customers`, `GET /customers/:id/points/transactions`, `POST /customers/:id/points/adjust`
- **DTOs**: CreateCustomerDto, UpdateCustomerDto, CustomerQueryDto, AdjustPointsDto
- **guards/roles**: AuthGuard + RolesGuard (OWNER/MANAGER/CASHIER/WAITER)
- **tenant scope/RLS**: TenantInterceptor + `tenant_id` en queries
- **audit side effects**: audit trail solo en `voidInvoice()` (SALE_VOIDED); no en loyalty adjust

### 7. Tests
- **loyalty_service_test.dart**: 8 tests — accumulation (3), redemption (4), transaction building (3)
- **customer_point_transaction_dao_test.dart**: 3 tests — atomic transaction, immutable history, mapper
- **loyalty_flow_integration_test.dart**: 3 tests — FOH validation, rejection, atomic E2E
- **loyalty-points.e2e-spec.ts**: 3 tests — backend adjust, 401 auth, tenant isolation
- **Total**: 17 tests que cubren el comportamiento actual

---

## 15. Gate de salida L0

`loyalty_gap_audit.md` se considera **CERRADO** cuando:

- [x] cada `VERIFY-CODE P0` tiene evidencia de archivo/clase/test
- [x] las rutas backend reales están inventariadas
- [x] se confirma la semántica actual del balance (denormalizado, no derivado)
- [x] se confirma o descarta earning automático por `TicketPaid` (DESCARTADO — es manual)
- [x] se confirma o descarta idempotencia por ticket (DESCARTADA — no existe)
- [x] se confirma o descarta reversal por VOID (DESCARTADO — no existe)
- [x] se confirma outbound/inbound sync de Loyalty (outbound NO incluye loyalty; inbound NO existe)
- [x] no existe un segundo balance de sellos (CONFIRMADO — no existe)
- [x] no existe escritura directa Loyalty -> Kardex (CONFIRMADO — no existe)
- [x] la tabla de disposición final queda sin decisiones condicionales críticas

### Resultado al cerrar L0

El PRD posterior **no** debe decir "construir Loyalty". Debe decir, con precisión:

```text
KEEP    el customer domain, ledger, offline persistence, redemption base, sync infrastructure, audit y RBAC.
EXTEND  ledger, service, checkout, sync y APIs con programId, reglas, rewards y trazabilidad.
REFACTOR el pointsBalance global único a saldo derivado por (customerId, programId).
ADD     LoyaltyProgram, estrategias, eligibility, reward catalog, progress, reversal, owner CRUD, profit-awareness, QR identification, progress printing e idempotencia.
REMOVE  cualquier saldo paralelo de sellos, earning manual ordinario o acoplamiento directo Loyalty -> Kardex.
```

Ese es el contrato arquitectónico que debe gobernar NHILOS Loyalty V1.

---

## 16. Archivos inspeccionados

### Backend (NestJS)
- `apps/admin_backend/src/modules/customers/entities/customer.entity.ts`
- `apps/admin_backend/src/modules/customers/entities/customer-point-transaction.entity.ts`
- `apps/admin_backend/src/modules/customers/controllers/customers.controller.ts`
- `apps/admin_backend/src/modules/customers/services/customers.service.ts`
- `apps/admin_backend/src/modules/customers/customers.module.ts`
- `apps/admin_backend/src/modules/customers/dto/adjust-points.dto.ts`
- `apps/admin_backend/src/modules/identity/security/permissions.enum.ts`
- `apps/admin_backend/src/modules/identity/entities/audit-log.entity.ts`
- `apps/admin_backend/src/modules/sales/controllers/sync-batch.controller.ts`
- `apps/admin_backend/test/customers/loyalty-points.e2e-spec.ts`

### Frontend POS (Flutter)
- `apps/pos_app/lib/domain/models/customer/customer.dart`
- `apps/pos_app/lib/domain/models/sales/customer_point_transaction.dart`
- `apps/pos_app/lib/domain/services/sales/loyalty_service.dart`
- `apps/pos_app/lib/data/models/customer/customer_entity.dart`
- `apps/pos_app/lib/data/models/customer/customer_point_transaction_entity.dart`
- `apps/pos_app/lib/data/daos/customer/customer_dao.dart`
- `apps/pos_app/lib/data/daos/customer/customer_point_transaction_dao.dart`
- `apps/pos_app/lib/data/mappers/customer_mapper.dart`
- `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`
- `apps/pos_app/lib/presentation/features/sales/widgets/customer_select_dialog.dart`
- `apps/pos_app/lib/domain/services/printer/receipt_58mm_formatter.dart`
- `apps/pos_app/lib/data/repositories/sales/sales_repository_impl.dart`
- `apps/pos_app/test/domain/services/sales/loyalty_service_test.dart`
- `apps/pos_app/test/data/daos/customer/customer_point_transaction_dao_test.dart`
- `apps/pos_app/test/presentation/features/sales/loyalty_flow_integration_test.dart`
