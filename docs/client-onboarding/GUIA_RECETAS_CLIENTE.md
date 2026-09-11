# Guía para Preparar Información de Recetas — NHILOS POS

> **Para:** Dueños/gerentes de cafeterías
> **Objetivo:** Facilitar la carga inicial de inventario y recetas en el sistema
> **Formato sugerido:** Hoja de cálculo (Excel / Google Sheets / CSV)

---

## 1. Conceptos Básicos que Debes Conocer

| Concepto | Qué es | Ejemplo en una cafetería |
|----------|--------|--------------------------|
| **Insumo** | Materia prima que compras y se consume | Café en grano, leche entera, azúcar, jarabe de vainilla, vasos, tapas |
| **Producto (venta)** | Lo que vendes al cliente final | Cappuccino 12oz, Latte Vainilla 16oz, Croissant, Agua 500ml |
| **Sub-receta** | Preparación intermedia reutilizable | Jarabe de la casa, Leche evaporada casera, Cold brew concentrate |
| **Receta** | Fórmula que define cuánto de cada insumo/sub-receta lleva un producto | "Latte Vainilla 16oz = 30ml espresso + 200ml leche + 15ml jarabe vainilla" |

> **Regla de oro:** Todo lo que **compras** es **Insumo**. Todo lo que **vendes** es **Producto**. Lo que **preparas internamente y usas en varios productos** es **Sub-receta**.

---

## 2. Información Mínima Requerida por Artículo

### 2.1 Insumos (Materias Primas)

| Campo | Obligatorio | Descripción | Ejemplo |
|-------|-------------|-------------|---------|
| `nombre` | ✅ | Nombre claro y único | "Café Grano Arábica 1kg" |
| `unidad_consumo` | ✅ | Unidad en que se **descuenta** al producir | "g" (gramos), "ml", "unidad" |
| `stock_inicial` | ✅ | Cantidad física actual en bodega | 5000 (para 5kg en gramos) |
| `costo_promedio` | ✅ | Costo unitario en tu moneda (NIO) | 120.00 (por 100g) |
| `es_perecedero` | ❌ | true/false (afecta alertas de vencimiento) | true |
| `stock_minimo` | ❌ | Alerta de reorden | 1000 |
| `codigo_barras` | ❌ | Si lo tienes | "7501234567890" |

> **Importante:** La `unidad_consumo` debe ser **la más chica** en que mides al producir. Si compras café en "kg" pero lo usas en "g", pon "g" y el stock inicial en gramos (1kg = 1000g).

### 2.2 Productos (Lo que Vendes)

| Campo | Obligatorio | Descripción | Ejemplo |
|-------|-------------|-------------|---------|
| `nombre` | ✅ | Nombre en carta | "Cappuccino 12oz" |
| `precio_venta` | ✅ | Precio final al cliente (NIO) | 45.00 |
| `unidad_venta` | ✅ | Siempre "unidad" (cada taza) | "unidad" |
| `es_preparado` | ✅ | true = tiene receta / false = se vende tal cual | true |
| `categoria` | ❌ | Para reportes | "Bebidas Calientes" |
| `sku` | ❌ | Código interno | "CAP12" |
| `tiene_variantes` | ❌ | true si hay tamaños/sabores | true |

> **Variantes:** Si un producto tiene tamaños (12oz, 16oz) o sabores (Vainilla, Caramelo), cada combinación es un **producto separado** con su propia receta.

### 2.3 Recetas (Fórmulas)

Para cada producto `es_preparado = true`, necesitas su receta:

| Campo | Obligatorio | Descripción | Ejemplo |
|-------|-------------|-------------|---------|
| `producto_nombre` | ✅ | Nombre exacto del producto | "Cappuccino 12oz" |
| `insumo_o_subreceta` | ✅ | Nombre exacto del insumo o sub-receta | "Café Grano Arábica", "Leche Entera", "Jarabe Vainilla" |
| `tipo` | ✅ | "insumo" o "subreceta" | "insumo" |
| `cantidad_bruta` | ✅ | Cantidad teórica según receta estándar | 18 (gramos café), 150 (ml leche) |
| `merma_tecnica_pct` | ❌ | % de pérdida en preparación (default 0) | 5 (para café: queda en filtro) |
| `unidad_componente` | ❌ | Si difiere de la unidad_consumo del insumo | "ml" (si insumo es "L") |

> **Cantidad neta** = `cantidad_bruta` × (1 - `merma_tecnica_pct`/100)
> El sistema calcula el costo real absorbiendo la merma.

### 2.4 Sub-Recetas (Preparaciones Internas)

Si preparas algo que usas en **varios** productos (ej. jarabe, cold brew, adobo):

