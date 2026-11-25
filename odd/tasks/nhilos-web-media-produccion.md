# Producción de material: sacar a NHILOS de la cafetería

Plan de la fase de captures y rodaje. Objetivo del fundador, verbatim: *"mostrar solo capturas de cafetería encasilla la app para un negocio, como estábamos haciendo con los textos. Es ideal sacar recursos para otros negocios, secciones y páginas de la web. Sería abordarlas una a una."*

## 0. El diagnóstico, medido

| Hecho | Dato |
|---|---|
| Páginas publicadas | 9 |
| Piezas de media en uso | 22 (entre capturas, clips y posters) |
| Negocios visibles en todas ellas | **uno**: NHILOS Market & Café |
| Páginas sin ninguna pieza | **`/precios/` y `/demo/`** |
| Archivos en `media/` | 58 (36 sin usar) |

Dos consecuencias:

1. **La app tiene cara de cafetería.** El catálogo visible tiene capuchino, croissant e iced chai latte. Un dueño de fritanga o de pulpería ve un producto de otro negocio, igual que antes los textos solo hablaban de restaurantes.
2. **Las dos páginas donde el comprador decide no muestran nada.** `/precios/` publica una tabla sin una sola imagen, y `/demo/` promete "escenario armado" sin mostrar un escenario. Son las de mayor intención comercial del sitio.

## 1. Las dos clases de recurso (y la que casi nadie ve)

**A. Capturas de inquilino: se producen en casa, sin cámara.**
La app es la misma; lo que cambia es el negocio sembrado. Existen `seed-soho-catalog`, `seed-soho-modifier-groups`, `seed-general-demo-tenant`, `seed-test-data` y `seed-prospect-demo`. Un inquilino nuevo sembrado como fritanga —tajadas, carne asada, gallo pinto, fresco de cacao— produce capturas **auténticas de una fritanga**: es la app real, con datos reales de ese negocio, no un montaje. Cubre catálogo, venta, cobro, caja, fiscal, inventario y panel.

Costo: un seed + la rutina de captura que ya usamos. **Es el 70% del material que falta, y no cuesta una sesión de fotos.**

**B. Rodaje físico: necesita al fundador y un local.**
El mostrador pequeño, la terminal en la mano, dos terminales cobrando a la vez. Esto no se sustituye con software: es la única clase que muestra **el lugar**, y por eso es la que más convence a un dueño de comidería.

## 2. Lo que se produce, una pieza a la vez

Cada bloque es una unidad de trabajo cerrada: se produce, se audita, se usa y se cierra. No se abre la siguiente sin cerrar la anterior.

### U1. Comidería / fritanga (capturas de inquilino) — **HECHO (2026-11-24)**
**Seed reproducible:** `npm run seed:prospect-demo -- --name "Comidería Doña Rosa" --vertical restaurante --mode RESTAURANT --slug demo-comideria-dona-rosa --plan PRO --invoices 24` (`BAR_RESTAURANTE`, 12 platos típicos nicaragüenses, 26 insumos).
**Piezas producidas y auditadas (1080×2316, WebP, `design/nhilos-web-foundation/media/`):**
1. `pos_comideria_01_catalogo.webp` (79 KB) — **Qué se ve:** catálogo POS de `Comidería Doña Rosa` (Hamburguesa con Papas C$220, Cerveza Toña C$65, Desayuno Nica Completo C$150, Tacos Nicas 3u C$140, Pollo Asado con Ensalada C$285, Quesillo con Tortilla C$90, Gallopinto C$85, Refresco Natural 12oz C$60) con nube verde sincronizada. **Qué prueba:** menú real de comidería nicaragüense fuera de la cafetería. **Qué no prueba:** modificadores abiertos ni impresión externa.
2. `pos_comideria_02_pedido.webp` (69 KB) — **Qué se ve:** carrito con 4 platos típicos (Pollo Asado C$285, Tacos Nicas 3u C$140, Quesillo con Tortilla C$90, Refresco Natural C$60; `TOTAL C$ 575.00`). **Qué prueba:** armado rápido de comanda multi-ítem en mostrador. **Qué no prueba:** despacho a cocina (KDS) ni envío por mesa.
3. `pos_comideria_03_cobro_vuelto.webp` (71 KB) — **Qué se ve:** Cobro y Facturación por C$ 580.00 en efectivo (NIO), monto recibido C$ 1,000.00 con botones de billete rápido y `Vuelto: C$ 420.00` (`$11.47 USD`). **Qué prueba:** cobro en córdobas con cálculo automático de vuelto y equivalencia en dólares. **Qué no prueba:** cobro con tarjeta ni ticket impreso.
4. `pos_comideria_04_historial.webp` (65 KB) — **Qué se ve:** Historial de Ventas del turno de `Comidería Doña Rosa` con 2 facturas consecutivas (`A00000001` C$575.00, `A00000002` C$580.00; `Total: C$ 1155.00`; `Anuladas: 0`). **Qué prueba:** correlativo consecutivo y resumen del turno en la terminal. **Qué no prueba:** cierre Z ni libros DGI exportados.
**Hecho cuando:** cuatro capturas reales auditadas + seed reproducible.

