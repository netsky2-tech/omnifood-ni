# SOHO — Plan de Prueba Integral End-to-End

**Objetivo**: Validar el estado go-live real del sistema con el menú completo de SOHO.
**Criterio de éxito**: Un día completo de operación simulada sin gaps funcionales.
**Cuándo**: Cuando el dispositivo de SOHO esté disponible.

---

## 0. Datos del menú de SOHO (fuente: Excel del owner)

### Brunch
| Producto | Componentes |
|---|---|
| Desayuno Americano | 2 huevos al gusto, 2 tiras de bacon, 2 pancakes con mantequilla y miel, 1 rebanada pan de masa madre |
| Desayuno Pinolero | 2 huevos al gusto, 1 taza pequeña gallo pinto, 4 rebanadas de maduro frito, 2 onzas queso frito |
| Omelet Jamón y Queso | 2 huevos en torta, relleno jamón pavo + queso mozarella, 1 rebanada pan de masa madre |
| Tostadas Morning | 2 slices pan de masa madre, queso derretido, 2 huevos revueltos, 2 tiras de bacon |
| Bagel Cremoso | 1 bagel, yogurt griego, mermelada de fresa o sirope de chocolate |
| Bagel Nica | 1 bagel, 2 huevos al gusto, 1 taza pequeña gallo pinto, 2 tiras de bacon, 1 mantequilla |
| Bagel Jamón de Pavo | 1 bagel, 1 huevo entero, 1 slice jamón de pavo, 1 bolsa chips Lays |

### Postres
| Producto | Componentes |
|---|---|
| Galleta Crumb | Compra galletas → venta unitaria |
| Galleta Pistachos | Compra galletas → venta unitaria |
| Galleta Ferrero Rocher | Compra galletas → venta unitaria |
| Mantquilla de Maní | Compra → venta unitaria |
| Slice Pastel de Chocolate | Pastel entero → N slices (UOM conversion) |

### Café Caliente (3 tamaños: 8oz / 12oz / 16oz)
| Producto | Componentes base |
|---|---|
| Café Americano | Café molido + agua caliente |
| Cappuccino | Café molido + leche |
| Flat White | Café molido + leche (más café, menos espuma) |

### Café Helado (3 tamaños: 8oz / 12oz / 16oz)
| Producto | Componentes base |
|---|---|
| Frappé Oreo | Café + leche + hielo + Oreo |
| Frappé Caramelo | Café + leche + hielo + caramelo |
| Iced Coffee | Café + hielo |

### Bebidas Especiales
| Producto | Componentes base |
|---|---|
| Matcha Fresa | Matcha + fresa + leche + hielo |
| Matcha Caliente | Matcha + leche caliente |

### Insumos transversales (aparecen en múltiples recetas)
- **Huevos** → Desayuno Americano, Pinolero, Omelet, Tostadas, Bagel Nica, Bagel Jamón
- **Pan de masa madre** → Desayuno Americano, Omelet, Tostadas
- **Bacon** → Desayuno Americano, Tostadas, Bagel Nica
- **Leche** → Todos los cafés, frappés, matcha
- **Café molido** → Todos los cafés calientes y helados
- **Hielo** → Todos los cafés helados, matcha fresa
- **Mantequilla** → Desayuno Americano, Bagel Nica

---

---

## FASE 0: Compras — Alimentación de Inventario

**IMPORTANTE**: Las compras se registran desde el POS (tablet), NO desde el dashboard web.
El owner no tiene UI de compras en la web. Esto es un gap de visibilidad.

### 0.1 Compras iniciales para stock de prueba
Registrar desde el POS → Inventario → Compras:

