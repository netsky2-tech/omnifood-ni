# Documento de Requerimientos de Producto (PRD) Master: OmniFood NI
## Plataforma POS Modular, Offline-First y Multi-Tenant para Nicaragua

---

## 1. Visión del Producto y Objetivos Estratégicos

OmniFood NI es un sistema de Punto de Venta (POS) modular y unificado, diseñado para operar de forma resiliente bajo las condiciones del mercado nicaragüense. Inicialmente optimizado para gastronomía (cafeterías y restaurantes), su arquitectura permite expandirse a retail general (tiendas de ropa, farmacias y minimarkets) mediante una base de datos extensible y configuración modular sin alterar la base del sistema.

### Pilares Fundamentales
1. **Offline-First Absoluto**: El POS debe facturar, procesar inventario y permitir el login de empleados sin conexión a internet. La base de datos local SQLite (Floor/Drift) es la fuente de la verdad; la nube es un espejo consistente y asíncrono.
2. **Cumplimiento Fiscal DGI (DT 09-2007)**: Las facturas son inmutables. No existe la eliminación física de transacciones; solo se permiten anulaciones supervisadas registradas en bitácora. La numeración correlativa es secuencial y rígida.
3. **Escalabilidad Multi-Tenant**: Aislamiento total de datos en la nube mediante PostgreSQL con Row-Level Security (RLS) basado en `tenant_id`, garantizando que la información de un comercio esté blindada de otros.
4. **Catálogo Extensible Multi-Rubro**: Capacidad de manejar productos simples (unidades), productos compuestos (recetas/BOM) y productos con variantes (tallas/colores) en un mismo motor de base de datos usando atributos en formato JSON.

---

## 2. Arquitectura de Dominio y Datos

Para lograr la escalabilidad de rubros, el sistema separa la gestión de ventas de la gestión de inventario de insumos utilizando tres tipos de productos:

### A. Tipos de Productos de Venta (`type`)
* **SIMPLE**: Productos unitarios que se compran y venden directamente sin transformación (ej: lata de gaseosa, bolsa de café cerrada, souvenir). Descuenta stock del propio producto al vender.
* **COMPOUND**: Productos elaborados en el local (ej: Taza de Capuccino, Hamburguesa). Requiere una receta vinculada en la tabla `recipe_items`. Al venderse, descuenta proporcionalmente las cantidades de materias primas (`raw_materials`).
* **VARIANT_PARENT**: Productos contenedores de variantes (ej: Camisa Oxford). La venta se efectúa sobre una variante específica (`PRODUCT_VARIANT`), la cual puede descontar inventario simple (ropa) o insumos de receta según aplique.

### B. Estructura de Persistencia Flexible (Dynamic Metadata)
Tanto en PostgreSQL (`JSONB`) como en SQLite (`TEXT` serializado), la tabla de productos y variantes contará con una columna `metadata` / `attributes`. Esto permite guardar propiedades específicas de cada industria sin migrar esquemas:
* **Gastronomía**: `{"requires_prep": true, "kitchen_printer": "Cocina_1"}`
* **Retail**: `{"talla": "M", "color": "Rojo", "material": "Algodón"}`
* **Farmacia**: `{"lote": "LOT-892A", "vencimiento": "2027-06-30", "receta_medica": true}`

### C. Arquitectura de Red Local (LAN Broker) para Multi-Dispositivos
Para soportar el funcionamiento de múltiples dispositivos (Handhelds de meseros, KDS y caja principal) cuando la conexión WAN externa se cae, la red Wi-Fi local interna (LAN) actuará como canal de comunicación en tiempo real:
- **Terminal Host (Broker Local)**: El dispositivo All-in-One principal de caja actuará como servidor local temporal de la red LAN (levantando un servicio HTTP/Websocket embebido).
- **Descubrimiento Automático (mDNS)**: Las tablets de los meseros y la pantalla KDS descubrirán la IP de la caja principal de forma automática en la red local mediante protocolos mDNS/Zeroconf.
- **Flujo de Comandas Offline**: Los meseros enviarán los pedidos directamente a la caja principal por la red local. La caja principal enrutará las comandas a la ticketera de cocina (IP/LAN) y a la pantalla KDS de forma inmediata, permitiendo la operación normal del FOH sin internet.
- **Sincronización Consolidada a la Nube**: El terminal host acumula todas las transacciones realizadas por sí mismo y por los dispositivos satélites, y es el encargado de subirlas al backend cloud (NestJS) cuando detecta que la conexión WAN es restablecida.
- **Sincronización de Estados en Tiempo Real (Local Broadcast)**: La caja principal actuará como el servidor de base de datos local central. Al recibir la ocupación de una mesa o un pedido de un mesero, actualizará su base de datos local y emitirá un broadcast vía WebSockets locales a todas las tablets de meseros conectadas, impidiendo que dos meseros abran la misma mesa simultáneamente y sincronizando el estado visual del salón en segundos.

