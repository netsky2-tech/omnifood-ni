# Módulo de Gestión de Identidad, Acceso y Auditoría

## Vision del módulo

Garantizar que cada acción sensible (ventas, anulaciones, arqueos) esté vinculada
a un usuario identificado, cumpliendo con los requisitos de seguridad de la
DGI y permitiendo una operación fluida en modo offline.

## Arquitectura de Identidad: Multi-Tenancy Aislado

Para escalar a otros nichos, utilizaremos una estructura jerárquica:

- SuperAdmin (Tú): Acceso global para soporte técnico y gestión de licencias.
- Tenant (Dueño del Negocio): Propietario de los datos de su café/restaurante.
- User (Empleado): Individuo con roles específicos dentro de un Tenant.

## Requerimientos Funcionales

### Flujo de Autenticación Híbrido (Online/Offline)

- Primer Login (Online): El empleado ingresa sus credenciales. La app Flutter
  descarga el perfil, el token JWT y una versión cifrada de su contraseña (hash)
  a la base de datos local SQLite.
- Login Diario (Offline-First): El sistema permite el acceso mediante un PIN de
  4 o 6 dígitos validado localmente contra SQLite. Esto facilita el cambio rápido
  entre cajeros o meseros sin depender de internet.
- Cierre de Sesión Forzado: Capacidad de cerrar sesiones de forma remota desde
  el dashboard
  cloud si un empleado es despedido.

### Autorización Basada en Roles (RBAC)

Se definen niveles de acceso para evitar que un mesero pueda borrar una orden o
ver reportes financieros:

Roles y permisos claves:

- Dueño (Owner) -> Acceso total, reportes financieros, configuración de recetas,
  gestión de personal.
- Gerente (Manager) -> Autorización de descuentos manuales, anulaciones de
  facturas, apertura/cierre de turnos.
- Cajero (Cashier) -> Registro de ventas, cobros, arqueo parcial de caja.
- Mesero (Waiter) -> Toma de pedidos, envío a cocina (KDS), ver estado de
  sus mesas únicamente.

### Autorizaciones Especiales (Supervisión)

- Pin de Supervisor: Si un cajero intenta anular una factura, el sistema debe
  bloquear la pantalla y
  solicitar el PIN de un Gerente o Dueño para aprobar la acción (exigencia para
  control de mermas y prevención de robos).

## Auditoría y Cumplimiento (DGI Nicaragua)

### Audit Trail (Log Inalterable)

De acuerdo con la Disposición Técnica 09-2007, el acceso debe estar controlado.
El sistema debe registrar en SQLite cada acción en un log que incluya:

- User_ID
- Timestamp (Local e Inmutable)
- Action (ej: "Invoice_Created", "Invoice_Voided", "Manual_Stock_Adjustment")
- Device_ID

### Bloqueo de Eliminación

El sistema no permitirá el borrado físico de usuarios que tengan transacciones
vinculadas, solo su desactivación. Esto es vital para que, en una auditoría de
la DGI, se pueda rastrear quién emitió una factura específica hace 6 meses.

## Especificaciones Técnicas

- Tokenización: Uso de JWT (JSON Web Tokens) con expiración configurable para
  la comunicación con la API Cloud.
- Cifrado Local: Las contraseñas y PINs nunca se guardan en texto plano. Se
  utilizará BCrypt o similar para el hashing.
- Sesiones: Soporte para múltiples sesiones en un mismo terminal
  (un mesero toma pedido, el cajero cobra, el dueño revisa stock) sin cerrar
  la sesión principal del dispositivo.

## UX/UI para el Food Park

- Selector Visual de Usuarios: Al encender la tablet, mostrar fotos o nombres
  de los empleados en turno para un acceso rápido vía PIN.
- Time-out de Pantalla: Bloqueo automático tras 2 minutos de inactividad para
  evitar que alguien use la cuenta de otro empleado.