| # | Insumo | Cantidad compra | UOM compra | Costo unitario (C$) | Proveedor |
|---|---|---|---|---|---|
| C-01 | Huevos (bandeja) | 5 docenas | docena | ~C$120 | Proveedor local |
| C-02 | Bacon | 5 libras | libra | ~C$200 | Proveedor local |
| C-03 | Pan de masa madre | 5 piezas | pieza | ~C$80 | Panadería |
| C-04 | Café molido | 5 libras | libra | ~C$350 | Café supplier |
| C-05 | Leche entera | 10 litros | litro | ~C$55 | Distribuidor |
| C-06 | Hielo | 3 sacos (5kg) | saco | ~C$80 | Hielera |
| C-07 | Bagels | 30 unidades | unidad | ~C$25 | Panadería |
| C-08 | Galletas (varias) | 5 cajas c/u | caja | ~C$150 | Proveedor |
| C-09 | Pastel de Chocolate | 3 pasteles | pastel | ~C$350 | Pastelería |
| C-10 | Matcha | 2 paquetes | paquete | ~C$500 | Importador |
| C-11 | Yogurt griego | 5 botes | bote | ~C$120 | Distribuidor |
| C-12 | Fresas | 3 libras | libra | ~C$200 | Frutería |
| C-13 | Oreo | 5 paquetes | paquete | ~C$80 | Super |
| C-14 | Sirope caramelo | 3 frascos | frasco | ~C$150 | Proveedor |
| C-15 | Chips Lays | 20 bolsas | bolsa | ~C$20 | Super |

### Punto de control 0.1
- [ ] Compras registradas en POS con costo correcto
- [ ] Stock de cada insumo aumentó correctamente
- [ ] Kardex muestra movimiento `PURCHASE` con costo unitario
- [ ] Costo promedio de cada insumo es correcto
- [ ] **GAP OBSERVADO**: Owner NO puede ver/comprar desde la web. Solo desde el POS.

### 0.2 Gap de visibilidad — Compras en dashboard
**Estado actual**: El endpoint `POST /inventory/purchases` existe en el backend, pero NO hay página en el dashboard web.
**Impacto**: El owner no puede:
- Registrar compras desde la oficina
- Ver historial de compras
- Comparar costos de compra entre proveedores
**Decisión**: ¿Creamos la página de compras en el dashboard como parte del go-live, o lo dejamos para después?

---

## FASE 1: Configuración de Insumos (Materia Prima)

### 1.1 Insumos de Brunch
| # | Insumo | UOM compra | UOM inventario | Factor | Notas |
|---|---|---|---|---|---|
| I-01 | Huevos (bandeja) | docena | unidades | 12 | Compra por docena, vende por unidad |
| I-02 | Bacon (paquete) | libra | tiras | ~16 tiras/lb | Medir cuántas tiras salen por libra |
| I-03 | Pan de masa madre | pieza entera | rebanadas | ~10-12 rebanadas/pieza | Compra entero, corta en rebanadas |
| I-04 | Mantequilla | libra | porciones | ~30 porciones/lb | Pequeñas porciones individuales |
| I-05 | Miel | frasco | porciones | por ml o porción | |
| I-06 | Pancakes (preparados) | porción | unidades | 1 | Ya viene preparado |
| I-07 | Gallo Pinto | libra | tazas | ~4 tazas/lb | |
| I-08 | Maduro frito | pieza | rebanadas | ~4 rebanadas/pieza | |
| I-09 | Qeso frito | libra | onzas | 16 onzas/lb | |
| I-10 | Queso mozarella | libra | gramos | ~454g/lb | |
| I-11 | Jamón de pavo | libra | slices | ~10 slices/lb | |
| I-12 | Bagel | unidad | unidades | 1 | Compra y vende por unidad |
| I-13 | Yogurt griego | bote | porciones | por ml | |
| I-14 | Mermelada de fresa | frasco | porciones | por ml | |
| I-15 | Sirope de chocolate | frasco | porciones | por ml | |
| I-16 | Chips Lays | bolsa | bolsas | 1 | |
| I-17 | Queso para derretir | libra | gramos | ~454g/lb | |

### 1.2 Insumos de Café y Bebidas
| # | Insumo | UOM compra | UOM inventario | Factor | Notas |
|---|---|---| gramos | 1000 | Base en gramos |
| I-18 | Café molido | libra (454g) | gramos | 454g/lb | Espresso: ~18g por shot |
| I-19 | Leche entera | litro | ml | 1000 | |
| I-20 | Leche deslactosada | litro | ml | 1000 | |
| I-21 | Hielo | saco (5kg) | gramos | 5000 | |
| I-22 | Matcha en polvo | paquete | gramos | por paquete | |
| I-23 | Sirope de caramelo | frasco | ml | por frasco | |
| I-24 | Galleta Oreo | paquete | unidades | ~12 un/paq | |
| I-25 | Fresa (fresco o congelado) | libra | gramos | 454g | Para matcha fresa |

