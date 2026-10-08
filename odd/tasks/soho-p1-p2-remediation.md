# SOHO — Remediación Prioritaria P1 / P2

- **Rama:** `fix/soho-p1-p2-remediation`
- **Worktree:** `/home/octavio_morales/omnifood-ni-remediation`
- **Base:** `main` @ `62672a1c`
- **Autorización:** Pedido directo del usuario para implementar los 4 ítems en orden secuencial.

---

## Ítems del Bloque

1. **T1 · [P1] Inconsistencia de timestamps fiscales entre tablas (desfase de 6 h)**
   - Causa: En el POS, `invoice.createdAt.toIso8601String()` emite timestamp local (UTC-6) sin offset ni `Z`. Node.js / Postgres lo interpreta como UTC o tiempo de servidor generando 6 horas de desfase en auditoría, reportes DGI y cierres.
   - Solución: Normalización a UTC explícito (`.toUtc().toIso8601String()`) en todos los payloads de sincronización de salida (facturas, pagos, vouchers, movimientos de caja) y verificación de ingesta en backend.

2. **T2 · [P1] Sincronización de clientes creados en terminal hacia la nube (D-1 / FU-4)**
   - Causa: Clientes creados mediante alta rápida en el POS quedan en `syncStatus: 'pending'` indefinidamente sin pipeline de outbox hacia el backend.
   - Solución: Pipeline outbox en POS para clientes (`CustomerEntity` / `SyncService`) y endpoint/servicio idempotente de sincronización en NestJS (`POST /sales/customers/sync`).

3. **T3 · [P2] Limpieza de venta de verificación en activación (#77)**
   - Causa: `ActivationVerificationSaleCleanupRunner` existe pero no está conectado ni invocado en el ciclo de activación de la terminal.
   - Solución: Cablear la ejecución del cleanup runner al finalizar la activación o en el paso de verificación fiscal en el POS con tests dedicados.

4. **T4 · [P2] Generalizar el banner de errores de venta en checkout (R-4 / #80)**
   - Causa: Los errores generales de `processSale` se despachan a un SnackBar al pie que el panel del carrito tapa en orientación tablet/landscape.
   - Solución: Banner persistente y visible en la interfaz del carrito/checkout para cualquier error de venta que impida finalizar el cobro.

---

## Registro de Tareas

- [x] **T1** Desfase 6h timestamps fiscales (Completado: `sales_mapper.dart`, `audit_repository_impl.dart`, `receipt_layout_formatter.dart`, `invoices.service.ts`, specs verdes 501/501 y 33/33)
- [ ] **T2** Sync de clientes de alta local
- [ ] **T3** Limpieza venta de verificación
- [ ] **T4** Banner visible para errores de venta (R-4)
