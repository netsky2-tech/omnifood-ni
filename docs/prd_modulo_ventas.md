# Core de Ventas (Front of House - FOH)

## Visión General del Producto

- Objetivo: Crear una interfaz de punto de venta (POS) de alto rendimiento que permita procesar transacciones, gestionar inventario en tiempo real y aplicar promociones de forma fluida.
- Usuarios Clave: Cajeros, vendedores de piso y gerentes de tienda.
- Indicador de Éxito (KPI): Tiempo promedio por transacción < 45 segundos; 0% de discrepancia en cierres de caja.

## Flujo de Usuario (User Journey)

El sistema debe seguir un flujo lógico para minimizar errores humanos:

- 1- Apertura: Inicio de sesión y declaración de fondo de caja.
- 2- Venta: Selección de productos (vía SKU, barcode o búsqueda manual).
- 3- Modificadores: Aplicación de descuentos, promociones o notas especiales.
- 4- Checkout: Selección de método de pago (Efectivo, Tarjeta, QR, Puntos).
- 5- Finalización: Emisión de ticket (físico/digital) y actualización de inventario.

## Requerimientos Funcionales

- A. Gestión de Transacciones
  - Escaneo de Productos: Compatibilidad con lectores de códigos de barra (1D/2D).
  - Gestión de Carrito: Capacidad de "pausar" ventas (Hold Ticket) para atender a otro cliente y recuperarlas después.
  - Impuestos Dinámicos: Cálculo automático de IVA/Tax basado en la ubicación o tipo de producto.
- B. Pagos y Cobranza
  - Pagos Divididos: Permitir que un cliente pague una sola cuenta con múltiples métodos (ej. mitad efectivo, mitad tarjeta).
  - Integración con Pasarelas: Conexión directa con terminales bancarias para evitar el "doble digitado".
  - Devoluciones y Notas de Crédito: Flujo para reversar cargos o generar saldo a favor del cliente.
- C. Inventario y Catálogo
  - Sincronización en Tiempo Real: Validación de stock antes de finalizar la venta para evitar sobreventas.
  - Variantes de Producto: Selección fácil de tallas, colores o sabores.

## Requerimientos No Funcionales

- Modo Offline: Capacidad de seguir vendiendo si se pierde la conexión a internet, sincronizando los datos automáticamente al volver la red.
- Seguridad: Roles y permisos (ej. solo el gerente puede autorizar una cancelación de ticket).
- Latencia: El buscador de productos debe responder en menos de 200ms.

## Casos de Uso Críticos

| ID | Caso de Uso | Descripción |
| --- | ----------- | ------------ |
| UC-01 | Venta Rápida | El cajero escanea 3 productos y cobra en efectivo en menos de 30 segundos. |
| UC-02 | Aplicación de Promo | El sistema detecta automáticamente un "2x1" al agregar la segunda unidad. |
| UC-03 | Cierre de Caja (X/Z) | Resumen detallado de ventas por método de pago y arqueo de efectivo. |

