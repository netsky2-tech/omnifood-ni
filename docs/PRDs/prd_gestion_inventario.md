# Módulo de Inventario y Producción OmniPos (BOH - Back of House)

Este PRD define el comportamiento, la arquitectura lógica, las estructuras de datos y las reglas de negocio para el control de inventarios, costeo y producción de OmniPos. Está diseñado para integrarse nativamente con el módulo FOH (Front of House), garantizando consistencia en tiempo real en negocios con infraestructura completa o resiliencia en dispositivos autónomos y simplificados.

## 1. Arquitectura de Operación y Topologías de Sincronización

El inventario de un restaurante o comercio se ve afectado directamente por las ventas del FOH. Dependiendo del escenario de hardware del cliente, el descuento de existencias e insumos se procesa bajo dos topologías de sincronización:

### Topología A: Operación Completa (All-In-One Local Edge + In-Store Server)

- Descuento de Stock en Caliente: Al procesarse un cobro en el FOH o emitirse un ticket de cocina, el servidor local centralizador (All-In-One o Mini-PC) ejecuta instantáneamente la explosión de recetas (BOM). Deduce en tiempo real del inventario local los insumos correspondientes.
- Centralización Local: El KDS y las tablets consultan las existencias remanentes de productos críticos de forma centralizada (ej. "Solo quedan 3 unidades de Filete de Pescado").
- Consolidación Asíncrona: El nodo local encola las transacciones de inventario terminadas y las sincroniza en lotes estructurados hacia el Backoffice en la nube.

### Topología B: Formato Ultra-Ligero (Smart POS / Tablet Autónoma)

- Descuento en Base de Datos Embebida: La tablet ejecuta la explosión de recetas localmente en su motor embebido (SQLite/IndexedDB) al confirmarse cada venta o merma.
- Sincronización Basada en Deltas de Stock: Para evitar la corrupción de datos provocada por problemas de latencia o conectividad celular/intermitente, la tablet nunca transmite el "Stock Actual" absoluto a la nube. En su lugar, transmite Deltas netos (ej. -0.150 kg de carne, -1 unidad de pan). La nube procesa estos deltas en orden secuencial estricto.

## 2. Especificación de Componentes Core

### 1. Gestión de Recetas (Bill of Materials - BOM) y Rendimientos

- Requerimiento Funcional: Permitir la configuración de las fórmulas de preparación de los productos de venta final, desglosándolos en materias primas (insumos) o sub-recetas (productos intermedios precocinados). Debe soportar mermas operativas por cocción/limpieza.
- Comportamiento Lógico:
  - Sub-recetas Multi-nivel: Capacidad de encadenar componentes (ej. Una Hamburguesa [BOM Final] usa Salsa Secreta [Sub-Receta], la cual a su vez usa Mayonesa, Mostaza y Especias [Insumos Base]).
  - Factor de Rendimiento y Merma Técnica: Configuración del porcentaje de pérdida natural de un insumo al procesarse (ej. Un lomo de carne de 1.000 kg crudo rinde 0.850 kg limpio tras el corte; Factor de rendimiento = 85%). El costo se prorratea sobre el peso neto utilizable.
  - Unidades de Medida Binarias: Manejo estricto de unidades de compra (ej. Caja de 24 unidades, Saco de 50 lbs) vs. unidades de consumo en receta (ej. Gramos, Mililitros, Onzas).

### 2. Costeo Promedio Ponderado (CPP) Multi-Moneda

