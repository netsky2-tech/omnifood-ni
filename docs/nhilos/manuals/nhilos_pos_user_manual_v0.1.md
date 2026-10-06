# Manual de Usuario del Punto de Venta (POS)

## Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-10-03 | Reemplazo completo de sección 6 (Cuentas Abiertas): ya no es "Retención y Recuperación de Cuentas" sino un flujo completo de cuentas abiertas con 5 secciones (crear, recuperar/editar, múltiples, abandonar, copiar). Actualización de secciones 11.1 (Corte X) y 11.2 (Corte Z) con bloqueos y listados de cuentas abiertas. |
| 0.1 | 2026-??-?? | Primera versión básica de retención y recuperación de tickets (hold simples). |


## NHILOS POS — Terminal MIRAY Q80 / iPOS

**Document ID:** NH-MAN-POS-001 (CD-11)  
**Versión:** 0.1  
**Estado:** CLIENT-READY  
**Aplica a:** Personal de caja, baristas y encargados de turno (Piloto: SOHO Café)  
**Referencia Técnica:** Terminal MIRAY Q80 / iPOS (Android 12, Impresora 80 mm)

---

## 1. Inicio de Jornada y Preparación del Equipo

Antes de abrir el turno de caja, verificá las condiciones físicas del terminal MIRAY Q80:

1. **Encendido:** Mantené presionado el botón de encendido en el lateral derecho del equipo durante 3 segundos hasta que la pantalla se ilumine.
2. **Nivel de Batería:** Comprobá en la esquina superior derecha que la batería tenga al menos un 50% de carga. Si el indicador está bajo, conectá el cable USB-C a la corriente de pared.
3. **Rollo de Papel Térmico:**
   * Abrí la compuerta superior de la impresora tirando de la palanca plástica.
   * Verificá que haya un rollo térmico estándar de **80 mm** instalado.
   * El papel debe salir desenrollándose desde la parte inferior hacia el frente.
   * Dejá asomar 2 cm de papel y cerrá la tapa con firmeza hasta oír un chasquido (*clic*).
4. **Conexión de Red:** Verificá que el ícono de Wi-Fi esté conectado a la red local del negocio. (Si no hay red, recordá que el sistema funciona perfectamente fuera de línea).

---

## 2. Acceso al Sistema mediante PIN

El acceso a NHILOS POS está protegido mediante códigos numéricos individuales para garantizar la auditoría de cada operación:

![Pantalla de Selección de Usuario](images/pos_01_seleccionar_usuario.png)

1. Al abrir la aplicación, verás la lista de usuarios autorizados del establecimiento.
2. Seleccioná tu usuario (ej. *Maxwell Orozco* o *Karla Cajera*).

![Teclado de Ingreso de PIN](images/pos_02_login_pin.png)

3. Ingresá tu **PIN de 4 a 6 dígitos** asignado en el teclado numérico en pantalla.
4. El sistema verificará tu identidad localmente de inmediato y cargará tu perfil asignado (Cajero, Supervisor o Administrador).

> **Seguridad:** Tu PIN es personal e intransferible. Cada ticket, anulación y cobro queda registrado a tu nombre. Nunca compartas tu código con otros compañeros.

---

## 3. Apertura de Turno de Caja

Al ingresar por primera vez en el día o al comenzar un nuevo turno de trabajo, el sistema te solicitará abrir el turno:

1. Tocá el botón **"Abrir Turno"**.
2. Ingresá el monto de **fondo inicial de efectivo** (*caja chica*) con el que arrancás el turno en Córdobas (NIO).
3. Si la barra maneja un fondo inicial en Dólares (USD), ingresalo en la casilla secundaria correspondiente.
4. Presioná **"Confirmar Apertura"**.
5. Se imprimirá un comprobante térmico con la fecha, hora, nombre del cajero y monto de apertura. Guardalo en la gaveta de dinero.

---

## 4. Registro de Ventas (Navegación por Catálogo)

La pantalla principal de venta se divide en dos áreas visuales:
* **Área Izquierda (Catálogo):** Categorías y cuadrícula de productos con nombre y precio.
* **Área Inferior / Derecha (Ticket Actual):** Barra de total y acceso al carrito de compras.

![Catálogo Real de SOHO Café](images/pos_03_catalogo_soho.png)

### Pasos para registrar una orden:
1. **Seleccionar Categoría:** Navegá por los productos del menú (ej. *Espresso Doble*, *Americano 12oz*, *Cappuccino 12oz* con distintivo promocional).
2. **Agregar Producto:** Tocá el producto deseado. Cada toque incrementa la cantidad en una unidad dentro del ticket.

![Barra Inferior con Total de Carrito](images/pos_04_carrito_barra.png)

