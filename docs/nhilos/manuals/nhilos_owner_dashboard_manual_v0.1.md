# Manual de Operación del Owner Dashboard (Portal Web)
## NHILOS POS — Backoffice Administrativo para Propietarios

**Document ID:** NH-MAN-DSH-001 (CD-12)  
**Versión:** 0.1  
**Estado:** CLIENT-READY  
**Aplica a:** Propietarios (Owners), administradores y gerentes de SOHO Café (`NH-T0001`)  
**Acceso Web:** Portal Backoffice en la Nube

---

## 1. Acceso y Autenticación Administrativa

El Owner Dashboard es una plataforma web a la que podés acceder desde cualquier computadora, tableta o teléfono móvil con navegador web moderno (Google Chrome, Safari, Firefox o Edge):

![Pantalla de Login del Backoffice](images/dsh_01_login.png)

1. **Ingreso:** Navegá hacia el subdominio asignado a tu comercio (ej. `http://soho.localhost:5173` en pruebas locales o `https://soho.nhilospos.com` en producción).
2. **Credenciales:** Ingresá tu correo electrónico corporativo registrado (`admin@soho.com`) y tu contraseña segura de propietario.
3. **Cierre de Sesión:** Al finalizar tus consultas en computadoras públicas o compartidas, hacé clic en tu avatar en la esquina inferior izquierda y seleccioná **"Cerrar Sesión"**.

---

## 2. Comprensión Crítica: Datos de Caja (POS) vs. Datos en Nube (Dashboard)

> **REGLA FUNDAMENTAL DE ARQUITECTURA:**  
> **El punto de venta físico (POS) es la fuente de verdad operativa de tu negocio.**  
> El Owner Dashboard web refleja la información que **ya ha sido sincronizada a la nube** a través de internet. Si el terminal físico de SOHO Café se queda temporalmente sin señal de Wi-Fi o internet en Managua, los cajeros seguirán cobrando sin problema, pero esas ventas aparecerán en el Dashboard web recién cuando el terminal recupere conectividad y complete su subida.

En la barra superior del portal verás siempre el indicador de **Frescura de Sincronización** (*Sync Freshness*), indicando la fecha y hora exacta del último reporte recibido desde la caja.

---

## 3. Vista General del Negocio (Dashboard Overview)

Al iniciar sesión, la pantalla de inicio te presenta los indicadores clave de rendimiento (KPIs) en tiempo real con datos sincronizados desde la terminal de caja:

![Vista General de KPIs del Negocio](images/dsh_02_kpis_ventas.png)

1. **Ventas Netas del Período:** Monto total facturado en Córdobas (C$) en el rango seleccionado (ej. C$ 510.00).
2. **Volumen de Facturas (Tickets):** Cantidad de comprobantes emitidos válidos (ej. 5 transacciones).
3. **Ticket Promedio:** Gasto medio por cliente (ej. C$ 102.00).
4. **Margen Bruto Teórico:** Indicador de rentabilidad (en el Día 1 de SOHO se muestra sin costo de ventas hasta cargar las recetas).
5. **Evolución y Ventas por Hora:** Gráfica interactiva de facturación a lo largo de las horas del día.
6. **Top Productos Más Vendidos:** Ranking de rotación (ej. *Cappuccino 12oz*, *Espresso Doble*, *Cappuccino 8oz*).
7. **Mix de Métodos de Pago:** Desglose consolidado del dinero recibido (Efectivo NIO, USD, Tarjetas).
8. **Atención Requerida:** Resumen automático de alertas de seguridad y facturas anuladas (ej. 2 anulaciones registradas por C$ 225.00).

---

## 4. Módulo de Ventas y Arqueos de Turno

En la sección lateral **Ventas**:

![Historial de Ventas y Rendimiento](images/dsh_03_historial_comprobantes.png)

### 4.1 Historial de Comprobantes
* Consulta la lista cronológica completa de todas las facturas y comprobantes emitidos.
* Filtrá por rango de fechas, número de ticket, cajero o método de pago.
* Hacé clic en cualquier ticket para visualizar el desglose detallado de productos, impuestos, descuentos y método de pago aplicado.

### 4.2 Auditoría de Anulaciones (Voids)
* Visualizá todas las ventas que fueron anuladas en la caja física.
* Podrás verificar: qué cajero solicitó la anulación, qué supervisor la autorizó mediante su PIN, la hora exacta y el motivo ingresado.

### 4.3 Sesiones de Caja y Reportes de Cierre (Cortes Z)
En la sección **Sesiones de caja** del menú lateral:

![Sesiones de Caja y Diferencias de Efectivo](images/dsh_05_sesiones_caja.png)