### 1.3 Insumos de Postres
| # | Insumo | UOM compra | UOM inventario | Factor | Notas |
|---|---|---|---|---|---|
| I-26 | Galleta Crumb | caja | unidades | ~12 un/caja | |
| I-27 | Galleta Pistachos | caja | unidades | ~12 un/caja | |
| I-28 | Galleta Ferrero Rocher | caja | unidades | ~12 un/caja | |
| I-29 | Mantquilla de Maní | frasco | porciones | por gramos | |
| I-30 | Pastel de Chocolate | pastel entero | slices | ~10-12 slices/pastel | **UOM CONVERSION CRÍTICA** |

### Punto de control 1.1
- [ ] Todos los insumos creados con stock inicial realista
- [ ] UOM de compra ≠ UOM de inventario donde aplique
- [ ] Kardex muestra stock inicial correcto por cada insumo

---

## FASE 2: Creación de Recetas (BOM)

### 2.1 Recetas de Brunch
| Producto | Insumo | Cantidad por venta |
|---|---|---|
| **Desayuno Americano** | Huevos | 2 unidades |
| | Bacon | 2 tiras |
| | Pancakes | 2 unidades |
| | Mantequilla | 1 porción |
| | Miel | 1 porción |
| | Pan de masa madre | 1 rebanada |
| **Desayuno Pinolero** | Huevos | 2 unidades |
| | Gallo Pinto | 1 taza (~113g) |
| | Maduro frito | 4 rebanadas |
| | Queso frito | 2 onzas (~57g) |
| **Omelet Jamón y Queso** | Huevos | 2 unidades |
| | Jamón de pavo | 1 slice (~30g) |
| | Queso mozarella | 30g |
| | Pan de masa madre | 1 rebanada |
| **Tostadas Morning** | Pan de masa madre | 2 rebanadas |
| | Queso para derretir | 40g |
| | Huevos | 2 unidades |
| | Bacon | 2 tiras |
| **Bagel Cremoso** | Bagel | 1 unidad |
| | Yogurt griego | 60g |
| | Mermelada de fresa | 15g |
| **Bagel Nica** | Bagel | 1 unidad |
| | Huevos | 2 unidades |
| | Gallo Pinto | 1 taza (~113g) |
| | Bacon | 2 tiras |
| | Mantequilla | 1 porción |
| **Bagel Jamón de Pavo** | Bagel | 1 unidad |
| | Huevos | 1 unidad |
| | Jamón de pavo | 1 slice (~30g) |
| | Chips Lays | 1 bolsa |

### 2.2 Recetas de Café Caliente (por tamaño)
| Bebida | Tamaño | Café (g) | Leche (ml) | Notas |
|---|---|---|---|---|
| **Café Americano** | 8oz | 18 (1 shot) | 0 | Solo espresso + agua |
| | 12oz | 18 (1 shot) | 0 | Más agua |
| | 16oz | 36 (2 shots) | 0 | Doble shot |
| **Cappuccino** | 8oz | 18 (1 shot) | 120 | |
| | 12oz | 18 (1 shot) | 180 | |
| | 16oz | 36 (2 shots) | 240 | |
| **Flat White** | 8oz | 18 (1 shot) | 150 | Más leche, menos espuma |
| | 12oz | 18 (1 shot) | 210 | |
| | 16oz | 36 (2 shots) | 300 | |

### 2.3 Recetas de Café Helado (por tamaño)
| Bebida | Tamaño | Café (g) | Leche (ml) | Hielo (g) | Extra |
|---|---|---|---|---|---|
| **Frappé Oreo** | 8oz | 18 | 120 | 150 | 1 Oreo |
| | 12oz | 18 | 180 | 200 | 1 Oreo |
| | 16oz | 36 | 240 | 250 | 2 Oreo |
| **Frappé Caramelo** | 8oz | 18 | 120 | 150 | 15ml caramelo |
| | 12oz | 18 | 180 | 200 | 15ml caramelo |
| | 16oz | 36 | 240 | 250 | 20ml caramelo |
| **Iced Coffee** | 8oz | 18 | 0 | 200 | Solo café + hielo |
| | 12oz | 18 | 60 | 250 | |
| | 16oz | 36 | 90 | 300 | |

