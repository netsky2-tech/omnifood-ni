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
- [x] **T1.2** API REST: CRUD de grupos y opciones, y enganches por categoría y por producto.
- [x] **T1.3** Resolución server-side de los grupos efectivos: categoría ∪ producto, con orden y overrides.
- [x] **T1.4** Dashboard: pantalla de grupos (nombre, min/max, cantidades, opciones con delta y default) y
      el flujo principal **"pegar grupos a una categoría"**, más la excepción por producto mostrando lo
      heredado como heredado.

### Fase 2 — Bajada y espejo local

- [x] **T2.1** Tipos de delta nuevos (`modifierGroups`, `categoryModifierGroups`, `productModifierGroups`)
      en `InboundSyncDeltasDto` (`inbound-sync.dto.ts:292`), su gating (`inbound-sync.service.ts:163-210`)
      y el ingest del POS (`sync_service.dart:3215-3410`).
- [x] **T2.2** Tablas locales espejo + DAOs (ingest POS absorbido aquí, ver §35).
- [x] **T2.3** **Resolver los grupos efectivos al cargar el producto** — el punto exacto donde hoy se
      descartan las opciones. Acá se cierra el defecto de raíz.
- [ ] **T2.4** *(redefinida por §7.1)* **Agregar las keys nuevas al set default de `parseRequestedTypes()`**
      (`inbound-sync.service.ts:427-444`). El POS **no manda `types`** (`sync_service.dart:3179-3197`), así
      que si la key no está en el default, el delta llega vacío y **silencioso** (no es un 4xx).

### Fase 3 — POS

- [x] **T3.1** Selector agrupado: radio cuando `max=1`, checkbox cuando no, y cantidades cuando
      `allow_quantities`.
- [x] **T3.2** Validación local de min/max al tocar AGREGAR — *absorbida dentro de la corrección de T3.1 (ver §37), tests como evidencia*.
- [x] **T3.3** Totales con cantidad y ticket de cocina `[MOD] 2x Extra Shot`.

### Fase 4 — Cierre

- [x] **T4.1** El editor de opciones del BOH pasa a lectura, explicando que se administra desde la web
      (decisión 2). Esto elimina de raíz la clase de divergencia del editor del BOH.
- [x] **T4.2** Retirar o corregir con el editor viejo los dos defectos del campo de dinero: el `0.0`
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

## 21. T0.5'a: la revisión nativa encontró un CRITICO que los 33 tests no veian

Commit `d227d7b8` (8 ficheros, 2.176 lineas, tier **high**). Revisión nativa con los 4 lentes
(risk, resilience, readability, reliability) corriendo concurrentes: 4 prompts de ~105 KB, 4 resultados.

**R3-001 · CRITICAL · deterministic · introduced** — y tiene razon:

```
:258  WHERE target_category_id IS NOT NULL AND btrim(target_category_id) <> ''   -- deja afuera los vacios
:457  USING NULLIF(btrim(target_category_id), '')::uuid                          -- los convierte en NULL
      is_active: intocado                                                        -- NULL + activo = GLOBAL
```

Una promocion **activa** con `target_category_id = ''` (o espacios) quedaba despues de la migracion en
`NULL + is_active = true`, y `NULL` en el motor POS significa **descuento sobre toda la linea de
carrito** (`promotions_engine.dart:110`, `:132`). El propio header del fichero (`:41-44`) prohibia este
resultado, y el guard `assertNothingButUuidsLeft` no lo veia porque **tambien** filaba `btrim <> ''`.

**Como paso, y por que importa como leemos la evidencia de un writer.** El worker reporto su decision
como desviacion numero 3, con motivo textual: *"the fail-closed guard initially threw on empty-string
values (they legitimately cast to NULL via NULLIF(btrim(...),''))"*. O sea: no lo ocult, lo nombro, y
el razonamiento era exactamente al reves. **Que un valor casteie a NULL no lo hace legitimo cuando NULL
significa global.** El cast era el peligro, no la excepcion.

Y ahi esta el numero que hay que recordar: el worker corrio **18/18 unit, 33/33 del modulo, 1/1 db
spec, tsc/eslint/prettier limpios y 3.510 tests de la suite completa verdes**, y yo verifique 18/18 y
33/33 con mis propias manos antes de commitear. **Ninguno vio el defecto.** Los tests que existían
sembraban valores resolubles y no-resolubles *con texto*; nadie sembro una cadena vacia. Verde no
significa correcto: significa que los casos que escribiste pasan. El revisor nativo encontro el caso
que nadie escribio.

**Presupuesto de correccion y resultado del plan.** Se pidio el plan de correccion (60 lineas de diff
de un presupuesto de 200) y fue admitido. Despues `status` devolvio `action: stop` con
`corrected_candidate_unavailable`: la correccion necesita un candidato nuevo, o sea el fix commiteado
como work-unit propio. Corrección en curso por un writer con las tres superficies del fichero de
migracion nada mas.

**Requisito del fix (no solo "arregla el vacio"):**
1. antes del `ALTER ... TYPE uuid`, desactivar en una sola sentencia todo row con
   `target_category_id IS NOT NULL AND btrim(target_category_id) = ''`, con log por promocion
   (tenant, nombre, id, motivo nombrando la trampa global) y contador.
2. el guard fail-closed tiene que ser **total**: antes del `ALTER`, afirmar que ningun row queda
   `NULL + activo` **por culpa de esta migracion**. Los que ya venian `NULL + activo` antes de correr
   son promociones globales legitimas y **no** deben pisar el guard ni cambiarse — esa distincion va
   explicita en el header.
3. RED obligatorio sembrando un promocion activa con `''` y otra con `'   '`: primero demostrar que el
   defecto existe hoy, despues arreglar.
4. el db spec real siembra la de texto vacio y afirma `NULL AND is_active = false`, y que una global
   preexistente sigue `NULL AND activa`.

**Leccion de proceso para el feature.** Toda regla de "NULL significa X" necesita un test que siembre
el vacio, no solo el valor ausente. `''` y `NULL` no son el mismo caso y el filtro `<> ''` aparece dos
veces en el mismo fichero con la misma consecuencia.

## 22. R0.5'a-REVIEW (2026-10-03, post-fix): R4-001 es un falso positivo determinista

**Contexto.** Tras el fix `dec1b91c`, `review recover` rechazo sus propias rutas tres veces
con `recovery base-ref does not match predecessor base`: el predecessor congelo
`initial_atomic_start.selector.base_ref = c28f5d19...` (el TREE) mientras la ruta de recover
renderizaba `--base-ref=04273823...` (el COMMIT). Nativo compara uno contra el otro.
Verificado en disco que **ninguna corrida mut6**: el successor `review-1b4fe6af7236c826`
no existia y el predecessor seguia intacto. Con autorizacion del usuario se abrio un
**lineage fresco** sobre el candidato corregido: `review-1b4fe6af7236c826`, tier high,
4 lentes concurrentes, 2457 lineas. El relay **funciono**: 4/4 materializados y admitidos
(`prompt_bytes ~119k`, `result_bytes` 3.1k-6.5k). Ningun lente volvio a mencionar el
`''`-vs-NULL: la correccion anterior quedo validada.