| Campo | Obligatorio | Descripción | Ejemplo |
|-------|-------------|-------------|---------|
| `nombre` | ✅ | "Jarabe Vainilla Casa" |
| `rendimiento_esperado` | ✅ | Cantidad que produce el batch | 2000 (ml) |
| `unidad_rendimiento` | ✅ | "ml", "g", "unidad" | "ml" |
| `dias_vida_util` | ❌ | Días antes de vencer (default 2) | 7 |
| `ingredientes` | ✅ | Lista de insumos/sub-recetas con cantidades | Ver abajo |

**Ingredientes de la sub-receta** (misma tabla que recetas de producto):

| insumo_o_subreceta | tipo | cantidad_bruta | merma_tecnica_pct | unidad_componente |
|---|---|---|---|---|
| Azúcar | insumo | 1000 | 0 | g |
| Agua | insumo | 1000 | 0 | ml |
| Esencia Vainilla | insumo | 50 | 0 | ml |

---

## 3. Plantilla Excel / CSV (Copiar y Pegar)

### Hoja 1: INSUMOS

```csv
nombre,unidad_consumo,stock_inicial,costo_promedio,es_perecedero,stock_minimo,codigo_barras
Café Grano Arábica 1kg,g,5000,120.00,true,1000,
Leche Entera 1L,ml,20000,0.35,true,5000,
Azúcar Refinada 1kg,g,10000,0.12,false,2000,
Jarabe Vainilla Comercial 750ml,ml,750,0.80,false,150,
Vasos 12oz Cartón,unidad,500,1.50,false,100,
Tapas 12oz,unidad,500,0.80,false,100,
```

### Hoja 2: PRODUCTOS

```csv
nombre,precio_venta,unidad_venta,es_preparado,categoria,sku,tiene_variantes
Cappuccino 12oz,45.00,unidad,true,Bebidas Calientes,CAP12,true
Latte Vainilla 16oz,55.00,unidad,true,Bebidas Calientes,LAV16,true
Americano 12oz,35.00,unidad,true,Bebidas Calientes,AME12,false
Croissant Mantequilla,30.00,unidad,false,Panadería,CRO01,false
Agua Mineral 500ml,20.00,unidad,false,Bebidas Frías,AGU500,false
```

### Hoja 3: RECETAS_PRODUCTOS

```csv
producto_nombre,insumo_o_subreceta,tipo,cantidad_bruta,merma_tecnica_pct,unidad_componente
Cappuccino 12oz,Café Grano Arábica,insumo,18,5,g
Cappuccino 12oz,Leche Entera,insumo,120,0,ml
Latte Vainilla 16oz,Café Grano Arábica,insumo,18,5,g
Latte Vainilla 16oz,Leche Entera,insumo,200,0,ml
Latte Vainilla 16oz,Jarabe Vainilla Casa,subreceta,15,0,ml
Americano 12oz,Café Grano Arábica,insumo,18,5,g
Americano 12oz,Agua Caliente,insumo,180,0,ml
```

### Hoja 4: SUB_RECETAS

```csv
nombre,rendimiento_esperado,unidad_rendimiento,dias_vida_util
Jarabe Vainilla Casa,2000,ml,7
Cold Brew Concentrate,1000,ml,14
```

### Hoja 5: RECETAS_SUB_RECETAS

```csv
subreceta_nombre,insumo_o_subreceta,tipo,cantidad_bruta,merma_tecnica_pct,unidad_componente
Jarabe Vainilla Casa,Azúcar Refinada,insumo,1000,0,g
Jarabe Vainilla Casa,Agua,insumo,1000,0,ml
Jarabe Vainilla Casa,Esencia Vainilla,insumo,50,0,ml
Cold Brew Concentrate,Café Grano Arábica,insumo,200,0,g
Cold Brew Concentrate,Agua,insumo,1000,0,ml
```

---

## 4. Ejemplos Completos para Cafetería

### 4.1 Bebidas Base (Espresso)

| Producto | Café (g) | Leche (ml) | Agua (ml) | Jarabe (ml) | Merma Café |
|----------|----------|------------|-----------|-------------|------------|
| Espresso Sencillo | 18 (5%) | - | 30 | - | 5% |
| Espresso Doble | 36 (5%) | - | 60 | - | 5% |
| Americano 12oz | 18 (5%) | - | 180 | - | 5% |
| Americano 16oz | 36 (5%) | - | 240 | - | 5% |

### 4.2 Bebidas con Leche

| Producto | Café (g) | Leche (ml) | Merma Café |
|----------|----------|------------|------------|
| Cappuccino 12oz | 18 (5%) | 120 | 5% |
| Cappuccino 16oz | 36 (5%) | 180 | 5% |
| Latte 12oz | 18 (5%) | 200 | 5% |
| Latte 16oz | 36 (5%) | 300 | 5% |
| Flat White 12oz | 36 (5%) | 120 | 5% |

