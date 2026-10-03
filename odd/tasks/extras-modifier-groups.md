# Extras / Modificadores — grupos reutilizables, web-first y con sync

**Estado:** diseño aprobado, implementación no iniciada.
**Origen:** pregunta del cliente en la entrega del equipo — *"¿se pueden agregar extras a los pedidos?"*
**Decisor:** dueño del producto. Cuatro decisiones tomadas (ver abajo).

---

## 1. Por qué existe este documento

El cliente preguntó si la app permite extras. La respuesta honesta es **no funciona**, y no por falta de
configuración:

- El **camino de lectura descarta las opciones**. `InventoryMapper.toProductDomain` recibe `variants` y
  `modifiers` como parámetros opcionales con default `const []`, y su **único** llamador
  (`inventory_repository_impl.dart:152`) no se los pasa. Todo producto cargado del repositorio tiene
  `availableModifiers` vacío.
- El **camino de escritura está bien**: `productDao.replaceProductOptions` corre en una sola transacción
  (comentario B4a) — no es ahí el problema.
- Consecuencia verificada en el aparato (S23): cargué `Extra Shot +15` en *Americano 8oz*, el editor lo
  listó, **GUARDAR CAMBIOS no dio error**, y al reabrir la lista estaba vacía y el POS agregó el producto
  directo al carrito sin ofrecer el selector.
- El selector es **código inalcanzable**: `sale_view.dart:1003` decide correctamente *"si no hay
  modificadores, agregá directo"*. Lógica correcta sobre dato vacío.

**Un parche provisorio fue evaluado y descartado.** El aparato **nunca sube productos** (el allowlist de
salida no los incluye; los productos son autoría del backend vía `product.controller.ts`). Un arreglo local
daría extras que funcionan en una terminal, no llegan a la nube, y el siguiente delta los pisa: divergencia
silenciosa, que es exactamente la clase de defecto que ya costaron R-15, R-16 y el editor del BOH.

---

## 2. Decisiones tomadas

| # | Decisión | Elegido |
|---|---|---|
| 1 | ¿Parche provisorio del camino de lectura? | **No.** Directo al modelo de grupos |
| 2 | ¿Dónde se administran los grupos? | **Sólo la web.** La terminal queda de lectura |
| 3 | ¿Modificadores con cantidad (`2x extra shot`)? | **Sí, desde el arranque** |
| 4 | ¿Cómo se enganchan a las categorías? | **Normalizar a una identidad real** → implementado como **(A)**: reutilizar `catalog_values`, enganche por `code` |
| 4' | *(revisión 2026-10-03)* ¿Crear `product_categories` o reutilizar `catalog_values`? | **Reutilizar `catalog_values` (opción A).** Ver §7.3 y §8 |

### Costo de la decisión 4, dicho sin adornos

Elegir identidad de categoría es la opción correcta y **la más cara**: hoy la categoría es texto libre en
los dos lados, y hay que crear la entidad, backfillear desde los strings existentes, y tocar importador,
sync, catálogo y promociones. **Es casi la mitad del esfuerzo total y no entrega valor visible por sí sola.**
Se paga porque sin ella el enganche por categoría se rompe al renombrar una categoría, y porque el enganche
por categoría es justamente lo que hace que configurar extras sea fácil en vez de cargarlos 58 veces.

> **Corrección de la ronda 2 (2026-10-03):** la estimación anterior partió de una premisa falsa. La entidad
> de categoría **no hay que crearla**: `catalog_values` (`SALES_PRODUCT_CATEGORY`) ya existe, ya es única por
> tenant en `code`, ya se administra en `/catalogs` y **ya baja al POS por delta**. Lo que falta es solo el
> vínculo (`products.category_code` hoy guarda el nombre crudo de la hoja) y traer la categoría en el delta de
> productos. El costo real de la Fase 0 es una fracción del estimado, y el riesgo de "dos verdades" era más
> cercano de lo que parecía.

---

## 3. Cómo lo hace la industria (investigado)

- **Grupo reutilizable como entidad de primera clase** (*ModifierGroup* / *CatalogModifierList* en Toast,
  Square, Clover, Lightspeed). No modificadores sueltos por producto.
- **Enganche a categoría con herencia**: el grupo colgado de "Bebidas Calientes" aplica a todos los cafés.
  Es el mecanismo que hace la configuración fácil; el enganche por producto queda para excepciones.
- **Reglas como números**: `min_selected` / `max_selected`, no banderas. Obligatorio = `min ≥ 1`.
- **Precio por delta** sobre el precio base (el estándar); además existen sustitución, matriz por tamaño y
  modificadores anidados — fuera de alcance.
- **Offline-first**: la nube es dueña del catálogo, baja por delta a SQLite local, y **toda la validación y
  el cálculo pasan local**; el pedido va a un outbox.

## 4. Qué ya está construido (no hay que rehacerlo)

- El **precio** ya honra modificadores: `invoice_fiscal_calculator.dart:170`
  `(item.unitPrice * item.quantity) + item.modifiersTotal`.
- Los modificadores **ya salen en el ticket de cocina**: `receipt_58mm_formatter.dart:244` `'[MOD] ${mod.name}'`.
- **Ya salen en la factura**: `receipt_layout_formatter.dart:1527` (*Modifiers & Extras*).
- El payload de venta **ya los envía** (`sales_mapper.dart:632`) y el backend **ya los guarda** como
  snapshot de línea (`invoice_item_modifiers`, sin vínculo al producto — correcto para fiscalidad).

Lo que falta es **definirlos, con reglas, y bajarlos**.

---

## 5. Plan por fases

### Fase 0 — Categorías con identidad (reescrita tras la ronda 2: opción **A**, `catalog_values`)

> **Cambio de decisión (2026-10-03, §7.3 + §8):** se eligió **(A) reutilizar `catalog_values`
> (`catalog_type = SALES_PRODUCT_CATEGORY`) como única identidad de categoría**. No se crea
> `product_categories`: la entidad **ya existe**, ya es única por tenant en `code`, ya se administra en
> `/catalogs` y **ya baja por delta** con el token `categories` (`inbound-sync.service.ts:166-169`).
> El enganche de grupos es por **`code`**, la clave estable documentada; los renombres tocan `label`, no `code`.
> La identidad por `id` uuid queda disponible (`catalog_values.id`) para las FK que la necesiten de verdad.

- [x] ~~**T0.1** Entidad `product_categories` + migración~~ → **desaparece** (decisión A): sería la tercera
      verdad sobre categorías.