---

## 3. Módulos del Sistema y Requerimientos Funcionales

### 3.1 Módulo de Ventas (FOH - Front of House)
* **Interfaz Adaptativa y Táctica**: Diseñada para pantallas táctiles (tablets Android y terminales All-in-One Windows/Linux). Con áreas de toque optimizadas (mínimo 48px).
* **Modificadores Dinámicos**: Selección de ingredientes extra, cambios de base de leche o términos de cocción. Cada modificador puede tener un costo extra y su propia receta de descuento de inventario.
* **Retención de Cuentas (Hold Tickets)**: Capacidad de "pausar" un pedido (cuentas abiertas o mesas) y recuperarlo para cobro o adición posterior.
* **KDS (Kitchen Display System)**: Pantalla interactiva en cocina/barra que recibe comandas digitales sin usar papel térmico.
* **Checkout Multi-Moneda y Pagos Divididos**:
  - Transacciones nativas en Córdobas (NIO) y Dólares (USD). Permite dividir la cuenta entre múltiples métodos de pago (Efectivo, Tarjeta, QR) en ambas monedas simultáneamente en una sola transacción.
  - **Doble Esquema de Tipo de Cambio Desacoplado**:
    1. **Tipo de Cambio Oficial (Base Contable/Fiscal)**: Utilizado estrictamente para el cálculo de impuestos de cara a la DGI y la contabilidad central de la plataforma (por defecto 36.6243 o sincronizado con el Banco Central).
    2. **Tipo de Cambio Comercial (Caja/Efectivo)**: Configurable de forma independiente por el Tenant en el POS. Se utiliza para el cálculo visual en pantalla del monto a pagar en dólares y para el vuelto en efectivo, protegiendo el margen del comercio ante spreads bancarios (ej: recibir USD a 36.00).
* **Motor de Impuestos Dinámico y Exenciones Temporales**:
  - Configuración flexible de tasas por producto o categoría (ej: IVA 15%, Exento 0% para medicinas, Propina Voluntaria del 10% en restaurantes).
  - Reglas de exención programables: Capacidad de definir campañas (ej: "Fin de semana sin IVA") con fecha/hora de inicio y fin para que el POS las aplique automáticamente fuera de línea.
  - Inmutabilidad Fiscal Histórica: Las tasas e impuestos cobrados se guardan de forma estática en la factura en el momento de la venta, garantizando que futuras modificaciones de reglas no alteren los reportes históricos auditados por la DGI.


### 3.2 Módulo de Inventario y Producción (BOH - Back of House)
* **Gestión de Recetas (Bill of Materials - BOM)**: Asociación de un producto `COMPOUND` a múltiples ingredientes de `raw_materials` definiendo cantidades exactas (ej: 0.5 oz de café, 6 oz de leche).
* **Costeo Promedio Ponderado (CPP)**: Recalcular automáticamente el costo teórico de producción de cada plato o bebida al ingresar facturas de compras de insumos de proveedores.
* **Kardex de Inventario Inalterable (Deltas de Stock)**:
  - Registro detallado, cronológico e inmutable de cada movimiento de inventario (Entrada por compra, Salida por venta, Salida por merma, Ajuste por conteo físico).
  - **Sincronización Basada en Deltas**: Los cambios en el stock se sincronizarán enviando deltas incrementales o decrementales (ej: -50g de café, +12 unidades de refresco) y nunca sincronizando el stock absoluto. El backend cloud (NestJS) procesará estos deltas en el orden estricto de su `client_timestamp` para mantener la consistencia e integridad de las existencias centrales, evitando sobreescrituras conflictivas por desfases de red.
* **Registro y Control de Mermas**: Formulario rápido para que el personal registre insumos dañados, derramados o vencidos para ajustar el inventario teórico contra el físico.

### 3.3 Gestión de Identidad, Acceso y Seguridad (RBAC)
* **Login Híbrido Cifrado**:
  - **Online**: El primer inicio de sesión valida contra el backend cloud y descarga los hashes BCrypt a la base de datos local SQLite.
  - **Offline**: Autenticación rápida en terminal mediante un PIN numérico (4-6 dígitos) validado localmente contra el hash SQLite, permitiendo cambios de cajero/mesero instantáneos sin internet.
* **Permisos Basados en Roles (RBAC)**:
  - **Owner (Dueño)**: Acceso total a reportes, personal, costos y configuraciones.
  - **Manager (Gerente)**: Habilitado para arqueos de caja, ajustes de stock y autorizaciones especiales.
  - **Cashier (Cajero)**: Apertura de caja, ventas, cobros y arqueos parciales.
  - **Waiter (Mesero)**: Envío de pedidos a KDS, gestión de mesas propias y cobro directo si está habilitado el modo descentralizado.