### 2.4 Recetas de Bebidas Especiales
| Bebida | Tamaño | Matcha (g) | Leche (ml) | Extra |
|---|---|---|---|---|
| **Matcha Caliente** | 8oz | 3 | 180 | |
| | 12oz | 4 | 240 | |
| | 16oz | 5 | 350 | |
| **Matcha Fresa** | 8oz | 3 | 120 | 30g fresa + hielo |
| | 12oz | 4 | 180 | 50g fresa + hielo |
| | 16oz | 5 | 240 | 60g fresa + hielo |

### 2.5 Recetas de Postres
| Producto | Insumo | Cantidad |
|---|---|---|
| **Galleta Crumb** | Galleta Crumb | 1 unidad |
| **Galleta Pistachos** | Galleta Pistachos | 1 unidad |
| **Galleta Ferrero Rocher** | Galleta Ferrero Rocher | 1 unidad |
| **Mantquilla de Maní** | Mantquilla de Maní | 1 porción (~30g) |
| **Slice Pastel Chocolate** | Pastel de Chocolate | 1 slice (~80g) |

### Punto de control 2.1
- [ ] Todas las recetas creadas y publicadas
- [ ] `publication_state = PUBLISHED` en `recipe_versions`
- [ ] Cada receta tiene sus `recipe_details` con cantidades correctas
- [ ] Producto tipo = COMPOUND para platos compuestos
- [ ] Dashboard muestra recetas publicadas

---

## FASE 3: Productos y Precios

### 3.1 Productos a crear
| Producto | Tipo | Precio (C$) | Categoría |
|---|---|---|---|
| Desayuno Americano | COMPOUND | ~250 | Brunch |
| Desayuno Pinolero | COMPOUND | ~220 | Brunch |
| Omelet Jamón y Queso | COMPOUND | ~230 | Brunch |
| Tostadas Morning | COMPOUND | ~200 | Brunch |
| Bagel Cremoso | COMPOUND | ~180 | Brunch |
| Bagel Nica | COMPOUND | ~220 | Brunch |
| Bagel Jamón de Pavo | COMPOUND | ~200 | Brunch |
| Galleta Crumb | SIMPLE | ~40 | Postres |
| Galleta Pistachos | SIMPLE | ~45 | Postres |
| Galleta Ferrero Rocher | SIMPLE | ~50 | Postres |
| Mantquilla de Maní | SIMPLE | ~35 | Postres |
| Slice Pastel Chocolate | COMPOUND | ~80 | Postres |
| Café Americano 8oz | COMPOUND | ~80 | Café Caliente |
| Café Americano 12oz | COMPOUND | ~100 | Café Caliente |
| Café Americano 16oz | COMPOUND | ~120 | Café Caliente |
| Cappuccino 8oz | COMPOUND | ~110 | Café Caliente |
| Cappuccino 12oz | COMPOUND | ~130 | Café Caliente |
| Cappuccino 16oz | COMPOUND | ~150 | Café Caliente |
| Flat White 8oz | COMPOUND | ~120 | Café Caliente |
| Flat White 12oz | COMPOUND | ~140 | Café Caliente |
| Flat White 16oz | COMPOUND | ~160 | Café Caliente |
| Frappé Oreo 8oz | COMPOUND | ~130 | Café Helado |
| Frappé Oreo 12oz | COMPOUND | ~150 | Café Helado |
| Frappé Oreo 16oz | COMPOUND | ~170 | Café Helado |
| Frappé Caramelo 8oz | COMPOUND | ~130 | Café Helado |
| Frappé Caramelo 12oz | COMPOUND | ~150 | Café Helado |
| Frappé Caramelo 16oz | COMPOUND | ~170 | Café Helado |
| Iced Coffee 8oz | COMPOUND | ~100 | Café Helado |
| Iced Coffee 12oz | COMPOUND | ~120 | Café Helado |
| Iced Coffee 16oz | COMPOUND | ~140 | Café Helado |
| Matcha Caliente 8oz | COMPOUND | ~120 | Especial |
| Matcha Caliente 12oz | COMPOUND | ~140 | Especial |
| Matcha Caliente 16oz | COMPOUND | ~160 | Especial |
| Matcha Fresa 8oz | COMPOUND | ~140 | Especial |
| Matcha Fresa 12oz | COMPOUND | ~160 | Especial |
| Matcha Fresa 16oz | COMPOUND | ~180 | Especial |