**Veredicto nativo:** `correction_required` con un solo hallazgo.

```
R4-001  lens resilience  severity BLOCKER  evidence_class deterministic  causal introduced
apps/admin_backend/src/migrations/1809570000000-PromotionTargetCategoryIdToUuid.ts:630
"down() references the undefined identifier `runner` instead of its `queryRunner` parameter,
 so any rollback ... throws a ReferenceError"
```

**Refutacion (3 niveles, sobre los bytes congelados `1680be49`).**

1. Contenido exacto de `:630` via `git show HEAD:...`: `const unmapped = (await queryRunner.query(`.
2. Filtro `runner.` sin `query` en el rango completo de `down()` (589-660): **ningun resultado**.
3. Los 12 `runner.` reales del fichero estan todos dentro de privados que declaran
   `runner: QueryRunner` en su firma (`:210, :232, :246, :258, :277, :392, :426, :458, :484`).
4. Chequeo decisivo: `npx tsc --noEmit -p tsconfig.json` **limpio**. Un identificador
   indefinido es `TS2304`, error de **compilacion**, no de runtime. Si R4-001 fuera cierto,
   el proyecto no compilaria, y el work-unit se verifico compilando.

**Por que no se submetio un correction plan.** La unica salida nativa para un bloqueador
`deterministic` es `correction_plan_required` (presupuesto 200) y **no hay refuter**: el
contrato reserva el refuter para inferenciales. Someter lineas de correccion para "arreglar"
un `ReferenceError` inexistente significa mutar codigo para satisfacer un hecho falso, y
destruye el valor del recibo: la proxima lectura creeria que hubo un defecto real ahi.
Se dejo el lineage en `correction_required` sin quemar autoridad.

**Defecto de proceso expuesto (para upstream).** Un hallazgo marcado `evidence_class:
deterministic` fue admitido sin la verificacion mas barata imaginable: abrir la linea citada.
Una maquina que afirma determinismo deberia estar obligada a que su prueba se reproduzca, y
"el compilador no se queja" refuta `TS2304` en cero segundos. Un filtro de viabilidad
(`tsc`/`eslint` sobre el candidato inmutable antes de admitir un bloqueador determinista de
identificadores) eliminaria esta clase de falso positivo y liberaria presupuesto de correccion
para los verdaderos.

**Follow-up legitimo anotado (no bloqueador, no inventado para complacer).** En `down()`, un
uuid cuyo `catalog_values` desaparecio queda `target_category_id = NULL` tras el
`DROP COLUMN target_category_id_uuid`. El log `unmapped` lo cubre y el FK lo hace
practicamente imposible. Queda aca, como follow-up, y **no** se toca codigo para dar la
sensacion de que R4-001 tenia razon.