* **Control de Flujo de Efectivo Configurable (Switch de Tenant)**:
  - La arquitectura permitirá al Administrador (Tenant) alternar entre dos modelos de flujo de dinero con un switch en su panel de control:
    1. **Modelo Centralizado (Caja Única)**: Los meseros solo toman pedidos. Todo pago (efectivo/tarjeta) debe ser procesado físicamente en la caja principal (All-in-One) por un cajero, abriendo la gaveta de dinero central.
    2. **Modelo Descentralizado (Cartera de Meseros)**: Cada mesero abre su propio "Turno de Cartera" con un fondo de caja inicial. Están autorizados a realizar cobros directamente en la mesa (efectivo o datáfono portátil) y emitir la factura desde su Handheld. Al finalizar su jornada, el sistema exige un arqueo individual por mesero para conciliar el dinero recaudado antes del cierre general del local.
* **Pin de Supervisor (Override Lockout) y Autorización Remota TOTP**:
  - Bloqueo de pantalla cuando un cajero o mesero intenta realizar acciones de riesgo (anular una factura, aplicar un descuento manual mayor al 10%, abrir gaveta manualmente).
  - **Doble Método de Aprobación Offline**:
    1. **Físico (Presencial)**: El Gerente o Dueño se acerca a la pantalla y digita su PIN personal registrado localmente en SQLite.
    2. **Remoto (Offline-First via TOTP)**: Si el Gerente no está presente, puede generar un código dinámico temporal de 6 dígitos (TOTP) desde la app móvil instalada en su teléfono (el cual se calcula mediante una semilla secreta compartida en el onboarding inicial y el reloj del sistema). Dicta este código al cajero (por llamada o WhatsApp), y el POS local valida el código offline y desbloquea la acción, registrando el ID del gerente autorizador en la bitácora (`Auth_By`).

### 3.4 Auditoría y Bitácora de Eventos (Audit Trail)
* **Registro de Acciones de Riesgo**: Log inalterable que guarda ID de usuario, timestamp del dispositivo, timestamp del servidor, ID de dispositivo, tipo de evento y payload (estado antes y después).
* **Protección Anti-Fraude Local**: La tabla de logs en SQLite utiliza un encadenamiento criptográfico (Hash Chain) donde cada registro contiene el hash del registro anterior. Si un empleado con conocimientos de base de datos edita o borra un registro, la cadena lógica se rompe y el sistema bloquea la sincronización, notificando al Dueño de inmediato.
* **Bloqueo de Eliminación de Usuarios**: Los usuarios con transacciones históricas asociadas no pueden ser borrados; solo se permite su desactivación soft-delete.

### 3.5 Automatización de Onboarding (Venta Rápida)
* **Módulo de Importación Masiva**: Herramienta integrada en el panel administrativo para cargar menús, inventarios e insumos iniciales en masa desde archivos Excel en minutos.
* **Base de Datos de Insumos Predeterminada**: Ingesta inicial opcional de insumos de uso común en Nicaragua (tipos de lácteos, café, verduras estándar, endulzantes) para acelerar la configuración del negocio.

---

## 4. Integraciones y Cumplimiento Legal

### 4.1 Procesamiento de Pagos y Datáfonos (Dos Capas)
* **Flujo en Dos Capas Desacopladas (Datáfono Físico / POS)**:
  - Ante la realidad del mercado nicaragüense donde las APIs bancarias directas no siempre están disponibles, el flujo por defecto operará de forma aislada:
    1. El POS calcula el total de la transacción.
    2. El cajero digita manualmente dicho monto en el datáfono físico del banco (BAC/Banpro).
    3. El cliente realiza el pago físico (tarjeta o QR).
    4. Una vez aprobado, el cajero registra la venta en el POS ingresando el **Código de Aprobación/Referencia** del voucher físico.
* **Flexibilidad Operativa (Conciliación Posterior)**:
  - Para evitar cuellos de botella en horas pico de alta concurrencia, el POS permitirá registrar la venta bajo el método "Tarjeta (Código Pendiente)" e imprimir la factura de forma inmediata para no detener la fila.
  - **Módulo de Conciliación de Turno**: Los códigos de autorización pendientes de ingresar se listarán en una pantalla especial del POS. Los cajeros o gerentes deberán digitar e ingresar estos códigos de forma manual antes de poder realizar el Cierre de Turno o de Caja (Reporte Z), garantizando la cuadratura contable y la prevención de fraudes.
* **Integración API Opcional (Fase Posterior)**:
  - Soporte de comunicación local vía red local (TCP/IP) con datáfonos inteligentes homologados que soporten el envío del monto automático desde la tablet y respondan con el código de autorización automáticamente.