### Punto de control 3.1
- [ ] Productos visibles en POS con precios correctos
- [ ] Categorías agrupan bien
- [ ] Productos SIMPLES (galletas) muestran stock disponible
- [ ] Productos COMPOUND muestran disponibles (con receta publicada)

---

## FASE 4: Apertura de Caja y Sesión

### 4.1 Escenario
1. Abrir caja con C$1,000 de fondo
2. Verificar sesión activa en POS
3. Verificar que la sesión muestra terminal correcto

### Punto de control 4.1
- [ ] Sesión abierta con monto correcto
- [ ] `CashierSession` en DB con `isClosed: false`
- [ ] Terminal ID registrado correctamente
- [ ] Monto esperado = C$1,000

---

## FASE 5: Ventas — Ronda 1 (Cobro en Efectivo)

### 5.1 Simulación: Turno de la mañana (8-10am)
| Venta | Producto | Cantidad | Método | Total |
|---|---|---|---|---|
| V-01 | Café Americano 12oz | 2 | Efectivo | ~C$200 |
| V-02 | Desayuno Americano | 1 | Efectivo | ~C$250 |
| V-03 | Cappuccino 8oz | 1 | Efectivo | ~C$110 |
| V-04 | Bagel Nica | 1 | Efectivo | ~C$220 |
| V-05 | Slice Pastel Chocolate | 2 | Efectivo | ~C$160 |
| V-06 | Frappé Oreo 12oz | 1 | Efectivo | ~C$150 |
| V-07 | Tostadas Morning + Café Americano 16oz | 1+1 | Efectivo | ~C$320 |

### Punto de control 5.1 — Después de cada venta
- [ ] V-01: Kardex café descuenta 36g (2 × 18g), leche descuenta 0ml
- [ ] V-02: Kardex huevos descuenta 2, bacon descuenta 2 tiras, pan 1 rebanada, pancakes 2, mantequilla 1, miel 1
- [ ] V-04: Kardex bagel 1, huevos 2, gallo pinto 1 taza, bacon 2 tiras, mantequilla 1
- [ ] V-05: Kardex pastel descuenta 2 slices (~160g)
- [ ] V-06: Kardex café 18g, leche 180ml, hielo 200g, Oreo 1
- [ ] V-07: Kardex pan 2 rebanadas, queso 40g, huevos 2, bacon 2 tiras + café 36g
- [ ] Sesión muestra C$1,410 en efectivo esperado
- [ ] **CRÍTICO S3**: Descuentos son las cantidades REALES de la receta, no 1

---

## FASE 6: Ventas — Ronda 2 (Pago con Tarjeta)

### 6.1 Simulación: Turno tarde (11am-1pm)
| Venta | Producto | Cantidad | Método | Total |
|---|---|---|---|---|
| V-08 | Desayuno Pinolero | 1 | Tarjeta | ~C$220 |
| V-09 | Flat White 16oz + Galleta Ferrero | 1+1 | Tarjeta | ~C$210 |
| V-10 | Iced Coffee 16oz | 2 | Tarjeta | ~C$280 |
| V-11 | Matcha Fresa 12oz | 1 | Tarjeta | ~C$160 |
| V-12 | Bagel Cremoso | 3 | Tarjeta | ~C$540 |

