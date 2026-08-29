# Test Suite

## Fase 1: Gobernanza, Roles y Seguridad (RBAC)

Objetivo: Validar que los permisos granulares y el Manager Override bloqueen accesos no autorizados sin paralizar la operación.

- Configuración de Identidades:
  - Crear rol CAJERO_ORDINARIO (Permisos básicos de venta).
  - Crear rol GERENTE_SUCURSAL (Permisos pos:drawer:open_manual, pos:discount:override, pos:void_sale).
  - Asignar PIN de 6 dígitos a ambos.

- Validación de Bloqueo: Iniciar sesión en el FOH como Cajero. Intentar abrir el cajón sin venta.
  - Esperado: El sistema bloquea la acción y solicita elevación.

- Elevación en Sitio (Manager Override):
  - En el modal de bloqueo, ingresar el PIN del Gerente y seleccionar motivo "Ingreso de sencillo".
  - Esperado: El pulso RJ12 se dispara, el cajón abre, y se registra en el Audit Trail.

- Fallo de Hardware Simulado:
  - Desconectar la impresora, solicitar apertura manual con PIN de Gerente.
  - Esperado: El sistema marca TIMEOUT_NO_DRAWER_SENSING, registra un intento fallido y quema/consume la autorización del PIN inmediatamente.

## Fase 2: Costeo Dinámico y Ajustes de Inventario (Kardex)

Objetivo: Auditar el recálculo del Costo Promedio Ponderado (CPP) y el registro de mermas fuera de ventas.

| Acción | Entidad | Valor | Validación Esperada en Kardex |
| --- | --- | --- | --- |
| Compra 1 | Café Grano | 5 kg a C$ 350.00 / kg | Stock: 5 kg | CPP: C$ 350.00 |
| Compra 2 | Café Grano | 5 kg a C$ 400.00 / kg | Stock: 10 kg | CPP Recalculado: C$ 375.00 |
| Ajuste Manual | Café Grano | -0.5 kg (Merma/Derrame) | Stock: 9.5 kg | Movimiento: OUT_SHRINKAGE con costo de C$ 187.50 |

- Prueba de Receta: Vender 1 Café Latte (requiere 0.02 kg).
- Validación del Costo de Venta (COGS): El margen de ganancia de esa factura debe calcularse usando el nuevo CPP de C$ 375.00/kg, no el precio de la primera compra.

## Fase 3: Transacciones Complejas y Multimoneda (FOH)

Objetivo: Estresar el motor de pagos fraccionados y el manejo dual USD/NIO. (Asumir Tasa de Cambio configurada a 36.50).

- Apertura de Caja: Iniciar turno declarando fondo de caja: C$ 1,000 y $20 USD.
- Pago Dividido (Split Tender):
  - Facturar una mesa por un total de C$ 1,500.
  - Cliente paga: C$ 500 en Efectivo, C$ 500 con Tarjeta VISA, y el saldo restante en USD.
  - Esperado: El sistema calcula exactamente $13.70 USD de saldo pendiente.
- Vuelto Transfronterizo (Cambio en Moneda Local):
  - Facturar un monto de C$ 182.50 (Equivalente a $5.00 USD).
  - Registrar pago con un billete de $20.00 USD.
  - Esperado: El sistema calcula el cambio adeudado como C$ 547.50 (no en dólares), aplicando la política de "Vuelto solo en moneda nacional".
- Descuento Supervisado:
  - Aplicar un descuento del 100% (Cortesía) a una cuenta.
  - Esperado: El Cajero es bloqueado. Requiere PIN de Gerente. Al aplicar, el Kardex descuenta los insumos, pero el ingreso de caja es C$ 0.00. El descuento está ligado a una cantidad permitida por configuracion de negocio, si este es superado requiere la aprobación del gerente.

## Fase 4: Resiliencia y Sincronización Offline (Outbox Pattern)

Objetivo: Garantizar que una caída de red (común en terrazas o Food Parks) no detenga el flujo de ventas ni corrompa el Kardex al reconectar.

- Corte de Red: Desactivar Wi-Fi de la terminal POS.
- Operación en Modo Aislado:
  - Emitir 3 facturas consecutivas pagadas en efectivo.
  - Realizar 1 apertura de cajón manual (con PIN de Gerente en caché local).
  - Esperado: Los tiquetes se imprimen con folio secuencial temporal. La latencia de interfaz debe ser cero (gracias a DexieDB/SQLite).
- Reconexión y Resolución:
  - Reactivar Wi-Fi.
  - Esperado: El motor Outbox sincroniza en segundo plano. En el BOH (Kardex web), los inventarios se descuentan con los timestamps reales de cuando ocurrió la venta offline, no con la hora de sincronización.