* Verificá quién abrió y cerró cada terminal de la sucursal (`pos-local-...`).
* Control del tiempo de turno: fecha y hora exacta de apertura y de cierre.
* **Control de Descuadres:** Consulta de la diferencia de efectivo reportada en el arqueo ciego (ej. `-C$5.00` o `-C$25.00`) para detectar faltantes de caja de inmediato.

---

## 5. Módulo de Catálogo y Precios

En la sección **Productos** del menú lateral:

![Catálogo Completo de Productos de SOHO](images/dsh_04_catalogo_productos.png)

1. **Visualización de Menú:** Lista completa de los **58 productos** del menú de SOHO Café organizados en modalidad *Simple*, con su Unidad de Medida (UN), precio de venta oficial y distintivo de estado *Activo*.
2. **Búsqueda Dinámica:** Buscador integrado por nombre o categoría.
3. **Acciones:**
   * **Editar:** Permite actualizar el precio de venta de cualquier producto en pocos segundos.
   * **Desactivar:** Permite ocultar temporalmente un producto del terminal POS si se agota en barra.

---

## 6. Módulo de Inventario, Recetas y Mermas (Fase Operativa Avanzada)

> **Nota para SOHO Día 1:** Durante la jornada inicial de puesta en marcha, el catálogo opera con productos en modalidad **SIMPLE** (solo precio y venta). Cuando se carguen las recetas e insumos, se habilitarán las siguientes capacidades analíticas:

1. **Control de Insumos (Materias Primas):** Existencia teórica en bodega de café en grano, leche, jarabes, azúcar, vasos descartables y tapas.
2. **Descuento Automático por Receta:** Cada vez que la caja vende un *Cappuccino 12oz*, el sistema descuenta matemáticamente los 18g de café, 120ml de leche, 1 vaso y 1 tapa correspondientes.
3. **Costo de Bienes Vendidos (COGS) y Margen Bruto:**
   * El sistema calcula el Costo Promedio Ponderado (CPP) de cada insumo.
   * Muestra el **margen de ganancia bruta real** de cada producto del menú (Precio de venta menos costo de ingredientes).
4. **Registro de Mermas y Ajustes:** Registro justificado de insumos caducados, leche cortada o derrames en preparación para auditar el desperdicio real del negocio.

---

## 7. Módulo Fiscal y Reportes para Contabilidad

En la sección **Fiscal** del menú lateral:

![Módulo de Control Fiscal DGI](images/dsh_06_fiscal.png)

1. **Cumplimiento DGI (Disposición Técnica 09-2007):**
   * Resumen mensual de ventas brutas (C$ 510.00), cantidad de facturas (5) e IVA recaudado (C$ 0.00 bajo Cuota Fija).
   * Clasificación de ventas exentas / no sujetas y notas de crédito emitidas.
   * Pista de auditoría inalterable con la numeración secuencial ascendente de facturas.
   * Registro completo de comprobantes anulados (ningún número se salta ni se destruye).
2. **Exportación de Datos para Contador:**
   * Pestaña de **Exportaciones**: Descargá reportes consolidados mensuales en formato **Excel (.xlsx)** o **CSV** para entrega directa a la administración contable.

---

## 8. Gestión de Usuarios, Roles y Seguridad de Acceso

En la sección **Ajustes > Usuarios y Permisos**:

1. **Creación y Edición de Cajeros:**
   * Podés registrar a cada empleado con su nombre completo y correo electrónico.
2. **Asignación y Reemplazo de PINs:**
   * Si un cajero olvida su PIN de 4 dígitos o si se produce una rotación de personal, podés cambiar su código numérico directamente en el portal en pocos segundos.
3. **Matriz de Privilegios:**
   * **Cajero:** Solo puede operar la pantalla de venta física en el terminal.
   * **Supervisor / Encargado:** Puede autorizar anulaciones y cierres de turno en caja.
   * **Owner (Propietario):** Acceso total y exclusivo a métricas financieras, costos, recetas y cambios de precios.

---

## 9. Monitoreo de Terminales de Flota

En la sección **Ajustes > Dispositivos**:

* Podrás ver el estado del terminal físico MIRAY Q80 asignado a tu sucursal (`POS-SOHO-01`).
* **Información Reportada:** Versión de la app instalada, nivel de batería reportado, dirección IP y marca de tiempo de la última sincronización exitosa.
* **Bloqueo Remoto:** En caso de extravío o sospecha de hurto del terminal, podés revocar su token de acceso con un solo clic para impedir cualquier uso no autorizado.

---

## 10. Canales de Asistencia y Preguntas Frecuentes

* **WhatsApp de Asistencia para Propietarios:** [Número de Contacto Directo]
* **Correo de Soporte Técnico:** `soporte@nhilospos.com`
* **Horario de Atención:** Lunes a Sábado de 8:00 AM a 8:00 PM.