- [ ] **T0.1'** Importador de menú deja de escribir el nombre crudo de la hoja:
      `menu-import.service.ts:609` hoy hace `category_code: group.category`. Debe **derivar el `code`
      canónico** del nombre de hoja y **upsertear** la fila `SALES_PRODUCT_CATEGORY` que falte
      (nombre de hoja nuevo ⇒ code nuevo, `label` = nombre legible), de modo que `products.category_code`
      siempre referencie una fila existente.
- [ ] **T0.2'** Backfill de `products.category_code` existente: mapear los valores de texto libre actuales
      (incluidos los 58 productos de SOHO ya importados) contra `catalog_values.code`, creando las filas
      que falten.
      **Medido en la base de desarrollo (2026-10-03): el tenant SOHO tiene 58 productos y CERO filas
      `SALES_PRODUCT_CATEGORY`** (ni de ningún otro tipo). Sus codes son
      `CAFÉ CALIENTE`(16), `BEBIDAS`(12), `CAFÉ HELADO`(11), `COMIDA`(6), `DESAYUNOS`(5), `BATIDOS`(4),
      `POSTRES`(4): **el 100 % esta huerfano**. Con T0.1' el propio importador siembra las filas, asi que
      T0.2' solo tiene que arreglar los 58 registros ya existentes y decidir el mapeo conceptual.
      **No unificar automaticamente** `CAFÉ CALIENTE` con el code sembrado `BEBIDA_CALIENTE`: es la misma
      idea de negocio con otro nombre, y esa union la decide el dueno en `/catalogs`, no la adivina un script.
      **Produccion sigue sin inspeccionar** — correr la misma consulta antes de escribir el script.
- [ ] **T0.3'** Delta de productos traiga la categoría: agregar `categoryCode` (y `categoryName` si hace
      falta para mostrar) al mapeo de `inbound-sync.service.ts:504-525` y a `InboundSyncProductDto`
      (`inbound-sync.dto.ts:62-89`), y consumirlos en el ingest del POS
      (`sync_service.dart:3251` lee `map['category']`, que **nunca viene**).
- [ ] **T0.4'** Dashboard `/catalogs`: verificar que la administración de `SALES_PRODUCT_CATEGORY`
      existente alcance para crear/renombrar categorías del menú (alta/renombre de `label`, soft-delete con
      `is_active`). **No se construye pantalla nueva** salvo que falte algo.
- [ ] **T0.5'** Promociones: `Promotion.target_category_id` (`promotion.entity.ts:48`) y el enganche de
      grupos por `code` tienen que resolver contra la misma identidad. Dejar una sola verdad, no dos.

### Fase 1 — Modelo de grupos (backend + web)

- [x] **T1.1** Entidades + migración con RLS **(cerrada en `0d6e7f72`, revisión nativa aprobada)**:
      `modifier_groups` (name, min_selected, max_selected, allow_quantities, sort_order, is_active),
      `modifier_options` (group_id, name, price_delta, is_default, sort_order, is_active),
      `category_modifier_groups`, `product_modifier_groups`. Ver §9 por la forma exacta acordada.
- [ ] **T1.2** API REST: CRUD de grupos y opciones, y enganches por categoría y por producto.
- [ ] **T1.3** Resolución server-side de los grupos efectivos: categoría ∪ producto, con orden y overrides.
- [ ] **T1.4** Dashboard: pantalla de grupos (nombre, min/max, cantidades, opciones con delta y default) y
      el flujo principal **"pegar grupos a una categoría"**, más la excepción por producto mostrando lo
      heredado como heredado.

### Fase 2 — Bajada y espejo local

- [ ] **T2.1** Tipos de delta nuevos (`modifierGroups`, `categoryModifierGroups`, `productModifierGroups`)
      en `InboundSyncDeltasDto` (`inbound-sync.dto.ts:292`), su gating (`inbound-sync.service.ts:163-210`)
      y el ingest del POS (`sync_service.dart:3215-3410`).
- [ ] **T2.2** Tablas locales espejo + DAOs.
- [ ] **T2.3** **Resolver los grupos efectivos al cargar el producto** — el punto exacto donde hoy se
      descartan las opciones. Acá se cierra el defecto de raíz.
- [ ] **T2.4** *(redefinida por §7.1)* **Agregar las keys nuevas al set default de `parseRequestedTypes()`**
      (`inbound-sync.service.ts:427-444`). El POS **no manda `types`** (`sync_service.dart:3179-3197`), así
      que si la key no está en el default, el delta llega vacío y **silencioso** (no es un 4xx).

### Fase 3 — POS

- [ ] **T3.1** Selector agrupado: radio cuando `max=1`, checkbox cuando no, y cantidades cuando
      `allow_quantities`.
- [ ] **T3.2** Validación local de min/max al tocar AGREGAR (offline, sin red).
- [ ] **T3.3** Totales con cantidad y ticket de cocina `[MOD] 2x Extra Shot`.

### Fase 4 — Cierre

- [ ] **T4.1** El editor de opciones del BOH pasa a lectura, explicando que se administra desde la web
      (decisión 2). Esto elimina de raíz la clase de divergencia del editor del BOH.
- [ ] **T4.2** Retirar o corregir con el editor viejo los dos defectos del campo de dinero: el `0.0`
      pre-cargado que concatena (`15 → 0.015`, clase D-16) y el prefijo `$` en vez de `C$`.
- [ ] **T4.3** Sembrar el set real de SOHO y verificarlo en el S23:
      **Leche** (obligatorio 1/1: Entera, Descremada, Almendras +20, Soya +20) ·
      **Endulzante** (opcional 0/2: Normal, Sin azúcar, Stevia) ·
      **Extras** (opcional 0/3 con cantidad: Extra shot +15, Leche extra +10, Vainilla +15, Canela +5),
      todos colgados de la categoría de bebidas calientes.

---

## 6. Riesgos y preguntas abiertas

> **Estado (ronda 2, ver §7):** el riesgo del pull del POS quedó **resuelto a favor** (el POS no manda
> lista de tipos; manda el backend). El riesgo del dashboard quedó **resuelto: llama a producción**,
> no a staging. Queda abierto solo el punto de identidad de categorías, que la ronda 2 reabre con
> evidencia nueva.

- ~~**El pull del POS:** no se verificó qué `types` pide el dispositivo~~ → **resuelto en §7.1.**
- **Categorías por texto libre:** el enganche actual de promociones depende de `item.category` como string.
  La Fase 0 debe dejar claro si convive o migra, para no dejar dos verdades.
