# Módulo de Ventas FlexiPoint (FOH - Front of House)

Este PRD define el comportamiento, la arquitectura lógica y los flujos de operación para el punto de venta (FOH) de FlexiPoint. Está diseñado para soportar entornos híbridos y offline-first, garantizando la consistencia fiscal de Nicaragua (DGI) y una experiencia táctil óptima.

## 1. Arquitectura de Despliegue y Topologías de Hardware

Para asegurar la continuidad del negocio en ambos escenarios solicitados, el módulo FOH se adaptará a dos topologías principales de hardware:

### Topología A: Restaurante/Comercio Completo (All-In-One + Tablets + KDS)

- Terminal Principal (All-In-One): Actúa como nodo local centralizador (Local Edge). Sincroniza datos con la nube de forma asíncrona y expone una API local por WebSockets o HTTP para las tablets y pantallas de cocina.
- Tablets (Comanderas): Dispositivos móviles para los meseros. Se comunican directamente con el nodo local. Si el nodo local falla, conmutan a un modo de contingencia directo a la nube (si hay internet).
- KDS (Kitchen Display System): Pantallas en cocina conectadas por WebSockets al nodo centralizador local para recibir órdenes en tiempo real sin latencia externa.

### Topología B: Formato Ultra-Ligero (Smart POS / Tablet con Impresora Integrada)

- Dispositivo Único: La tablet asume el rol de cliente de UI, base de datos local embebida (SQLite/IndexedDB) y servidor de impresión integrado (via SDK nativo del fabricante Android/iOS para la impresora térmica).
- Sincronización: Conexión directa a la nube. En caso de pérdida de conectividad, retiene las transacciones localmente y encola las impresiones directamente en el hardware local.

## 2. Especificación de Módulos Core

### 1. Interfaz Adaptativa y Táctica

- Requerimiento Funcional: La UI debe diseñarse bajo el principio de "Zero-Training" y optimización de taps (máximo 3 taps para facturar un producto común). Debe soportar cambio de layout dinámico: modo Quick Service (fast food, mostrador) y modo Fine Dining (mapa de mesas interactivo).
- Comportamiento UX/UI:
  - Botones con un área táctil mínima de 48x48dp.
  - Búsqueda predictiva con indexación local ultrarrápida (búsqueda por iniciales o SKU en menos de 50ms).
  - Soporte nativo para pantallas divididas o paneles colapsables según la resolución (10" para tablets vs 15.6" para All-In-One).

### 2. Modificadores Dinámicos

- Requerimiento Funcional: Permitir la personalización de productos en cascada (ej. Término de carne, extras, remociones). Los modificadores pueden alterar el precio final, afectar el inventario de sub-recetas y disparar alertas específicas al KDS.
- Comportamiento Lógico:
  - Grupos de Modificadores: Obligatorios (ej. "Término de cocción"), Opcionales (ej. "Extras") y Mutuamente Excluyentes.
  - Límites: Configuración de máximos y mínimos por grupo (ej. "Elige hasta 3 salsas gratis").
  - Impacto de Costo: Cada modificador suma al precio base de forma independiente o puede tener un costo cero pero descontar stock físico (ej. "Sin cebolla").

### 3. Retención de Cuentas (Hold Tickets / Mesas)

- Requerimiento Funcional: Capacidad de congelar el estado de una orden (cuenta abierta, mesa o ticket en espera) y recuperarla desde cualquier terminal autorizada de la red local.
- Comportamiento Técnico (Offline-First):
  - Cada ticket en espera genera un UUID único y un número secuencial de control local.
  - Al guardar en Hold, el estado se propaga inmediatamente vía WebSockets a los nodos hermanos en la red local (Topología A) o se guarda en el storage local (Topología B).
  - Evitar colisiones: Cuando una terminal abre un ticket en retención, este se bloquea (Locked) en las demás terminales para prevenir doble facturación o modificaciones simultáneas.

### 4. Kitchen Display System (KDS)

- Requerimiento Funcional: Sustituir o complementar las tiqueteras de cocina con pantallas interactivas que gestionen los tiempos de preparación y el despacho de platillos.
- Especificaciones del KDS:
  - Modos de Vista: Vista de Tickets Completo (orden cronológico) o Vista Consolidada (ej. "Total: 5 Hamburguesas en parrilla").
  - Alertas Visuales: Cambio de color según el tiempo transcurrido (Verde: < 10 min, Amarillo: 10-15 min, Rojo: > 15 min).
  - Interactividad: Botón de "Listo" (Despachado) que notifica inmediatamente a la comandera del mesero o actualiza la pantalla de entrega al cliente.
  - Fallback para Impresora Integrada (Topología B): Si no hay KDS físico, el sistema rutea automáticamente la orden para imprimir un "Ticket de Cocina" en la impresora térmica integrada al presionar "Enviar a Cocina".

### 5. Checkout Multi-Moneda y Pagos Divididos (Split Payments)

