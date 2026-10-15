# Pre-integración: re-verificación del núcleo de inventario (v2)

Re-ejecutar **desde cero** el flujo real del núcleo de inventario contra el **candidato de integración** (`feat/inventory-count-session-persistence` @ `8e456a36` = `main` + lo nuestro), porque eso es lo que se integraría y lo que iría en el **release del POS**, y no queremos que afecte producción. La v1 (`nucleo-inventario-verificacion.md`, base `main@12a5336c`, 2026-08-27) encontró los gaps; los arreglos vinieron después. **Esta corrida responde una sola pregunta: ¿los arreglos son reales, medidos contra la base real y el backend vivo?**

**Rango verificado:** de `bcf6f7cf` (2026-10-13, commit anterior a la valuación) a `8e456a36` → **85 commits** (53 de `main` + 32 nuestros). La valuación entró por **PR #926** (`feat/inventory-cost-or-market-kardex`).
**Cierre:** no hay commit de código de producto; el cierre es el documento de evidencia `docs/audits/inventory-core-flow-truth-v2.md` + la actualización de memoria.
**Deliverable v1 que éste re-verifica:** `docs/audits/inventory-core-flow-truth-v1.md`.

> **Advertencia de alcance, para que no se lea mal:** el lote de inventario (`c3709c6c` valuación, `b8b944d2` escrituras del kardex, R1–R20) **ya está en `origin/main`**. Lo único que le falta a `main` son nuestros **32** commits. Pero el *flujo* depende de las dos cosas, y el release del POS empaqueta las dos: por eso la verificación se corre sobre el candidato entero y no sobre un lado.

## Specs

- **S1** — Instrucción del owner (verbatim): *"Ok, lo que quiero que verifiquemos es eso si. Todo esto que trabajamos nació a raiz que hicimos las pruebas del flujo que te comenté y nos dimos cuenta de muchos gaps. Procedamos a trabajar en todo eso hasta los commits actuales y el siguiente paso era verificar todo desde 0 nuevamente. Es la verifiacion que debemos hacer desde el primer commit relacionado a la valuacion hasta el ultimo actual, que es todo lo nuevo que se integraría a main y el nuevo releasel del POS, que queremos que no afecte production, y por eso verificaremos antes de integrar"*.
- **S2** — El origen (verbatim): *"Pero entre todos estos commits también tocamos el nucleo del inventario, no? Por que estabamos haciendo pruebas e2e desde las compras, ingreso de stock para insumos, ventas de productos con recetas, descargue, kardex y todo ese flujo?"*
- **S3** — Heredadas de la v1 y todavía vigentes (verbatim de `nucleo-inventario-verificacion.md`): *"Recorrer compra→UOM→CPP→receta→producción→venta→descargue→merma en rig/tenant de prueba y documentar qué se rompe."* · *"Entregable: mapa de brechas verificado con evidencia `path:line` + registro del flujo real paso a paso, marcando dónde el sistema miente o se detiene."* · *"Qué NO hace: no escribe código de producto (solo, si hace falta, datos de prueba en el tenant de prueba)."* · *"insumos, recetas, kardes, costos, margenes, y todo ese nucleo core del sistema"*.
- **S4** — **SOHO es producción con tablet entregada y no se toca** (v1-S7): el flujo se ejercita en el rig local o en un tenant de prueba, **nunca** sobre datos de SOHO.
- **S5** — Toda brecha se **confirma o refuta contra Postgres real y el backend vivo**, no por inspección de código (v1-S8). Y su recíproca, que es el corazón de esta corrida: **un arreglo tampoco se da por bueno por leerlo — se mide.**
- **S6** — No hay commit de código de producto. Si la verificación destapa un defecto, se **abre una tarea con su evidencia**; no se arregla dentro de la verificación.
- **S7** — Del checklist del S23 (L9 de `identidad-empresa-paridad.md`): el S23 tiene driver de impresión **simulado**, así que la mitad de papel no se puede cubrir; la pasada del aparato verifica estado, no papel.

## Lo que la v1 encontró — y lo que esta corrida tiene que mostrar

Cada fila es un objetivo de re-chequeo. **Ninguna se da por arreglada sin medirla.**