- ~~**El dashboard apunta a una API no confirmada.**~~ → **resuelto en §7.2: llama a `https://api.nhilospos.com`.**
  Queda como **defecto de documentación** en `apps/owner_dashboard/docs/staging-environment.md`.
- **Tamaños:** los productos de SOHO codifican el tamaño en el nombre (`Americano 8oz` / `12oz`). La
  industria usaría variantes. Fuera de alcance; no bloquea.

---

## 7. Ronda 2 de verificación (2026-10-03, worktree `feat/extras-modifier-groups`)

Scout read-only sobre el camino de sync + sonda al bundle publicado. Cambia el plan en un punto y liquida
dos riesgos.

### 7.1 El POS no pide tipos: manda el set default del backend (riesgo cerrado)

- `apps/pos_app/lib/data/services/sync_service.dart:3179-3197` — el pull arma `queryParams` solo con
  `sinceVersion`, `terminalId` y negociación OHAC, y llama `GET /v1/sync/inbound/deltas`. **No existe
  parámetro `types` en todo `apps/pos_app/lib`** (grep: cero golpes).
- `apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts:425-444` —
  `parseRequestedTypes()` devuelve un **set default hardcodeado** cuando `types` viene vacío:
  `products, catalogvalues, catalog_values, categories, insumos, recipes, recipeversions, recipe_versions,
  users, loyaltyprograms, promotions, customers, alerts, fiscal, fiscal_config, fiscalconfig`.
- `inbound-sync.dto.ts:19` — `types?: string` solo tiene `@IsString()`: **sin enum, sin allowlist**.
  `parseRequestedTypes` (`:446-451`) tokeniza en minúsculas; un token desconocido simplemente nunca
  matchea.
- **Modo de falla: entrega silenciosa vacía, nunca un 4xx.** Un tipo nuevo que no se agregue al set default
  es invisible para todas las terminales.

**Consecuencia:** T2.4 deja de ser "verificar que el POS pida los tipos nuevos" y pasa a ser
**"agregar las keys nuevas al set default del backend"**, que es el paso que se pierde y no avisa.

Checklist real para que un tipo nuevo baje (ambos lados, obligatorio):

| Lado | Archivo:línea | Qué |
|---|---|---|
| backend | `inbound-sync.service.ts:427-444` | **agregar las keys al set default** (el paso silencioso) |
| backend | `inbound-sync.dto.ts:292` | keys en `InboundSyncDeltasDto` + DTOs nuevos (patrón `InboundSyncProductDto:62`) |
| backend | `inbound-sync.service.ts:163-210` | gating por key + fetch methods (patrón `fetchProductDeltas:453`) |
| POS | `sync_service.dart:3215-3410` | ramas de ingest (patrón `rawDeltas['products']:3225`, `rawDeltas['catalogValues']:3272`) |
| POS | entidad Freezed + DAO + tabla espejo | capa de datos local |

### 7.2 El panel del dueño llama a producción, no a staging (riesgo cerrado, nace un defecto de docs)

- `apps/owner_dashboard/src/lib/api-base-url.ts` — `getApiBaseUrl()` lee `import.meta.env.VITE_API_URL` y
  devuelve `${resolveConfiguredApiOrigin(configured)}${API_PREFIX}` con `API_PREFIX = "/api"`; si no está
  seteado cae en el relativo `"/api"` (solo dev proxy).
- El repo **no** puede decidirlo: no hay `wrangler.toml` ni `_routes.json`, no hay `.env` del dashboard, y la
  CI (`.github/workflows/owner-dashboard-ci.yml`) solo lint/typecheck/test — no build, no deploy, no
  `VITE_API_URL`. El valor vive solo como env var del proyecto en Cloudflare Pages.
- El bundle publicado sí lo decide: el chunk lazy `assets/utils-DnVrzdL2.js` contiene
  ``return`${He(`https://api.nhilospos.com`)}${Be}` ``. Vite sustituye `import.meta.env.VITE_API_URL` en build,
  así que **el artefacto desplegado se construyó con `VITE_API_URL=https://api.nhilospos.com`**.
  `api-staging`: 0 golpes en cualquier chunk.
- El hallazgo anterior ("el bundle no tiene ninguna referencia de API") era un **artefacto de haber greppeado
  solo el chunk de entrada** `index-DachZXqr.js`: el cliente de API está en los chunks lazy.
- `/api/v1/health` en el host del panel → `200 text/html`: Pages no proxya `/api`, consistente con un host
  absoluto embebido.
- **Defecto nuevo registrado (P2, documentación):** `apps/owner_dashboard/docs/staging-environment.md:12,74`
  afirma `api-staging` para este hostname y está mal para el build publicado. No corregirlo es lo que
  mañana hace que alguien configure extras contra la base equivocada.

### 7.3 La premisa de la decisión 4 es parcialmente falsa: la entidad categoría YA EXISTE y YA baja

Esto es lo único que reabre el plan, y recorta la Fase 0.

- `apps/admin_backend/src/modules/catalog/entities/catalog-value.entity.ts` — `CatalogValue` ya tiene
  `id` uuid, `tenant_id`, `catalog_type`, **`code` único por tenant**
  (`UQ_catalog_tenant_type_code`), `label`→`name`, `is_active` (borrado lógico), `sort_order`.
  `SALES_PRODUCT_CATEGORY` es un tipo real con 8 codes sembrados
  (`COMIDA, BEBIDA_CALIENTE, BEBIDA_FRIA, PANADERIA, SNACK, RETAIL, LIMPIEZA, OTROS`,
  `catalog.service.ts:56`).
- El token `categories` del set default **apunta al mismo payload** que `catalog_values`
  (`inbound-sync.service.ts:166-169`): **las categorías ya bajan por delta**, no hay que inventar un canal.
- El POS ya las ingest y las guarda: `sync_service.dart:3272-3289` → `CatalogValueEntity(id, catalogType,
  code, name, isActive, sortOrder)` vía `catalogValueDao.insertCatalogValues`.
- Lo que falta es **solo el vínculo**: `product.entity.ts:51` guarda `category_code: string` sin FK, y
  `menu-import.service.ts:609` escribe `category_code: group.category` o sea el **nombre crudo de la hoja**,
  que puede no matchear ningún `code` sembrado. Ahí están las dos verdades, con ubicación exacta.
- El delta de productos sigue sin traer categoría: `inbound-sync.service.ts:504-525` emite
  `id, name, uom, stock, averageCost, sellPrice, taxRate, isTaxExempt, isActive, isPerishable, warehouseId,
  productType, mappingVersionId, insumoId, createdAt, updatedAt, tenantId`. `sync_service.dart:3251` lee
  `map['category']` → siempre null → conserva el valor local.