### 4.3 Bebidas con Sabores (usan Sub-receta "Jarabe Vainilla Casa")

| Producto | Café (g) | Leche (ml) | Jarabe Vainilla (ml) |
|----------|----------|------------|----------------------|
| Latte Vainilla 12oz | 18 (5%) | 200 | 15 |
| Latte Vainilla 16oz | 36 (5%) | 300 | 20 |
| Cappuccino Caramelo 12oz | 18 (5%) | 120 | 15 (jarabe caramelo) |

### 4.4 Sub-Receta: Jarabe Vainilla Casa (Rinde 2 Litros)

| Insumo | Cantidad | Unidad |
|--------|----------|--------|
| Azúcar Refinada | 1000 | g |
| Agua | 1000 | ml |
| Esencia Vainilla | 50 | ml |

**Costo aprox:** (1000g × $0.12/g) + (1000ml × $0.001/ml) + (50ml × $0.50/ml) = $120 + $1 + $25 = **$146 / 2000ml = $0.073/ml**

---

## 5. Checklist Antes de Enviar

- [ ] **Todos los insumos** que compras están listados con `unidad_consumo` en la unidad MÁS PEQUEÑA de uso
- [ ] **Stock inicial** contado físicamente y convertido a esa unidad
- [ ] **Costo promedio** actual por unidad de consumo (si compras 1kg a $120 y usas gramos → $0.12/g)
- [ ] **Todos los productos de la carta** están listados, incluyendo variantes de tamaño/sabor
- [ ] **Cada producto preparado** tiene su receta completa (todos sus insumos/sub-recetas)
- [ ] **Sub-recetas** identificadas (lo que preparas en batch y usas en varios productos)
- [ ] **Merma técnica** estimada para cada ingrediente (ej. café 5%, leche 0%, jarabe 0%)
- [ ] **Unidades consistentes**: si el insumo es "ml", la receta usa "ml"; si insumo es "g", receta usa "g"
- [ ] **Nombres exactos coinciden** entre hojas (sin espacios extra, mayúsculas iguales)

---

## 6. Preguntas Frecuentes

**P: ¿Qué pasa si mi receta usa "1 shot" de café?**
R: Define cuántos gramos es tu "shot" (ej. 18g) y usa gramos en la receta. La merma del 5% cubre lo que queda en el portafiltro.

**P: ¿Y si uso leche de soja/avena en algunas bebidas?**
R: Crea insumos separados: "Leche Soja 1L", "Leche Avena 1L" con sus propios costos. Haz productos separados: "Latte Soja 12oz", "Latte Avena 16oz" con sus recetas.

**P: ¿Tengo que poner merma en todo?**
R: No. Pon merma solo donde haya pérdida real medible: café (queda en puck), frutas (cáscara), carnes (grasa/hueso). Para líquidos que se vierten completos (leche, agua, jarabes), merma = 0.

**P: ¿Cómo manejo "un chorrito de jarabe" que mide el barista a ojo?**
R: Estandariza: define que "1 chorrito = 15ml" y pon 15ml en la receta. Si el barista echa más, el sistema detectará variación en el conteo de inventario.

**P: ¿Los vasos y tapas van en recetas?**
R: Sí, si quieres control total de costos y stock. Pon `tipo = insumo`, `cantidad_bruta = 1`, `unidad_componente = unidad`. Si no, déjalos fuera y solo controla stock manual.

**P: ¿Qué hago con productos que no tienen receta (ej. galleta empacada)?**
R: `es_preparado = false`. El sistema solo descontará stock al vender, sin explosión de receta.

---

## 7. Próximos Pasos

1. **Descarga** la plantilla Excel adjunta (o copia las tablas CSV arriba)
2. **Llena** con tu información real (usa una hoja por pestaña)
3. **Revisa** el checklist de la sección 5
4. **Envía** el archivo a tu implementador de NHILOS POS
5. **Agenda** 30 min para validar juntos la carga inicial en el sistema

---

## 8. Contacto y Soporte

- **Implementador:** [Tu nombre/empresa]
- **Email:** [tu@email.com]
- **WhatsApp:** [tu número]
- **Horario de soporte:** [ej. Lun-Vie 9am-6pm]

> **Nota:** Una vez cargada la info, el sistema calcula automáticamente:
> - Costo de cada producto (para márgenes)
> - Alertas de stock bajo
> - Órdenes de compra sugeridas
> - Trazabilidad por lote (DGI Nicaragua)
> - Mermas reales vs teóricas

---

*Documento versión 1.0 — NHILOS POS — Preparado para onboarding de cafeterías*