| Hipótesis / bug v1 | Qué dijo la v1 | Qué tiene que mostrar la v2 |
|---|---|---|
| **H1** — CPP sobreestimado cuando `consumptionUom ≠ purchaseUom` | **CONFIRMADA** (L6): el factor de conversión se ignoraba; el sync manda `quantity` en base y `unitCost` crudo | El CPP del insumo con factor ≠ 1 cuadra con el costo de compra real |
| **H2** — la guarda UOM vive en `PurchaseService`, servicio **sin consumidores** | **CONFIRMADA** (L6): `POST /api/insumos` con `purchaseUom:"lb"`, `consumptionUom:"kg"`, `factor:1` daba **201** | El mismo POST ahora **rechaza** (o hay una tarea abierta que lo explique) |
| **H3** — el dashboard descarta `ingredientType`/`componentUom` → una SUB_RECIPE se persiste como `INSUMO` con uuid de producto | **CONFIRMADA** (L9) | Una sub-receta creada desde el dashboard se persiste con el tipo correcto y la venta **no** la salta en silencio |
| **H4** — `compensationForKardexId` siempre null contra Postgres real | Confirmada en el mapa (L11) | La anulación de una venta deja la compensación **enlazada** al asiento original |
| **H5** — `explodeRecursive` no tiene caller productivo | **CONFIRMADA** (L9) | El multi-nivel es alcanzable, o queda declarado como caso abierto con su razón |
| **H6** — FEFO en el POS vs "no vencidos, luego batchId" en el backend | **CONFIRMADA** (L13) | La misma operación valoriza **igual** en los dos lados |
| **H7** — el dispatcher de la alerta forense es no-op (umbral >C$1.500) | Confirmada en el mapa (L14/L15) | El umbral persistido **notifica**, o queda declarado con dueño |
| **H8** — sin superficie humana de costo teórico ni margen bruto por plato | Confirmada en el mapa (L12) | Existe, o queda declarada como brecha de producto con dueño |
| **T4-1** — el cierre de producción revienta con **HTTP 500** (`expirationDate.getTime is not a function`) | **T4 quedó BLOQUEADO** (L10) | El cierre de producción **cierra** consumiendo de un lote perecedero |
| **T4-2** — el vencimiento se corre un día (`2026-12-31` → `2026-12-30`) | **BLOQUEADO** (L10) | `producedExpirationDate` se guarda **igual** a lo enviado |
| **Nuevo: R19** | No existía en la v1 | La sesión de conteo **se persiste** y la lista firmable sale del servidor (S10–S15-bis de `nucleo-inventario-conteo-persistente.md`) |
| **Nuevo: identidad + `ruc`** | No existía en la v1 | La identidad de empresa viaja por el snapshot y el `ruc` local **no se borra** (task 31) |

## Entorno (receta de la v1, con su lección)

| Elemento | Valor / cómo |
|---|---|
| Base | **`omnifood_rig`** — aislada; **no** se tocan `omnifood` ni `omnifood_test` |
| Esquema | Debe ser el **del candidato**: correr las migraciones hasta la última de esta rama (`1809980000000`) |
| Backend | vivo contra el rig (`DB_DATABASE=omnifood_rig PORT=3100 node dist/main.js`) |
| Tenant | de prueba (la v1 usó `e05bf002-b1d3-45f2-a46a-3592e1cc1431`, slug `pilot-caf---pruebas`) |
| Transporte de escritura | **`SyncTransportGuard`**: casi todo el núcleo exige **credencial de dispositivo**, no token de usuario. Su emisión es T1b de la v1 |
| **Lección de la v1 que hay que respetar** | **`/tmp` se barrió a mitad de sesión** y borró el secreto de la credencial. **No dependas de `/tmp` entre pasos**, y reemití el token en línea (TTL corto) en cada comando que lo use |

## Tasks