3. **Buscador Rápido:** Si tenés un catálogo amplio, podés tocar el ícono de lupa y escribir las primeras letras del producto para filtrarlo en pantalla.
4. **Ver Carrito:** Tocá el botón **"VER CARRITO"** en la barra inferior para revisar el pedido consolidado antes de cobrar.

![Detalle de Carrito y Opciones](images/pos_05_detalle_carrito.png)

---

## 5. Manejo de Modificadores, Tamaños y Extras

En negocios de especialidad como cafeterías, muchos productos admiten personalización:

1. **Productos con Variantes / Tamaños:** Al seleccionar un producto configurado con opciones, se desplegará una ventana modal.
2. **Selección de Extras:**
   * Podés marcar agregados como *Shot Adicional*, *Sirope de Vainilla*, *Leche de Almendra* o *Crema Batida*.
   * Si el extra tiene costo adicional, se sumará de forma transparente al precio unitario del producto en el ticket.
3. **Notas Especiales:** Podés presionar sobre una línea del ticket para añadir una instrucción breve para preparación (ej. *"con poca azúcar"* o *"muy caliente"*).
4. Tocá **"Aceptar"** para confirmar las opciones en el pedido.

---

## 6. Cuentas Abiertas (Ventas en Espera / Hold Tickets)

El sistema permite mantener múltiples cuentas abiertas simultáneamente para atender mesas o clientes que siguen consumiendo. Cada cuenta se guarda de forma independiente con su propio nombre, lista de productos y total.

### 6.1 Crear una Cuenta Nueva

Cuando terminás de armar un pedido para un cliente que seguirá en el local:

1. **Armar el pedido** en el carrito (agregar productos como de costumbre).
2. **Poner en Espera:** Presioná el ícono **⏸️ (Poner en Espera)** en la barra inferior del carrito.
3. Se abre el diálogo "Poner Venta en Espera":
   * **Nombre / Identificador:** Escribí un nombre para la cuenta (ej: "Mesa 3", "Cliente 2", "Juan Pérez").
   * **Mesa Asignada (Opcional):** Seleccioná la mesa del local si se trata de una comanda.
   * **Invitados:** Cantidad de personas (opcional).
4. Presioná **"GUARDAR"**. La cuenta se guarda y el carrito queda vacío para atender al siguiente cliente.

> **Importante:** Una vez guardada, la cuenta no se puede modificar desde el catálogo. Para cambiar productos o nombre, debés recuperarla primero (sección 6.2).

### 6.2 Recuperar y Editar una Cuenta Existente

Para continuar atendiendo una cuenta abierta:

1. **Abrir Cuentas Abiertas:** Tocá el botón **⏸️ (Cuentas Abiertas)** en la barra superior del menú principal. Verás todas las cuentas activas con su nombre, cantidad de productos y total.
2. **Recuperar:** Presioná sobre la cuenta que querés editar. El pedido se cargará en el carrito.
3. **Editar:** Podés agregar productos, modificar cantidades o quitar items como en cualquier venta normal.
4. **Re-guardar (Editar Nombre):** Si querés cambiar el nombre de la cuenta o re-guardar con los productos actualizados:
   * Presioná el botón **⏸️ (Editar Cuenta Abierta)** en la barra inferior.
   * Aparecerá un banner que muestra exactamente lo que se va a cambiar: cuántos productos tenés guardados, el total actual, cuántos productos tiene el carrito ahora y la diferencia.
   * Ejemplo: *"Al guardar, sus 2 productos por C$ 250 pasan a ser los 3 productos del carrito, por C$ 150. Se pierden C$ 100 de productos que no están en el carrito."*
   * Cambiá el nombre si querés (se renombra la cuenta, no se crea una nueva).
   * Presioná **"GUARDAR"** para aplicar los cambios.

> **Re-guardar reemplaza, no acumula:** Cuando re-parkkeás una cuenta recuperada, el contenido se **reemplaza** por completo con lo que hay en el carrito. No se suman productos a la cuenta original. Esto evita duplicidades y asegura que cada cuenta refleje exactamente su estado actual.

### 6.3 Múltiples Cuentas Abiertas Simultáneas

Podés tener varias cuentas abiertas a la vez (por ejemplo, Mesa 3 y Mesa 5 atendiendo al mismo tiempo):

* Cada cuenta se muestra de forma independiente en el listado.
* Cada una tiene su propio total y cantidad de productos.
* Podés cobrar una cuenta sin afectar a las demás.
* Al cobrar, esa cuenta desaparece del listado y se emite factura.

### 6.4 Abandonar una Cuenta (Eliminar)

Si una cuenta ya no será cobrada (ej: cliente que se fue sin pagar):