### U2. Pulpería / miscelánea (capturas de inquilino) — **HECHO (2026-11-24)**
**Seed reproducible:** `npm run seed:prospect-demo -- --name "Pulpería La Esquina" --vertical retail --slug demo-pulperia-la-esquina --plan ESENCIAL --invoices 24` (`RETAIL_MINIMARKET`, `FOODPARK_QSR`, 12 productos de reventa pura sin recetas).
**Piezas producidas y auditadas (1068×2310, WebP, `design/nhilos-web-foundation/media/`):**
1. `pos_pulperia_01_catalogo.webp` (79 KB) — **Qué se ve:** catálogo POS de reventa pura (Agua 1L C$25, Arroz 5lb C$120, Azúcar 2lb C$45, Aceite 1L C$95, Café Molido 250g C$110, Frijoles 1lb C$55, Galletas Oreo C$25, Coca Cola 500ml C$35, Hielo 5lb C$40) con nube sincronizada. **Qué prueba:** operación de mostrador/pulpería sin recetas. **Qué no prueba:** escáner de código de barras ni impresión externa. **En uso en:** `/software-pos/` (tarjeta "Vendes lo que compras: reventa y mostrador sin recetas").
2. `pos_pulperia_02_cobro_vuelto.webp` (74 KB) — **Qué se ve:** pantalla de Cobro y Facturación por C$ 305.00 en efectivo (NIO), monto recibido C$ 500.00 con botones de billete rápido y cálculo automático de `Vuelto: C$ 195.00` (`$5.32 USD`). **Qué prueba:** cobro rápido en córdobas con cálculo de vuelto y equivalencia en dólares. **Qué no prueba:** pago con tarjeta ni emisión impresa.
3. `pos_pulperia_03_reporte_turno.webp` (94 KB) — **Qué se ve:** Lectura Parcial (Corte X) del turno activo de `Propietario Pulpería La Esquina` con Fondo Inicial C$ 2,000.00 / $ 20.00 y Esperado en Gaveta C$ 2,305.00 / $ 20.00 tras la venta. **Qué prueba:** control bimoneda de caja en turno abierto sin cerrarlo. **Qué no prueba:** Corte Z final ni conciliación multi-terminal.
**Hecho cuando:** tres capturas auditadas + seed + primera pieza cableada en `/software-pos/`.