| ID | Spec | Tarea | Estado |
|---|---|---|---|
| **V1** | S3, S4 | Línea base del candidato: rig con el esquema del candidato, backend vivo, tenant de prueba, credencial de dispositivo, y snapshot del estado inicial | — |
| **V2** | S5 | **H1 + H2**: compra con `factor ≠ 1` (¿el CPP cuadra?) y `POST /api/insumos` con factor 1 y UOM distintas (¿rechaza?) | — |
| **V3** | S5 | **H3 + H5**: sub-receta desde el dashboard (¿qué se persiste?) y multi-nivel (¿es alcanzable?) | — |
| **V4** | S5 | **T4-1 + T4-2**: cierre de producción consumiendo de lote perecedero (¿cierra?) y `producedExpirationDate` (¿se corre un día?) | — |
| **V5** | S5 | **H4**: anulación de venta con receta (¿la compensación queda enlazada?) | — |
| **V6** | S5 | **H6**: mismo insumo perecedero consumido por POS y por cloud (¿valorizan igual?) | — |
| **V7** | S5 | **H7 + H8**: umbral forense (¿notifica?) y superficies de costo teórico/margen (¿existen?) | — |
| **V8** | S5 | **Mermas y ajustes** en el candidato: merma de insumo, merma de plato, conteo físico | — |
| **V9** | S5 | **Lo nuevo de esta rama**: sesión de conteo persistida + lista firmable (R19) e identidad/`ruc` (task 31), ejercitados en el mismo rig | — |
| **V10** | S3, S6 | Documento de cierre `docs/audits/inventory-core-flow-truth-v2.md`: flujo paso a paso, cada fila de arriba **medida** (arreglada / sigue rota / no alcanzable), `path:line`, y **qué bloquea la integración** | — |

## Trampas verificadas (de la v1, no re-pisar)

- **Los specs mockean la propia guarda**: rutas como `test/sales/sync-batch.e2e-spec.ts` hacen `overrideGuard(SyncTransportGuard)` **y** mockean el servicio. Verifican cableado, no comportamiento. La verificación va por el **backend vivo**.
- **El mock le entrega un `Date` real donde la base entrega un string** — así se escondió el 500 de T4-1 durante toda la vida del módulo. Cualquier verificación de fechas contra Postgres real es obligatoria.
- **Solo 4 de 44 specs de inventario corrían contra Postgres real** (v1). Un subconjunto verde no es evidencia de nada.
- **Un `/tmp` que se barre a mitad de sesión** ya costó una credencial: no guardar secretos ahí.
- **Los tags de fecha**: `batches.expiration_date` es un `date` de Postgres (string), no un instante; el contrato de días calendario vive en `src/core/database/calendar-day.ts`.

## Log

- **L1** 2026-10-15 — **Pedido del owner (verbatim, íntegro)**: *"Ok, lo que quiero que verifiquemos es eso si. Todo esto que trabajamos nació a raiz que hicimos las pruebas del flujo que te comenté y nos dimos cuenta de muchos gaps. Procedamos a trabajar en todo eso hasta los commits actuales y el siguiente paso era verificar todo desde 0 nuevamente. Es la verifiacion que debemos hacer desde el primer commit relacionado a la valuacion hasta el ultimo actual, que es todo lo nuevo que se integraría a main y el nuevo releasel del POS, que queremos que no afecte production, y por eso verificaremos antes de integrar"*. Aclaración previa del owner, también verbatim: *"Pero entre todos estos commits también tocamos el nucleo del inventario, no? Por que estabamos haciendo pruebas e2e desde las compras, ingreso de stock para insumos, ventas de productos con recetas, descargue, kardex y todo ese flujo?"*.
- **L2** 2026-10-15 — **Alcance medido y una corrección de encuadre, dicha de frente.** El rango pedido son **85 commits** (`bcf6f7cf..8e456a36`). **Pero el lote de inventario ya está en `origin/main`**: verificado uno por uno que `c3709c6c` (valuación), `b8b944d2` (escrituras del kardex), `71053b61`, `46734983`, `886fb27a` y `0fc3aec5` son **ancestros de `origin/main`** y que **ninguno** de ellos está entre nuestros 32. Es decir: lo único que le falta a `main` son nuestros 32 commits; el flujo, en cambio, depende de los 85. Por eso la verificación se corre sobre el **candidato entero**.
- **L3** 2026-10-15 — **El instrumento de la v1 se reusa en vez de reinventarse.** `nucleo-inventario-verificacion.md` tenía specs (S1–S8), 8 hipótesis (H1–H8) y la receta de entorno con sus trampas; su corrida confirmó H1, H2, H3, H5 y H6, dejó **T4 bloqueado** por dos bugs concretos (el 500 de `expirationDate.getTime` y el vencimiento corrido un día) y publicó `docs/audits/inventory-core-flow-truth-v1.md`. Esta corrida **no cambia el método: cambia el candidato**, y su valor está en medir **qué de todo eso quedó realmente arreglado** — porque un arreglo tampoco se da por bueno por leerlo.
- **L4** 2026-10-15 — **Sin código de producto.** La verificación corre en el rig y en el tenant de prueba (S4); cualquier defecto que aparezca se **abre como tarea con su evidencia**, no se arregla acá (S6).
