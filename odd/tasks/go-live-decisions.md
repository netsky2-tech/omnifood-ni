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