- Requerimiento Funcional: Sistema de valoración de inventario basado en el algoritmo de Costeo Promedio Ponderado (CPP), procesado obligatoriamente en la moneda base contable de Nicaragua (Córdobas - NIO).
- Comportamiento Matemático:
  - Cada entrada por compra actualiza el costo promedio del insumo de acuerdo con la fórmula estándar:
    - $$CPP_{Nuevo} = \frac{(Existencia_{Actual} \times CPP_{Actual}) + (Cantidad_{Entrante} \times Costo_{UnitarioEntrante})}{(Existencia_{Actual} + Cantidad_{Entrante})}$$
  - Tratamiento de Compras en USD: Si una factura de proveedor ingresa en Dólares (USD), el sistema traduce el costo unitario entrante a Córdobas (NIO) utilizando estrictamente el Tipo de Cambio Oficial del Banco Central de Nicaragua (BCN) correspondiente a la fecha de emisión de la factura de compra, garantizando consistencia con la contabilidad fiscal general. Los feriados no modifican esta regla de tipo de cambio.
  - Calendario Fiscal de Excepciones: El sistema debe soportar reglas fiscales temporales configurables, como periodos oficiales de exención de IVA durante Semana Santa u otros comunicados gubernamentales. Estas reglas deben poder activarse/desactivarse con fechas de vigencia, alcance tributario y evidencia documental, sin mezclarse con la lógica de tipo de cambio BCN.
  - Las salidas de almacén (ventas, mermas) descargan el inventario utilizando el valor del $CPP$ vigente en el instante exacto del movimiento.

### 3. Kardex de Inventario Inalterable (Deltas de Stock)

- Requerimiento Funcional: Un registro contable electrónico, cronológico e inmutable de todos los movimientos físicos de inventario. Queda estrictamente prohibido reescribir, borrar o alterar cualquier registro histórico del Kardex.
- Reglas de Diseño Arquitectónico:
  - Arquitectura de Append-Only: Cualquier corrección de inventario (ej. Un error al digitar una entrada por compra) se soluciona ingresando un nuevo movimiento de ajuste compensatorio con signo inverso.
  - Campos de Control de Auditoría: Cada línea del Kardex debe estampar el ID de usuario, la marca de tiempo del servidor y el tipo de documento de origen (Factura de Venta, Orden de Compra, Hoja de Merma, Conteo Físico).

### 4. Registro y Control de Mermas

- Requerimiento Funcional: Interfaz optimizada y rápida para registrar pérdidas de producto e insumos, clasificándolas por motivos específicos para la toma de decisiones gerenciales y deducciones fiscales permitidas.
- Comportamiento Operativo:
  - Tipificación Obligatoria: Cada merma debe categorizarse: Vencimiento, Desecho de Cocina (Quemado/Mal preparado), Deterioro de Bodega, o Cortesía/Degustación.
  - Nivel de Registro: Permite mermar tanto un producto final (ej. 1 Hamburguesa tirada a la basura que explota insumos mediante el BOM) como materia prima directa (ej. 2 kg de tomates podridos en bodega).
  - Impacto Contable: Genera un movimiento automático de salida en el Kardex al $CPP$ actual del artículo, restando el valor monetario del inventario e impactando la cuenta de gasto por merma correspondiente.

### 5. Producción y Pre-elaboración de Batch

- Requerimiento Funcional: Módulo para formalizar la producción interna de sub-recetas que se preparan con anticipación al turno (ej. Producción de 20 litros de salsa, marinado de 50 lbs de pollo).
- Comportamiento Lógico:
  - El usuario genera una "Orden de Producción interna".
  - El sistema calcula los insumos requeridos según el BOM de la sub-receta para ese batch específico.
  - Al confirmar la producción: El sistema realiza una salida masiva automática en el Kardex para todas las materias primas consumidas, y en el mismo instante inyecta una entrada de inventario por la cantidad neta producida de la sub-receta, asignándole un coste equivalente a la suma de los componentes consumidos al $CPP$ del momento.

## 3. Modelo de Datos Entidad-Relación (Estructura Core)

Para dar soporte a la inmutabilidad del Kardex, el costeo y la estructura jerárquica de recetas, se define el siguiente esquema de base de datos relacional:

