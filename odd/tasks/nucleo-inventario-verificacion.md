# Núcleo de inventario: verificación end-to-end del flujo real

Verificar contra `main` si el flujo compra → conversión de unidades → costos → receta → producción → venta → descargue → perecederos → mermas realmente funciona, ejercitándolo en un entorno de prueba en vez de confiar en los 44 specs (40 de los cuales son unitarios con mocks). Entregable: registro del flujo paso a paso + mapa de brechas confirmadas o refutadas con evidencia. **No escribe código de producto.**

**Base:** `main` @ `12a5336c`. Este worktree (`fix/minor-sweep`) es byte-idéntico a `main` en todo el núcleo de inventario.
**Cierre:** no hay commit de código; el cierre es el documento de evidencia + la actualización de memoria.

## Specs

- **S1** — "Recorrer compra→UOM→CPP→receta→producción→venta→descargue→merma en rig/tenant de prueba y documentar qué se rompe."
- **S2** — "Entregable: mapa de brechas verificado con evidencia `path:line` + registro del flujo real paso a paso, marcando dónde el sistema miente o se detiene."
- **S3** — "Qué NO hace: no escribe código de producto (solo, si hace falta, datos de prueba en el tenant de prueba)."
- **S4** — "basate en el codebase de main"
- **S5** — "insumos, recetas, kardes, costos, margenes, y todo ese nucleo core del sistema"
- **S6** — "SOHO inició con productos simples y eso no nos dio la oportuniad de probar realmente todo el flujo desde compra, conversion de unidades, manejo de los costos, construcción de receta, production, venta, ver el descargue y calculo correcto de costos, el tema de los perecederos, mermas y toda esa parte de compra/venta/inventario que requiere de mucho cuidado."
- **S7** — SOHO es producción con tablet entregada y `odd/tasks/soho-estado-y-pendientes.md` §7 dice "Producción: no se toca": el flujo se ejercita en rig local o tenant de prueba, nunca sobre datos de SOHO.
- **S8** — Toda brecha que la auditoría read-only previa (Engram `inventory-core-truth-main`, obs. 10145) afirma por inspección de código debe **confirmarse o refutarse** contra Postgres real y el backend vivo antes de entrar al mapa como hallazgo.

### Hipótesis a confirmar o refutar (derivadas de S8)

| # | Hipótesis | Evidencia declarada |
|---|---|---|
| H1 | CPP cloud se sobreestima ×factor cuando `consumptionUom ≠ purchaseUom`: el sync manda `quantity` en base y `unitCost` crudo, y el backend no divide por el factor | `sync_service.dart:2343-2353`, `inventory-purchase.service.ts:703-739`, `cost-calculator.service.ts:101-113` |
| H2 | El guard UOM (factor=1 con UOM distintas → rechazar) vive en `PurchaseService`, servicio **sin consumidores**; las escrituras de insumo y la compra manual del dueño no lo llaman | `uom-catalog.ts:299-373`, `purchase.service.ts:61-73`, `insumo.controller.ts:104-163`, `purchases-form.tsx:118-171` |
| H3 | El dashboard descarta `ingredientType`/`componentUom`, así que una SUB_RECIPE se persiste como `INSUMO` con uuid de producto → la venta la salta con warn (sub-deducción silenciosa) y la producción falla | `RecipeForm.tsx:169-176`, `recipe.controller.ts:209-213`, `recipe.service.ts:170-183`, `invoices.service.ts:1752-1756`, `production.service.ts:470-481` |
| H4 | `compensationForKardexId` es siempre null contra Postgres real: la compensación busca `reason='invoice:<id>'` pero los SALE se guardan con `sourceDocumentId` y `reason` nulo; solo el mock lo ve | `invoices.service.ts:1907-1921`, `:1803`, `invoices.service.spec.ts:1955-1972` |
| H5 | `explodeRecursive` (multi-nivel, ciclo, profundidad 5) no tiene ningún caller productivo: venta, producción y merma usan `explode()` single-level | `bom-explosion.service.ts:44-100`, `production.service.ts:263,443`, `invoices.service.ts:1982`, `shrinkage.service.ts:176` |
| H6 | Perecederos: el POS consume FEFO (`expiration_date ASC`) y el backend consume "no vencidos primero, luego batchId ASC" → misma operación valorizada distinto | `batch_dao.dart:6`, `batch-costing.service.ts:26-41` |
| H7 | El dispatcher de alerta forense es no-op: la alerta >C$1,500 se persiste pero nunca se notifica al admin | `forensic-alert.service.ts:19-24`, `inventory.module.ts:129-132` |
| H8 | No hay superficie humana del costo teórico ni del margen bruto por plato: `calculateRecipeTheoreticalCost` no tiene callers y `calculateDraftTheoreticalCost` solo lo llama su test | `cost-calculator.service.ts:128-183`, `recipe_view_model.dart:411-472`, `recipe_view.dart` |

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S1, S7 | Línea base del rig: Postgres local + backend vivo + tenant de prueba con insumos, productos y recetas; snapshot de estado inicial | ✅ L5 |
| T1b | S1, S7 | Credencial de device-sync en el rig: desbloquea los writes del núcleo (`SyncTransportGuard`) | — |
| T2 | S1, S6, S8 | Etapa compra: factura, identidad fiscal, FX por fecha, entrada de kardex; ejercitar factor=1 y factor≠1 (H1, H2) | — |
| T3 | S1, S6, S8 | Etapa receta: crear versión con insumo simple y con sub-receta desde el dashboard; verificar qué se persiste (H3, H5) | — |
| T4 | S1, S6, S8 | Etapa producción: orden de producción con sub-receta y sin ella; costo unitario derivado = valor consumido / cantidad producida | — |
| T5 | S1, S6, S8 | Etapa venta → descargue: venta de producto con receta, venta sin receta, anulación con compensación (H4) | — |
| T6 | S1, S6, S8 | Etapa costos y márgenes: CPP resultante vs. CPP del POS; valorización; exposición de costo teórico y margen (H8) | — |
| T7 | S1, S6, S8 | Etapa perecederos: compra con vencimiento, consumo y valorización POS vs. cloud (H6) | — |
| T8 | S1, S6, S8 | Etapa mermas y ajustes: merma de insumo y de plato, conteo físico, umbral forense (H7) | — |
| T9 | S2, S3, S8 | Documento de cierre: registro del flujo paso a paso + mapa de brechas confirmadas/refutadas con `path:line`; actualizar Engram y los docs desactualizados del roadmap | — |