### U3. Food park con dos puestos (capturas de inquilino) — **HECHO (2026-11-24)**
**Seed reproducible:** `npm run seed:prospect-demo -- --name "Patio Central" --vertical foodpark --slug demo-foodpark-patio-central --plan OPERACION --invoices 24` (`BAR_RESTAURANTE`, `FOODPARK_QSR`, productos agrupados en categorías `Puesto Parrilla` y `Puesto Bebidas`).
**Piezas producidas y auditadas (1440×900, WebP, `design/nhilos-web-foundation/media/`):**
1. `dsh_foodpark_01_productos_modos.webp` — **Qué se ve:** pantalla Productos de `Patio Central` con pestañas `Simple` (Agua Purificada C$20, Flan Casero C$80, Gaseosa C$35), `Compuesto (con receta)` y `Padre de Variantes` coexistiendo en el mismo negocio. **Qué prueba:** convivencia de reventa simple y cocina con receta dentro de un mismo catálogo de puesto. **Qué no prueba:** varias cuentas independientes consolidadas ni dos terminales cobrando en simultáneo.
2. `dsh_foodpark_02_dashboard_ventas.webp` — **Qué se ve:** Dashboard de `Propietario Patio Central` con `VENTAS NETAS C$4,780.00`, `24 tickets`, `Ticket Promedio C$199.17`, evolución de ventas y ventas por hora. **Qué prueba:** panel propio del dueño del puesto en régimen Cuota Fija. **Qué no prueba:** vista consolidada multi-marca del parque (prohibida por #994 y §6.0).
3. `dsh_foodpark_03_ventas_resumen.webp` — **Qué se ve:** vista Ventas de `Patio Central` con `VENTAS BRUTAS C$850.00`, `4 facturas` y desglose por método de pago (`Efectivo NIO C$340`, `Tarjeta NIO C$240`, `Otros C$270`). **Qué prueba:** control de ventas y medios de pago por turno en el panel. **Qué no prueba:** sincronización entre cajas por red local.
**Hecho cuando:** tres capturas reales del panel auditadas + seed reproducible.

### U4. Control de Mesas con mesa ocupada (captura de inquilino) — **BLOQUEADO POR SYNC DE TOPOLOGÍA EN APK**
**Hallazgo real (2026-11-24):** con `Comidería Doña Rosa` sembrado en modo `RESTAURANT` y 10 mesas en `tenant_topology_revisions` (`Salón Principal` + `Terraza`), la pantalla `Control de Mesas y Áreas` del APK instalado (`com.nhilos.pos_app`) permanece vacía (`"No hay áreas ni mesas configuradas"`) porque `TableLayoutViewModel` lee solo SQLite local y el sync delta entrante no hidrató `restaurant_areas`/`restaurant_tables` en este build. No se simula ni se maquilla; queda abierto hasta que el POS hidrate áreas/mesas desde la topología.

### U5. El mostrador pequeño real (rodaje físico)
**Qué cambia:** es el único recurso que muestra **el lugar**.
**Piezas:** terminal en la mano sobre un mostrador de comidería, la venta cobrándose, el ticket saliendo de la impresora integrada. Vertical, trípode, luz difusa, pantalla limpia, 6-10 s, primer cuadro ≈ último, sin fondo verde (requisitos ya escritos en `docs/nhilos/web/nhilos_web_media_capture_brief_v1.0.md`).
**Desbloquea:** el hero (camino B), el bloque de reconocimiento de `/restaurantes/`, y la portada social.
**Necesita:** el fundador, el local y el equipo. No se puede adelantar en casa.

**Pieza editorial compuesta promovida (2026-11-25):** `design/nhilos-web-foundation/media/pos_comideria_05_mostrador_mano.webp` (`896×1200`, 98 KB, WebP).
- **Naturaleza (transparencia obligatoria):** composición por capas — fotografía base editorial de mostrador de madera + mano sujetando smartphone Android, con captura real vía ADB de `Comidería Doña Rosa` (`1080×2316`, sin deformación de textos) integrada mediante homografía de 4 esquinas y bisel/vidrio óptico. Se etiqueta siempre como `"datos de demostración"` y **nunca** como `"grabación real"` ni `"foto real en local"`. El rodaje físico real de U5 (con impresora térmica / video loop 6–10 s) queda abierto como upgrade futuro.
- **Auditoría:** **Qué se ve:** mano sosteniendo un smartphone Android sobre un mostrador de madera en comidería con luz natural difusa; en pantalla se ve el catálogo POS real de `Comidería Doña Rosa` (precios en córdobas `C$ 60`–`C$ 285`, ícono de mesa, testigo offline naranja) y la barra de carrito activa (`2 productos agregados · Total: C$ 200.00 · VER CARRITO`). **Qué prueba:** legibilidad real de la interfaz de ventas en córdobas con carrito activo y modo offline en un celular Android común en contexto de mostrador. **Qué no prueba:** rodaje físico en local real, impresión térmica ni video en movimiento.

## 3. Reglas de la fase (heredadas, no negociables)

1. **Auténtico.** Captura de la app real con datos reales de un negocio sembrado. Cero mockup, cero pantalla renderizada, cero pieza generada presentada como producto.
2. **Etiqueta obligatoria:** "datos de demostración" en toda captura de inquilino; "grabación real" solo cuando lo sea.
3. **El `alt` describe lo que la pantalla muestra a tamaño de publicación**, no lo que el sistema guarda en memoria ni lo que sugiere el nombre del archivo.
4. **Cada pieza nueva entra con su línea de auditoría** en el ODD correspondiente: qué se ve, qué prueba, qué no prueba.
5. **Ninguna pieza puede afirmar una capacidad prohibida:** KDS, caja compartida, factura impresa en ticketera genérica, vista consolidada. Hoy los artboards 01–04 usan una captura de KDS; no están publicados y el build publica cero archivos de KDS. Esa frontera se mantiene.
6. **Solo se publica lo referenciado.** El build ya lo garantiza.
7. **Un negocio por inquilino, un inquilino por unidad.** No se mezcla la fritanga con la pulpería en la misma captura.

## 4. Orden y por qué

**U1 primero.** Es el segmento que el fundador nombró dos veces, el que hoy promete sin mostrar, y el más barato de producir. Después **U2**, que muestra el modo contrario sin tocar lo que ya existe. **U3** y **U4** cierran límites que ya están escritos en páginas publicadas, así que su valor es medible: se retira una frase de límite porque la prueba existe. **U5** espera al rodaje y no bloquea nada.

## 5. Lo que NO entra en esta fase

- Imágenes generadas de comida, personas o pantallas. Siguen prohibidas como prueba de producto.
- Capturas de capacidades abiertas (#983 impresión externa, #993 KDS, #994 topología).
- Rehacer piezas que ya funcionan: las de recetas, kardex y fiscal se quedan.
- Cambiar el diseño de las páginas. Esta fase produce material; la página se ajusta solo donde el recurso lo justifica.

## Log

- **L1.** Fundador, verbatim: *"mostrar solo capturas de cafetería encasilla la app para un negocio, como estábamos haciendo con los textos. Es ideal sacar recursos para otros negocios, secciones y páginas de la web. Sería abordarlas una a una para tener todos los recursos que necesitamos, ahora tenemos un sistema de producción bastante completo con el cual editar o crear."*
- **L2.** Inventario medido antes de proponer: 22 piezas publicadas, un solo negocio visible, `/precios/` y `/demo/` sin ninguna, 36 archivos sin usar en `media/`.
- **L3.** El descubrimiento que abarata la fase: **la mayor parte del material que falta no necesita cámara**, necesita otro inquilino sembrado. Los seeds ya existen.
- **L4.** Verificado que las dos piezas de KDS en el repositorio viven solo en los artboards 01–04 (no publicados) y que el build publica cero archivos de KDS: no hay claim vivo, y esa frontera se mantiene en esta fase.
- **L5.** `/precios/` y `/demo/` no tienen media. No es un olvido menor: son las dos páginas donde el comprador decide.