```sql
-- Catálogo base de Insumos / Materias Primas
CREATE TABLE insumos (
    id UUID PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    unidad_medida_inventario VARCHAR(20) NOT NULL, -- 'KG', 'LTS', 'UND', 'OZ'
    
    -- Control de Costeo Promedio Ponderado (En Córdobas siempre)
    existencia_actual NUMERIC(14,4) DEFAULT 0.0000,
    costo_promedio_nio NUMERIC(14,4) DEFAULT 0.0000,
    
    stock_minimo NUMERIC(14,4) DEFAULT 0.0000,
    stock_maximo NUMERIC(14,4) DEFAULT 0.0000
);

-- Cabecera de Recetas / Bill of Materials (BOM)
CREATE TABLE recetas (
    id UUID PRIMARY KEY,
    producto_final_id UUID, -- Referencia a tabla 'productos' de ventas (FOH) o a sí mismo si es sub-receta
    es_sub_receta BOOLEAN DEFAULT FALSE,
    nombre_receta VARCHAR(150) NOT NULL,
    cantidad_rendimiento NUMERIC(10,4) NOT NULL, -- Cantidad que produce este BOM (ej. 1.0000 Unidad o 10.0000 Litros)
    unidad_rendimiento VARCHAR(20) NOT NULL      -- 'UND', 'LTS', 'KG'
);

-- Detalle de los componentes de la receta
CREATE TABLE receta_detalles (
    id UUID PRIMARY KEY,
    receta_id UUID REFERENCES recetas(id) ON DELETE CASCADE,
    
    -- Un detalle puede ser un insumo base O otra sub-receta
    insumo_id UUID REFERENCES insumos(id) NULL,
    sub_receta_id UUID REFERENCES recetas(id) NULL,
    
    cantidad_bruta NUMERIC(12,4) NOT NULL, -- Cantidad antes de mermas de cocción
    porcentaje_merma_tecnica NUMERIC(5,2) DEFAULT 0.00, -- Ej. 15.00% pérdida por desbuesar
    cantidad_neta_utilizable NUMERIC(12,4) NOT NULL     -- Cantidad real incorporada al plato
);

-- Kardex Único Inalterable (Registro Contable de Movimientos)
CREATE TABLE kardex (
    id BIGSERIAL PRIMARY KEY, -- ID Secuencial único incremental obligatorio
    insumo_id UUID REFERENCES insumos(id),
    fecha_movimiento TIMESTAMP NOT NULL,
    
    tipo_movimiento VARCHAR(30) NOT NULL, 
    -- 'ENTRADA_COMPRA', 'SALIDA_VENTA', 'SALIDA_MERMA', 'AJUSTE_CONTEO', 'ENTRADA_PRODUCCION'
    
    documento_origen_id UUID NOT NULL, -- ID de Tabla Tickets, Factura Compra o Ficha de Merma
    cantidad NUMERIC(14,4) NOT NULL,   -- Siempre expresada en la unidad_medida_inventario. Positivo o Negativo.
    
    -- Congelamiento de Costeo en el momento exacto de la transacción
    costo_unitario_movimiento_nio NUMERIC(14,4) NOT NULL,
    existencia_posterior NUMERIC(14,4) NOT NULL,
    costo_promedio_posterior_nio NUMERIC(14,4) NOT NULL,
    
    usuario_id VARCHAR(50) NOT NULL,
    terminal_id VARCHAR(50) NOT NULL
);

-- Registro de Mermas de Inventario
CREATE TABLE mermas (
    id UUID PRIMARY KEY,
    fecha_merma TIMESTAMP NOT NULL,
    tipo_motivo VARCHAR(50) NOT NULL, -- 'VENCIDO', 'MALA_PREPARACION', 'ROTO', 'DETERIORADO'
    subtotal_costo_perdido_nio NUMERIC(14,4) NOT NULL,
    usuario_id VARCHAR(50) NOT NULL,
    observaciones TEXT
);

-- Detalle de los insumos o productos perdidos en la hoja de merma
CREATE TABLE merma_detalles (
    id UUID PRIMARY KEY,
    merma_id UUID REFERENCES mermas(id),
    insumo_id UUID REFERENCES insumos(id) NULL,
    producto_venta_id UUID NULL, -- Si se mermó un plato completo directamente desde el FOH
    cantidad NUMERIC(14,4) NOT NULL,
    costo_unitario_historico_nio NUMERIC(14,4) NOT NULL
);
```

## 4. Matriz de Casos de Uso Críticos y Escenarios Excepcionales (Edge Cases)

