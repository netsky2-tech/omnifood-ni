# Flujo administrativo de anulación de facturas (DGI) — Issue #937

Diseñar e implementar el flujo administrativo de anulación de facturas cumpliendo con DT 09-2007,
cerrando la serie consecutiva DGI, respetando 'Offline-First or Muerte' y evitando stock fantasma.

## Specs

- S1: "Existe un camino administrativo para anular una factura de terminal que cruzó el día (o la dejó de ayer), con actor, motivo y evidencia registrados."
- S2: "Al anular una venta nunca fiscalizada, la nube recibe el documento anulado y la serie queda sin huecos (con la leyenda ANULADO de #533)."
- S3: "Los movimientos de inventario de esa venta se revierten: el stock del terminal queda como estaba antes de la venta fallida."
- S4: "La anulación de una venta ya fiscalizada sigue funcionando por el camino actual (no se rompe el D-14 existente)."
- S5: "El mensaje del POS cuando D-14 niega la anulación nombra el destino real del trámite."
- S6: "Test que reproduce el estado actual como rojo antes del fix: factura local failed + sin movimiento en la nube + hueco en la serie => no hay ninguna acción posible en el producto."
- S7: "Offline-First or Muerte: The system must be fully operational without internet connectivity. Local SQLite is the Source of Truth; the cloud is an eventually consistent mirror."
- S8: "Prevenir stock fantasma en la nube: al ingerir SALE_CANCEL de una venta que nunca se aplicó en el Kardex de la nube (compensationForKardexId null), no sumar inventario inexistente a insumo.stock."

## Tasks

- T1: (S1, S4) Backend - Crear endpoint `POST /sales/admin/invoices/:id/void` en `AdminInvoicesController` con `SALES_VOID_INVOICE`, auditoría forense y reversión de Kardex BOH. Route: inline. Commit: pending.
- T2: (S2, S8) Backend - En `invoices.service.ts`, aceptar ingesta de `SALE_CANCEL` para facturas no fiscalizadas previamente, registrando la factura con `is_canceled: true` y evitando inflar `insumo.stock` cuando no hubo salida previa. Route: inline. Commit: pending.
- T3: (S1, S2) Backend - En `inbound-sync.service.ts`, exponer delta de facturas anuladas (`voidedInvoices`) para replicar anulaciones administrativas hacia los terminales. Route: inline. Commit: pending.
- T4: (S3, S5, S6, S7) POS - En `void_decision.dart` y `sale_view_model.dart`, actualizar mensaje de `deniedCrossDay` para nombrar el portal administrativo web y permitir que un rol supervisor/gerente pueda anular localmente facturas en estado `failed` para destrabarlas y revertir stock local. Route: inline. Commit: pending.
- T5: (S1, S3, S7) POS - En `sync_service.dart`, consumir delta de facturas anuladas y aplicar la anulación atómica y reversión de stock en SQLite local cuando no haya sido anulada previamente. Route: inline. Commit: pending.
- T6: (S1, S2, S3, S4, S6, S7, S8) E2E Real DB - Crear suite `test/sales/admin-invoice-void.db.e2e-spec.ts` con PostgreSQL y RLS (`NOSUPERUSER NOBYPASSRLS`), validando el flujo de anulación administrativa, cierre de serie DGI y no-divergencia de stock. Route: inline. Commit: pending.

## Log

- L1: (2026-11-04) User: "Ahora si vamos con el siguiente de bloque 3: - #937 — Flujo administrativo de anulación de facturas (DGI): Diseñar la anulación desde el backoffice para aquellas facturas que quedaron en el limbo de días anteriores o que no subieron desde el terminal, cumpliendo con la exigencia DGI de correlativo y leyenda ANULADO sin obligar al cajero a romper las reglas locales de turno. Aqui debemos revisar si, me hace ruido eso de 'facturas en limbo de dias anteriores o que no ssubieron desde el terminal', esto como queda con el tema de offline-first, y sobre todo, por que habria facturas no subidas desde el termianl que se anulen en la web?"
- L2: (2026-11-04) Architect: Análisis y propuesta de separación estricta: (1) Las facturas no subidas/rechazadas en el POS se anulan administrativamente en el propio terminal con rol supervisor/admin para revertir stock local y enviar el documento anulado a la nube, cerrando la serie DGI sin huecos ni stock fantasma. (2) Las facturas ya sincronizadas de días pasados se anulan en la Web Backoffice y viajan vía inbound deltas al POS.
- L3: (2026-11-04) User: "Si, me parece que ese analisis y arquitectura está mejor aterrizado" -> Autorización formal de la arquitectura y plan de trabajo.