### Punto de control 6.1
- [ ] **CRÍTICO S4**: Cada pago registrado con `PaymentMethod.card`
- [ ] V-08: Kardex huevos 2, gallo pinto 1 taza, maduro 4 rebanadas, queso frito 2 onzas
- [ ] V-09: Kardex café 36g, leche 300ml + galleta Ferrero 1
- [ ] V-10: Kardex café 72g (2×36g), hielo 600g (2×300g), leche 180ml (2×90ml)
- [ ] V-11: Kardex matcha 4g, leche 180ml, fresa 50g, hielo
- [ ] V-12: Kardex bagel 3, yogurt griego 180g, mermelada 45g
- [ ] Sesión trackea monto por tarjeta por separado

---

## FASE 7: Ventas — Ronda 3 (Pago con Transferencia)

### 7.1 Simulación
| Venta | Producto | Cantidad | Método | Total |
|---|---|---|---|---|
| V-13 | Omelet Jamón y Queso | 1 | Transferencia | ~C$230 |
| V-14 | Café Americano 8oz | 3 | Transferencia | ~C$240 |

### Punto de control 7.1
- [ ] **CRÍTICO S4**: Pagos registrados con `PaymentMethod.transfer` o método correcto
- [ ] V-13: Kardex huevos 2, jamón 30g, queso mozarella 30g, pan 1 rebanada
- [ ] V-14: Kardex café 54g (3×18g)

---

## FASE 8: Escenarios Especiales

### 8.1 Venta con descuento
| Venta | Producto | Descuento | Método |
|---|---|---|---|
| V-15 | Desayuno Americano | 10% descuento | Efectivo |
| V-16 | 2× Café Americano 12oz | Promoción 2x1 | Efectivo |

### Punto de control 8.1
- [ ] Descuento 10% se aplica correctamente al total
- [ ] Promoción 2×1 solo cobra 1 café
- [ ] **Inventario descuenta 2 cafés** (el stock no se ve afectado por el descuento/promo)
- [ ] Kardex refleja descuento real de inventario

### 8.2 Venta offline (sin WiFi)
1. Desconectar WiFi del dispositivo
2. Hacer 2 ventas en efectivo
3. Verificar que se procesan localmente
4. Reconectar WiFi
5. Verificar que el sync sube las ventas al cloud

### Punto de control 8.2
- [ ] Ventas offline se procesan sin error
- [ ] Inventario se descuenta localmente
- [ ] Después de reconectar, sync completa sin duplicados
- [ ] Cloud recibe las ventas con datos correctos

### 8.3 Venta split (mixto)
| Venta | Producto | Parte 1 | Parte 2 |
|---|---|---|---|
| V-17 | Desayuno Pinolero + Café Americano 16oz | C$200 en efectivo | Resto en tarjeta |

### Punto de control 8.3
- [ ] Split registrado correctamente
- [ ] Ambos métodos aparecen en la venta
- [ ] Total cuadra

### 8.4 Void / Anulación
1. Anular la venta V-05 (2× Slice Pastel Chocolate)
2. Verificar que imprime "ANULADO"
3. Verificar reversión de inventario

### Punto de control 8.4
- [ ] Venta marcada `is_canceled = true`
- [ ] Kardex reversa 2 slices de pastel
- [ ] Stock de pastel aumenta de vuelta
- [ ] Se imprime "ANULADO" en el ticket
- [ ] Audit trail registra motivo + usuario

---

## FASE 9: Conciliación de Caja

### 9.1 Cierre de sesión
1. Contar efectivo real en caja
2. Cerrar sesión con conteo real
3. Verificar diferencias

### Punto de control 9.1
- [ ] Efectivo esperado = fondo + (ventas efectivo - vueltos)
- [ ] Tarjeta esperada = suma de ventas con tarjeta
- [ ] Transferencia esperada = suma de ventas con transferencia
- [ ] Si hay discrepancia, se reporta correctamente

---

## FASE 10: Sync y Verificación en Cloud

### 10.1 Verificación desde el dashboard web
1. Abrir dashboard en web (soho.nhilospos.com)
2. Ir a Ventas → verificar facturas del día
3. Ir a Inventario → Kardex
4. Ir a Reportes → verificar totales

### Punto de control 10.1
- [ ] Todas las ventas aparecen en el dashboard
- [ ] Métodos de pago correctos (efectivo, tarjeta, transferencia)
- [ ] Kardex muestra movimientos de inventario con cantidades correctas
- [ ] **CRÍTICO S3**: Cantidades de kardex = cantidades reales de recetas (no 1)
- [ ] Stock actual de cada insumo es correcto
- [ ] Reporte X/Z cuadra con la sesión