**Relectura del costo de la decisión 4.** El documento decía "casi la mitad del esfuerzo total". Con esta
evidencia, la mitad cara ya está construida: **no hay que crear la entidad ni el canal de sync de categorías,
hay que referenciar la que existe y limpiar el importador.** El argumento "una clave de texto se rompe al
renombrar" se cumple para el nombre de la hoja, **no** para `catalog_values.code`, que es la clave estable y
única por tenant documentada justamente para que el POS referencie valores.

Pendiente de decisión del dueño (ver §8).

### 7.4 Tamaños y variantes

Sin cambios: `Americano 8oz` / `12oz` siguen codificando el tamaño en el nombre. Fuera de alcance.

## 8. Decisión reabierta en la ronda 2

**Identidad de categoría: ¿creamos `product_categories` o referenciamos `catalog_values`?**

- **(A) Reutilizar `catalog_values` (SALES_PRODUCT_CATEGORY).** El importador hace upsert de la hoja contra
  `catalog_values` y escribe el `code` canónico en `products.category_code`; los grupos se enganchan por
  `code` (o por `catalog_value_id`). **Cero tablas nuevas, cero deltas nuevos**: la categoría ya baja y ya se
  administra en `/catalogs`. T0.1 y T0.4 desaparecen; quedan T0.2' (canonicalizar el importador) y T0.3'.
- **(B) Entidad `product_categories` nueva** (plan original). Domínio más limpio y semántica propia, pero
  duplica una entidad que ya existe, ya sincroniza y ya tiene UI, y exige un delta de categorías nuevo.
- **(C) No tocar categorías:** enganchar grupos solo por producto. Barato hoy, y vuelve a cargar los extras
  58 veces — contradice la decisión 2 y el motivo por el que se pagó la decisión 4.

**Recomendación: (A).** Compra la misma capacidad (enganche por categoría que sobrevive renombres) a una
fracción del costo, y elimina las dos verdades en vez de crear una tercera.

## 9. Forma del enganche (decisión del dueño, 2026-10-03)

Elegida la vía mixta: **la BD referencia por `id`, el contrato de sync expone `code`.**

```sql
category_modifier_groups(id uuid, tenant_id uuid NOT NULL,
  catalog_value_id uuid NOT NULL, group_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0, created_at, updated_at,
  CONSTRAINT fk_cmg_catalog FOREIGN KEY (tenant_id, catalog_value_id)
    REFERENCES catalog_values(tenant_id, id),
  CONSTRAINT fk_cmg_group FOREIGN KEY (tenant_id, group_id)
    REFERENCES modifier_groups(tenant_id, id),
  CONSTRAINT uq_cmg UNIQUE (catalog_value_id, group_id))
```

- **FK compuestas por `(tenant_id, …)`**: un hijo de otro tenant es imposible en la BD, no por convención.
  Requiere `UNIQUE (tenant_id, id)` en los padres; `products` ya lo tiene
  (`1802000000000-CreateProductInventoryMappingVersions.ts`) y `catalog_values` **no**: la migración de
  T1.1 lo agrega con guarda idempotente.
- El delta `categoryModifierGroups` sale con `{ categoryId, categoryCode, groupName, min/max, options[] }`.
  El POS resuelve **por `code`**, que ya está en su tabla `catalog_values` local → funciona offline.
- Renombrar el `label` de una categoría no rompe nada; cambiar el `code` sí re-mapea, y eso lo controla
  `/catalogs`.
- **`price_delta` decimal(12,2)**: misma forma que `products.sell_price`. El total ya suma
  `item.modifiersTotal` (`invoice_fiscal_calculator.dart:170`), así que el delta entra por ahí sin tocar
  el cálculo fiscal.
- **`sort_order`, no `display_order`**: convención de la casa (`catalog_values.sort_order`).
- **`UNIQUE (tenant_id, name)` en `modifier_groups`**: es la clave de idempotencia para sembrar el set
  SOHO de T4.3 sin duplicar grupos en cada corrida.

### 9.1 Las reglas de selección son explícitas, sin centinela

El primer intento de T1.1 introdujo `max_selected = 0` con la semántica "ilimitado" **y a la vez**
`CHECK (max_selected >= min_selected)`. Las dos cosas no conviven: un grupo obligatorio
(`min_selected = 1`) con `max_selected = 0` viola el CHECK (`0 >= 1` es falso). O sea que la fila más
básica del negocio — *"Leche: obligatorio, elegí la cantidad que quieras"* — no se podía guardar, y el
centinela iba en contra del principio §3 (**reglas como números, no banderas**).

Forma final acordada:

```sql
min_selected integer NOT NULL DEFAULT 0,
max_selected integer NOT NULL DEFAULT 1,
CONSTRAINT chk_modifier_groups_min_selected_non_negative CHECK (min_selected >= 0),
CONSTRAINT chk_modifier_groups_max_gte_min CHECK (max_selected >= min_selected AND max_selected >= 1)
```

- `min_selected = 0` ⇒ opcional; `min_selected >= 1` ⇒ obligatorio.
- **No existe "ilimitado"**: un grupo con muchas opciones guarda un `max_selected` explícito.
- El default `1` y el CHECK viven en el mismo lugar, así que el entity y el DDL no se contradicen.

## 10. Cierre de T1.1 (work unit `0d6e7f72`)

Verificado contra Postgres 16 real, no solo contra el spec unitario:

- La migración **executa** por los dos caminos: `runMigrations()` del `1809530000000-AddReportIndexes.db.spec`
  y `npm run migration:run:prod` sobre una DB scratch. La FK compuesta a `catalog_values(tenant_id, id)`
  fue **aceptada**: el `UNIQUE` del padre se crea antes, así que el orden es correcto.
- `CHECK` comprobado con transacciones revertidas: rechaza `max_selected = 0` y `max_selected < min_selected`;
  **acepta** `min=1, max=1` (la fila "Leche" de T4.3).
- Cross-tenant rechazado en las tres tablas hija (tres FK distintas disparadas a propósito).
- RLS: `ENABLE` + `FORCE` en las 4; **exactamente 4 policies por tabla**; predicado deparseado a
  `(tenant_id = (current_setting('app.tenant_id', true))::uuid)` — casteo del setting, no de la columna.
- Aislamiento real con rol `NOBYPASSRLS` + `set_config('app.tenant_id', …)`: sesión con tenant A ve solo
  las filas de A; sesión nueva sin setear → **0 filas**.
