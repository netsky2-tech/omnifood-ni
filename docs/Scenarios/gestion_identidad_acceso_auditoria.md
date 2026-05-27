# 🔐 Escenarios de Prueba — Identidad, Acceso y Auditoría

## 1. Autenticación (Login Híbrido)

  S-AUTH-01 — Login online exitoso
  El sistema con conectividad envía credenciales al API cloud, recibe un JWT válido y el conjunto de permisos actualizado. El usuario queda autenticado con token de corta duración.

  S-AUTH-02 — Fallback automático a modo offline
  Al cortar la conexión, el siguiente intento de login debe conmutar automáticamente (sin intervención del usuario) a validación local. El sistema hashea el PIN contra el registro en
  SQLite/Secure Storage y genera un token de sesión local restringido.

  S-AUTH-03 — Credenciales en texto plano (negativo)
  Inspeccionar el storage local (SQLite, Secure Storage, IndexedDB) después del login y verificar que no exista ningún campo con la contraseña o PIN en texto claro. Solo deben existir
  hashes.

  S-AUTH-04 — Login offline con PIN incorrecto
  Ingresar un PIN erróneo en modo offline. El sistema debe rechazar el acceso, no generar token y no revelar si el usuario existe o no (respuesta genérica de credenciales inválidas).

  S-AUTH-05 — Coherencia de permisos online vs offline
  Un usuario tiene su rol modificado en la nube (ej. degradado de Supervisor a Cajero). Al hacer login offline con el caché anterior, el sistema debe operar con los permisos cacheados
  pero marcar el token como "pendiente de sincronización". Al reconectarse, los permisos deben actualizarse antes de la siguiente sesión.
  ──────

## 2. RBAC — Control de Acceso por Rol

  S-RBAC-01 — Mesero no puede abrir/cerrar turno de caja
  Autenticar como Mesero e intentar acceder a la funcionalidad de apertura de caja. El sistema debe bloquear la acción tanto en UI (botón oculto/deshabilitado) como en la capa de datos
  (el DAO/API rechaza la operación).

  S-RBAC-02 — Cajero no puede aplicar descuentos
  Autenticar como Cajero e intentar aplicar un descuento a una orden. El sistema debe mostrar el modal de bloqueo (Security Lockout) solicitando PIN de supervisor, no ejecutar el
  descuento directamente.

  S-RBAC-03 — Solo Administrador modifica recetas/insumos (BOH)
  Autenticar como Supervisor, Cajero y Mesero respectivamente e intentar acceder al módulo de modificación de recetas. Los tres deben ser bloqueados. Solo Administrador debe tener
  acceso.

  S-RBAC-04 — Anulación de factura bloqueada para Cajero y Mesero
  Intentar anular una factura ya emitida con rol Cajero y con rol Mesero. En ambos casos debe dispararse el modal de bloqueo. Supervisores y Administradores deben poder ejecutarla
  directamente (o con su propio PIN de confirmación según el flujo).

  S-RBAC-05 — Reportes X/Z inaccesibles para Cajero y Mesero
  Verificar que las pantallas de Reporte X y Z no sean accesibles (ni en UI ni por ruta directa) para roles Cajero y Mesero.

  S-RBAC-06 — Todos los roles pueden tomar comandas
  Autenticar con cada uno de los 4 roles y verificar que todos pueden registrar un pedido y enviarlo a cocina sin restricción ni modal de seguridad.
  ──────

## 3. Cash Control — Modelo Centralizado (Modelo A)

  S-CASH-A-01 — Solo Cajero gestiona el turno central
  En configuración Modelo A, verificar que las tablets (Meseros) solo puedan tomar pedidos. El botón de cobro/facturación en efectivo debe estar inhabilitado o redirigir a la caja
  central.

  S-CASH-A-02 — Apertura de caja con monto inicial
  El Cajero abre un turno de caja: el sistema crea un registro en  turnos_caja  con  estado = 'ABIERTO' ,  monto_apertura_nio  correcto y  fecha_apertura  con timestamp válido.

  S-CASH-A-03 — Cierre de turno y reconciliación
  Al cerrar el turno, el sistema calcula el  monto_cierre_teorico_nio  (apertura + ventas efectivo - salidas), el cajero ingresa el  monto_cierre_real_nio , y el sistema persiste la
  diferencia en  monto_diferencia_nio . El estado pasa a  'CERRADO' .
  ──────

## 4. Cash Control — Modelo Descentralizado / Cartera de Mesero (Modelo B)

  S-CASH-B-01 — Apertura de cartera personal
  El mesero abre su turno con un fondo inicial. El sistema crea un  turno_caja  de tipo  CARTERA_MESERO  vinculado al  usuario_id  del mesero y a su  terminal_id .

  S-CASH-B-02 — Cierre de cartera post-corte de luz (UC-03)
  Simular un reinicio del dispositivo a mitad de turno (sin perder la batería del Smart POS). Al reabrir la app, el mesero debe poder ejecutar el cierre. El sistema debe calcular el
  total cobrado en efectivo a partir de los tickets cerrados en SQLite local y mostrar el monto exacto para cuadre físico.

  S-CASH-B-03 — Aislamiento entre carteras de distintos meseros
  Mesero A y Mesero B trabajan simultáneamente. El cierre de cartera de Mesero A solo debe contener las transacciones asignadas a su  usuario_id , sin cruzar datos con Mesero B.
  ──────

