# Núcleo de inventario — R19: la sesión de conteo físico deja de perderse

Cierra el requisito legal que hoy no tiene de dónde leerse: **la nube no guarda el conteo, guarda sólo su efecto contable**. Sin el documento persistido no puede producir las listas firmadas del Reglamento (`R-05`) ni los registros a disposición de la Administración (`R-06`).

**Rama:** `feat/inventory-count-session-persistence` · **Base:** `main` @ `0fc3aec5` · **Rigor:** `docs/inventario_marco_normativo.md` (NORMA, no práctica).

## Specs

- **S10** — Decisión del owner (verbatim): *"PDF del servidor (precedente de ventas)"*. La lista firmable por hoja se emite **en el servidor como PDF**, siguiendo el precedente de ventas.
- **S11** — **NORMA**: Reglamento de la Ley 822 (Decreto 01-2013), art. 33 → `R-05` inventario físico al fin del año con *"listas originales firmadas y fechadas en cada hoja por las personas que hicieron el recuento físico"*; `R-06` registros equivalentes y listas de las tomas periódicas **a la orden de la Administración**.
- **S12** (derivada de S11) — **lo que hoy se descarta tiene que persistirse**: `actorLabel`, `countedAt`, `disputed` y `notes` de cada conteo, más la identidad del insumo (`insumoName`, `uom`) y la **cantidad teórica congeladas en el registro**. Congelarlas no es normalizar de menos: la hoja firmada tiene que poder **reimprimirse idéntica dentro de años**, y si el nombre del insumo cambió, el papel no cambia con él. Mismo principio que el costo congelado del kardex.
- **S13** — La sesión se persiste **en el mismo camino de escritura** que hoy aplica la varianza, y la persistencia entra en **la misma transacción** y bajo la **misma idempotencia** (`sourceDocumentId = sessionId`) que ya tiene el ajuste. Un reintento del POS no puede duplicar ni la sesión ni el asiento.

## Reconocimiento (evidencia verificada, `path:line`)

| Qué | Dónde |
|---|---|
| Ruta de escritura | `inventory-movement.controller.ts:418` (`@Post('count-sessions')`), handler `:429`, `SyncTransportGuard` + `sync:push` |
| DTO | `dto/count-session-document.dto.ts:80` |
| Servicio | `count-session.service.ts:37` — RLS `:52`, idempotencia `:54-60`, escritura `:126` y `:152-156` |
| **La sesión NO se persiste** | no hay `@Entity` con `CountSession`; `sessionId` sólo sobrevive como `sourceDocumentId` del movimiento |
| Molde de persistencia | `entities/shrinkage.entity.ts` + `1809950000000-AddObservationToShrinkages.ts` (R20) |
| Patrón RLS a copiar | `1809940000000-CreateInsumoMarketPrices.ts`: `ENABLE` + `FORCE` RLS y 4 políticas por comando vía `resolveTenantRlsPredicate()` |
| Registro en el módulo | `inventory.module.ts:18` (import) → `:87` (`forFeature`) |
| Próximo timestamp libre | **`1809960000000`** (después de `1809950000000`) |
| Manifiesto del gate | `apps/admin_backend/scripts/schema-rls-coverage-manifest.txt`, formato `<tabla>|<clasificación>` |
| Quién falla sin manifiesto | `scripts/verify-schema-build.sh` (`:288` lectura, `:1130` fallo) + CI. **`tenant-rls-coverage.db.spec.ts` NO falla**: usa su propio manifiesto de fixture (`:160-166`) |
| Host de la ruta de lectura | `controllers/inventory-reports.controller.ts:26` (`@Controller('inventory/reports')`, humano). Una ruta nueva en un controller humano existente **no** necesita declaración de transporte |
| Precedente de PDF | `sales/services/sales-export.service.ts:15` (`pdfkit`), `:105` `buildPdfBuffer`; `Content-Disposition` en `sales/controllers/reports.controller.ts:183-190` |
| Harness de spec DB | `test/support/migration-built-schema.helper.ts:116`; plantilla más cercana `inventory/shrinkage.service.db.spec.ts` |

### El hallazgo que define la tarea

El DTO trae **9 campos sin destino** — `warehouseId`, `warehouseName`, `status`, `notes`, `movementReferences`, los `id`/`insumoName`/`uom` de cada línea y, con peso legal, `actorLabel` / `countedAt` / `disputed` / `notes` de cada conteo. Hoy el sistema **no puede decir quién contó, cuándo, ni quién marcó una discrepancia**. No falta un reporte sobre datos existentes: **son datos que se tiran.**

