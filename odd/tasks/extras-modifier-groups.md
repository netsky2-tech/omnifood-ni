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
| 4 | ¿Cómo se enganchan a las categorías? | **Normalizar categorías a id propio** |

### Costo de la decisión 4, dicho sin adornos

Elegir identidad de categoría es la opción correcta y **la más cara**: hoy la categoría es texto libre en
los dos lados, y hay que crear la entidad, backfillear desde los strings existentes, y tocar importador,
sync, catálogo y promociones. **Es casi la mitad del esfuerzo total y no entrega valor visible por sí sola.**
Se paga porque sin ella el enganche por categoría se rompe al renombrar una categoría, y porque el enganche
por categoría es justamente lo que hace que configurar extras sea fácil en vez de cargarlos 58 veces.

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

### Fase 0 — Categorías con identidad (prerequisito, decisión 4)

- [ ] **T0.1** Entidad `product_categories` (tenant-scoped + RLS) y migración. Sembrar desde los
      `catalog_values` de tipo `SALES_PRODUCT_CATEGORY` y desde los `products.category_code` ya en uso.
- [ ] **T0.2** `products.category_id` con backfill desde `category_code`.
- [ ] **T0.3** Importador de menú: el nombre de la hoja crea/reusa la categoría y asigna `category_id`
      (hoy `MENU_COLUMNS = [producto, precio, insumo, cantidad, unidad]` y la hoja **es** la categoría).
- [ ] **T0.4** Sync: `categoryId` + `categoryName` en el delta de productos y un delta de categorías.
- [ ] **T0.5** Dashboard `/catalog`: administrar categorías.
- [ ] **T0.6** Promociones: `Promotion.target_category_id` convive con la entidad nueva (hoy engancha por
      nombre contra `item.category`).

### Fase 1 — Modelo de grupos (backend + web)

- [ ] **T1.1** Entidades + migración con RLS:
      `modifier_groups` (name, min_selected, max_selected, allow_quantities, display_order, is_active),
      `modifier_options` (group_id, name, price_delta, is_default, display_order, is_active),
      `category_modifier_groups`, `product_modifier_groups`.
- [ ] **T1.2** API REST: CRUD de grupos y opciones, y enganches por categoría y por producto.
- [ ] **T1.3** Resolución server-side de los grupos efectivos: categoría ∪ producto, con orden y overrides.
- [ ] **T1.4** Dashboard: pantalla de grupos (nombre, min/max, cantidades, opciones con delta y default) y
      el flujo principal **"pegar grupos a una categoría"**, más la excepción por producto mostrando lo
      heredado como heredado.

### Fase 2 — Bajada y espejo local

- [ ] **T2.1** Tipos de delta nuevos (`modifierGroups`, `categoryModifierGroups`, `productModifierGroups`)
      en el inbound service y sus DTOs.
- [ ] **T2.2** Tablas locales espejo + DAOs.
- [ ] **T2.3** **Resolver los grupos efectivos al cargar el producto** — el punto exacto donde hoy se
      descartan las opciones. Acá se cierra el defecto de raíz.
- [ ] **T2.4** Verificar que el pull del POS pida los tipos nuevos.

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

- **El pull del POS:** no se verificó qué `types` pide el dispositivo al sincronizar. Si no pide los tipos
  nuevos, el delta nunca llega — se cubre en T2.4.
- **Categorías por texto libre:** el enganche actual de promociones depende de `item.category` como string.
  La Fase 0 debe dejar claro si convive o migra, para no dejar dos verdades.
- **El dashboard apunta a una API no confirmada.** La documentación dice
  `VITE_API_URL=https://api-staging.nhilospos.com/api`, pero el bundle publicado no menciona `staging` ni
  `nhilospos.com`, y el host devuelve `text/html` en `/api/v1/health` (no proxya). **Sin confirmar:** hay que
  mirarlo en la pestaña de red del panel. Si el panel del dueño leyera staging, todo lo que ve estaría mal, y
  además es donde se van a configurar los extras.
- **Tamaños:** los productos de SOHO codifican el tamaño en el nombre (`Americano 8oz` / `12oz`). La
  industria usaría variantes. Fuera de alcance; no bloquea.
