# Soho — Tab Reconciliaciones en el Dashboard (F-2/T6)

**Origen:** `odd/tasks/soho-voucher-reconciliation-identity.md`, T4/T5 implementados.
**Rama:** `fix/voucher-reconciliation-sync-route`.

---

## El problema

La flecha de acción del attention band para vouchers va a `/sales?tab=summary&filters[paymentMethod]=card`, que es la **desglose de ventas por método**, no una lista de conciliaciones. El owner llega a una pantalla donde no aparecen los vouchers pendientes ni puede accionar nada. Esto es un **dead-end navigation**.

El standard de experiencia (sección 9.1, 9.2) prohíbe esto explícitamente:
> **A context-rich interaction should navigate to a context-rich destination.**
> Bad: Dashboard → "16 productos críticos" → Inventory generic list → user filters Critical manually
> Good: Dashboard → "16 productos críticos" → Inventory / status=CRITICAL

**Decisión:** construir el endpoint + vista de lista paginada de reconciliaciones + botones de accionar.

---

## Alcance

### 1. Endpoint de lista paginada (backend)

**`GET /sales/reports/reconciliations`** (o `POST` para query params complejos, siguiendo la convención del reporte de conciliación actual que es `POST`).

Query params:
- `status?: string` — `PENDIENTE`, `CONCILIADO`, `MANUAL_OVERRIDE`, `UNKNOWN_PAYMENT`, etc.
- `method?: string` — `card`, `cash`, etc.
- `page: number`
- `limit: number` (default 25, max 200)
- `startDate?: string` — ISO 8601 date
- `endDate?: string` — ISO 8601 date

Response:
```json
{
  "reconciliations": [
    {
      "paymentId": "uuid",
      "invoiceId": "uuid",
      "invoiceNumber": "string",
      "amount": 150.00,
      "amountNio": 5500.00,
      "currency": "NIO",
      "method": "CARD",
      "voucherCode": "VCH-123456",
      "reconciliationStatus": "PENDIENTE",
      "reconciledAt": "2026-10-08T15:22:00Z",
      "reconciledByUserId": "operador-42",
      "overrideSupervisorRef": "supervisor-mariana",
      "createdAt": "2026-10-08T14:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 47,
    "totalPages": 2
  }
}
```

### 2. Frontend: Tab Reconciliaciones en /sales

- Agregar tab `reconciliation` con label `Reconciliaciones` a los existentes (`CASH_NIO`, `CASH_USD`, `CARD_NIO`, `CARD_USD`, `OTHER`, `credit-notes`).
- Tabla con columnas: Voucher, Método, Estado (badge color), Monto, Fecha, Operador, Supervisor, Acciones.
- **Acciones:**
  - `PENDIENTE` → botón "Conciliar" que abre un modal con el form de conciliación (voucher code input)
  - `MANUAL_OVERRIDE` → ver detalle (botón info), no conciliar de nuevo
  - `CONCILIADO` → readonly, ver detalle
- **Filtro por default:** cuando viene de la atención (query param `reconciliationStatus`), filtrar a ese estado. Si viene directamente, mostrar todos (sin filtro).
- **Orden:** por defecto `created_at DESC` (más recientes primero).

### 3. Corrige el drill-down del attention band

- El signal de `vouchers` ahora debe navegar a `/sales?tab=reconciliation&filters[reconciliationStatus]=PENDIENTE`.
- **Necesitamos un nuevo signal** para `manualOverrides` (usa el DTO extendido de T4: `manualOverrideCount` + `manualOverrideAmountNio`) que navegue a `/sales?tab=reconciliation&filters[reconciliationStatus]=MANUAL_OVERRIDE`.
- Ambos van a la **misma pestaña**, solo cambia el filtro.

### 0. DECISIÓN DE ALCANCE: el dashboard NO escribe reconciliaciones

Verificado en el código: el feed inbound que consume el POS sólo aplica
`products`, `insumos`, `recipes`, `customers`, `promotions`, `alerts`, `users`
(`sync_service.dart` `rawDeltas[...]`; `payment`/`reconciliation` no aparecen
en el contrato `inbound-sync.dto.ts`). Si el owner conciliara desde la web:

1. el POS nunca se entera: su badge de pendientes y el gate fiscal del cierre
   siguen como si nada;
2. cuando el cajero concilia en el POS, el upsert por `paymentId` **pisa** la
   fila que escribió el owner;