## 5. PIN de Supervisor y TOTP

  S-PIN-01 — Flujo completo de autorización presencial (UC-01)
  Un Mesero intenta aplicar descuento → el modal de bloqueo aparece → Supervisor ingresa PIN correcto → la acción se ejecuta → se crea registro en  logs_auditoria_seguridad  con
  metodo_autorizacion = 'PIN_PRESENCIAL'  y  usuario_autorizador_id  del supervisor.

  S-PIN-02 — PIN incorrecto no desbloquea
  Ingresar un PIN inválido en el modal de seguridad. La acción restringida no debe ejecutarse. El sistema muestra error pero no revela cuántos intentos restan hasta el tercer intento.

  S-PIN-03 — Bloqueo por intentos fallidos (brute force)
  Ingresar PIN incorrecto 3 veces en menos de 60 segundos. El sistema debe bloquear el método PIN durante 5 minutos exactos. Durante ese tiempo, el único método disponible debe ser TOTP
  remoto o clave de Administrador General.

  S-PIN-04 — Autorización TOTP remota sin internet (UC-02)
  Con el dispositivo en modo offline, ingresar un código TOTP válido generado por la app ligada a FlexiPoint. El sistema valida matemáticamente el token usando la  totp_secret_seed
  local y desbloquea la acción. No debe requerir llamada a red.

  S-PIN-05 — TOTP expirado (ventana de 30 segundos)
  Ingresar un código TOTP con más de 60 segundos de antigüedad (fuera de la ventana de 1 paso de tolerancia). El sistema debe rechazarlo.

  S-PIN-06 — El desbloqueo es por única transacción
  Después de que el supervisor autoriza con PIN, intentar realizar una segunda acción restringida diferente. El sistema debe volver a solicitar autorización; el PIN previo no debe
  persistir como sesión de privilegios elevados.
  ──────

## 6. Registro de Gaveta (Drawer Logs)

  S-DRAWER-01 — Apertura normal durante facturación
  Al imprimir una factura de venta, la gaveta se abre automáticamente. Este evento NO debe requerir autorización y puede registrarse como evento rutinario (no como
  DRAWER_OPENED_MANUALLY ).

  S-DRAWER-02 — Apertura manual requiere autorización
  Intentar abrir la gaveta fuera del flujo de facturación. El sistema debe solicitar autorización de supervisor (PIN o TOTP). Sin aprobación, la gaveta no debe abrirse.

  S-DRAWER-03 — Registro inmutable de apertura manual
  Al aprobar una apertura manual, el sistema debe crear un registro en  logs_auditoria_seguridad  con  tipo_accion = 'APERTURA_GAVETA_MANUAL' , incluyendo justificación,
  usuario_operador_id ,  usuario_autorizador_id , y timestamp. Este registro no debe poder modificarse ni eliminarse.
  ──────

## 7. Auditoría e Inmutabilidad

  S-AUDIT-01 — Inmutabilidad de logs
  Intentar hacer UPDATE o DELETE directamente sobre  logs_auditoria_seguridad  con cualquier rol de aplicación. El sistema (via constraint o trigger de DB) debe rechazar la operación.

  S-AUDIT-02 — Integridad secuencial del BIGSERIAL
  Después de una sincronización hacia la nube, el Backoffice debe detectar automáticamente si hay saltos en la secuencia de IDs. Simular un registro eliminado directamente en la DB y
  verificar que la auditoría nocturna genere la alerta de integridad.

  S-AUDIT-03 — Todos los campos requeridos presentes en cada log
  Para cada tipo de evento crítico (anulación, descuento, apertura de gaveta, void ticket), verificar que el registro en  logs_auditoria_seguridad  contiene:  fecha_evento ,
  usuario_operador_id ,  usuario_autorizador_id  (cuando aplica),  tipo_accion ,  modulo_origen ,  documento_referencia_id ,  descripcion_detallada  y  metodo_autorizacion . Ningún
  campo NOT NULL debe ser nulo.

  S-AUDIT-04 — Logs generados en offline se sincronizan íntegros
  Ejecutar acciones críticas con el dispositivo offline (anulación de ítem, apertura de gaveta manual). Al reconectar, verificar que todos los logs generados localmente se transmiten a
  la nube con sus firmas criptográficas intactas y sin pérdida de datos.
  ──────

## 8. Anti-Tampering (UC-04)

  S-TAMPER-01 — Manipulación de reloj del dispositivo
  Retroceder el reloj del sistema operativo de la tablet a una fecha anterior al último  fecha_evento  registrado en la DB local. Al intentar cualquier operación, el sistema debe
  detectar la inconsistencia cronológica y entrar en  Anti-Tampering Lock , bloqueando toda funcionalidad y exigiendo clave maestra.

  S-TAMPER-02 — El bloqueo anti-tampering persiste tras reinicio
  Después de activar el Anti-Tampering Lock, reiniciar el dispositivo. Al reabrir la app, el sistema no debe retomar operación normal; el bloqueo debe persistir hasta ingresar la clave
  maestra.
  ──────

## 9. Seguridad en Reposo (NFR)

  S-SEC-01 — totp_secret_seed cifrado con AES-256 en Topología B
  Inspeccionar el storage local del dispositivo autónomo y verificar que el  totp_secret_seed  no está legible en texto plano. Debe estar cifrado con AES-256 usando una llave derivada
  del hardware del dispositivo.

  S-SEC-02 — Hashes de PIN con Argon2 o PBKDF2
  Verificar que los  pin_seguridad_hash  almacenados localmente sean el resultado de Argon2 o PBKDF2 con sal, no MD5, SHA-1 ni SHA-256 sin sal.
  ──────

## 10. Rendimiento (NFR)

  S-PERF-01 — Validación de PIN bajo 30ms
  Medir el tiempo de respuesta de la validación de PIN presencial bajo carga (ej. durante una prueba de 50 transacciones concurrentes). El percentil P99 debe estar por debajo de 30ms en
  el motor local.