## Log

- **L1** 2026-08-27 — Owner: "Necesito entremos de lleno en la parte de insumos, recetas, kardes, costos, margenes, y todo ese nucleo core del sistema. Como sabes, SOHO inició con productos simples y eso no nos dio la oportuniad de probar realmente todo el flujo desde compra, conversion de unidades, manejo de los costos, construcción de receta, production, venta, ver el descargue y calculo correcto de costos, el tema de los perecederos, mermas y toda esa parte de compra/venta/inventario que requiere de mucho cuidado. Ahora que tenemos a soho operando con normalidad en modalidad producto simple y que vimos que funciona bien, toca solidificar esta otra parte del producto"
- **L2** 2026-08-27 — Owner: "basate en el codebase de main". Verificado: `main` = `12a5336c`, sincronizado con `origin/main`; el núcleo de inventario en este worktree es byte-idéntico a `main` (solo difieren `owner_dashboard/src/features/onboarding/setup-center-view.tsx` y `receipt_58mm_formatter.dart`).
- **L3** 2026-08-27 — Auditoría read-only delegada (`gentle-ai-explore`, task `mv7d5nsg-1-lnaa`). Resultado: de 44 specs de inventario solo 4 corren contra Postgres real; el resto es unitario con mocks. Producida la tabla de hipótesis H1–H8 de arriba. Guardada en Engram como `inventory-core-truth-main` (obs. 10145).
- **L4** 2026-08-27 — Owner eligió la opción "Verificar el flujo real end-to-end": ejercitar el flujo en rig/tenant de prueba y documentar qué se rompe, sin escribir código de producto. Esto fija S1–S3 y el alcance de T1–T9.
- **L5** 2026-08-27 — **T1 cerrado.** Rig aislado en su propia base `omnifood_rig` (no se tocaron `omnifood` ni `omnifood_test`, que otras sesiones y las suites DB comparten). El esquema local `omnifood` estaba **4 migraciones atrás de main** y **sin `uom_catalog`**: ninguna prueba local había corrido contra el esquema de main. Tras `nest build`, el rig quedó en 127 migraciones, 87 tablas, `uom_catalog` con 28 entradas, triggers de inmutabilidad del kardex (`trg_inventory_kardex_immutable`, `trg_inventory_kardex_running_balance`, `inventory_kardex_append_only_guard`, `trg_kardex_correction_immutable`) y **RLS con `relforcerowsecurity = true`** en `insumos`, `inventory_kardex`, `recipes` y `batches`.
  Backend vivo en `:3100` contra el rig; login en `POST /api/identity/login` (sin prefijo de versión; el health sí es `/api/v1/health`) con `{email, pass, tenantSlug}`; tenant `e05bf002-b1d3-45f2-a46a-3592e1cc1431` slug `pilot-caf---pruebas`, OWNER `sofia@omnifood.ni`.
  **Línea base de datos:** 29 insumos —**todos con `purchaseUom = consumptionUom` y `conversionFactor = 1.0000`**—, 8 productos **todos `SIMPLE`**, **0 recetas**, 29 movimientos de kardex todos `INITIAL_STOCK`, **0 compras**, **0 lotes**.
  **Hallazgo T1-1:** el propio fixture de pruebas está construido con factor=1, sin recetas, sin compras y sin lotes. Es decir: **ni el fixture ejercitó conversión de unidades, BOM, compras ni perecederos.** Ejercitar H1 exige primero configurar un insumo con `purchaseUom ≠ consumptionUom` por la API real.
  **Hallazgo T1-2:** el esquema usa **dos columnas paralelas de existencia** (`stock` y `existencia_actual`) y el costo vive en `costo_promedio_nio`; las dos columnas de stock coinciden hoy. Divergencia potencial entre dos fuentes de verdad de existencia.
  **Hallazgo T1-3:** columnas en camelCase entrecomillado (`"purchaseUom"`, `"consumptionUom"`, `"conversionFactor"`, `"parLevel"`) mezcladas con snake_case (`existencia_actual`, `costo_promedio_nio`, `negative_stock_policy`) en la misma tabla.
