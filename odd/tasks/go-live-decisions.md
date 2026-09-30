# Registro de decisiones para go-live

Registro consolidado de decisiones de producto ya tomadas en conversación con el fundador. Una entrada por decisión: fecha, decisión, rationale, anclas de evidencia y disparador de revisión. Registro, no ensayo.

## DEC-1 — Numeración de notas de crédito: cursor único del POS

- **Fecha**: 2026-09-29
- **Decisión**: MANTENER que el POS comparta el cursor DGI de ventas para emitir notas de crédito (opción 1: sin prefijo/serie NC separada en el POS).
- **Rationale**: SOHO arranca mono-terminal; las NC se emiten en caja; el número del POS y el de la factura de origen salen de una misma secuencia monotónica sin huecos. Las NC emitidas desde el backoffice siguen usando `CREDIT_NOTE_SERIES`.
- **Consecuencia conocida (registrada honestamente)**: dos fuentes pueden emitir NC en formatos distintos si el backoffice emite una. Postura aceptable para el piloto mono-terminal.
- **Anclas de evidencia**:
  - `apps/pos_app/lib/data/services/sales/dgi_numbering_service_impl.dart` — cursor único `dgi_current_number`.
  - `apps/pos_app/lib/data/repositories/sales/sales_repository_impl.dart` — `createCreditNote` usa `numberingService`.
  - `apps/admin_backend/src/modules/sales/services/invoices.service.ts` — `CREDIT_NOTE_SERIES`.
- **Revisar antes de**: operar multi-terminal o emitir NC por canal mixto (POS + backoffice en producción).

## DEC-2 — Postura 400 de lote completo en sync fiscal: fail-closed confirmada

- **Fecha**: 2026-09-29
- **Decisión**: CONFIRMAR el comportamiento actual: un registro inválido rechaza el envelope completo con 400. Nunca se persiste parcialmente un lote malformado en la superficie de sync fiscal.
- **Rationale**: para una superficie fiscal, persistir parcialmente un lote malformado es peor que rechazarlo entero; fail-closed es la postura correcta.
- **Mitigación vigente**: el POS pre-valida los registros antes de enviar; existe aislamiento por registro dentro de la ingesta (`invoices.service.ts` con resultados REJECTED por registro).
- **Anclas de evidencia**:
  - `apps/admin_backend/src/modules/sales/dto/sync-batch.dto.ts` — `@ValidateNested` anidado en `records`.
  - `apps/admin_backend/src/main.ts` — ValidationPipe global.
- **Revisar si**: la operación reporta bloqueos recurrentes por rechazo de lotes completos (hoy sin disparador definido).

## DEC-3 — NC emitidas en el POS no sincronizan al cloud durante el piloto

- **Fecha**: 2026-09-30
- **Decisión**: ACEPTAR para el piloto mono-terminal que las notas de crédito emitidas en el POS queden fuera del sync saliente (filtro `documentType != 'CREDIT_NOTE'`).
- **Rationale**: el filtro existe por **DSI-6** (auditoría de autorización de NC en el backend), no por OHAC. La feat OHAC está terminada y mergeada (U1–U5b: emisor de assertions, verifier port, drain gate, recovery tokens — ver `odd/tasks/ohac-completion.md`), pero NO desbloquea este filtro: falta el cable DSI-6 (DEP-2), que es scope separado.
- **Consecuencia conocida**: los dashboards cloud no verán las NC emitidas en caja durante el piloto; las NC emitidas desde el backoffice (`CREDIT_NOTE_SERIES`) sí sincronizan. La numeración ya está resuelta en DEC-1.
- **Anclas de evidencia**:
  - `apps/pos_app/lib/data/services/sync_service.dart:328` (filtro saliente) y `:713` (comentario del hold).
  - `openspec/changes/offline-human-authorization-credential/tasks.md` D-REFACTOR: "`SyncCreditNoteAuthGuard` remains fail-closed until DSI-6 adopts the port".
  - `odd/tasks/ohac-completion.md` — U6: gates de habilitación (cohort disabled por defecto, sin callers de emisión/verificación).
- **Revisar si**: el piloto necesita visibilidad cloud de NC, se opera multi-terminal, o se habilita DSI-6.