- `scripts/verify-schema-build.sh`: **exit 0**, `tables=85 classified=85 failures=0`; conteo programático del
  manifiesto: 85 entradas = 52 `direct:SIUD` + 10 `direct:SI` + 6 `direct:SIU` = 68 direct, 9 global,
  5 parent-owned, 3 debt. El comentario de conteos ahora **coincide con la realidad**.
- Suites enfocadas: `CreateModifierGroups` 30/30, `tenant-rls-coverage` 35/35, `catalog` 95/95,
  `migration` 571 pasando, `tsc --noEmit` limpio.

Dos hallazgos del revisor nativo, **no bloqueantes**, que se cierron en el mismo work unit:
- **F1:** las entidades declaraban `@ManyToOne` simples mientras la migración crea FK compuestas y ninguna
  FK a `tenants`. Con `synchronize: false` es inocuo hoy, pero si alguien corriera `schema:sync` el ORM
  reemplazaría las FK que sostienen la garantía cross-tenant. Fix: `createForeignKeyConstraints: false` en
  las 9 relaciones, con comentario de que la integridad la posee la migración.
- **F2:** `down()` terminaba con `ALTER TABLE catalog_values …` sin guarda sobre la tabla; en una DB
  físicamente vacía da `relation "catalog_values" does not exist`. Fix: `ALTER TABLE IF EXISTS`.

Quedan como trabajo separado, decididos y no ejecutados:
- **F3 (informativo):** los 5 FK nuevos son `NO ACTION`. Es correcto con el borrado lógico por `is_active`
  (un grupo sin opciones ni enganches se borra igual). Solo hace falta `ON DELETE CASCADE` si se quiere un
  flujo real de borrado físico/purga.
- **F4 (informativo):** `uq_modifier_options_tenant_id (tenant_id, id)` no lo referencia nada hoy. Peso
  muerto hacia adelante, inocuo; se quita si no se planea una FK futura a `modifier_options`.
- **F5:** `npx jest --silent modifiers` no encuentra tests: el módulo trae solo entidades por diseño
  (cobertura vive en el spec de migración). No es defecto, es el nombre de suite que no aplica.

## 11. Estado real de las categorías (medido en la base de desarrollo, 2026-10-03)

```
tenant SOHO (bc3bd4dd)          → 58 productos | 0 filas SALES_PRODUCT_CATEGORY | 0 filas catalog_values
  CAFÉ CALIENTE 16 · BEBIDAS 12 · CAFÉ HELADO 11 · COMIDA 6 · DESAYUNOS 5 · BATIDOS 4 · POSTRES 4
  → los siete están huérfanos (100 %)
tenant "SOHO Test Fixture"      → 23 productos | 8 filas SALES_PRODUCT_CATEGORY (los codes sembrados)
```

Lectura correcta del dato: **el tenant real nunca pasó por la siembra del catálogo**, porque el camino
que tiene es el importador de menú, y el importador escribe el nombre de la hoja en `category_code` sin
crear la fila (`menu-import.service.ts:609`). Por eso:

1. **T0.1' no es una limpieza, es el mecanismo de siembra.** Con el importador canónico, importar el menú
   crea/reusa las filas `SALES_PRODUCT_CATEGORY` del tenant.
2. **T0.2' queda reducido** a las 58 filas que ya existen.
3. Un grupo enganchado "por categoría" hoy **no tendría dónde engancharse**. Cualquier pantalla de
   administración de grupos tiene que mostrar esa realidad en vez de un selector vacío.
4. **No fuzzy-mear** `CAFÉ CALIENTE` ≈ `BEBIDA_CALIENTE`: coincidencia solo por `code` derivado. Unificar
   conceptos es decisión del dueño en `/catalogs`.
5. Producción todavía no fue inspeccionada; la misma consulta corre antes de escribir el script de backfill.

## 12. Estado de la rama tras T1.1 y T0.1'

Commits:
```
0d6e7f72 feat(admin_backend): create tenant-scoped modifier group schema        (T1.1)
ef2d437c docs(odd): real tenant category state                                   (T4.3 §11)
da4c2512 feat(onboarding): import menu categories as canonical catalog codes    (T0.1')
```

**Deuda de revisión abierta (decisión del dueño, 2026-10-03).** El candidato `da4c2512` quedó con
revisión nativa **no producida**: el relay del revisor devolvió `reviewer-empty-output` con
`stopReason: length` dos veces, ~245 s y ~250 s, sin timeout y **sin mutación**. El lineage
`review-7286b42cf449371c` sigue en `reviewing`, `candidate.consumed: false`, el slot
`review-reliability / order 0` reofrecido. Decidido: **dejarlo abierto** y seguir; si el relay se
destraba se retoma el mismo lineage sin recomenzar. Costo explícito: ASSESS sigue marcando ese
commit como `reviewDue: true` (`slice_budget_reached`), riesgo `medium`, `writerProfile: large`.
Referencia de contraste: T1.1 (952 líneas, mismo tier) se revisó y quemó bien, así que el fallo no
es un corte general del mecanismo.

**T0.1' cerró con esto además del feature:**
- `ON CONFLICT DO NOTHING` en vez de `try/catch` sobre `save()`: dentro de una transacción de
  Postgres, un statement que falla aborta la transacción (`25P02`), así que el recovery
  error-and-requery del primer intento **no podía funcionar nunca**. El harness con mocks no lo
  ve, por eso pasó verde la primera vez.
- Una hoja cuyo nombre normaliza a code vacío es ahora **error fail-closed antes de escribir**,
  no un `category_code = ''` nuevo.
- Lint: el work unit había agregado 13 errores (29 → 42). Volvió a 11, todos pre-existentes y en
  líneas que este cambio no toca.

**Qué NO hace T0.1'.** Deja de producir huérfanos hacia adelante y siembra al importar, pero no
repara los 58 productos existentes: la rama de update de precio mantiene su contrato
*"never touch name, recipe, or type"*. Eso es T0.2'.

## 13. T0.2' — el backfill y la trampa que lo hace un no-op silencioso

`products` y `catalog_values` están con `FORCE ROW LEVEL SECURITY`, y el rol de migración es **dueño**
de las tablas. Sin `app.tenant_id` bindado, el predicado evalúa `NULL` y bajo FORCE el dueño
**ve cero filas**: un backfill de categorías loguea un no-op limpio exactamente en la base que existe
a reparar. Está documentado en el propio repo
(`1809510000000-BackfillTemplateProductTypes.ts`, citando `1809180000000-ReconcileEnumColumns`), con
el bracket `NO FORCE` / restore en `finally` como contrato. Ese es el requisito duro de T0.2', no un
detalle de estilo.

