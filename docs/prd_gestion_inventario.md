# Módulo de Gestión de Inventario Inteligente (BOH - Back of House)

## Visión del Módulo

Proveer un control total sobre el ciclo de vida de los insumos y productos, desde la compra al proveedor hasta el descuento automático por receta en cada venta. Este módulo debe permitir al dueño del café conocer su Costo Real de Venta y su nivel de Merma en tiempo real.

## Arquitectura de Datos: Productos vs. Insumos

Para escalar a otros nichos, el sistema diferenciará entre tres tipos de ítems:

- Insumos (Raw Materials): Artículos que no se venden solos (ej: café en grano, leche, azúcar, envases).
- Productos Simples (Retail): Artículos que se compran y venden igual (ej: agua embotellada, galletas empaquetadas).
- Compuestos (Recetas): Productos finales creados a partir de insumos (ej: Capuccino, Latte).

## Requerimientos Funcionales Core

### Gestión de Recetas (Bill of Materials - BOM)

- Desglose Técnico: Capacidad de definir cuántas onzas/gramos de cada insumo consume un producto.
- Sub-Recetas: Soporte para preparaciones intermedias (ej: una jarra de "Jarabe de la Casa" que usa azúcar y agua, y luego esa mezcla se usa en 10 cafés).
- Costo Teórico: Cálculo automático del costo del producto basado en el precio de compra de sus ingredientes.

### Control de Existencias y Movimientos

- Descuento en Tiempo Real: Cada venta en el POS debe descontar proporcionalmente los insumos de la base de datos local (SQLite) mediante disparadores (triggers).
- Unidades de Medida Duales: Comprar en unidades grandes (Saco de 50lb) y consumir en unidades pequeñas (gramos/onzas).
- Gestión de Mermas (Shrinkage): Registro manual de desperdicios (ej: leche derramada, granos quemados) para ajustar el inventario físico vs. el teórico.
- Kardex Digital: Historial inalterable de cada entrada y salida de mercancía, esencial para auditorías.

### Compras y Proveedores

- Órdenes de Compra: Registro de facturas de proveedores con actualización automática de precios de costo (promedio ponderado).
- Directorio de Proveedores: Base de datos con contactos y condiciones de crédito.

## Funcionalidades de Inteligencia y Scalabilidad

### Niveles PAR y Alertas Predictivas

- Stock Mínimo (PAR): Definir el nivel de seguridad de cada insumo. Si el café cae a 5lb, el sistema envía una notificación push al móvil del dueño.
- Alertas de Caducidad: Seguimiento por lotes para productos perecederos (leche, repostería) bajo el método FIFO (First In, First Out).

### Cumplimiento Fiscal (DGI)

- Notas de Crédito e Inventario: Si una factura de venta se anula, el sistema debe revertir automáticamente el descargo de inventario según exige la normativa de la DGI.
- Respaldo Magnético: Garantizar que los movimientos de inventario se respalden junto con la facturación.

## Diseño para "Offline-First"

- Sincronización Local: La lógica de descuento de recetas debe residir en la app Flutter (localmente). El POS no puede esperar a que el servidor responda si hay café disponible para cerrar una venta.
- Resolución de Conflictos: Si dos terminales venden el último "Muffin" simultáneamente mientras están offline, el sistema debe priorizar el timestamp más antiguo al sincronizar.

## Diccionario de Datos (Entidades Clave)

| Entidad | Campos Clave | Relación |
| --- | --- | --- |
| Insumo | ID, Nombre, UOM (onz, gr, ml), Stock_Actual, Costo_Promedio | N/A |
| Receta | ID_Producto, ID_Insumo, Cantidad_Usada | Relaciona Insumo con Producto |
| Movimiento | Tipo (Venta, Compra, Merma), Cantidad, Fecha, UsuarioRegistro | Auditor (Kardex) |
| Almacén | ID_Tenant, ID_Ubicación, Nombre | Soporte Multi-tenant |

## KPIs de Inventario para el Dashboard

- Varianza de Inventario: Diferencia entre lo que "debería haber" (teórico) vs. lo que "hay" (conteo físico).
- Índice de Rotación: Qué insumos se mueven más rápido para optimizar el flujo de caja.
- Costo de Mercancía Vendida (COGS): Porcentaje del ingreso que se consume en insumos.

## Nota del arquitecto

Está diseñado así de forma que, si mañana se decide vender este software a una ferretería en lugar de un café, solo habría que apagar el módulo de "Recetas" y encender el de "Variantes por Talla/Color". La base de datos de inventario es el corazón de la escalabilidad de OmniFood NI.