- **L6** 2026-08-27 — **T2 (etapa compra) ejercitada contra el rig. H1 y H2 CONFIRMADAS con números reales.**
  **H2 confirmada (guarda UOM no aplicada en ningún camino alcanzable).** `POST /api/insumos` aceptó `purchaseUom="lb"`, `consumptionUom="kg"`, `conversionFactor=1` con **HTTP 201**. La compra manual (`POST /api/inventory/purchases/manual`) comprometió la compra de ese insumo inválido y persistió stock 10 kg a CPP 100 NIO. S3 manda rechazar exactamente ese caso. La guarda existe en `uom-catalog.ts:299-373` pero no está cableada ni a la escritura de insumos ni a la ruta de compra viva.
  **H1 confirmada (el factor de conversión se ignora por completo).** Insumo `ZZ TEST Harina lb->kg VALIDO`: `purchaseUom=lb`, `consumptionUom=kg`, `conversionFactor=0.4536`. Compra de 10 lb a C$100/lb:

  | | sistema (persistido) | correcto |
  |---|---|---|
  | `inventory_kardex.quantity` | **10.0000** | 4.5360 kg |
  | `inventory_kardex.unit_cost_nio` | **100.0000** | 220.4586 NIO/kg |
  | `inventory_kardex.stock_after` | **10.0000** | 4.5360 |
  | `inventory_kardex.average_cost_after_nio` | **100.0000** | 220.4586 |
  | `insumos.stock` = `existencia_actual` | **10.0000** | 4.5360 |
  | `insumos.costo_promedio_nio` | **100.0000** | 220.4586 |

  El total valuado coincide por casualidad (10 × 100 = 4.536 × 220.4586 = C$1000) porque un factor de conversión puro conserva el valor total. **La distorsión está en cantidad y costo unitario, no en el total** — y son justamente cantidad y costo unitario los que alimentan el descargue de recetas, las alertas de par/stock mínimo y el costo del plato.
  Agravante: el kardex es **append-only por trigger**, así que estos valores quedaron **congelados** en el ledger; la única corrección posible es un movimiento compensatorio. No hay arreglo silencioso.
  **Hallazgo T2-1 (bloqueo estructural del plan).** Todos los writes del núcleo exigen `SyncTransportGuard` (credencial de dispositivo), no token de usuario: `POST /inventory/purchases` (:240), `/shrinkage` (:403), `/count-sessions` (:443), `/production-orders/close` (:464), `/recipes/versions` (:486) y `/movements/sync` (:150). Con token de OWNER solo son alcanzables el preview (`/inventory/purchase`), la compra manual (`/purchases/manual`) y la corrección (`/purchases/:id/correction`). Por eso los specs que mockean esas guardas "pasan" sin ejercitar nada. **T1b (credencial de device-sync en el rig) pasa a ser prerequisito de T4, T5, T7 y T8.**
  Nota de método: `POST /inventory/purchases` devolvió `401 Invalid device access token`, lo que reveló el bloqueo.