### 4.2 Cumplimiento Fiscal DGI (Nicaragua)
* **Bloqueo de Modificación de Facturas**: Una vez impresa la factura, no se puede alterar su contenido, precio o RUC.
* **Numeración Consecutiva por Series Independientes**:
  - Para operar fuera de línea sin riesgo de colisiones, cada dispositivo (Caja/Tablet) tendrá configurada una serie única autorizada por la DGI (ej: Serie A para Caja 1, Serie B para Caja 2).
  - La numeración de las facturas correrá correlativamente dentro de cada serie de forma local en SQLite, impidiendo saltos de folios.
* **Anulación Legal (`is_canceled`)**: Si se requiere revertir una factura, esta se marca como anulada. El sistema reversa la venta en el reporte financiero, devuelve los ingredientes al inventario y genera un registro de auditoría vinculando al supervisor que autorizó la operación. La factura anulada debe poder consultarse en cualquier auditoría de la DGI.
* **Formatos de Impresión Legal (Patrón Strategy + Perfiles de Impresión)**:
  - En lugar de detección automática, la arquitectura del motor de impresión usará el **Patrón Strategy** acoplado a perfiles configurados (`PrinterProfile`).
  - Cada impresora física tendrá asignado un perfil que define su **Presupuesto de Caracteres por Línea (CPL)** para evitar roturas o desalineación de textos en el ticket térmico:
    1. **Perfil 58mm (Handhelds portátiles de mesero)**: Presupuesto estricto de **32 caracteres por línea (CPL)** utilizando fuente estándar (*Font A*) o **42 CPL** (*Font B*).
    2. **Perfil 80mm (Caja principal All-in-One y ticketera de cocina)**: Presupuesto de **42 CPL** o **48 CPL** (*Font A*).
  - El ticket impreso debe cumplir con todos los datos fiscales exigidos por la DGI (RUC del emisor, dirección, teléfono, la serie y numeración correlativa autorizada por la DGI, desglose detallado de IVA 15% e impuestos especiales).
* **Motor de Vigilancia Fiscal (Fiscal Sentinel)**:
  - Componente transversal e ininterrumpido (tanto localmente en SQLite como en el backend en la nube) encargado de supervisar los límites legales de las resoluciones de facturación activas:
    1. **Alerta Preventiva (90% de Capacidad / 30 Días)**: Al consumir el 90% de los folios numéricos asignados o faltar 30 días naturales para el vencimiento de la resolución, el sistema disparará una notificación de advertencia persistente en forma de banner destacado en el inicio de sesión del POS y del panel administrativo, exigiendo tramitar una nueva resolución.
    2. **Bloqueo Preventivo Rígido (Hard-Stop 100% / Expiración)**: Al consumir el 100% de los folios o alcanzar la fecha de vencimiento de la resolución, el POS bloqueará inmediatamente el proceso de facturación en esa serie. No permitirá emitir más ventas bajo esa serie hasta que se ingrese y valide una nueva resolución autorizada de la DGI, protegiendo al comercio y al desarrollador de cometer delitos de defraudación fiscal.
* **Reportes X y Z**: Generación local y resguardo de reportes de arqueo diarios para cumplimiento tributario.


---

## 5. Especificaciones de Hardware Homologado

| Componente | Especificación Técnica | Costo Estimado (Local) |
| :--- | :--- | :--- |
| **Terminal de Caja Principal** | All-in-One Touch 3NStar (Intel J1900, 4GB RAM, SSD 128GB) ejecutando Windows o Linux. | $945.00 - $1,100.00 |
| **Terminales de Mesero** | Handheld POS Android (Pantalla 5.5", Impresora de 58mm integrada, NFC). | $250.00 |
| **Impresora de Recibos** | Epson TM-T20III (Térmica de 80mm, interfaz Ethernet/USB). | $290.00 |
| **Cajón de Dinero** | CD350 3NStar Metálico con apertura por pulso RJ11 desde la impresora. | $80.00 |

---

## 6. Proyección Económica y Monetización

* **Setup Fee (Configuración Inicial)**: **$200.00** (Pago único). Cubre la capacitación remota/presencial y la migración inicial de datos desde Excel.
* **Suscripción Mensual SaaS**: **$60.00/mes** (Plan Pro - incluye KDS, recetas avanzadas, multi-usuario y almacenamiento cloud de auditoría y ventas).
* **Costo Operativo Base**: **$75.00/mes** (incluye hosting VPS KVM 2 a $8/mes, dominio $1.25/mes prorrateado y suscripciones de desarrollo).
* **Punto de Equilibrio (Break-even)**: **2 clientes activos** ($120.00/mes de ingreso recurrente contra $75.00/mes de costo operativo, dejando una ganancia neta de +$45.00/mes).