1. Abrí el listado de Cuentas Abiertas (⏸️ en barra superior).
2. Tocá el ícono de papelera roja **🗑️** al lado de la cuenta que querés eliminar.
3. El sistema muestra una confirmación con:
   * El nombre de la cuenta
   * La cantidad de productos
   * El total monetario
   * Advertencia: *"Nada de esto ha sido facturado. Al abandonarla se descarta definitivamente: no se puede deshacer."*
4. Presioná **"ABANDONAR"** para eliminar la cuenta. Si presionás **"CANCELAR"**, la cuenta se mantiene.

> **Importante:** Una cuenta abandonada **no se puede recuperar**. No genera factura ni nota de crédito, ya que es estado pre-fiscal (SQLite local).

### 6.5 Copiar una Cuenta

Si necesitás duplicar una cuenta existente (ej: un pedido similar para otra mesa):

1. Abrí el listado de Cuentas Abiertas.
2. Seleccioná la cuenta que querés copiar.
3. El sistema abre el diálogo para crear una nueva cuenta con los mismos productos.
4. Asignale un nuevo nombre o número de mesa y presioná **"GUARDAR"**.

> **Nota:** La cuenta copiada es independiente. Modificaciones a una no afectan a la otra.

---

## 7. Flujos de Cobro y Medios de Pago

Cuando la orden esté lista, presioná el botón verde **"COBRAR"** en la parte inferior del carrito. Se abrirá la pantalla modal de cobro y facturación:

![Pantalla de Cobro y Facturación](images/pos_06_pantalla_cobro.png)

### 7.1 Cobro en Efectivo en Córdobas (NIO)
1. El total se muestra destacado en Córdobas (C$) junto con el equivalente en Dólares al tipo de cambio comercial (ej. C$ 36.62).
2. Podés asociar un número de *Buzzer / Pager* o el nombre del cliente para entrega en barra.
3. Ingresá el monto de dinero recibido usando el teclado o los botones rápidos de billetes comunes (C$ 225, C$ 300, C$ 400, C$ 500, C$ 1000).

![Cobro en Efectivo con Vuelto en Verde](images/pos_07_cobro_efectivo_vuelto.png)

4. La pantalla te mostrará en números grandes y claros el **VUELTO EXACTO A ENTREGAR** en verde.
5. Tocá **"COBRAR"**. La venta se registrará y el ticket se imprimirá de inmediato.

### 7.2 Cobro en Efectivo en Dólares (USD)
1. Tocá la pestaña **"USD ($)"** en la fila de *Paga con*.
2. El sistema convertirá automáticamente el saldo y mostrará botones rápidos en dólares ($6, $10, $15, $20, $50, $100).
3. Si el cliente paga con un billete de $10.00, el sistema calcula el vuelto exacto a entregar en **Córdobas (NIO)** al tipo de cambio comercial fijado.

![Cobro en Dólares con Vuelto en Córdobas](images/pos_08_cobro_dolares.png)

4. Tocá **"COBRAR"** para emitir el comprobante.

### 7.3 Cobro con Tarjeta de Crédito / Débito (Datáfono Externo)
1. Seleccioná la opción **"Tarjeta"**.
2. Operá el cobro en el datáfono bancario físico independiente entregado por el banco.
3. Una vez que el datáfono imprima el voucher de **"APROBADO"**, ingresá en el POS los últimos 4 dígitos de la tarjeta o el número de autorización del voucher bancario.
4. Tocá **"Confirmar Pago"**.

### 7.4 Pago Mixto / Dividido (Split Payment)
1. Si un cliente abona una parte en efectivo y el resto con tarjeta:
2. Seleccioná **"Pago Dividido"**.
3. Ingresá primero el monto en efectivo recibido (ej. C$ 100).
4. El sistema restará ese valor y mostrará el saldo restante pendiente.
5. Seleccioná **"Tarjeta"** para el saldo restante, pasá el cobro por el datáfono y confirmá la transacción.

---

## 8. Menú Lateral y Módulos del Sistema

Tocando el ícono de tres líneas horizontales (*hamburguesa*) en la esquina superior izquierda se despliega el menú lateral de operaciones:

![Menú Lateral de Operaciones](images/pos_09_menu_lateral.png)

Desde aquí podés navegar rápidamente a:
* **Ventas (POS):** Pantalla principal de caja.
* **KDS - Pantalla de Cocina / Barra:** Monitor de pedidos en preparación.
* **Historial de Ventas:** Consulta y reimpresión de comprobantes anteriores.
* **Control de Caja y Turnos:** Lecturas X, movimientos y cierre Z.
* **Reportes DGI:** Auditoría tributaria y correlatividad.
* **Cambiar Operador / Cerrar Sesión:** Cambio rápido de cajero en turno.