| ID | Caso de Uso / Escenario | Comportamiento Esperado del Sistema |
| --- | --- | --- |
| UC-01 | Se registra la compra de 10 sacos de harina en USD ($30.00 c/u) durante un periodo especial declarado por el Gobierno, por ejemplo Semana Santa con exención temporal de IVA. | El sistema valida la fecha de emisión de la factura. Extrae de la caché local o API el Tipo de Cambio Oficial del BCN de ese día y traduce el costo a Córdobas (ej. $30.00 × 36.6542 = C$1,099.626 por saco). De forma separada, consulta el calendario fiscal de excepciones para determinar si aplica IVA-cero/exención durante ese rango de fechas. Luego aplica el algoritmo de CPP actualizando el maestro de insumos, dejando auditada la regla fiscal aplicada. |
| UC-02 | Sincronización diferida en Tablet con Impresora (Topología B) tras vender 50 unidades offline. | La base de datos local SQLite de la tablet registra 50 transacciones restando deltas de ingredientes. Al recuperar internet, la tablet dispara las transacciones en orden cronológico inverso mediante el Outbox Pattern. La nube procesa cada delta en el Kardex central sin alterar los balances intermedios ya calculados de otros dispositivos. |
| UC-03 | Stock Negativo Virtual (Un mesero vende un platillo cuyo insumo principal figura en 0 en el sistema). | Regla de Alimentos: El sistema FOH no bloquea la venta de comida por stock teórico cero (impediría vender stock real que llegó físicamente pero no se ha digitado la factura de compra). El Kardex registra la salida restando la cantidad (generando stock negativo temporal) calculada al último CPP conocido. Cuando la factura de compra sea digitada con retroactividad, el motor recalcula automáticamente los costos y regulariza los balances. |
| UC-04 | Ajuste por Conteo Físico Revela faltante de 5 kg de carne Premium en el congelador al cierre de mes. | El auditor crea un Documento de Ajuste Físico. El sistema calcula la diferencia entre el stock teórico esperado (ej. 15 kg) y el real (10 kg). Registra un movimiento tipo AJUSTE_CONTEO en el Kardex con una cantidad de -5.0000 kg, valorada al CPP actual de la carne, ajustando el stock real a 10 kg exactos sin alterar compras pasadas. |
| UC-05 | Se elimina o modifica una receta (BOM) vieja modificando los ingredientes de una Salsa. | El sistema aplica Versionamiento de Recetas. La receta antigua se marca como inactiva (fecha_fin_vigencia = NOW()) y se crea una nueva versión ID. Las ventas del pasado mantienen su vínculo con la versión de receta con la que fueron cocinadas, protegiendo la inmutabilidad histórica del costo de ventas de meses anteriores. |

## 5. Requerimientos No Funcionales (NFR) de Arquitectura BOH

- Precisión Decimal Obligatoria: Todos los cálculos matemáticos de cantidades de insumos, porcentajes de merma y costos financieros deben procesarse a nivel de base de datos y backend utilizando tipos de datos numéricos de punto fijo con un mínimo de 4 decimales de precisión (NUMERIC(14,4)) para mitigar errores por redondeo acumulativo.
- Aislamiento de Concurrencia: La inserción de movimientos en el Kardex para un mismo insumo debe gestionarse bajo un nivel de aislamiento de transacciones de base de datos de tipo SERIALIZABLE o mediante colas de mensajes bloqueantes (FIFO por ítem) para evitar condiciones de carrera (Race Conditions) al actualizar el Costo Promedio Ponderado de forma simultánea desde diferentes cajas o bodegas.
- Auditoría Forense: Cualquier registro en el Kardex con una alteración manual o tipo AJUSTE_CONTEO superior a un umbral de C$1,500.00 equivalentes debe disparar de forma asíncrona una alerta por correo electrónico y notificación Push al perfil del administrador general del sistema.
- Configuración Fiscal Temporal: Las excepciones fiscales comunicadas oficialmente (ej. periodos sin aplicación de IVA) deben modelarse como reglas configurables con fecha de inicio, fecha de fin, tipo de impuesto afectado, alcance, estado activo/inactivo, usuario responsable y referencia documental. Activar o desactivar una regla debe quedar auditado y no debe alterar retroactivamente documentos ya emitidos sin un proceso explícito de ajuste/anulación.