### 10.2 Verificación de datos de inventario
1. Ir a Inventario → Valorización
2. Verificar que el valor total del inventario es correcto
3. Verificar COGS por producto

### Punto de control 10.2
- [ ] Valoración = Σ(stock × costo_promedio) por insumo
- [ ] Productos con stock negativo marcados con alerta
- [ ] COGS refleja el costo real de los insumos consumidos

---

---

## FASE 11: Dashboard y KPIs

### 11.0 Gaps de visibilidad del Owner en Dashboard Web

| Capacidad | Backend endpoint | Dashboard web | Estado |
|---|---|---|---|
| Ver resumen de ventas | ✅ `/sales/reports/summary` | ✅ `/sales` | FUNCIONA |
| Ver ventas por hora | ✅ | ✅ `/sales` → Ventas por Hora | FUNCIONA |
| Ver top productos | ✅ | ✅ `/sales` → Top Productos | FUNCIONA |
| Ver mix de métodos de pago | ✅ | ✅ `/sales` → Resumen | FUNCIONA |
| Ver rendimiento cajeros | ✅ | ✅ `/sales` → Rendimiento Cajeros | FUNCIONA |
| Ver kardex | ✅ | ✅ `/inventory` → Kardex | FUNCIONA |
| Ver valoración inventario | ✅ | ✅ `/inventory` → Valoración | FUNCIONA |
| Ver COGS/margen | ✅ | ✅ `/inventory` → COGS | FUNCIONA |
| Ver reporte Z | ✅ `/fiscal/z-reports` | ✅ `/fiscal` → Exportaciones | FUNCIONA |
| Ver resumen fiscal mensual | ✅ | ✅ `/fiscal` → Resumen | FUNCIONA |
| Ver anulaciones | ✅ | ✅ `/fiscal` → Anulaciones | FUNCIONA |
| **Registrar compras** | ✅ `POST /inventory/purchases` | ❌ No existe | **GAP** |
| **Ver historial compras** | ❓ | ❌ No existe | **GAP** |
| **Ver sesiones de caja** | ✅ `GET /sales/shifts/*` | ❌ No existe | **GAP** |
| **Ver movimientos de caja** | ✅ `GET /sales/shifts/:id/movements` | ❌ No existe | **GAP** |
| **Registrar entrada/salida caja** | ✅ `POST /sales/shifts/:id/movements` | ❌ No existe | **GAP** |
| **Reporte X (mid-shift)** | ❓ No confirmado | ❌ No existe | **GAP** |

### Resumen de gaps para el owner

**Lo que SÍ puede hacer el owner desde la web:**
- ✅ Ver ventas del día, por hora, por producto, por cajero
- ✅ Ver mix de métodos de pago (efectivo, tarjeta, otros)
- ✅ Ver kardex y valoración de inventario
- ✅ Ver COGS y márgenes
- ✅ Exportar reporte Z
- ✅ Ver resumen fiscal mensual y anulaciones
- ✅ Gestionar catálogo, recetas, promociones, lealtad, usuarios

**Lo que NO puede hacer el owner desde la web:**
- ❌ Registrar/comprar insumos (solo desde el POS)
- ❌ Ver historial de compras
- ❌ Ver sesiones de caja (quién abrió, cuándo, cuánto)
- ❌ Ver movimientos de caja (entradas/salidas manuales)
- ❌ Cerrar caja desde la web
- ❌ Ver reporte X (mid-shift)

**¿Es esto bloqueante para go-live?**
- Compras: El owner puede comprar desde el POS (tablet en el local). No ideal pero funcional.
- Caja: El owner puede cerrar caja desde el POS. Si no está en el local, no puede ver el estado.
- **Decisión**: ¿Creamos las páginas faltantes antes del go-live, o operamos con estas limitaciones?

---

## FASE 12: Dashboard y KPIs

### 11.1 Verificación de KPIs
1. Revenue del día
2. Ticket promedio
3. Productos más vendidos
4. Métodos de pago (distribución)
5. Alertas de stock bajo