**Producción sin inspeccionar, y eso no bloquea.** No hay credenciales de producción en el repo
(Railway las inyecta; `.env.example` es local). En vez de escribir un script que asuma los 7 valores
del tenant SOHO, el backfill se especificó **para datos arbitrarios**: deriva el code de lo que haya,
nunca toca el `label` de una fila existente, deja NULL/vacío como estado legítimo, y **reporta** lo que
creó, reusó, fusionó o saltó. El dueño puede revisar el mapa en el log de la migración.

Consulta de sólo lectura para correr en Railway **antes** del deploy (no escribe nada):

```sql
select t.name as tenant,
       coalesce(nullif(p.category_code,''), '<vacio>') as category_code,
       count(*) as productos,
       bool_or(cv.id is not null) as existe_en_catalog
  from products p
  join tenants t on t.id = p.tenant_id
  left join catalog_values cv
    on cv.tenant_id = p.tenant_id
   and cv.catalog_type = 'SALES_PRODUCT_CATEGORY'
   and cv.code = p.category_code
 group by 1,2
 order by 1, 3 desc;
```

Lo que hay que mirar ahí: si algún `category_code` de producción normaliza al mismo code que otro
(fusión), porque la migración los convierte en una sola categoría y eso es una decisión del dueño,
no un detalle técnico.

## 14. Incidencia de orquestacion: dos escritores sobre el mismo fichero (T0.2')

**La causa fui yo, no el subagente.** Queda registrado con los hechos, porque la conclusion inicial
escrita aqui era falsa y el plan de registro no puede conservar una acusacion incorrecta.

Que paso de verdad:

1. Lance el writer de T0.2' en `mode: background`. Su primera escritura del `.ts` ocurrio a las
   **10:11**.
2. Antes de eso lei una salida intermedia como si fuera el informe final, comprobe el disco, no
   habia nada, y escribi "evidencia fabricada". **No habia nada porque todavia no habia escrito.**
3. Relance la tarea sobre las **mismas superficies de edicion permitidas** mientras el primer writer
   seguia vivo. Ahi se creo el conflicto real: dos escritores sobre
   `1809560000000-BackfillProductCategoryCodes.ts` y su `.spec.ts`, reescribiendose mutuamente
   (10:13, 10:16, 10:20, 10:23), alternando entre dos contratos incompatibles:
   - export `canonicalCategoryCode` vs `canonicalizeCategoryCode`
   - mock `GROUP BY count(*)` vs `DISTINCT` + sonda `MAX(sort_order)`
   - UPDATE por original (scalar) vs UPDATE en lote con `ANY($3)`
4. Cada `GREEN` observado (19/19 dos veces) quedo invalidado por la reescritura del otro en minutos.
   Ninguno de los dos estaba mintiendo: ambos observaron sus propios tests pasar contra el estado
   que cada uno tenia delante.

Ambos writers se detuvieron solos (`interaction_required`, pidiendo dueno exclusivo) y el worktree
esta estable: `md5 4681ec95...` del `.ts` y `33392756...` del `.spec.ts` sin cambios en 45 s de
observacion.

**Regla que sale de esto (para el padre, no para el child).** Antes de relanzar una tarea en
background hay que comprobar que la anterior termino; `subagent_status` existe para eso y no lo use.
Una salida intermedia no es un informe final: `mode: background` entrega estados parciales, y juzgar
integridad de un writer por un `ls` tomado mientras trabaja es un error de verificacion, no del
writer. La regla de un solo escritor a la vez se rompe por el orquestador, no por el delegante.

**Estado del trabajo delegado (real, verificado en disco):** `.ts` 18,787 B con la canonicalizacion
espejada, el bracket `NO FORCE` con restauracion en `finally` del subconjunto realmente elevado, bucle
por tenant, reuse/insert/merge/skip/update-solo-si-difiere, reporte y `down()` no-op. `.spec.ts`
22,876 B, 19 tests con QueryRunner falso de estado. **No compila hoy** por el choque de nombres
(`TS2724` en el spec) y un `TS2339` reintroducido en el `.ts`. El `.db.spec.ts` (Postgres real, dueno
`NOBYPASSRLS`) **no se escribio**: es la pieza que falta y la que prueba el bracket, que hasta agora
solo esta probado con mocks.

## 15. T0.4' verificado (solo lectura): el dashboard ya administra categorías

No hace falta construir nada para administrar la identidad de producto.

- `apps/owner_dashboard/src/features/catalog/types.ts:5,12` — `SALES_PRODUCT_CATEGORY` es uno de los
  cuatro tipos y se muestra como **"Categorías de Producto"** en las pestañas.
- `apps/owner_dashboard/src/features/catalog/product-page.tsx:246` — la pantalla ya pide ese tipo.
- El backend tiene `CatalogsController` en `src/modules/catalog/` (list / create / update / delete) y
  `catalog_values` **sí** viaja en el delta POS (`SALES_PRODUCT_CATEGORY` en el selector de tipos).

**Por qué importa para este feature.** Si el owner crea una categoría desde la web, ese `code` ya
existe en `catalog_values` y ya llega al terminal: un grupo pegado a esa categoría se resuelve sin
ningún delta nuevo. Lo único que le falta a la pantalla es **pegar grupos** a la categoría, que es
T1.4, no T0.4'.

**Corolario honesto sobre T0.2'.** El backfill crea las filas que faltan, pero si el owner ya tiene
`COMIDA` creada a mano, la regla es reusar y **no tocar el label**. Por eso la migración no debe
pisar labels existentes, y por eso el reporte debe distinguir creado de reusado.

## 16. T0.2' cerrado: el backfill existe y el bracket esta probado en produccion-real

Commit de work unit: `394886e8 feat(admin_backend): backfill product category codes against
catalog_values` (3 ficheros, 1.613 lineas anadidas).

`.ts` 434 lineas · `.spec.ts` 664 (19 tests) · `.db.spec.ts` 515 (1 test contra Postgres 16 real).

**Semantica, en el orden que ejecuta:** por tenant con al menos un `category_code` no vacio →
canonicalizar con la regla espejada → reusar la fila `SALES_PRODUCT_CATEGORY` que ya existe **sin
tocarle el label** → crear las que faltan con el valor original como label y `sort_order` continuo al
maximo propio → plegar colisiones y reportarlas → `UPDATE ... AND category_code <> $2` o sea solo
donde difiere de verdad → NULL/vacio quedan intactos y contados.

