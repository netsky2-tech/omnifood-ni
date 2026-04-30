# Módulo de Audit Trail (Bitácora de Eventos Críticos)

## Visión del Módulo

Proveer un registro histórico, inalterable y detallado de todas las acciones realizadas en el sistema. Este módulo garantiza la transparencia operativa para el dueño del negocio y asegura que el desarrollador (tú) tenga pruebas técnicas ante cualquier disputa sobre la integridad de los datos o fallos del sistema.

## Principios de Diseño

- Inalterabilidad (Append-Only): Los registros de auditoría nunca se editan ni se eliminan. Solo se añaden nuevos registros
- Offline-Resilience: Los logs se generan localmente en SQLite y se marcan para sincronización obligatoria antes de permitir el cierre de turno.
- Aislamiento Multi-tenant: Los logs de un tramo del Food Park están estrictamente separados de otros mediante Tenant_ID.

## Eventos Sujetos a Auditoría (Scope)

El sistema debe registrar automáticamente los siguientes eventos, categorizados por nivel de riesgo:

- Acciones de Seguridad (Riesgo Alto)
  - Inicios/Cierres de Sesión: Usuario, dispositivo, hora exacta y resultado (éxito/fallido).
  - Cambios de Permisos: Cuándo se cambió el rol de un empleado.
  - Intentos de Acceso no Autorizado: Cuando un cajero intenta entrar a módulos de gerencia.
- Acciones Transaccionales (Riesgo Crítico)
  - Anulación de Facturas: Quién solicitó la anulación y quién la autorizó (PIN de supervisor).
  - Descuentos Manuales: Registro del porcentaje aplicado y el motivo.
  - Apertura de Gaveta de Dinero: Registrar cada vez que la gaveta se abre sin una venta vinculada (comando manual).
  - Modificación de Precios: Cambios en el catálogo de productos durante el turno.
- Acciones de Inventario
  - Ajustes Manuales de Stock: Cuándo se incrementó o decrementó el inventario sin una factura de compra/venta (ej: merma o corrección de conteo).
  - Eliminación de Recetas: Cambios en la composición de productos que afecten el costo.

## Estructura de un Registro de Auditoría (Schema)

Log_ID ->UUID generado por el cliente (dispositivo).
Tenant_ID ->Identificador único del negocio en el Food Park.
User_ID ->ID del usuario que realizó la acción.
Auth_By ->ID del supervisor que autorizó la acción (si aplica).
Event_Type ->Código de evento (ej: INV_VOID, STOCK_ADJ).
Description ->Texto legible (ej: "Factura #50 anulada por error en método de pago").
Payload_Before ->Estado del objeto antes de la acción (JSON).
Payload_After ->Estado del objeto después de la acción (JSON).
Client_Timestamp -> Hora del dispositivo (indispensable para offline).
Server_Timestamp -> Hora de recepción en la nube (para detectar manipulaciones de hora local).
Device_Metadata -> ID del dispositivo, versión de la app, IP local

## Requerimientos Técnicos

- Protección del Log Local (SQLite)
  - Para evitar que un usuario con conocimientos técnicos manipule la base de datos local en la tablet, el log de auditoría se guardará en una tabla con un Hash encadenado. Cada registro incluirá el hash del registro anterior, creando una cadena lógica que se rompe si alguien intenta borrar una fila del medio.
- Sincronización y Prioridad
  - Los logs de auditoría tienen prioridad alta en la cola de sincronización. Si el dispositivo tiene internet, el log se envía en tiempo real mediante un Webhook.
  - En modo offline, el sistema debe alertar al dueño si hay logs críticos (como anulaciones) pendientes de subir a la nube por más de 12 horas.

## Cumplimiento Fiscal (DGI Nicaragua)

De acuerdo con la Disposición Técnica 09-2007, este módulo soporta el requisito de "Seguridad de Acceso" y "Anulación de Facturas":

- El sistema debe demostrar ante el inspector de la DGI que las facturas anuladas conservan su numeración y están vinculadas al usuario que realizó la operación.
- Los respaldos magnéticos deben incluir la tabla de auditoría para garantizar que no hubo manipulación de la facturación computarizada.

## Reportes de Auditoría para el Dueño

- Reporte de Excepciones: Un resumen diario enviado al correo del dueño con todos los descuentos, anulaciones y aperturas de gaveta manuales.
- Dashboard de Trazabilidad: Interfaz donde se puede buscar la historia de un ítem de inventario o una factura específica desde su creación hasta su cierre.