---

## 9. Pantalla de Cocina / Barra (KDS)

Para establecimientos con estación de preparación separada de caja, NHILOS POS incluye un monitor de comandas en tiempo real:

![KDS - Pantalla de Cocina y Barra](images/pos_11_kds_pantalla_cocina.png)

* Los pedidos pagados entran automáticamente con alerta visual y cronómetro de demora.
* El barista o cocinero puede tocar **"Iniciar Preparación"** para dar seguimiento al despacho.

---

## 10. Historial de Ventas y Anulaciones (DGI)

Por estrictas disposiciones de cumplimiento normativo (DGI de Nicaragua), **las facturas emitidas nunca se eliminan físicamente de la base de datos**; únicamente se registran como **ANULADAS**:

![Historial de Ventas con Distintivos de Anulación](images/pos_10_historial_ventas.png)

1. En el historial podés revisar la secuencia ininterrumpida de facturas (ej. facturas 1 a 7).
2. Las facturas anuladas aparecen claramente identificadas con un distintivo rojo de **ANULADA**.
3. Al tocar cualquier factura, accedés a su detalle con opciones de **Reimprimir**, **Emitir Nota de Crédito** o **Anular Factura**.

![Detalle de Factura y Opciones de Acción](images/pos_12_detalle_factura_acciones.png)

4. Al presionar **"ANULAR FACTURA"**, el sistema abre la ventana de selección de motivo formal:

![Diálogo Formal de Motivo de Anulación](images/pos_13_dialogo_anular_factura.png)

5. Seleccioná el motivo correspondiente (*Error de captura*, *Cliente desiste*, *Ticket duplicado*, *Otro*) y confirmá la acción.

---

## 11. Control de Caja, Lectura X y Cierre de Turno (Corte Z)

Al acceder a **Control de Caja y Turnos** desde el menú lateral:

![Panel de Control de Caja y Turnos](images/pos_14_control_caja_turnos.png)

* Podés consultar el fondo inicial cargado en Córdobas y Dólares.
* Podés registrar movimientos de entrada o salida de efectivo (*Ingresos / Egresos manuales*).

### 11.1 Lectura Parcial Informativa (Corte X)
* Tocando **"Lectura Parcial (Corte X)"**, obtenés un arqueo en tiempo real del turno en curso sin cerrar la caja:

![Lectura Parcial Corte X](images/pos_15_lectura_parcial_corte_x.png)

* El Corte X muestra información completa incluyendo:
  * Totales por medio de pago (efectivo, tarjeta, QR, etc.)
  * **Cuentas abiertas:** Se listan las cuentas activas con su cantidad de productos y total acumulado (ej: "Cuentas abiertas · 2 · C$ 350.00")
  * El pie del reporte aclara: *"La lectura X es informativa y no cierra el turno de caja."*

> **Importante:** Las cuentas abiertas no forman parte del ingreso bruto en el Corte X. Se muestran solo como referencia para que el cajero sepa qué pendientes quedan por cobrar.

### 11.2 Arqueo Ciego y Cierre Definitivo (Corte Z)
* Al finalizar el turno, presioná el botón rojo **"Cerrar Turno (Corte Z)"**.
* **Bloqueo de Cuentas Abiertas:** Si existieran cuentas abiertas (ventas en espera) que no se cobraron, el sistema **bloquea el cierre** y muestra un diálogo informativo enumerando cada cuenta abierta con su total:

![Bloqueo de Corte Z — Cuentas Abiertas](images/pos_16b_cierre_con_cuentas_abiertas.png)

* El cierre no se inicia hasta que todas las cuentas abiertas se liquidaron (se cobraron o abandonaron).
* El cajero debe confirmar que cada cuenta se liquidó o que abandonó las que no se cobrarán.
* Una vez que no quedan cuentas pendientes, se procede con el arqueo ciego:
  1. El cajero cuenta físicamente el efectivo en gaveta.
  2. Ingresá el total sin ver los totales del sistema (arqueo ciego).
  3. Presioná **"ENTENDIDO"** para confirmar.

![Arqueo Ciego y Cierre de Turno Corte Z](images/pos_16_cierre_turno_corte_z.png)

* Al confirmar, se imprime el ticket oficial de Corte Z y se bloquea el turno cerrado.

---

## 12. Soporte Técnico Directo

Si experimentás cualquier problema que no puedas resolver con esta guía o la *Guía de Contingencias*:
* **Canal Directo de WhatsApp:** [Número de WhatsApp de Soporte]
* **Correo de Soporte:** `soporte@nhilospos.com`
* **Horario de Asistencia:** Lunes a Sábado de 8:00 AM a 8:00 PM.