**La trampa, ahora ejecutada y no solo afirmada.** `products` y `catalog_values` estan en
`FORCE ROW LEVEL SECURITY` y el rol de migracion las posee. El `.db.spec.ts` construye la base scratch
con el set real de 113 migraciones, entrega la propiedad a un rol `LOGIN NOSUPERUSER NOBYPASSRLS` y
corre `up()` **conectado como ese rol**. Antes de la corrida, bajo FORCE y sin `app.tenant_id`,
`SELECT count(*) FROM products` da **0** y la sonda de tenants devuelve **0 filas**: sin el bracket
el backfill seria un no-op silencioso. Despues, las 4 filas del tenant forma-SOHO existen, el label
preexistente del tenant B conserva `'Bebidas del menU original'` y `sort_order 7`, la colision
`CAFÉ CALIENTE`/`CAFE CALIENTE` reusa una sola fila con el primer original en orden deterministico y
`sort_order 8`, `relforcerowsecurity` vuelve a `true` en ambas tablas, cada tenant sigue sin ver al
otro, y el segundo `up()` loguea el no-op de convergencia.

**Lo que NO prueba:** la ruta de restaurar el subconjunto elevado cuando el throw ocurre a media
elevacion, y el wrapper transaccional de TypeORM (`up()` se invoca directo, fuera de
`runMigrations`). Ambos quedan cubiertos solo por el spec con fake.

## 17. Hallazgo de plataforma: exportar una funcion en un fichero de migracion la ejecuta TypeORM

Desviacion ratificada del worker, verificada en el codigo de TypeORM y no de palabra.

`node_modules/typeorm/util/DirectoryExportedClassesLoader.js`:

```js
function loadFileClasses(exported, allLoaded) {
  if (typeof exported === "function" || InstanceChecker.isEntitySchema(exported)) {
    allLoaded.push(exported);          // cualquier export funcion, no solo clases
```

`ConnectionMetadataBuilder` despues hace `getFromContainer(metadata.target)`, es decir `new fn()`.
Un `export function canonicalCategoryCode(raw)` en el fichero de migracion se instanciaba con
`raw === undefined` y reventaba en `.trim()`. Romperia **cada** `runMigrations()` real, incluido el
deploy (`npm run migration:run:prod` corre antes de `node dist/main`, y un fallo de migracion aborta
el deploy y deja el despliegue previo sirviendo).

Fix: el helper es `static canonicalCategoryCode()` dentro de la clase. Conserva nombre, duplicacion
del de `menu-import.service.ts` y el pin del spec; cambia solo el mecanismo de export.

**Estado del repo:** `grep '^export (function|const|async function)' src/migrations/*.ts` sobre las
113 migraciones devuelve vacio. El hazard es latente, no hay otra victima hoy. Regla para cualquier
fichero de migracion nuevo: **el unico export de un fichero de migracion es la clase de migracion**.

## 18. Correccion a mi propio metodo de verificacion (dos falsas acusaciones en una sesion)

1. Acuse fabricacion a `muskz7ix` leyendo el disco mientras el writer seguia corriendo. Su primera
   escritura cayo a las 10:11; mi `find` fue antes. Relance sobre las mismas superficies y eso creo
   el choque de dos escritores.
2. Acuse al worker de `musly6j7` de no haber limpiado la base de desarrollo porque probe con
   `id::text like '11111111%'`, patron que tambien atrapa los fixtures legitimos
   `11111111-1111-4111-a111-...` (Restaurante General QA, creados 2026-09-27). Con los UUID reales del
   spec (`...8111...`, `...8222...`) el residuo es **0 tenants, 0 productos, 0 filas de catalogo**,
   y los fixtures intactos (3 productos General QA, 58 SOHO). La autodenuncia del incidente del worker
   era exacta y su limpieza tambien.

**Regla.** Verificar es comprobar la afirmacion con el identificador de la afirmacion, no con un
patron propio que ademasse. Y un resultado que contradice la expectativa es una senal de que mi
consulta esta mal antes que de que el otro mintio: los dos errores de esta sesion tuvieron la misma
forma — concluir rapido desde una consulta amplia.

**Bateria final, corrida por el padre, no delegada:** 19/19 unit · 1/1 db spec real · `tsc --noEmit`
limpio · `eslint` exit 0 · `prettier --check` ok · suite completa **3.487 passed / 8 skipped / 3.17
suites** · `verify-schema-build.sh` PASS en ambos escenarios, manifest `declared=68 legacy=0
failures=0`, tablas sin cambio (la migracion no crea tablas).

Un detalle cosmético corregido por el padre en vez de delegado: el log de merge nombraba el tenant
dos veces.

## 19. T0.2' revisado y quemado · T0.1' aprobado pero NO quemable

**T0.2' (`394886e8`): recibo de revision aprobado y authority quemada.**
- Lineage `review-273ff31ae341adae` · tier medium · 4 ficheros · 1.691 lineas · presupuesto de correccion 200
- 1 corrida de revisor, lente `review-reliability`, transporte `pi_host_relay`
- Cierre en el ultimo evento admitido: `state: approved`, `consumed_revision sha256:602cd1054701c4473ea883048ac468078e86839c80f80c0c9340ba2f5c541eed`
- Acknowledgement exacto ejecutado: `authority: burned`, `burn_evidence: gentle-ai.review-acknowledged/v1`
- Un solo hallazgo, **informativo y no bloqueante**: `R3-001` WARNING en `...BackfillProductCategoryCodes.db.spec.ts:30-36`. No abrio correccion, no reabre la revision, no ofrece transicion de correccion. Queda como trabajo separado.
- Leccion de uso de la herramienta: `acknowledge-approved` **no acepta `input`**. El primer intento con el objeto `{target, expectedRevision, token}` devolvio `native-approved-acknowledgement-input-invalid` / `controller-only-input` sin mutar nada; la continuation correcta es `operation: acknowledge-approved` con `lineageId` y `workspaceRoot` nada mas, y el provider arma el token y la revision por su cuenta.