## Decisión de diseño (S12)

Dos tablas, no tres:

- **`count_sessions`** — cabecera. Muta (`status`), así que `direct:SIUD`.
- **`count_session_entries`** — una fila por conteo, con `insumo_id` + `insumo_name` + `uom` + `theoretical_quantity` **congelados** y el `is_approved` / `is_disputed` de la línea. **Append-only**: el registro de quién contó no se edita.

No se copia el molde `shrinkages` + `shrinkage_details` porque ahí los detalles son *componentes de un documento*; acá cada fila es **evidencia de un acto de conteo**, y la evidencia no se corrige: se agrega otra.

## Tareas

| id | Tarea | Estado |
|---|---|---|
| T1 | `count_sessions` + `count_session_entries`: entidad, migración `1809960000000`, entrada en el manifiesto RLS, y **spec DB en rojo** que afirme lo observable | ✅ revisado (L2) |
| T2 | Persistir la sesión en `replayCountSession`, **en la transacción y la idempotencia existentes** (S13): que el spec de T1 pase a verde sin tocar aserciones | — |
| T3 | Endpoint de la lista imprimible en `inventory-reports.controller.ts` + PDF del servidor (S10), con espacio de firma y fecha **por hoja** | — |
| T4 | Cerrar el ciclo: `npm run lint`, `npm run build`, spec DB contra `omnifood_rig`, y verificación de los dos caminos (sesión nueva / reenvío idempotente) | — |

## Log

- **L1** 2026-10-14 — Reconocimiento delegado (`gentle-ai-explore`) y decisión del owner sobre el formato (S10). Se confirma el hueco: 9 campos del DTO sin destino, incluidos los que sostienen `R-05`. Diseño fijado en dos tablas con identidad y teórico congelados y entries append-only. Trampa registrada antes de pisarla: el gate que falla por una tabla nueva es `verify-schema-build.sh`, **no** el spec de cobertura RLS (que usa su propio fixture).
- **L2** 2026-10-14 — **T1 entregado por worker y aceptado tras revisión.**
  - **El rojo es el correcto, y eso se probó, no se afirmó**: 2/2 fallan en `expect(headers).toHaveLength(1)` con el esquema por migraciones levantado limpio (sin `EntityMetadataNotFoundError` ni ruido de fixture), y el camino de varianza del mismo run sí ejecutó. El fallo es *el servicio no persiste*, que es exactamente lo que T2 arregla.
  - **Verificado contra Postgres real**: `verify-schema-build.sh` pasa en sus dos escenarios **y** una lectura directa de `pg_policies` confirma `count_sessions` con S/I/U/D y `count_session_entries` con **sólo S/I**, ambas con `relforcerowsecurity=true`. La garantía de append-only la da la **ausencia de política**, no un trigger: es RLS haciendo de contrato.
  - **La aserción de identidad congelada discrimina**: compara contra el `insumoName`/`uom` del **documento**, con el del catálogo sembrado distinto a propósito. Un servicio que relea el catálogo falla la prueba. No es una aserción que pasa por casualidad.
  - **El `down()` es mejor de lo esperado**: se niega a borrar evidencia poblada y —el detalle que importa— **levanta `FORCE RLS` para su propio conteo**, que si no devolvería cero filas y habría borrado la evidencia en silencio.
  - **Dos desvíos del worker, aceptados con su razón**: (a) agregó `entry_index` a la identidad de la entry, sin el cual dos conteos sobre la misma línea chocan contra la restricción única de idempotencia; (b) dejó `created_at`/`updated_at` de la cabecera como timestamps **del servidor**, mientras los instantes de evidencia (`cutoff_at`, `posted_at`, y el `counted_at` de cada entry) son **del cliente**. Es el mismo reparto que hace el kardex (bookkeeping del servidor, instante del evento del cliente) y queda escrito acá para que no se lea como omisión.
  - **Obligación que T2 NO puede olvidar**: las entidades todavía **no** están registradas en `app.module.ts` (`entities[]`) ni en `inventory.module.ts` (`forFeature`). Sin las dos, el spec pasa (lo registra él mismo) y **producción revienta** con `EntityMetadataNotFoundError` en el primer conteo real. Es la trampa #6 de esta sesión, otra vez, y ahora está anunciada antes de pisarla.
  - Verificación: spec RED (2/2, corrido dos veces), `LINT_EXIT=0` sobre los 4 archivos tocados, `BUILD_EXIT=0`, `GATE_EXIT=0`.