**Estado de recibo.** T0.5'a + fix **sin recibo**. Linea de tiempo honesta de deuda abierta:
`da4c2512` (T0.1') aprobada y no quemable; `d227d7b8`/`dec1b91c` (T0.5'a) en `correction_required`
por un bloqueador falso. `0d6e7f72` (T1.1) y `394886e8` (T0.2') si consumidos.

## 23. T0.5'b (2026-10-03): el delta de producto embarca categoryId resuelto — `3c39010d`

**Defecto cerrado.** `fetchProductDeltas` (`inbound-sync.service.ts:509-533`) no tenia ningun
campo de categoria. Esa es la razon raiz de que `item.category` sea siempre `null` en el
dispositivo: los productos nunca viajan con categoria por el canal nube->POS y el ingest hace
`map['category'] ?? existing?.category` con `existing` inexistente.

**Contrato nuevo.** `InboundSyncProductDto.categoryId: string | null` — el `catalog_values.id`
resuelto del `category_code` canonico del producto, dentro del mismo tenant; `null` si el code
esta vacio o no tiene fila de catalogo (nunca bloquea el sync). **Obligatorio, no opcional:**
un productor que lo olvide no compila. Se eligio id y no code porque el match del motor de
promociones va a ser por identidad, y el id sobrevive a un rename de etiqueta; mandar el code
obligaria al POS a mantener un mapa code->id sincronizado con cada rename.

**Implementacion.** Una sola lectura batcheada de `catalog_values` (sin N+1) por la caja de
productos ya cargada, atada al MISMO `entityManager` bound al tenant: el contrato RLS y el
throw fail-closed por manager ausente quedan intactos. Sin constraint unico en
`(tenant_id, catalog_type, code)` (verificado: solo `catalog_values_pkey`), las filas
duplicadas de un code se resuelven **deterministicamente**: orden por `created_at` luego `id`,
nunca por el orden de retorno de la base, y cada code ambiguo loguea tenant/code/conteo.

**Fixture fuera de superficie.** El campo obligatorio rompio `terminal-priming.service.spec.ts`
(`TS2741`, el unico error del proyecto). El worker hizo bien en frenar y preguntar. Se
autorizo agregar una linea (`categoryId: null,`) porque ese fixture ya lo exige por convencion
propia documentada (comentario `:33-35`: "any InboundSyncProductDto fixture must carry [contract
fields]"). Se descubrio ademas que `inbound-sync.dto.ts` violaba prettier ya en HEAD; sin ese
reformato `--check` no pasa en un diff limpio.

**Evidencia.** RED `TS2322 Property 'categoryId' is missing` -> GREEN. Propio:
`inbound-sync` 66/66, `src/modules/sales` 452/452, `terminal-priming` 31/31,
suite completa **318 suites / 3519 tests** (baseline 3510/3487, nada roto),
`tsc --noEmit` exit 0, eslint y prettier limpios.

**Incidente de entorno resuelto a mitad de la verificacion.** El worktree hermano
`/home/octavio_morales/omnifood-ni-fx` fue eliminado mientras corría la suite. 44 symlinks del
`node_modules` compartido apuntaban al store `.pnpm` de ese worktree (`jest`, `tsc`, `typescript`,
`eslint`, `prettier`, `@nestjs/*`, `@types/*`, `pg`, `typeorm`...) y quedaron colgados:
`Cannot find module 'jest/bin/jest.js'`. El store principal tenia **el mismo hash** de todos los
paquetes, asi que se repararon 44 links re-apuntando `omnifood-ni-fx/node_modules/...` ->
`omnifood-ni/node_modules/...` (0 rotos tras la reparacion) y la suite volvio a correr completa.
Leccion: los worktrees comparten `node_modules` via symlink, asi que **borrar un worktree
hermano puede tumbar el toolchain de todos los demas**.

**Recibo nativo de T0.5'b: QUEMADO.** Lineage `review-df0be20055493a05`, tier medium,
1 lente (reliability), 370 lineas, `approved` -> `acknowledge-approved` ->
`authority: burned` (`consumed_revision sha256:1621c432…`) **antes de ningun commit nuevo**.
Un unico hallazgo advisory (no bloqueante): R3-001 SUGGESTION en
`inbound-sync.service.ts:587-589`, la expresion `categoryId` hace dos veces `.trim()` sobre
`p.category_code` — cosmético, queda como follow-up.

**Defecto de captura y su salida.** El `gentle_review_capture_group` rechazo DOS veces con
error identico byte a byte (`pi-host-relay-transport-failure`: payload del revisor truncado
en byte 589, `reviewer payload contains no complete JSON object`); el segundo intento tardo
153 ms y reproceso los mismos bytes rechazados (`rejected-results/…attempt:1`). El mismo
binding exacto enviado por la via de slot unico (`gentle_review_capture`) corrio un revisor
fresco y aprobo. Regla practica: si el grupo rechaza repetido con errores identicos, pasar
el slot a la via de slot unico en vez de insistir con el grupo.

## 24. T0.5'c (2026-10-05): el POS guarda categoryId y matchea promos por identidad estricta — `353fe2fd`

**Defecto cerrado.** El motor comparaba `item.category?.toLowerCase()` contra
`targetCategoryId` (`promotions_engine.dart:107` y `:129`), un campo que el delta de producto
nube->nunca mando: la comparacion corria sobre `null` siempre y la ruta de texto libre era
muerta en la practica, mientras era la UNICA logica que existia.

**Cambios.**
- **Columna local**: entidad Floor `category_id` TEXT nullable, base 60 -> 61 con
  `migration60_61` (probe de tabla + probe `PRAGMA table_info`, re-ejecutable, paridad
  null-without-default con la entidad). Regenerado con build_runner (nada editado a mano).
- **Ingesta**: `sync_service.dart:3251` y `activation_priming_service.dart:121` mapean
  `map['categoryId']`; el `category` de display queda intacto.
- **Carrito**: `CartItem.categoryId` (Freezed), poblado en `sale_view_model.dart`.
- **Match estricto**: target null = global (byte-igual al viejo); si no,
  `line.categoryId == promo.targetCategoryId` exacto, sin case folding ni trim; linea con id
  null no matchea ninguna promo no-global.
- **Código muerto eliminado**: `getPromotionsByCategory` (cero llamadores productivos,
  verificado antes de borrar).

**El unico rojo real de la suite completa** fue
`promotions_integration_flow_test.dart:180` (`Expected 20.0, Actual 0.0`): sembraba el
contrato viejo (target `'Bebidas'` contra `category: 'Bebidas'`). Su fixture se migro a ids
(`cat-bebidas`/`cat-comida`, 4+/1-). **Leccion**: un test de integracion que siembra el
contrato viejo ES el RED del cambio de contrato; arreglar el fixture es la correccion, no
truco para verde.

**Flake de toolchain documentado (no nuestro).** Varias corridas completas de `flutter test`
fallaron siempre en un fichero distinto, siempre en etapa `loading`, con
`Unable to connect to flutter_tester process: WebSocketException: Invalid WebSocket upgrade
request`: agotamiento intermitente del handshake del flutter_tester al escalar suites.
Cada uno de esos ficheros pasa individual (verificado: payment_dao_voucher,
dgi_report_view_responsive, inventory_database, inventory_valuation_view,
restaurant_flow_e2e, release_downloader, y otros), sin presion de memoria (10 Gi libres),
idem con `-j3`. Nada del cambio tocado.

**Verificacion propia (no delegada).** engine 20/20, migrations+promotion_dao 13/13,
sync 122/122, priming 11/11, integration flow 4/4, `flutter analyze` sin issues.
**Riesgo aceptado y anotado**: `dart format` de esta version reformatea ficheros de HEAD
tambien (no es el formatter del repo) — no se aplica; el fixture cambio 4+/1-.

## 25. R0.5'c (2026-10-05): correccion R3-001/R3-002 + RECIBO QUEMADO — `a2712d7b`

**Veredicto inicial (4 lentes, tier high):** `correction_required` con dos CRITICAL gemelos
del lente reliability, ambos reales en el codigo:
- **R3-001** `activation_priming_service.dart:122` y **R3-002** `sync_service.dart:3252`:
  `categoryId` se asignaba SIN el fallback `?? existing?` que si usan sus vecinos
  (sku/barcode/category). Un payload que omite la key borra en silencio el id resuelto y
  desactiva el match estricto de promos hasta que otro payload lo reponga.

**El arreglo obvio estaba mal.** `map['categoryId']?.toString() ?? existing?.categoryId`
haria IMPOSIBLE limpiar un id: un `null` autoritativo (backend diciendo "categoria
resuelta ya no existe") tambien caeria al fallback y dejaria el id obsoleto matcheando una
categoria de la que el producto ya no forma parte. La correccion distingue los tres casos:

```dart
categoryId: map.containsKey('categoryId')
    ? map['categoryId']?.toString()   // valor presente: sobrescribe (null limpia)
    : existing?.categoryId,           // key ausente (backend viejo): conserva
```

**Evidencia TDD.** RED observado primero con `git stash` de los dos ficheros de origen:
ambas aserciones de preservacion fallaron `Expected 'cat-uuid-...' Actual <null>`.
GREEN: priming 12/12 + sync 122/122, `flutter analyze` limpio.
**Presupuesto:** 73 lineas de diff contra las 140 declaradas (techo 200).

### Flujo de correccion nativo — descifrado completo (aplicable a todos los work-units)

1. 4 lentes → `correction_required` → STATUS ofrece `correction_plan_required` con
   `request_hash` → `gentle_review_capture` con `correctionLines` (lineas de diff) admite
   el plan.
2. STATUS devuelve `stop / corrected_candidate_unavailable` **y sigue devolviendo lo mismo**
   aunque los cambios esten en el working tree — `git add` (staged) **no mueve nada**: la
   proyeccion es del rango CONGELADO, no del workspace.
3. **El paso que desbloquea es COMMITEAR la correccion.** Acto seguido, STATUS devuelve
   `action=collect / targeted_validation_required` con `correction_candidate_tree` y
   exactamente los paths corregidos.
4. Slot `capture-validation` (materialize: forecast → ack) corre UN validador dirigido
   sobre el arbol corregido → `approved` → `acknowledge-approved` **sin input** →
   `authority: burned`.
   Toda commit ahi es segura: el recibo se quema ANTES de cualquier commit posterior.

**Tambien confirmado:** cuando el capture por GRUPO falla con errores de admision identicos
byte a byte o `stopReason: length` en un lente, la salida es capturar DE A SLOT con STATUS
fresco entre cada uno — los 4 lentes completaron por esa via (readability, que reventó en
grupo, corrio solo con 7430 bytes).

**Recibo:** `review-96bb16fbf6825a99` QUEMADO sobre `target sha256:74877c81…`
(`consumed_revision sha256:55990ff8…`). Seis hallazgos advisory informativos quedan como
follow-up: R1/R4-1/R4-2 (`sync:3252`, `priming:122`, WARNING), R2-1 (`priming:122`),
R2-2 (`promotions_engine:135`), R2-3 (`migrations_test:223`).

## 26. T0.5'd (2026-10-05): picker de categorias + contrato null — `3a40a15a`

**Defecto cerrado (urgente).** Tras T0.5'a el backend exige uuid, pero el form del dashboard
seguia mandando texto libre con default `''` — `'' !== undefined` asi que **todo create de
promocion desde el dashboard devolvia 400**, y editar no podia limpiar un target.

**Backend (contract).** DTOs `target_category_id?: string | null` (create+update;
`IsOptional` de class-validator ya salta null, update aplica via `Object.assign`) y el guard
trata `null` igual que `undefined` (create = global, update = limpiar). **`''` sigue con
BadRequest** — es la misma trampa de target en blanco que T0.5'a protege.

**Dashboard.**
- Input de texto -> `<select>` nativo con `useCatalogValues('SALES_PRODUCT_CATEGORY', true)`
  (**nativo porque Radix Select rechaza values `''`**). Categorias inactivas llevan sufijo
  ` (inactiva)`: un target guardado en una categoria desactivada debe renderizarse como lo
  que es, no parecer global.
- `schema.ts`: acepta solo `''` o uuid; el texto libre muere en cliente con mensaje en espanol.
- **Normalizacion de envio** (el corazon): create omite la key con `''` (backend -> global);
  update manda `null` explicito con `''` (`Object.assign` limpia); el id elegido pasa sin tocar.
- `PromotionsList`: resuelve id -> nombre con fallback `…ultimos8`; nunca uuid a pelo, nunca
  `Global` para un id no-nulo (2 sitios: fila y dialogo).
- `types/promotions.ts`: solo los dos DTOs ampliados a `string | null` (sin casts).

**Evidencia.** RED en ambos lados: backend (`2 failed` con el BadRequest del guard) y
dashboard (`3 failed` contra el schema de texto libre, tras `npm ci`). GREEN: backend
promotions **37/37**, dashboard promotions **31 passed / 4 skips pre-existentes**, tsc limpio
en las dos apps, oxlint sin warns nuevos, eslint+prettier limpios.

**Suites completas.** Backend **318 suites / 3523 tests** verdes. Dashboard: la primera
corrida completa tiro 2 tests en 1 fichero que **no se reprodujeron en 3 corridas
consecutivas** (95/95, 1361 passed x3); no capture sus nombres en su momento — queda como
transitorio sin identidad, mismo caracter que los flakes de flutter_tester.

**Seguimiento nuevo (encontrado por el worker, fuera de alcance).** En `PromotionForm`, los
inputs opcionales `start_date`/`end_date` registran `valueAsNumber`: vacios producen `NaN`,
`z.coerce.number()` rechaza con un error atado a campos sin UI, `onSubmit` nunca se dispara y
la creacion **no hace nada en silencio**. Los tests del picker rellenan las fechas (caso
realista). Corregir en una unidad aparte: preprocess `NaN -> undefined` en el schema o
sacar `valueAsNumber` de esos dos campos.

**Decidido en la iteracion:** opcion A (tipos compartidos ampliados, no cast) + `npm ci`
autorizado en el worktree (solo crea `node_modules`, lockfile de la rama).

## 27. T0.5'd — Recibo nativo y cierre (review-51ead544a49cabf0)

**Resultado.** `approved` sin corrección; **autoridad QUEMADA** antes de cualquier commit
posterior: `consumed_revision sha256:4405377a99db89f0ee64e318575528546e6d84790f56313fd79732736f38a479`,
`burn_evidence gentle-ai.review-acknowledged/v1`, target `sha256:59a168703c511375770af93ee6bb28e7d5c9aa3e4b51acfb4fb37d0824565dc4`,
tier high (hot path: `update-promotion.dto.ts`), 451 líneas, 11 paths.

**Proceso de captura (patrón confirmado por tercera vez).** El capture group abortó dos
veces por `stopReason: length` en lentes distintos (primero `reliability`, luego
`resilience`) con relay de 4 corridas. Vía per-slot: `risk` OK al primer intento,
`resilience` OK al segundo intento (tras `stopReason: length`), `readability` y
`reliability` OK al primer intento. STATUS fresco antes de cada slot, como manda el
contrato. La vía per-slot con reintentos sigue siendo la robusta.

**Hallazgos advisory (4, todos informativos — el recibo se mantiene y ninguno reabre):**

| Id | Lente | Ubicación | Severidad |
|----|-------|-----------|-----------|
| R2-1 | readability | `PromotionForm.tsx:114-118` | WARNING |
| R3-001 | reliability | `PromotionForm.tsx:201-209` | WARNING |
| R3-002 | reliability | `PromotionsList.test.tsx:282-287` | SUGGESTION |
| R4-1 | resilience | `PromotionForm.tsx:206` | WARNING |

Van al backlog de seguimiento junto al defecto `start_date`/`end_date` (`NaN` silencioso)
documentado en §26; ninguno bloquea el cierre de T0.5'd ni de Fase 0.

**Fase 0 completa:** T0.1' + T0.2' + T0.4' (por verificación) + T0.5'a (recibo deuda §22) +
T0.5'b (recibo) + T0.5'c (recibo) + T0.5'd (recibo). La identidad de categoría es uuid
`catalog_values.id` de punta a punta: backend → delta → motor en dispositivo → dashboard.

## 28. T1.2 — API REST CRUD de grupos, opciones y enganches (e691d4e5)

**Qué se construyó.** 12 rutas bajo `/modifier-groups` en `modifiers/`:
`GET /` (con filtros opcionales `?category_id=` / `?product_id=`), `GET /:id`, `POST /`,
`PATCH /:id`, `DELETE /:id` (borrado suave), CRUD de opciones bajo `/:groupId/options`,
y enganches `POST|DELETE /:id/categories[/:catalogValueId]` e
`POST|DELETE /:id/products[/:productId]`. Lecturas con los 4 roles, mutaciones
OWNER/MANAGER (convención promotions). 12 ficheros, +2155/−8.

**Doctrina aplicada (heredada y verificada):**
- Toda operación dentro de `runInTenantTransaction` con helpers basados en `manager`.
- `max_selected >= min_selected` espejo de `chk_modifier_groups_max_gte_min` → **400 antes
  que 500** (la SQL de la migración es el contrato; el servicio lo refleja).
- Nombre duplicado → `409 ConflictException` (doctrina de `catalog.service.ts`), pre-check
  dentro de la transacción.
- Guard de categoría idéntico a `assertValidTargetCategory` (tipo `SALES_PRODUCT_CATEGORY`,
  **un solo mensaje** para tenant ajeno/inexistente/tipo equivocado — sin oráculo
  cross-tenant). Guard de producto con la misma doctrina.
- **Invariante single-default nuevo:** `is_default=true` limpia los hermanos en la misma
  transacción (`clearSiblingDefaults`); T1.3 debe confiar en él, no re-verificarlo.
- `removeGroup` deja los junctions a propósito (el grupo inactivo deja de resolver en T1.3);
  el detach es DELETE duro porque los junctions no tienen `is_active`.

**TDD.** RED observado antes de implementar (ambas specs sin compilar, TS2307). GREEN:
**52 tests de servicio + 17 de controlador = 69/69**.

**Verificación del orquestador (independiente del reporte del worker):**
- `git status`/`diff`: sólo la superficie `modules/modifiers` + 2 ficheros fuera declarados abajo.
- Reproduje 69/69, `tsc --noEmit` exit 0, eslint 0/0, prettier limpio.
- **Suite completa: primer rojo legítimo** — `route-transport-registry.spec.ts`
  (`unclassified: route exists without a declared transport class` ×12): registry
  **fail-closed** en `test/support/route-transport-registry.ts` que el worker no podía tocar
  (fuera de su superficie). Arreglo: una línea `{ controller: 'ModifiersController',
  transport: 'human' }`. Corregido por el orquestador dentro de la unidad.
- Deuda de formato de T1.1 (`category-modifier-group.entity.ts`, prettier/eslint 3 errors
  preexistentes) corregida format-only en este commit.
- **Suite completa final: 320 suites / 3592 tests verdes, 0 rojos** (8 skips pre-existentes).

**Decisiones de diseño dentro del contrato:** attach/detach/opciones exigen grupo activo
(404); `PATCH` de grupo **no** filtra `is_active` para poder reactivar; la validación de uuid
de query vive en el servicio (patrón promotions).

**Riesgos señalados:** ver foco de revisión — invariante single-default, junctions que
sobreviven al soft-delete del grupo.

## 29. T1.2 — Recibo quemado + corrección R4-001 (review-6feb2ce8bd4c14dd)

**Resultado.** START con `baseRef` explícito (`a6399070…`, rango = sólo T1.2: 13 ficheros /
2210 líneas — el inspect por defecto ofrecía origin/main con los 67 paths de la rama,
re-empaquetando unidades ya quemadas; se evitó con `{"mode":"ordinary","baseRef":…,
"committedOnly":true}`). Tier high, 4 lentes + refuter + **corrección acotada** →
`approved` → **autoridad QUEMADA**: `consumed_revision sha256:1f0cd400…`,
target `sha256:132e53be…` (correction target `sha256:415a0b73…`).

**R4-001 (CRITICAL, real) y su corrección `8bb09926`.** `clearSiblingDefaults` hacía un
UPDATE sin lock y el `save` del nuevo default era otra sentencia: bajo READ COMMITTED dos
`is_default=true` concurrentes no se veían y el grupo quedaba con múltiples defaults.
Fix: `SELECT … FOR UPDATE` de la fila del grupo ANTES del clear (ordena grupo→opciones en
todos los caminos, sin deadlock) + docstring honesto. Plan **110** líneas, usado **105**.
Tests: 4 nuevos (2 de orden vía `invocationCallOrder` + 2 negativos de que no hay lock en
rutas no-default), RED observado (`lockCallIndex = -1`), modifiers **73/73**.

**Defecto de admisión decodificado (aplicable al flujo futuro).** El slot
`capture-validation` rechazó 5 veces con `capture-binding-rejected: missing or stale`:
el `collectBinding` de validación incluye un bloque **`validationRequest`** final
(camelCase) que los primeros renders de STATUS NO mostraban y mi copia omitía; la
comparación es `canonicalReviewCaptureBinding` (claves ordenadas recursivamente — el
ORDEN no importa, SÍ todo el contenido). Ritual correcto: **STATUS fresco → copiar el
binding COMPLETO incluyendo `validationRequest` → forecast → ack**. Errores propios
encontrados de paso: (a) transcripción de un JSON gigante a mano es frágil — verificar con
canon JSON local; (b) `inspect` sin `workspaceRoot` apunta al repo principal.

**Lentes `stopReason: length`.** readability necesitó 4 intentos y reliability 4 (prompts
~98KB); patrón: STATUS fresco → relanzar el binding reofrecido idéntico. El grupo volvió a
abortar; per-slot sigue siendo la vía.

**11 advisory informativos (backlog, ninguno reabre):** R2-binding-test-incomplete
(`spec:807`), R2-dead-injected-repositories (`service:44-54`), R2-self-exclusion-assertion-vacuous
(`spec:592-594`), R3-1..R3-5 (`service:454,298,135,100,389`), R4-002 (`service:270-293`),
R4-003 (`service:100-110`), R4-004 (`controller:151-164`).

## 30. T1.3 — Resolución server-side de grupos efectivos (38e37c71)

**Endpoint.** `GET /modifier-groups/effective?product_id=<uuid>` → lista ordenada de grupos
efectivos con `source: 'category' | 'product'` y sus opciones activas. La posición en el
array ES el orden (no hay campo `sort_order` en la respuesta). `@Get('effective')` declarado
ANTES de `@Get(':id')` — el matching de Nest es en orden y `:id` capturaría la ruta.

**Regla de resolución (T2.3 DEBE espejarla idéntica en el POS):**

1. **Lado categoría (heredado):** `products.category_code` → fila `catalog_values` del tenant
   con `catalog_type = SALES_PRODUCT_CATEGORY` y ese `code` → sus `category_modifier_groups`.
   Sin `code` o con código huérfano (sin fila catálogo) → conjunto heredado **vacío**, nunca
   un fallo.
2. **Lado producto (excepciones):** `product_modifier_groups` del producto.
3. **Unión con override:** dedup por `group_id`; si el producto engancha un grupo que también
   cuelga de la categoría, aparece **una sola vez** con `source: 'product'` (la excepción
   explícita gana), aunque su sort_order de categoría sea menor.
4. **Orden determinístico:** bloque `category` primero (`cmg.sort_order`, `group.name`,
   `group.id`), después bloque `product` (mismas claves con `pmg`).
5. **Filtrado fail-closed:** sólo `modifier_groups.is_active` y `modifier_options.is_active`.
6. Producto inexistente → 404 con mensaje único (sin oráculo cross-tenant); uuid malformado → 400.

**TDD.** RED primero (TS2339 `getEffectiveGroups` no existe, 0 tests), luego GREEN:
**82/82** en el módulo (8 tests nuevos de servicio + 1 de controlador). Verificado por el
orquestador de forma independiente: alcance de 4 ficheros dentro de la superficie, orden de
rutas, lint/prettier/tsc limpios, **suite completa 320/320 / 3605 tests verdes**.

## 31. T1.3 — Recibo quemado (review-389ba8dc54550829)

**Resultado.** Rango delimitado con `baseRef` explícito (`5d6e979a…` — el inspect por defecto
otra vez ofreció origin/main con toda la rama): 5 ficheros / 477 líneas. Tier **medium, 1
lente (reliability)** → `approved` al **3er intento** (intento 1: `stopReason: length` a los
188s; intento 2: `stopReason: stop` a 1.2s — relayer caído, carácter distinto) →
**autoridad QUEMADA**: `consumed_revision sha256:e853a3c9…`, target `sha256:42892ba1…`.

**Advisory (2, informativos → backlog):** R3-001 (`modifiers.service.ts:493-496`) y R3-002
(`modifiers.service.ts:539-543`), ambos WARNING de reliability sobre la resolución nueva.

**Verificación del orquestador (independiente):** 4 ficheros dentro de la superficie, orden
`@Get('effective')` antes de `@Get(':id')` verificado en el fichero, 82/82 del módulo, tsc,
eslint y prettier limpios, **suite completa 320/320 / 3605 tests verdes**.

## 32. T1.4.a — Pantalla de grupos + corrección R3-01 (review-453d0b084d90a63c, RECIBO QUEMADO)

**Unidad.** `b8a90e02` (11 ficheros, 1567 líneas): pantalla de grupos en el dashboard —
lista con reglas legibles ("Obligatorio 1/1" / "Opcional 0/3"), alta/edición con zod
espejando las reglas del backend, editor de opciones con default único en el estado del
form, desactivación con confirmación. Ruta `/modifiers`, sidebar "Modificadores" en
Gestión, rbac OWNER+MANAGER (pantalla de configuración pura, sin rol de lectura para
personal). **Regla de copy del dueño aplicada y codificada**: un test guardián recorre el
`textContent` renderizado y falla con `§`, `INV.`, `T\d.\d`, hashes o jerga
(uuid/tenant/zod/RLS) — guardado también como preferencia de proyecto (obs 9863).

**Corrección R3-01 (CRITICAL, real): `e8b73fd7`** — el guardado secuencial sin
reconciliación duplicaba opciones creadas en un retry y trababa desactivaciones en 404
permanente. Fix client-side (el candidato no incluye backend): crear adopta el `id`
devuelto en la fila (retry = PATCH), desactivar saca el id del set pendiente, y un 404
en una reintento cuenta como éxito idempotente. Plan **120**, usado **119**. RED observado
(3 failed), GREEN **22/22**, dashboard completo **1383**.

**Proceso.** El primer START devolvió `consent-binding-expired` (binding de >10 min,
`lineage_created: false`) — se repitió START para obtener uno fresco, sin linajes zombis.
El validador dirigido admitió al primer intento incluyendo el bloque `validationRequest`
completo desde STATUS (lección de §29 aplicada). 3 advisory → backlog: R3-02
(`form:167-182`), R3-03 (`form:131-139`), R3-04 (`form.test:1-361`).

**Incidente de proceso del worker (sin impacto en el repo):** un edit agresivo truncó el
spec a mitad de sesión; fue reconstruido fielmente (verificado por el orquestador: el diff
contra el commit es +85/−2, sólo adiciones). Un `git checkout` de recuperación fue
correctamente bloqueado por la guarda de seguridad y abandonado.

## 33. T1.4.b — Enganches por categoría y excepciones por producto (3a2a68e1, RECIBO QUEMADO)

**Unidad.** 9 ficheros / 1325 líneas: la pantalla de grupos ahora tiene 3 tabs — "Grupos",
"Por categoría", "Por producto". **Fase 1 COMPLETA** (T1.1-T1.4 todos con recibo quemado,
excepto la deuda documentada de T0.1'/T0.5'a).

**"Por categoría"** (flujo principal del plan): selector con el picker estilo promociones
(inactivas marcadas `(inactiva)`, nunca silenciosas), enganchados por `?category_id=`,
attach con `sort_order` append-at-end (no existe endpoint de reorden — deuda de capacidad
backend, anotada), detach con confirmación explícita.

**"Por producto"** sobre el endpoint T1.3: sección **"Heredado de la categoría"** (badge
"Heredado", SIN acción de borrar — quitar un enganche de categoría desde acá sería mentir;
una línea guía al tab de categoría) y **"Excepciones de este producto"** (badge "De este
producto", "Quitar" con confirmación). El picker de excepciones incluye grupos heredados
a propósito: agregar uno crea el override product-wins, explicado en copy plano:
"Al agregarlo aquí, este producto usará su propia configuración del grupo".

**Revisión.** `review-0abb49cc21d17f55` (medium, 1 lente): **approved al primer intento**,
sin refuter. **Recibo QUEMADO**: `consumed_revision sha256:d4a16faa…`. 3 advisory → backlog:
R3-001 (`category-attachments.tsx:170-172`), R3-002 (`product-exceptions.tsx:183-189`),
R3-003 (`product-exceptions.tsx:170-174`).

**Verificación del orquestador:** superficie exacta, copy audit limpio (los hits de
`uuid/tenant/zod` son identificadores de código, no texto visible), sección heredada sin
`onRemove` en el render, 32/32 del módulo, **suite completa 98/98 / 1393 tests**, tsc y
oxlint limpios. Copy guard extendido sobre los 3 tabs.

**Riesgos registrados:** selector de producto carga el listado completo con filtro client-
side (con catálogos muy grandes haría falta paginación — el filtro ya aísla el punto); el
reorden de enganches requiere un endpoint PATCH que hoy no existe.

## 34. T2.1 — Delta del catálogo de modifiers al POS (69041819, RECIBO QUEMADO) + T2.4 temprano

**Unidad backend** (3 ficheros, 671 líneas): `InboundSyncDeltasDto` gana
`modifierGroups` / `categoryModifierGroups` / `productModifierGroups` (opcionales en el
tipo, siempre poblados — precedente `alerts`), gating con variantes planas y con
guion bajo, y 3 builders.

**Decisión de diseño central: SNAPSHOT COMPLETO, sin `sinceDate`.** Los enganches se
borran con `DELETE` duro (T1.2 detach), así que un delta incremental `created_at > since`
**nunca** propagaría borrados. Las tablas son minúsculas ⇒ el estado completo es la
semántica correcta. El test `is independent of sinceDate: a future since still returns
every row` codifica la rationale. Grupos/opciones inactivos viajan como tombstones; el
`catalogCode` se resuelve en lote (una lectura `In`, sin N+1) y una fila catálogo
inexistente (imposible por FK) se salta con `warn`, nunca fabrica código.

**T2.4 cerrada dentro de esta unidad** (aterrizaje temprano, documentado con honestidad):
los 6 tokens entraron al set default de `parseRequestedTypes` porque es el patrón de la
casa (todos los tipos viven ahí) — mi contrato de delegación no lo excluyó, el worker lo
siguió y lo reportó. Está **doble-testeado** ("includes the three new keys by default" ×2).
Rechazarlo para re-hacer una línea en unidad aparte sería burocracia, no disciplina.

**Reorden honesto de Fase 2**: el ingest POS (mitad de T2.1 original) se mueve a **T2.2**
— depende de las tablas locales espejo que todavía no existen; el orden estricto es
backend → tablas/DAOs+ingest → resolución T2.3.

**Revisión.** `review-1b5973f1aa5f1a69` (medium, 1 lente): **approved al primer intento**,
**recibo QUEMADO** (`consumed_revision sha256:10c46e6d…`). 1 advisory → backlog:
R3-CATALOG-TYPE-FILTER (`inbound-sync.service.ts:1321-1322`). Segundo
`consent-binding-expired` del día — resuelto con re-START (`lineage_created: false`).

**Verificación del orquestador:** 66/66 del spec, **suite completa 3614 tests**, tsc,
prettier y eslint limpios, sólo los 3 ficheros de la superficie.

## 35. T2.2 — Espejo SQLite + ingest (4d018f6c + 28664f79, RECIBO QUEMADO)

**Unidad encadenada.** Cuatro entidades Floor (uuid TEXT PK, sin columna tenant), `ModifierDao`
con UN `replaceAllModifierData` `@transaction` de argumentos posicionales (DELETE+INSERT
atómico = propagación de los borrados duros), migración `61→62` con sonda, e ingest en
`sync_service.dart` **presencia-correcta por key**: key ausente (backend viejo) salta la
rama sin wipe; key presente aunque vacía = reemplazo autoritativo; grupos+opciones siempre
juntos; las tablas no dueñas se preservan leyéndolas y re-insertándolas en la misma
transacción. 11 tests nuevos; suite completa POS verificada por el orquestador (2985 con
sólo el flake rotativo `flutter_tester`, ambos ficheros verdes individuales).

**`lens_context_budget_exceeded` — diagnóstico y solución.** El primer commit de la unidad
(6178+4664 líneas) reventó el presupuesto del lente. El villano NO fue el código (1380
líneas reales) sino el **churn generado de 7 ficheros `*.mocks.dart` (~9.7k líneas de
renumbering de aliases por meterse `ModifierDao` en `AppDatabase`)**. Verificado que los
mocks viejos compilan y pasan (mockito `noSuchMethod`) ⇒ **descartados de la unidad** y el
historial reescrito con `reset --soft` en dos commits encadenados. Lección: regenerar
mockito puede inflar el diff ×7 — ojo con el presupuesto de revisión.

**Incidente del relay (7 intentos + reinicio de Pi).** El lente `reliability` falló en
cascada: `length` → `stop` (1.4s) → JSON truncado (967 B) → replay → JSON truncado (3506 B)
→ replay → replay antiguo. El relay reenviaba bytes rechazados en vez de correr de nuevo.
**El reinicio de Pi lo resolvió de entrada**: forecast → ack → `approved` con 3 advisory.
Dos lecciones de ritual: (a) tras un reinicio, el capture necesita `workspaceRoot` explícito
(`collectBinding belongs to a different registered route` — el mapa de rutas retenidas vive
en proceso); (b) si el ack devuelve otro forecast, repetir el ack.

**Advisory → backlog:** R3-001 (`sync_service.dart:4034`), R3-002 (`migrations.dart:2717`),
R3-003 (`sync_service.dart:4077`). El payload truncado reveló de paso un hallazgo real
(`R3-SCHEMA-PARITY`, prefijo `index_` de Floor vs `idx_` de la migración) que quedó
cubierto por el resultado completo — está en los advisory.

**Recibo QUEMADO**: `consumed_revision sha256:4e5e72fc…`, target `sha256:f4820c2b…`.

## 36. T2.3 — Resolución efectiva en el dispositivo (308345bc + 56b458ae, RECIBO QUEMADO)

**El defecto raíz está cerrado.** `toProductDomain` aceptaba `modifiers` con default vacío y su
único llamador no los pasaba: todo producto cargaba sin modificadores y el selector decía
"agregar directo" sobre dato vacío (lógica correcta, dato inexistente). Ahora:

- `Product.availableModifierGroups` (freezed `EffectiveModifierGroup/Option` nuevos, el
  `Modifier` plano legacy intacto).
- `ModifierResolutionService.resolveEffective`: función pura estática **espejo exacto de §30** —
  lado categoría por `product.category_id` (el uuid ya resuelto desde T0.5'b, equivalente al
  `code → catálogo` del servidor), lado producto, dedup con victoria del producto, orden
  bloque categoría → bloque producto `(sort_order, name, id)`, filtros `is_active`
  fail-closed, attachments colgados saltados sin crash.
- Los 2 sitios de carga piden el snapshot de 4 datasets **una vez** y resuelven en memoria
  (nunca queries por producto). UI fuera de alcance a propósito → T3.1.

**Corrección R3-001 (CRITICAL, determinista): `56b458ae`** — `productGroupIds` se construía con
**toda** la tabla de attachments: la excepción de un producto suprimía el grupo heredado para
**todos** los demás productos de la categoría. Fix: `ownAttachments` (filtrado por producto)
primero, el set derive de él. Plan **70**, usado **54**. RED reprodujo el fallo exacto
(el producto hermano resolvía `[]`). La suite de paridad no lo había visto: su caso de
doble-enganche usaba un solo producto — **lección: los tests de §30 deben sembrar DOS productos**.

**Revisión.** `review-0cf9ebd78f2f51ff` (medium, 1 lente) → corrección → validador dirigido
**aprobado sin advisories**. **Recibo QUEMADO**: `consumed_revision sha256:551e6267…`,
target `sha256:f2c108f7…`. Ritual post-reinicio confirmado: `workspaceRoot` explícito en todo
capture/ack.

**Verificación del orquestador:** 32 tests nuevos (8 paridad + 5 wiring + fix), mocks de
mockito fuera de superficie revertidos (6 ficheros, `analyze` + suites verdes sin ellos),
suite completa con sólo el flake rotativo `flutter_tester` (todos verdes individuales).
**FASE 2 COMPLETA** (T2.1-T2.4).

## 37. T3.1 — Selector agrupado (30b4d471 + corrección 1837c89c, RECIBO QUEMADO)

**Unidad.** `30b4d471` (3 ficheros, 632 líneas): la puerta abre con `availableModifierGroups`
(productos agrupados ya no se agregan directo — síntoma visible del defecto original), el
diálogo renderiza por grupo **en orden del resolver**: radio (`max=1`, preselección sólo con
`isDefault`), checkbox (`max>1`), stepper `−/n/+` con **tope del total del grupo** en
`allow_quantities`. Encabezados en palabras de negocio ("Elige hasta 3 · puedes repetir"),
nunca enteros de configuración. Puente a la `List<Modifier>` plana con
`extraPrice = cantidad × delta` (la aritmética del recibo queda correcta hoy; totales con
cantidad y ticket de cocina son T3.3). Sección legacy plana eliminada (dato muerto).

**Corrección — 3 CRITICAL deterministas (`1837c89c`):**
1. `R3-CHECKBOX-MAX-UNENFORCED` — el checkbox no respetaba `maxSelected` mientras el header
   prometía el tope. *(Gap del contrato del orquestador: el tope sólo lo pedí a los steppers.)*
2. `R3-LEGACY-FLAT-DROP` — la puerta mantenía `availableModifiers` y el diálogo ya no lo
   renderizaba → área vacía y AGREGAR como foso silencioso. Sección restaurada tras guard
   `isNotEmpty` + puente legacy.
3. `R3-MINSELECTED-UNENFORCED` — AGREGAR nunca leía `minSelected`: grupos obligatorios
   saltables. Ahora bloquea con error inline en español ("Falta elegir una opción en «Leche»")
   que se limpia solo al satisfacer.

**Presupuesto.** Plan declarado **170**, real **199** (source 78 + tests 121 tras comprimir
con builders compartidos y fusión de tests) — **techo del proveedor 200 respetado**, y la
validación **no** mide contra la estimación declarada (confirmado empíricamente: pasó con
199 > 170). Lección: declarar cerca del techo cuando el alcance tenga 3 hallazgos.

**T3.2 ABSORBIDA**: la validación local min/max al tocar AGREGAR quedó dentro de esta
corrección; sus tests (bloqueo por grupo obligatorio, liberación al satisfacer, grupo
opcional nunca bloquea) son la evidencia de cierre.

**Discrepancia de reporte (verificada contra disco):** el worker reportó 14 tests y nombró un
test "legacy-only" inexistente; el inventario real es **8 dialog + 5 gate = 13**, todo verde.
El escenario legacy-only comparte la rama `isNotEmpty` con el test de coexistencia (fuente
verificada por el orquestador); el techo de 200 impedía sumar el test faltante sin sacrificar
aserciones mandadas. Queda como deuda menor de cobertura.

**Revisión.** `review-805e9c2427429ae7` (medium, 1 lente) → corrección → validador
aprobado. **Recibo QUEMADO**: `consumed_revision sha256:4ca2d8b6…`, target
`sha256:8446eb24…`. Suite POS en su mejor número de la rama (3014 + flake rotativo,
individuales verdes), `analyze` limpio.

## 38. T3.3 — Cantidades de primera clase + ticket de cocina (dd4cc77e, RECIBO QUEMADO)

**Unidad.** 21 ficheros / 648 líneas (+609/−39 tracked tras reventar el churn de mocks):
- `Modifier.quantity` (`@Default(1)`) con compatibilidad obligatoria: payloads viejos sin la
  clave (historial de facturas) deserializan como cantidad 1 — probado en carrito, recibo y
  roundtrip JSON.
- Puente AGREGAR con `extraPrice` **por unidad** + `quantity` explícito (el test de T3.1 se
  actualizó honestamente: 2×15 dejó de ser `30` y pasó a `15` + `qty 2`).
- `modifiersTotal` en `CartItemX` **y** `ReceiptLine.fromInvoiceItem` con la fórmula idéntica:
  `Σ(extraPrice × quantity) × cantidad_línea`.
- Persistencia fail-closed: JSON de checkout con `quantity` + columna en
  `invoice_item_modifiers` vía migración **62→63** re-ejecutable — una reimpresión nunca
  pierde el conteo.
- Recibo: `2x Extra Shot (por unidad: C$ 15.00)`.
- **Cocina**: helper único `KitchenModifierLines.forItem` → `[MOD] 2x Extra Shot` (sin
  dinero) consumido por el formateador que los 3 adaptadores (mock/sunmi/ipos) ya llaman —
  antes los tickets no llevaban conteos.
- Tile del carrito lista `2x Extra Shot, 1x Crema`.

**Cobertura.** RED primero (errores de compilación por el campo nuevo + tests de comportamiento
que esperaban `30`), GREEN 25 tests nuevos; dos expectativas existentes actualizadas con
honestidad (conteos explícitos en formateador, cadena de migraciones 62→63). Suite POS en su
mejor número: **3024** + flake rotativo (individuales verdes), `analyze` limpio. Churn de
mockito (6 ficheros ~4.3k líneas) revocado en la terminal — diff real del commit: **+609/−39**.

**Revisión.** `review-094ea9de125206f3` (medium, 1 lente): **4 intentos** con JSON truncado
(4728 → replay → 1695 → replay) — el mismo síntoma de relay de §35, resuelto **otra vez con
reinicio de Pi al primer intento post-restart** (patrón confirmado ×2: si el reviewer corta
JSON, reiniciar es el fix). **Recibo QUEMADO**: `consumed_revision sha256:38436d30…`.
4 advisory → backlog: R3-001 (`app_database.g.dart:273`), R3-002 (`product.g.dart:101`),
R3-003 (`kitchen_modifier_lines.dart:12-13`), R3-004 (`invoice_modifier_quantity_test.dart:55-85`).

**FASE 3 COMPLETA** (T3.1 + T3.2 absorbida + T3.3).

## 39. T4.1 — Editor de opciones del BOH a sólo lectura (0de4ead9, RECIBO QUEMADO)

**Unidad.** 4 ficheros (+281/−209): el editor se vuelve pantalla stateless de consulta —
se eliminan la barra "GUARDAR CAMBIOS", el callback `onSave` y el método huérfano
`saveProductOptions` del viewmodel. La pestaña MODIFICADORES renderiza
`availableModifierGroups` (la verdad real desde T2.3) con deltas `+C$` y el banner
"Los modificadores se administran desde el panel web, en Gestión → Modificadores"; la
legacy plana se borra (dato muerto que mentiría). VARIANTES en display con su empty state
**sin claim de web** (esa superficie no existe — mentir sería peor que un tab vacío).
Copy guard como test sobre todos los strings renderizados.

**Peligro de borrado descubierto en la exploración y cerrado aquí:** el editor abría
**vacío** en ambas pestañas (carga por `getActiveProducts()`, que no puebla variants ni
modifiers al dominio) y "GUARDAR CAMBIOS" ejecutaba un `replaceProductOptions` con listas
vacías = **wipe** de las tablas legacy. Sin la ruta de guardado, el hazard es
inalcanzable desde la UI. (Evidencia S23 de §1 — "al reabrir la lista estaba vacía" —
queda explicada: la reapertura lee el dominio, no la tabla.)

**Código muerto inventariado (NO borrado — unidad futura):** `InventoryRepository
.saveProductOptions` (+impl), `ProductDao.replaceProductOptions`, `findVariantsByProductId`
/ `findModifiersByProductId` — lectores sin llamadores de producción.

**Revisión.** `review-95cbd425008be9d6` (medium, 1 lente): **approved al primer intento**
con 1 advisory (R3-001 en el test, informativo → backlog). **RECIBO QUEMADO**:
`consumed_revision sha256:d2d6871d…`. Verificación del orquestador: alcance exacto (3 lib +
1 test), audit de copy limpio, inventario UI **114/114**, suite completa **3011** con sólo
el flake rotativo (5 ficheros, todos verdes individuales), `analyze` limpio.

**Nota de proceso:** el primer worker de esta unidad murió por infraestructura
("process cleanup unconfirmed; capacity quarantined") dejando el árbol LIMPIO (verificado
antes de relanzar); relanzado como tarea nueva con el contrato completo.

## 40. T4.2 — Defectos del campo dinero: RETIRADOS con el editor viejo (cierre por verificación)

**Sin código nuevo — ambas deudas vivían en el editor de BOH y T4.1 las retiró con sus
formularios** (el plan permitía "retirar o corregir"). Evidencia:

1. **`0.0` que concatena (`15 → 0.015`, clase D-16):** el editor pre-T4.1 sembraba
   `TextEditingController(text: ... ?? '0.0')` en "Ajuste de Precio" y "Precio Extra" sin
   selección-al-tocar — verificado contra `git show 0de4ead9~1`. Hoy el editor tiene **0
   TextField**. Barrido de toda `lib/ui`: el único controller con seed es
   `CloseBoxDialog('0.00')`, protegido con selección-total al tocar (patrón anti-concat,
   distinto del defecto); el patrón canónico D-16 ("vacío, '0.00' sólo es hint") está
   documentado en apertura y cierre de caja.
2. **Prefijo `$` en vez de `C$`:** barrido de los 11 `prefixText` de la app: **cada `$`
   suelto corresponde a un campo USD** ("Fondo USD", "Monto fijo en dólares",
   `isNio ? C$ : $` condicionales) y **todos los campos NIO usan `C$`**. Ningún córdoba
   muestra `$`.

**Verificación del orquestador:** grep de seeds `'0.0'`, inventario completo de
`prefixText`, y conteo de inputs del editor — los tres limpios. T4.2 cierra como T0.4':
sin diff, con evidencia.
