# Checklist de Liberación a Producción y Pruebas de Humo
## NHILOS POS — Control de Calidad de Release (Release Candidate Gate)

**Document ID:** NH-CHK-REL-001 (OP-07)  
**Versión:** 0.1  
**Audiencia:** Equipo de Ingeniería / Release Manager (Uso Interno)  
**Aplica a:** Cada despliegue a producción de Backend y actualización de APK móvil  
**Referencia Técnica:** `docs/operations/release-signing-runbook.md` y `docs/DoD/test-suite.md`

---

## 1. Identificación del Release

| Parámetro | Registro del Despliegue |
|---|---|
| **Número de Versión del Release** | v1.0.0 (Release Candidate SOHO) |
| **Commit Hash (Git SHA)** | ________________________________________ |
| **Rama de Origen (Branch / Tag)** | `main` / `tags/release-v1.0.0-soho` |
| **Fecha de Liberación** | _____ / _____ / 2026 |
| **Entorno Objetivo** | Producción (`Production - Railway / Cloudflare`) |
| **Build ID de APK Móvil** | `app-arm64-v8a-release.apk` (VersionCode: ______) |
| **Ingeniero Responsable** | [Nombre del Fundador] |

---

## 2. Gates Previos a la Compilación (Pre-Build Gate)

Todos los checks de esta sección deben resultar satisfactorios antes de autorizar el empaquetado:

### A. Calidad de Código y Pruebas Automatizadas
- [ ] **Tests Unitarios de Backend (NestJS):** Ejecutar `npm run test` en `apps/admin_backend`. (100% de suites en verde, 0 fallos).
- [ ] **Tests de Integración / E2E:** Ejecutar `npm run test:e2e` validando los endpoints de sincronización, autenticación y transacciones.
- [ ] **Tests del Punto de Venta (Flutter):** Ejecutar `flutter test` en `apps/pos_app` (Floor SQLite, validadores de moneda y formateo de tickets en 80 mm).
- [ ] **Code Generation:** `flutter pub run build_runner build --delete-conflicting-outputs` ejecutado sin advertencias ni conflictos en `.g.dart` o `.freezed.dart`.

### B. Esquema de Base de Datos y Migraciones
- [ ] Migraciones de TypeORM auditadas: ninguna migración destructiva no autorizada (`DROP COLUMN` sin plan de respaldo).
- [ ] Migración ejecutada en Staging exitosamente antes de tocar Producción.
- [ ] Invariantes de PostgreSQL RLS intactos: cada tabla transaccional filtra obligatoriamente por `tenant_id`.

---

## 3. Empaquetado y Firma Segura del APK (Android POS)

Conforme al procedimiento establecido en `docs/operations/release-signing-runbook.md`:

- [ ] **Firma Criptográfica Oficial:** APK firmado con la llave de producción `release-key.jks` oficial del proyecto (nunca con certificados de depuración `debug.keystore`).
- [ ] **Arquitectura de Procesador (ABI):** Compilación confirmada para `arm64-v8a` (arquitectura nativa de 64 bits del procesador Unisoc/MediaTek del MIRAY Q80).
- [ ] **Preservación de Rutas de Impresión:** Verificado que ProGuard/R8 no elimine las clases críticas de integración AIDL (`keep class net.nyx.** { *; }` y `keep class woyou.aidlservice.jiu_mi.** { *; }`).
- [ ] **Cálculo de Checksum SHA-256:**
  ```bash
  sha256sum dist/release_candidate/app-arm64-v8a-release.apk
  # Hash registrado: __________________________________________________
  ```

---

## 4. Despliegue de Backend y Respaldo Previo

- [ ] **Snapshot Inmediato de Base de Datos:** Tomar instantánea de seguridad en Railway antes de iniciar la migración:
  * Manifiesto de respaldo: `pre-deploy-v1.0.0-snapshot`
- [ ] **Variables de Entorno:** Comprobar que ninguna credencial de desarrollo (`test-keys`, `localhost`) persista en las variables de producción en Railway.
- [ ] **Corte de Migración:** Ejecución de migraciones en producción observada sin errores de timeout.
- [ ] **Health Check del Backend:** Endpoint `GET /api/health` retorna status `200 OK` con conexión a base de datos activa.

---

## 5. Pruebas de Humo en Producción (Smoke Tests Post-Deploy)

Ejecutar inmediatamente después del despliegue en un tenant de prueba o dispositivo de homologación:

| Prueba | Descripción del Flujo | Criterio de Éxito | ¿Pasa? |
|---|---|---|:---:|
| **SMK-01** | Autenticación Web (Dashboard) | Login exitoso de usuario OWNER en `https://app.nhilospos.com` | [ ] |
| **SMK-02** | Consulta de Métricas | Carga rápida de KPIs de venta sin errores 500 en consola | [ ] |
| **SMK-03** | Autenticación Móvil (POS) | Login local por PIN en terminal MIRAY Q80 | [ ] |
| **SMK-04** | Descarga de Catálogo | Catálogo de 58 productos SIMPLE cargado completamente | [ ] |
| **SMK-05** | Transacción de Venta Real | Emisión de ticket de venta en Córdobas con impresión de 80 mm | [ ] |
| **SMK-06** | Sincronización Inbound/Outbound | Venta reflejada en la base de datos central en menos de 10 segundos | [ ] |
| **SMK-07** | Consistencia de Serie Fiscal | Consecutivo fiscal DGI incrementado exactamente en +1 sin saltos | [ ] |

---

## 6. Procedimiento de Reversión (Rollback Plan)

Si durante las pruebas de humo posteriores al despliegue se identifica una falla crítica bloqueante (SEV-1):

1. **Reversión de Backend:**
   * En el panel de Railway, activar la opción **Rollback** al deployment inmediatamente anterior.
   * Si la migración alteró esquemas incompatibles, ejecutar `npm run migration:revert` o restaurar la base de datos a partir del snapshot tomado en la Sección 4.
2. **Reversión de APK en Terminal:**
   * En caso de falla catastrófica en el terminal, reinstalar mediante adb el APK anterior estable:
     ```bash
     adb install -r dist/stable_previous/app-arm64-v8a-release.apk
     ```
3. **Comunicación de Incidencia:** Notificar al equipo de operaciones registrando el incidente en `docs/operations/pilot-terminal-incident-procedure.md`.

---

## 7. Dictamen de Aprobación del Release

- [ ] **RELEASE APROBADO PARA PUESTA EN MARCHA (GO-LIVE):** Todas las pruebas unitarias, de empaquetado, base de datos y pruebas de humo pasaron satisfactoriamente.
- [ ] **RELEASE BLOQUEADO / RECHAZADO:** Se detectaron discrepancias que impiden la entrega al cliente.

<br>

| Liberado y Certificado por | Fecha y Hora de Liberación |
|---|---|
| **Firma:** __________________________________ | **Fecha:** _____ / _____ / 2026 |
| **Nombre:** [Nombre del Fundador] | **Hora:** ____:____ hrs |