- Requerimiento Funcional: Procesamiento nativo de transacciones mezclando Córdobas (NIO) y Dólares (USD) en el mismo ticket, calculando el cambio/vuelto en la moneda óptima o solicitada por el cliente.

#### Doble Esquera de Tipo de Cambio Desacoplado

Para proteger el flujo de caja del negocio frente a las variaciones del mercado y cumplir la ley, la base de datos manejará dos tipos de cambio independientes de manera estricta:

```text
  +------------------------------------------------------------------------+
  |                        TICKET DE VENTA (FOH)                           |
  +------------------------------------------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                                                         |
         v                                                         v
+----------------------------------+             +----------------------------------+
|    TIPO DE CAMBIO OFICIAL        |             |    TIPO DE CAMBIO COMERCIAL      |
|  (Base Contable, Fiscal DGI)     |             |    (Flujo de Caja, Efectivo)     |
+----------------------------------+             +----------------------------------+
| - Fijo por día según BCN.        |             | - Definido por la administración.|
| - Usa la fórmula oficial de      |             | - Protege al negocio contra      |
|   deslizamiento de la moneda.    |             |   costos de intermediación.      |
| - Determina la base imponible    |             | - Calcula el vuelto en efectivo  |
|   del IVA en reportes fiscales.  |             |   y equivalencias en pantalla.   |
+----------------------------------+             +----------------------------------+
```

- Fórmula de Conversión en Checkout:
  - Monto en USD a pagar en Efectivo NIO = $Monto_{USD} \times TC_{Comercial}$
  - Declaración de Impuestos = $Monto_{USD} \times TC_{Oficial}$
- Pagos Divididos: El sistema debe permitir registrar múltiples métodos de pago para un solo ticket (ej. C$500 en Efectivo + $20 en Tarjeta BAC + C$200 en Transferencia LAFISE). El sistema descuenta el saldo dinámicamente hasta llegar a cero.

### 6. Motor de Impuestos Dinámico y Exenciones Temporales

- Requerimiento Funcional: Motor de cálculo capaz de aplicar el IVA (15%), retenciones si aplica, e implementar reglas específicas de exención fiscal sin alterar datos históricos.
- Reglas de Exención Programables:
  - Soporte para fines de semana libres de IVA (ferias escolares, regulaciones gubernamentales específicas).
  - Exención por perfil de cliente (Diplomáticos, Organismos Internacionales, Zonas Francas) requiriendo el número de aval exonerado de la DGI obligatorio para cerrar la venta.
- Inmutabilidad Fiscal Histórica:
  - Los impuestos aplicados a una venta se calculan en caliente durante el checkout, pero una vez emitido el ticket, los valores absolutos de los impuestos ($IVA_{Calculado}$, $Base_{Imponible}$) se graban de forma estática e inmutable en la tabla de detalles del ticket.
  - Regla arquitectónica: Si las tasas impositivas cambian en el Backoffice en el futuro, los reportes de ventas del pasado no deben recalcularse. Deben leer los valores históricos congelados en la transacción.

## 3. Modelo de Datos Entidad-Relación (Estructura Core)

Para asegurar la flexibilidad del desacoplamiento cambiario, la inmutabilidad y los pagos divididos, se implementará la siguiente estructura de datos en el motor local y nube:

