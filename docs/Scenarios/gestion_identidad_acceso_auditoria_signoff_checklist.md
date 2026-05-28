# ✅ Sign-off Checklist — Gestión de Identidad, Acceso y Auditoría

Referencia base:
- PRD: `docs/PRDs/prd_gestion_identidad_acceso_y_auditoria.md`
- Escenarios: `docs/Scenarios/gestion_identidad_acceso_auditoria.md`

Estados:
- **PASS**: implementado + evidencia de test/flujo
- **PARTIAL**: implementación incompleta o evidencia parcial
- **FAIL**: no implementado o sin evidencia válida

---

## 1) Autenticación (Login híbrido)

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-AUTH-01 Login online exitoso | PARTIAL | `apps/pos_app/lib/ui/features/auth/viewmodels/login_viewmodel.dart` | Hay flujo online, falta validación integral de permisos/token en checklist E2E. |
| S-AUTH-02 Fallback automático offline | FAIL | `login_viewmodel.dart` | En fallo online devuelve error; no conmutación automática comprobada. |
| S-AUTH-03 Sin credenciales en texto plano | PARTIAL | `apps/pos_app/lib/data/repositories/auth_repository_impl.dart`, `.../local_totp_seed_cipher.dart` | Se endureció seed TOTP; falta cierre formal sobre todos los stores y política hash final. |
| S-AUTH-04 PIN offline incorrecto rechaza | PASS | `apps/pos_app/test/data/repositories/auth_repository_security_profile_sync_test.dart` | Cubierto en tests de auth offline. |
| S-AUTH-05 Coherencia permisos online/offline | PARTIAL | `apps/admin_backend/src/modules/identity/services/auth.service.ts` | Hay sync y scope, pero falta contrato explícito de “pending sync” y test de reconciliación de rol. |

---

## 2) RBAC — Control por rol

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-RBAC-01 Mesero no abre/cierra caja | PARTIAL | `apps/pos_app/lib/ui/features/sales/sale_view.dart` | Hay gating en flujo puntual; falta enforcement completo UI + data/API. |
| S-RBAC-02 Cajero no aplica descuento directo | PARTIAL | `sale_view.dart`, `supervisor_override_modal.dart` | Hay modal/override en flujos restringidos; falta matriz completa por acción/rol. |
| S-RBAC-03 Solo Admin modifica recetas | FAIL | N/A en evidencia actual | No quedó cobertura explícita BOH en este cambio. |
| S-RBAC-04 Void ticket bloqueado para Cajero/Mesero | PARTIAL | Flujos restringidos + override | Falta test dedicado por rol y endpoint enforcement. |
| S-RBAC-05 Reportes X/Z inaccesibles | PARTIAL | `apps/pos_app/lib/ui/widgets/app_drawer.dart` | Gating parcial de navegación; falta cobertura por ruta directa/API. |
| S-RBAC-06 Todos toman comandas | PARTIAL | N/A | No se encontró suite dedicada de validación 4 roles. |

---

## 3) Cash Control — Modelo A (centralizado)

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-CASH-A-01 Solo cajero gestiona turno central | PARTIAL | `sale_view_model.dart`, `cashier_session` model | Modelo existe, falta validación estricta de bloqueo en tablets mesero. |
| S-CASH-A-02 Apertura caja con monto inicial | PARTIAL | `cashier_session` + DAO/migraciones | Persistencia existe; falta prueba funcional completa del flujo. |
| S-CASH-A-03 Cierre y reconciliación | PARTIAL | `sale_view_model_test.dart` | Cálculos parciales cubiertos, falta cierre completo de turno con estados. |

---

## 4) Cash Control — Modelo B (cartera)

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-CASH-B-01 Apertura cartera personal | PARTIAL | `tipo_modelo` en dominio/entidad/migración | Estructura existe, falta suite de flujo completo por usuario/terminal. |
| S-CASH-B-02 Cierre post-corte de luz | FAIL | N/A | No hay prueba explícita de recuperación/reinicio + cuadre. |
| S-CASH-B-03 Aislamiento entre carteras | PARTIAL | Modelo por `usuario_id`; DAO actual | Riesgo: lectura de sesión activa necesita validación estricta multiusuario. |