## Fase 5: Cierre de Turno por Declaración a Ciegas (Blind Count)

Objetivo: Prevenir fraude en el cuadre de caja ocultando los totales esperados.

- Iniciación: El Cajero presiona "Cerrar Turno". El sistema no muestra cuánto dinero debería haber.
- Conteo Físico: El Cajero cuenta físicamente los billetes e ingresa en pantalla:
  - Total Efectivo NIO: C$ 3,450.00
  - Total Efectivo USD: $ 20.00
  - Total Tarjetas (Voucher): C$ 500.00
- Sellado y Arqueo (Z-Report):
  - El sistema sella la sesión y la compara con los registros teóricos.
  - Si el sistema esperaba C$ 3,500.00, se debe generar una alerta de Faltante de C$ 50.00 en el reporte Z y registrarse en el Audit Trail.
  - Esperado: La sesión cambia a estado CLOSED y la terminal vuelve a la pantalla de login/PIN, lista para el siguiente turno.

## Fase 6: Flujo de Cocina y Hardware (Food Park & KDS)

Objetivo: Validar que el enrutamiento de impresiones y la gestión de atención al cliente funcionen en hardware real.

- Captura de Beeper: En el POS, ingresar un pedido de 2 Hamburguesas e introducir el Beeper #12.
- Enrutamiento Inteligente (Comandas):
  - Esperado: La impresora local de caja (Sunmi V2s) imprime el comprobante de pago con el texto BEEPER: 12.
  - Esperado: La impresora de red en la cocina (IP 192.168.1.X, puerto 9100) imprime la comanda de preparación de forma simultánea, activando el buzzer (alarma sonora) y mostrando el BEEPER: 12 en la cabecera.
- Gestión de Cola: Si se apaga la impresora de cocina, el sistema debe encolar la comanda y reintentar la impresión automáticamente al reconectarla, sin bloquear la pantalla del cajero.

## Fase 7: Cumplimiento Fiscal y Facturación (DGI Nicaragua)

Objetivo: Garantizar que el motor de impuestos y datos del cliente cumplan con la normativa contable local.

- Cálculo de IVA (15%):
  - Configurar un producto en C$ 100.00 (Precio sin impuesto) y asignarle la regla IVA_15.
  - Esperado: El total a pagar en POS debe ser C$ 115.00. En el reporte contable, C$ 100 van a ingresos netos y C$ 15 a pasivo de impuestos.
- Facturación a Contribuyentes:
  - Al momento del pago, ingresar el Nombre de Razón Social y un número de RUC válido.
  - Esperado: El tiquete impreso incluye los datos fiscales del cliente para su soporte de gastos.
- Manejo de Propinas (Opcional):
  - Agregar un 10% de propina sugerida (Servicio).
  - Esperado: La propina incrementa el total a cobrar, pero no genera IVA ni afecta el ingreso bruto operativo del restaurante.

## Fase 8: Motor de Provisión y Concurrencia (Infraestructura)

Objetivo: Probar los mecanismos de defensa anti-fraude y control de dispositivos en el BOH.

- Enrolamiento de Dispositivo (Activación):
  - Crear un código de activación de 6 dígitos en el BOH.
  - Ingresarlo en una tablet nueva.
  - Esperado: El backend emite el certificado de dispositivo y la tablet descarga la base de datos inicial (Catálogo y Políticas).
- Revocación (Kill-Switch):
  - Desde el BOH, revocar el dispositivo activado.
  - Esperado: En el siguiente intento de sincronización, la tablet cierra la sesión y borra la base de datos local (SQLite/Dexie) para proteger la información.
- Control de Concurrencia (CAS):
  - Abrir la Matriz de Permisos en dos pestañas del navegador distintas.
  - En la Pestaña A, guardar un cambio.
  - En la Pestaña B, intentar guardar un cambio diferente sobre la misma política.
  - Esperado: El sistema rechaza el guardado de la Pestaña B (HTTP 412 Precondition Failed) e indica que la política fue modificada por otro administrador.

## Fase 9: Consolidación Analítica (Reportes End-of-Day)

Objetivo: Validar que toda la data transaccional genere inteligencia de negocio exacta.

- Cuadre de Ventas vs. Costos (P&L Diario):
  - Ir al BOH ➔ Reportes ➔ Utilidad Bruta.
  - Esperado: El sistema debe cruzar las Ventas Netas del día contra el COGS (Costo de Bienes Vendidos deducido en el Kardex) y mostrar el Margen Bruto exacto.
- Auditoría de Mermas:
  - Revisar el reporte de ajustes manuales.
  - Esperado: Debe mostrar la merma registrada en la Fase 2 valorada al costo promedio ponderado de ese momento, impactando el gasto operativo.