### Punto de control 11.1
- [ ] Revenue = suma de todas las ventas no canceladas
- [ ] Ticket promedio = revenue / cantidad de ventas
- [ ] Top productos coincide con lo vendido
- [ ] Distribución de métodos de pago es correcta
- [ ] Alertas de stock bajo para insumos que se agotaron

---

## Checklist de Validación S3 (UOM Conversión)

Este es el test más crítico del plan. Si falla, S3 necesita implementación.

| Test | Insumo | Receta dice | Kardex descuenta | ¿Correcto? |
|---|---|---|---|---|
| Espresso → Café | Café molido | 18g | ___g | ☐ |
| Cappuccino → Café | Café molido | 18g | ___g | ☐ |
| Cappuccino → Leche | Leche | 120ml | ___ml | ☐ |
| Frappé → Hielo | Hielo | 200g | ___g | ☐ |
| Des. Americano → Huevos | Huevos | 2 unidades | ___un | ☐ |
| Des. Americano → Bacon | Bacon | 2 tiras | ___tiras | ☐ |
| Pan → Rebanadas | Pan masa madre | 1 rebanada | ___rebanadas | ☐ |
| Pastel → Slice | Pastel chocolate | 1 slice (~80g) | ___g | ☐ |
| Bagel Nica → Gallo Pinto | Gallo Pinto | 1 taza (~113g) | ___g | ☐ |

### Criterio de éxito S3
- ✅ **PASS**: TODOS los descuentos = cantidades reales de la receta
- ❌ **FAIL**: Algún descuento = 1 (hardcodeado) → S3 necesita implementación

---

## Checklist de Validación S4 (Métodos de Pago)

| Test | Venta | Método usado | Registrado en local | Sync al cloud | ¿Correcto? |
|---|---|---|---|---|---|
| V-01 a V-07 | Efectivo | cash | ☐ | ☐ | ☐ |
| V-08 a V-12 | Tarjeta | card | ☐ | ☐ | ☐ |
| V-13 a V-14 | Transferencia | transfer | ☐ | ☐ | ☐ |
| V-17 | Split | cash + card | ☐ | ☐ | ☐ |

### Criterio de éxito S4
- ✅ **PASS**: TODOS los métodos de pago correctos en local Y cloud
- ❌ **FAIL**: Algún pago se pierde en sync o se queda en "cash" por default

---

## Resumen de esfuerzo estimado

| Fase | Tiempo estimado | Dependencia |
|---|---|---|
| Fase 1: Insumos (~30 insumos) | 1.5 - 2h | Ninguna |
| Fase 2: Recetas (~40 recetas con variantes) | 2 - 3h | Fase 1 |
| Fase 3: Productos (~35 productos) | 1h | Fase 2 |
| Fase 4: Apertura caja | 5 min | Fase 3 |
| Fase 5-7: Ventas (17 ventas) | 1 - 1.5h | Fase 4 |
| Fase 8: Escenarios especiales | 30 min | Fase 5-7 |
| Fase 9: Conciliación | 15 min | Fase 8 |
| Fase 10: Sync y verificación web | 30 min | Fase 9 |
| Fase 11: KPIs y dashboard | 15 min | Fase 10 |
| **Total estimado** | **~7-9 horas** | |

**Recomendación**: Dividir en 2 sesiones:
- **Sesión A** (4-5h): Fases 1-4 + primeras ventas (S3 + S4 test crítico)
- **Sesión B** (3-4h): Ventas restantes + escenarios especiales + conciliación + sync + dashboard

---

## Orden de ejecución recomendado (por impacto)

1. **Primero**: Crear 3-4 insumos + 1 receta compuesta (ej: Café Americano)
2. **Test S3 inmediato**: Vender 1 café → verificar kardex descuenta 18g
3. **Si PASS S3**: Crear el resto de insumos y recetas con confianza
4. **Si FAIL S3**: Detener, investigar y fixear antes de continuar
5. **Después**: Completar el menú completo
6. **Test S4**: Vender con tarjeta → verificar método de pago
7. **Final**: Escenarios especiales + conciliación + sync + dashboard