**T0.1' (`da4c2512`): la revision se aprobo, pero el recibo ya no se puede quemar.**
- El relay volvio a funcionar y `review-7286b42cf449371c` aprobo en la primera corrida: `state: approved`, `store_revision sha256:04ada54669a43361bcf9db19ea51f9b98609a1a2ef51a2cc3e6613a1a9ec9cd8`, con 4 hallazgos **todos informativos** (`R3-001`/`R3-002` en `menu-import.service.ts:444` y `444-452`, `R3-003` en `752-753`, `R3-004` SUGGESTION en `124-126`).
- El acknowledgement devolvio `native-approved-acknowledgement-not-current` con `mutation_performed: false`. **Causa: mi secuencia, no el contenido.** Deje el lineage abierto a traves de dos commits siguientes; cuando la punta de la rama se movio, el target congelado de ese lineage dejo de ser el target current y el provider no admite el recibo.
- El estado actual ofrece un START **combinado** (`review-1c21a32232dc6384`, base `878c1cb0`, 6 ficheros, ~2.300 lineas: T0.1' + T0.2' + docs). **No se arranca**: re-revisar en bloque dos work-unit ya revisados contra el presupuesto de revision humana es el defecto que el tier y el presupuesto existen para evitar.
- Consecuencia registrada como deuda, no como cierre: `da4c2512` queda **aprobado sin recibo quemado**. Su evidencia funcional propia sigue en pie (43/43 menu-import, 694/694 onboarding, tsc/eslint/prettier limpios).

**Regla operativa nueva.** Quemar el acknowledgement **inmediatamente** despues de la aprobacion, antes de cualquier commit nuevo en la rama. Un lineage aprobado y no quemado es una ventana que la siguiente escritura en la rama cierra. En T0.2' se hizo bien; en T0.1' se dejo abierto por decision del dueno cuando el relay fallaba, y el fallo del relay es exactamente lo que obliga a esta disciplina.

**Follow-ups que dejo la revision, ninguno bloqueante:**
- `menu-import.service.ts:444` y `444-452` (guarda del code vacio) y `752-753`: mirar al tocar el importador de nuevo.
- `menu-import.service.ts:124-126` (SUGGESTION sobre `canonicalCategoryCode`):candidato de refactor menor, sin accion ahora.
- `...BackfillProductCategoryCodes.db.spec.ts:30-36`: WARNING en el arn es del db spec.

## 20. T0.5' decidido: unificar promociones y grupos en `catalog_values.id`

**Hallazgo medido (no teoria).** Promociones y grupos de extras resuelven "categoria" con dos
identidades distintas y ninguna de las dos funciona en el terminal:

| capa | hecho |
|---|---|
| `promotions.target_category_id` | `varchar` **sin FK** (`promotion.entity.ts:47`; columna lisa creada en `1790000000000-CreatePromotionsTable.ts:37`) |
| dashboard | input de **texto libre** (`PromotionForm.tsx:169-173`), no picker de `/catalogs` |
| motor POS | comparacion **case-insensitive de strings** contra `item.category` (`promotions_engine.dart:106-108` y `128-130`) |
| grupos (T1.1) | FK compuesta a `catalog_values(tenant_id, id)` |
| `item.category` en el POS | **siempre null**: el delta de producto no manda campo de categoria (`inbound-sync.service.ts:504-527`) y el ingest hace `map['category'] ?? existing?.category` (`sync_service.dart:3251`); el dispositivo nunca sube productos, asi que no hay `existing` |
| `PromotionDao.getPromotionsByCategory` | **cero llamadores** (`promotion_dao.dart:27-28`); codigo muerto |

**El dato concreto que obliga a decidir ahora:** el tenant SOHO tiene 2 promociones y una apunta
`CAF_E CALIENTE` como texto libre. Ese es exactamente el valor que T0.2' reescribe a
`CAFE_CALIENTE` en los productos. Dejar las promociones como estan es tener dos features que nombran
la misma cosa con claves distintas, una de ellas inerte.

**Decision del dueno (2026-10-03): unificar en `catalog_values.id`.** Renombrar una categoria a mano
no debe romper enganches: el id no cambia, el code si. Con esto, el matching por nombre desaparece
del motor y `target_category_id` deja de ser un nombre mentiroso.

**Trampa de diseno que hay que nombrar explicitamente.** En el motor, `target_category_id = NULL`
significa **promocion global** (`isGlobal`, `promotions_engine.dart:110`, `132`). Por lo tanto una
migracion que "no resuelva" el texto libre y lo deje en NULL **convierte una promocion de una
categoria en un descuento sobre todo el menu**. El contrato de la migracion es: texto libre que no
resuelve a una fila `SALES_PRODUCT_CATEGORY` del mismo tenant → `target_category_id = NULL`
**y `is_active = false`**, reportado en el log con el nombre de la promocion. Nunca NULL activo.

**Por que desactivar no es una regresion viva:** hoy ninguna promocion por categoria matchea en el
terminal (`item.category` es null siempre), asi que desactivar las no resolubles no cambia el precio
que el cliente paga. Cambia el estado declarado, y por eso se reporta para revision del dueno.

**Work units en orden (cada uno cierra con su propio commit):**

- **T0.5'a backend-schema**: `promotions.target_category_id` pasa a `uuid` con FK compuesta
  `(tenant_id, target_category_id) REFERENCES catalog_values(tenant_id, id)`, patron T1.1
  (`createForeignKeyConstraints: false` en la entidad). Migracion de datos: canonicaliza el texto
  libre existente con la misma regla espejada, resuelve por `code` dentro del tenant, asigna el id, y
  desactiva + reporta lo no resoluble. DTO valida UUID; el service rechaza un id de otra tenant o de
  otro catalog_type. Sin tabla nueva: el manifest RLS no se toca.
- **T0.5'b delta**: el payload de producto pasa a llevar `categoryId`, resuelto server-side haciendo
  join `products.category_code` → `catalog_values(tenant, SALES_PRODUCT_CATEGORY, code)`. Un producto
  sin categoria o con un code que no existe en el catalogo manda `null` y eso esta bien: ahi no hay
  promocion possible.
- **T0.5'c pos**: columna local `products.category_id TEXT` (migracion Floor propia), ingest de
  `map['categoryId']`, `CartItem` lleva `categoryId`, y el motor pasa a **igualdad estricta de ids**
  en los tres tipos de promocion. Borrar `getPromotionsByCategory` del DAO (esta muerto y tiene la
  semantica vieja).
- **T0.5'd dashboard**: `/promotions` pasa de input libre a picker sobre `/catalogs`
  (`SALES_PRODUCT_CATEGORY`), mostrando el label y guardando el id.

**Dependencia honesta con este feature:** T0.5'c y T2.3 (resolver grupos efectivos al cargar el
producto) tocan el mismo ingest de producto del POS. Van en el mismo worktree, en ese orden, para no
pisarse.