```sql
-- Catálogo de productos con su configuración impositiva por defecto
CREATE TABLE productos (
    id UUID PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    sku VARCHAR(50) UNIQUE,
    precio_base_nio NUMERIC(12,4) NOT NULL,
    porcentaje_iva NUMERIC(5,2) DEFAULT 15.00,
    es_exento BOOLEAN DEFAULT FALSE
);

-- Encabezado de la transacción FOH
CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    numero_secuencial_local VARCHAR(50) NOT NULL,
    fecha_apertura TIMESTAMP NOT NULL,
    fecha_cierre TIMESTAMP,
    estado VARCHAR(20) NOT NULL, -- 'OPEN', 'HOLD', 'PAID', 'VOID'
    mesa_id VARCHAR(50),
    mesero_id VARCHAR(50),
    
    -- Historial del Tipo de Cambio aplicado en el momento exacto del Checkout
    tipo_cambio_oficial NUMERIC(8,4) NOT NULL,  -- BCN Diario
    tipo_cambio_comercial NUMERIC(8,4) NOT NULL, -- Configuración de Caja
    
    -- Totales consolidados guardados de forma estática (Inmutabilidad)
    subtotal_neto_nio NUMERIC(12,4) NOT NULL,
    total_impuestos_nio NUMERIC(12,4) NOT NULL,
    total_descuentos_nio NUMERIC(12,4) NOT NULL,
    total_final_nio NUMERIC(12,4) NOT NULL,
    
    -- Datos de exoneración DGI si aplica
    numero_aval_exoneracion VARCHAR(100) NULL,
    es_ticket_exonerado BOOLEAN DEFAULT FALSE
);

-- Detalle de los ítems del ticket con congelamiento de precios e impuestos
CREATE TABLE ticket_detalles (
    id UUID PRIMARY KEY,
    ticket_id UUID REFERENCES tickets(id),
    producto_id UUID REFERENCES productos(id),
    cantidad INT NOT NULL,
    precio_unitario_historico_nio NUMERIC(12,4) NOT NULL,
    porcentaje_iva_historico NUMERIC(5,2) NOT NULL,
    monto_iva_calculado_nio NUMERIC(12,4) NOT NULL,
    subtotal_item_nio NUMERIC(12,4) NOT NULL
);

-- Modificadores aplicados a cada línea de producto
CREATE TABLE ticket_detalle_modificadores (
    id UUID PRIMARY KEY,
    ticket_detalle_id UUID REFERENCES ticket_detalles(id),
    nombre_modificador VARCHAR(100) NOT NULL,
    precio_adicional_nio NUMERIC(12,4) DEFAULT 0.0000
);

-- Registro detallado de la forma de pago (Pagos Divididos Multi-Moneda)
CREATE TABLE ticket_pagos (
    id UUID PRIMARY KEY,
    ticket_id UUID REFERENCES tickets(id),
    metodo_pago VARCHAR(50) NOT NULL, -- 'EFECTIVO', 'TARJETA', 'TRANSFERENCIA'
    moneda_pago VARCHAR(3) NOT NULL,  -- 'NIO', 'USD'
    
    monto_entregado_moneda_original NUMERIC(12,4) NOT NULL, -- El dinero físico/digital recibido
    tipo_cambio_utilizado NUMERIC(8,4) NOT NULL,           -- TC Comercial si es USD a NIO
    
    monto_aplicado_nio NUMERIC(12,4) NOT NULL,             -- El contravalor equivalente aplicado al saldo en NIO
    vuelto_entregado_nio NUMERIC(12,4) DEFAULT 0.0000
);
```

## 4. Matriz de Casos de Uso Críticos (Edge Cases)

| ID | Caso de Uso / Escenario | Comportamiento Esperado del Sistema |
| --- | --- | --- |
| UC-01 | El cliente paga una cuenta de C$1,000 dando un billete de $20 USD y el resto en Córdobas en efectivo. | El sistema toma los $20 USD, los multiplica por el Tipo de Cambio Comercial (ej. 36.50 = C$730). Resta C$730 al total, indicando un saldo pendiente de C$270 que se liquida con el efectivo en Córdobas. |
| UC-02 | Se cae el internet por completo a mitad del turno en un entorno con 5 Tablets y 1 KDS. | Las tablets continúan enviando comandas al All-In-One local (Topología A). El KDS sigue reflejando los pedidos. Los tickets se cobran e imprimen localmente. Al volver el internet, el nodo local sincroniza en background los estados contables a la nube de forma ordenada. |
| UC-03 | Se va el internet en una sucursal pequeña que solo usa una Tablet con Impresora Integrada (Topología B). | La app almacena las transacciones en su base de datos local (SQLite) de forma cifrada. Al presionar "Cobrar", envía la orden de impresión mediante bus local/Bluetooth a la impresora térmica integrada. El cliente recibe su ticket. La sincronización con la nube queda en cola (Outbox Pattern). |
| UC-04 | Se activa un fin de semana "Libre de IVA" decretado por el gobierno para ciertos productos. | El administrador programa la regla en el Backoffice con fecha/hora de inicio y fin. El motor de impuestos dinámico evalúa la marca de tiempo del ticket: si entra en el rango, setea el porcentaje_iva a 0% de forma automática para las categorías seleccionadas, guardando porcentaje_iva_historico = 0.00 en el detalle del ticket. |
| UC-05 | Dos meseros intentan abrir la misma cuenta retenida (Mesa 5) al mismo tiempo desde tablets diferentes. | El nodo local (o la base de datos distribuida por WebSockets) aplica un mecanismo de Optimistic/Pessimistic Locking. El primer mesero que hace tap bloquea el registro del ticket. Al segundo mesero le aparece un modal informando: "La cuenta de la Mesa 5 está siendo editada por [Nombre_Mesero]". |

## 5. Requerimientos No Funcionales (NFR) de Arquitectura

- Rendimiento Local: El tiempo de respuesta de la interfaz al agregar un modificador o un producto al carrito de compras debe ser inferior a 16ms (60fps) para evitar fatiga visual del cajero.
- Disponibilidad Local (Resiliencia): En la Topología A, la pérdida del enlace WAN (internet) no debe impedir que se abran, modifiquen, impriman o cobren cuentas locales. El RTO (Recovery Time Objective) del switch a modo offline debe ser de 0 segundos (transparente para el usuario).
- Seguridad y Auditoría Fiscal: Cualquier anulación de ticket (Void) o eliminación de ítems de una cuenta retenida debe requerir PIN de supervisor y generar un log inmutable de auditoría local (logs_auditoria_foh) detallando: fecha, hora, terminal, ID del empleado que modificó y razón de la edición.