3. quedan dos fuentes de verdad para el mismo campo, con el cloud perdiendo en
   silencio — viola "SQLite es Source of Truth" (`AGENTS.md`).

**T2 y T3 construyen lista + detalle, sin ningún write.** La "acción" de una fila
PENDIENTE es decir en qué terminal se concilia; la de una fila MANUAL_OVERRIDE es
mostrar el acto completo (operador, credencial declarada, motivo, fecha).

**T4 (modal de conciliación desde el dashboard) queda AFUERA de este feature.**
Si algún día se quiere, el prerequisito es un canal inbound de reconciliaciones
+ regla de conflicto cloud-vs-device, no un botón más.

Para la acción "Conciliar", el modal de conciliación puede ser:
- Un `Dialog` con input de voucher code (reusando la lógica de validación de código),
- Al confirmar, llama al endpoint de sync del backend (`POST /sales/payment-reconciliations/sync`) con la conciliación,
- El backend ya tiene la lógica de validación de voucher (la misma que usa el POS).

**Importante:** no se necesita autenticar al usuario del dashboard como operador real (no tiene un terminal), pero sí debe haber registro de *quién* hizo la conciliación desde el dashboard. Se puede usar el `user_id` de la sesión actual del owner.

---

## Restricciones

- No correr la suite completa del backend (tope de memoria). `*.db.spec.ts` con DB local.
- No usar formateadores whole-file en el repo del frontend (ver nota en `AGENTS.md`).
- El endpoint de lista debe usar el mismo RLS pattern que los otros reportes (tenant-scoped, read-only, no pooled repository).
- `synchronize: false` → si necesito agregar un endpoint de reporte, debo agregar su controller al `reports.module.ts` o donde corresponda.
- Reutilizar la lógica de validación de voucher del existing `PaymentReconciliationSyncIngestionService` para el modal de conciliación del dashboard.

## Tareas

### T1 · Endpoint de lista paginada de reconciliaciones (backend)
- Nuevo controller en `src/modules/sales/controllers/` o `reports.controller.ts`.
- Query service con pagination, filtro por status, date range, method.
- DTO response con la estructura indicada arriba.
- **Checks:** unit spec para el service y controller; db-spec contra la DB local; `tsc --noEmit` limpio.
- **Commit evidencia:** —

### T2 · Frontend: tab Reconciliaciones en /sales
- Agregar tab `reconciliation` a los `TABS` existentes.
- Componente `ReconciliationTab.tsx` con tabla, paginación y filtros.
- Columnas: Voucher, Método, Estado (badge), Monto, Fecha, Operador, Supervisor, Acciones.
- Badge color: PENDIENTE = amber, MANUAL_OVERRIDE = blue, CONCILIADO = green.
- **Checks:** render test del tab + snapshot de tabla con datos mock.
- **Commit evidencia:** —

### T3 · Drill-down del attention band + signal de overrides
- Actualizar el drill-down del signal `vouchers` → `/sales?tab=reconciliation&filters[reconciliationStatus]=PENDIENTE`.
- Agregar nuevo signal `manualOverrides` (usa `manualOverrideCount` + `manualOverrideAmountNio`) → `/sales?tab=reconciliation&filters[reconciliationStatus]=MANUAL_OVERRIDE`.
- **Checks:** test de `use-attention-signals` que asierta los nuevos `href` values.
- **Commit evidencia:** —

### T4 · Modal de conciliación desde el dashboard
- Dialog con input de voucher code que llama al endpoint sync.
- Al confirmar, invalida la query de reconciliaciones y refetch.
- **Checks:** render test del modal con interacción.
- **Commit evidencia:** —

### T5 · Cierre
- Reporte final, decisión de F-4 (InventoryController), y corte de release.

---

## Restricciones

- No usar formateadores whole-file.
- No correr la suite completa (tope de memoria del host).
- No commitear `apps/pos_app/pubspec.yaml` (intencional uncommitted local bump).
- El backend necesita ser rebuild y deploy para que el nuevo endpoint esté disponible antes de que el frontend lo consuma.
- Para la acción "Conciliar" desde el dashboard, el endpoint sync ya existe y funciona (`POST /sales/payment-reconciliations/sync`). Solo necesitamos pasarlo los datos correctos desde el modal.
- La conciliación desde el dashboard se hará con el `user_id` del owner logueado, no con el operador del POS.