---

## 5) PIN Supervisor y TOTP

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-PIN-01 Flujo presencial completo | PASS | `sale_view_security_flows_test.dart`, `authorizeOverride` | Modal + aprobación + log forense cubiertos. |
| S-PIN-02 PIN incorrecto no desbloquea | PASS | tests auth repo / local auth | Cubierto. |
| S-PIN-03 Bloqueo 3 intentos/60s por 5 min | PASS | `auth_repository_impl.dart` + tests | Cubierto. |
| S-PIN-04 TOTP remoto offline | PASS | `local_auth_service.dart` + tests | Cubierto en lógica y pruebas unitarias. |
| S-PIN-05 TOTP expirado rechazado | PASS | tests TOTP ventana | Cubierto. |
| S-PIN-06 Desbloqueo por única transacción | PARTIAL | `sale_view` flow | Necesita test explícito de segunda acción vuelve a pedir autorización. |

---

## 6) Drawer Logs

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-DRAWER-01 Apertura normal en facturación | FAIL | N/A | No hay evidencia clara del flujo rutinario separado. |
| S-DRAWER-02 Apertura manual requiere autorización | PASS | `sale_view.dart`, `sale_view_security_flows_test.dart` | Cubierto. |
| S-DRAWER-03 Registro inmutable apertura manual | PARTIAL | `audit.controller.ts`, modelo forense | Se registra; falta evidencia de inmutabilidad DB estricta anti update/delete para app roles. |

---

## 7) Auditoría e Inmutabilidad

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-AUDIT-01 Inmutabilidad de logs (reject UPDATE/DELETE) | PARTIAL | Insert-only + constraints lógicas | Mejoró fuerte; falta prueba/constraint explícita de reject UPDATE/DELETE en DB. |
| S-AUDIT-02 Integridad secuencial + alerta de gaps | PARTIAL | continuidad `sequence_no/prev_hash` backend + índice parcial | Continuidad protegida; falta evidencia de “alerta nocturna backoffice” por gaps. |
| S-AUDIT-03 Campos requeridos en logs | PASS | DTO/entity + validaciones | Cobertura sólida de campos críticos. |
| S-AUDIT-04 Logs offline sincronizan íntegros | PASS | `audit_repository_impl` + `audit.controller` + tests | Contrato robustecido y compatibilidad forense cubierta. |

---

## 8) Anti-Tampering

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-TAMPER-01 Manipulación de reloj activa lock | FAIL | N/A | No se encontró implementación clara en este cambio. |
| S-TAMPER-02 Lock persiste tras reinicio | FAIL | N/A | No se encontró implementación/test. |

---

## 9) Seguridad en Reposo

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-SEC-01 `totp_secret_seed` cifrado AES-256 | PARTIAL | `local_totp_seed_cipher.dart`, `totp_seed_key_provider.dart` | Hay cifrado + fail-closed + encrypted-only; falta certificación explícita de “hardware-bound derivation” según exigencia estricta. |
| S-SEC-02 Hash PIN con Argon2/PBKDF2 | FAIL | `local_auth_service.dart` (bcrypt) | Algoritmo actual no coincide textual con escenario (Argon2/PBKDF2). |

---

## 10) Rendimiento

| Escenario | Estado | Evidencia | Nota |
|---|---|---|---|
| S-PERF-01 PIN P99 < 30ms | FAIL | N/A | No hay benchmark/test de rendimiento concurrente documentado. |

---

## Resumen Ejecutivo

- **PASS**: 8
- **PARTIAL**: 17
- **FAIL**: 10

### Bloqueadores para sign-off real
1. Fallback automático online→offline (S-AUTH-02).  
2. Matriz RBAC completa con enforcement UI + data/API (S-RBAC-* críticos).  
3. Anti-tampering lock por reloj + persistencia del lock (S-TAMPER-*).  
4. Política hash PIN alineada a Argon2/PBKDF2 o ajuste formal de escenarios (S-SEC-02).  
5. Benchmark P99 PIN <30ms (S-PERF-01).  

### Próximo paso recomendado
Crear un batch corto de pruebas/implementación orientado a cerrar primero los **FAIL** y luego convertir **PARTIAL** críticos en **PASS**.
