# Feature: Re-anclaje de la cadena forense del terminal (Issue #936)

Status: In Progress
Owner: el Gentleman Orchestrator
Branch: fix/audit-stream-reanchor

## Specs

### S1: Endpoint de continuidad en la nube (`GET /identity/audit/stream-head`)
- Quoted from #936:
  > "El POS puede preguntar a la nube la cabeza de su cadena (`sequence_no`, `entry_hash`) para `(device, usuario)` y reanclarse sin intervención manual."
- El endpoint `GET /identity/audit/stream-head` (con query params `deviceId`, `userId`) está protegido con `SyncTransportGuard` y scope de sincronización de dispositivo.
- Valida que `deviceId` coincida con el `devicePrincipal.deviceId` (o lo toma de este) y que `userId` esté presente.
- Consulta en `audit_logs` la tupla `(tenant_id, device_id, user_id, forensic_status: 'ACTIVE')` ordenada por `sequence_no DESC LIMIT 1`.
- Retorna `{ sequence_no: N, entry_hash: H }` si existe, o `{ sequence_no: 0, entry_hash: 'GENESIS' }` si la cadena está vacía en la nube.

### S2: Evento de re-anclaje auditable y continuidad de la cadena
- Quoted from #936:
  > "Con la nube en la secuencia `N` y el terminal proposing `≤ N` con otro hash, el terminal se reancla y vuelve a empujar (no queda atascado) y el hueco queda documentado en la auditoría (un evento de re-anclaje, con actor y motivo)."
  > "El re-anclaje debe ser auditable: cambiar el ancla de una cadena forense es un hecho que tiene que quedar registrado (quién, por qué, desde qué secuencia), no una UPDATE silenciosa."
- El evento de re-anclaje utiliza la acción `AUDIT_STREAM_REANCHOR`:
  - `sequence_no`: `N + 1`
  - `prev_hash`: `cloud.entry_hash`
  - `metadata`: incluye `reason`, `cloud_head_sequence: N`, `cloud_head_hash`, `previous_local_sequence`
  - `entry_hash`: calculado criptográficamente con la fórmula canónica del stream.
- Los registros locales pendientes son resecuenciados a partir de `N + 2` y sus hashes recalculados secuencialmente (`prev_hash` = `entry_hash` anterior).
- La transacción local actualiza los registros y persiste el evento de reanclaje de forma atómica.

### S3: Eliminación del auto-bloqueo permanente ante 409
- Quoted from #936:
  > "Un `409` de conflicto no deja el envío de auditoría bloqueado de forma permanente: o el terminal se reancla, o el incidente deja de bloquear el flujo."
- Ante un error 409 (o detección de `countActiveAuditTerminalAlerts > 0`), el terminal consulta `stream-head` a la nube.
- Si la nube tiene una secuencia divergente, ejecuta el re-anclaje de S2, marca la alerta `AUDIT_BACKEND_TERMINAL_REJECTION` como resuelta (`status = 'resolved'`) y reintenta el envío de la auditoría.

### S4: Registro de alerta en la nube y resolución remota
- Quoted from #936:
  > "La alerta `AUDIT_BACKEND_TERMINAL_REJECTION` llega a la nube y se puede resolver desde el dashboard; al resolverla, el terminal reanuda el envío."
- Cuando el backend detecta el conflicto 409 en `POST /identity/audit`, persiste una fila en `forensic_alerts` (`alert_type: 'AUDIT_BACKEND_TERMINAL_REJECTION'`, `severity: 'CRITICAL'`, `resolved_at: null`).
- Se provee endpoint administrativo `POST /operations/audit/alerts/:id/resolve` (guarded con `AuthGuard, RolesGuard` para OWNER/MANAGER) para marcar la alerta como resuelta (`resolved_at = now()`).
- Inbound sync en el POS (`fetchAlertDeltas`) propaga las alertas resueltas: cuando el POS recibe una alerta con `resolvedAt != null`, actualiza su alerta local a `status = 'resolved'`, permitiendo reanudar el envío.

### S5: Prueba roja (RED) reproduciendo el bloqueo previo al fix
- Quoted from #936:
  > "Test que reproduce el estado actual como rojo antes del fix: terminal con cadena local en `1/GENESIS` + nube con `N` registros ⇒ el terminal queda con los registros pendientes y sin `POST` saliente."

### S6: Prueba verde (GREEN) del camino completo de re-anclaje
- Quoted from #936:
  > "Test que cubre el camino feliz del re-anclaje: la cadena resultante es continua y verificable (`prev_hash` de cada registro = `entry_hash` del anterior) del lado local y del lado nube."

## Tasks

- [x] T1: Crear endpoint backend `GET /identity/audit/stream-head` en `AuditController` con `SyncTransportGuard` y registrarlo en `route-transport-registry.ts` (S1).
- [x] T2: Persistir alerta forense en nube ante 409 y crear endpoint `POST /operations/audit/alerts/:id/resolve` para resolución de alertas (S4).
- [x] T3: Permitir `identity/audit/stream-head` en `DeviceSyncAuthInterceptor` de POS y agregar método `getStreamHead` en `AuditRepository` (S1).
- [x] T4: Implementar algoritmo de re-anclaje auditable con `AUDIT_STREAM_REANCHOR` en `AuditRepositoryImpl` y actualización en `AuditDao` (S2, S3).
- [x] T5: Actualizar resolución de alertas en `sync_service.dart` ante `resolvedAt` de la nube (S4).
- [x] T6: Escribir tests unitarios y de integración para Backend y POS (RED y GREEN) demostrando que se previene el bloqueo permanente y la cadena queda 100% continua (S5, S6).

## Log

- L1: Issue #936 asignado para el Bloque 3 de estabilización profunda. Contexto analizado a partir de las mediciones de rig en R28/L57.
- L2: Implementado endpoint backend `GET /identity/audit/stream-head` para consulta autorizada de secuencia y hash de la cabeza de stream.
- L3: Implementada persistencia en `forensic_alerts` de `AUDIT_BACKEND_TERMINAL_REJECTION` al detectar 409, y endpoint `POST /operations/audit/alerts/:id/resolve` para resolución administrativa en backoffice.
- L4: Actualizado allowlist `DeviceSyncAuthInterceptor` en POS para habilitar `identity/audit/stream-head` y expuesto `getCloudStreamHead` en `AuditRepository`.
- L5: Implementado algoritmo atómico de re-anclaje con evento auditable `AUDIT_STREAM_REANCHOR` y recálculo secuencial de hashes.
- L6: Inbound sync en POS actualizado para resolver alertas locales de rechazo cuando la nube reporta `resolvedAt`.
- L7: Verificadas pruebas unitarias y de integración tanto en Backend NestJS (15 tests en audit-transport.e2e, 31 en audit-summary.controller, 17 en route-transport-registry) como en POS Flutter (32 tests en audit_repository_impl_test, 16 en device_sync_auth_interceptor_test, sync_service_test). Todos los criterios de aceptación de #936 cumplidos.
