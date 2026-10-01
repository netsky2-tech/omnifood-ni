# Registro de decisiones para go-live

Registro consolidado de decisiones de producto ya tomadas en conversación con el fundador. Una entrada por decisión: fecha, decisión, rationale, anclas de evidencia y disparador de revisión. Registro, no ensayo.

## DEC-1 — Numeración de notas de crédito: cursor único del POS

- **Fecha**: 2026-09-29
- **Decisión**: MANTENER que el POS comparta el cursor DGI de ventas para emitir notas de crédito (opción 1: sin prefijo/serie NC separada en el POS).
- **Rationale**: SOHO arranca mono-terminal; las NC se emiten en caja; el número del POS y el de la factura de origen salen de una misma secuencia monotónica sin huecos. Las NC emitidas desde el backoffice siguen usando `CREDIT_NOTE_SERIES`.
- **Consecuencia conocida (registrada honestamente)**: dos fuentes pueden emitir NC en formatos distintos si el backoffice emite una. Postura aceptable para el piloto mono-terminal.
- **Anclas de evidencia**:
  - `apps/pos_app/lib/data/services/sales/dgi_numbering_service_impl.dart` — cursor único `dgi_current_number`.
  - `apps/pos_app/lib/data/repositories/sales/sales_repository_impl.dart` — `createCreditNote` usa `numberingService`.
  - `apps/admin_backend/src/modules/sales/services/invoices.service.ts` — `CREDIT_NOTE_SERIES`.
- **Revisar antes de**: operar multi-terminal o emitir NC por canal mixto (POS + backoffice en producción).

## DEC-2 — Postura 400 de lote completo en sync fiscal: fail-closed confirmada

- **Fecha**: 2026-09-29
- **Decisión**: CONFIRMAR el comportamiento actual: un registro inválido rechaza el envelope completo con 400. Nunca se persiste parcialmente un lote malformado en la superficie de sync fiscal.
- **Rationale**: para una superficie fiscal, persistir parcialmente un lote malformado es peor que rechazarlo entero; fail-closed es la postura correcta.
- **Mitigación vigente**: el POS pre-valida los registros antes de enviar; existe aislamiento por registro dentro de la ingesta (`invoices.service.ts` con resultados REJECTED por registro).
- **Anclas de evidencia**:
  - `apps/admin_backend/src/modules/sales/dto/sync-batch.dto.ts` — `@ValidateNested` anidado en `records`.
  - `apps/admin_backend/src/main.ts` — ValidationPipe global.
- **Revisar si**: la operación reporta bloqueos recurrentes por rechazo de lotes completos (hoy sin disparador definido).

## DEC-3 — NC emitidas en el POS no sincronizan al cloud durante el piloto

- **Fecha**: 2026-09-30
- **Decisión**: ACEPTAR para el piloto mono-terminal que las notas de crédito emitidas en el POS queden fuera del sync saliente (filtro `documentType != 'CREDIT_NOTE'`).
- **Rationale**: el filtro existe por **DSI-6** (auditoría de autorización de NC en el backend), no por OHAC. La feat OHAC está terminada y mergeada (U1–U5b: emisor de assertions, verifier port, drain gate, recovery tokens — ver `odd/tasks/ohac-completion.md`), pero NO desbloquea este filtro: falta el cable DSI-6 (DEP-2), que es scope separado.
- **Consecuencia conocida**: los dashboards cloud no verán las NC emitidas en caja durante el piloto; las NC emitidas desde el backoffice (`CREDIT_NOTE_SERIES`) sí sincronizan. La numeración ya está resuelta en DEC-1.
- **Anclas de evidencia**:
  - `apps/pos_app/lib/data/services/sync_service.dart:328` (filtro saliente) y `:713` (comentario del hold).
  - `openspec/changes/offline-human-authorization-credential/tasks.md` D-REFACTOR: "`SyncCreditNoteAuthGuard` remains fail-closed until DSI-6 adopts the port".
  - `odd/tasks/ohac-completion.md` — U6: gates de habilitación (cohort disabled por defecto, sin callers de emisión/verificación).
- **Revisar si**: el piloto necesita visibilidad cloud de NC, se opera multi-terminal, o se habilita DSI-6.

## DEC-4 — La llave de firma de release vive fuera del repositorio

- **Fecha**: 2026-10-01
- **Decisión**: la keystore de release vive FUERA del repositorio (p. ej. `~/.keys/`), con dos backups cifrados en ubicaciones distintas y la contraseña en un gestor de secretos, separada del archivo de la llave. `scripts/provision_release_keystore.sh` es el único camino de alta, y rechaza cualquier path dentro del repositorio.
- **Rationale**: el `.gitignore` del repositorio solo cubría `apps/pos_app/android/`, así que `upload-keystore.jks` en la raíz, en `scripts/` y en `apps/pos_app/` eran committables hasta S0-01. Aun con las reglas nuevas, el ignore es red de contención, no custodia: perder esta llave imposibilita para siempre actualizar terminales ya despachados.
- **Consecuencia conocida**: un terminal firmado con otra llave no se puede actualizar in-place (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Sin acceso físico queda irrecuperable en campo; la recuperación pasa por `docs/operations/pilot-terminal-incident-procedure.md`, y un reinstale pone en riesgo la secuencia DGI local y los documentos sin sincronizar.
- **Anclas de evidencia**:
  - `scripts/provision_release_keystore.sh` — guard de path en el repo resuelto físicamente en ambos lados; guard de sobrescritura.
  - `.gitignore` — reglas raíz `*.jks`, `*.keystore`, `*.p12`, `key.properties` agregadas en S0-01 (`48cf3334`).
  - `docs/operations/release-signing-runbook.md` — custodia, backups y límites de recuperación.
- **Revisar antes de**: el primer uso en producción, o si cambia el responsable de la custodia.

## DEC-5 — Device-owner delegado a un MDM self-hosted, no a un DPC propio

- **Fecha**: 2026-10-01
- **Decisión**: el rol device-owner se otorga a través de un MDM self-hosted (Headwind) que actúa como DPC. No se escribe un DPC propio. El privilegio de instalación silenciosa lo ejerce el agente del MDM, no `com.nhilos.pos_app`.
- **Rationale**: el terminal no está físicamente disponible y los updates tienen que poder aplicarse sin que haya alguien capaz en sitio. El device-owner otorga install silencioso más reboot, wipe y logs remotos; hacerlo vía MDM evita mantener código de DPC propio.
- **Consecuencia conocida (registrada explícitamente)**: como el privilegio pertenece al agente del MDM, el POS **no puede auto-actualizarse en silencio**. El canal OTA de Fase 2 debe empujar los APK a través del MDM, o caer al camino con prompt del operador. Diseñar Fase 2 asumiendo lo contrario produciría un updater que no puede instalar nada.
- **Consecuencia conocida 2**: la ventana de enrollment es de una sola vez. Requiere reset de fábrica y el equipo en mano; `adb shell dpm remove-active-admin` falla en un device owner de producción, así que el estado es efectivamente permanente hasta un reset de fábrica.
- **Anclas de evidencia**:
  - `docs/operations/release-signing-runbook.md` — ventana de enrollment, irreversibilidad, caveat de validar en el equipo real.
  - `odd/tasks/release-signing-baseline.md` — S0-03, con la consecuencia arquitectónica.
- **Revisar antes de**: diseñar el canal OTA de Fase 2, o si se confirma que SOHO no tendrá a nadie capaz en sitio durante los updates.

## DEC-6 — `API_URL` sigue siendo compile-time: diferido fuera de Fase 0

- **Fecha**: 2026-10-01
- **Decisión**: DIFERIR mover `API_URL` de compile-time a provisión en runtime. Fase 0 no lo incluye, por decisión de alcance del fundador.
- **Rationale**: el alcance acordado para Fase 0 fue keystore y device-owner. La URL en runtime es un cambio de código del POS, no una base de distribución, y se puede hacer después sin bloquear la llave ni el enrollment.
- **Consecuencia conocida**: cada entorno necesita su propio APK, y un OTA que baje el APK del entorno equivocado rompe el terminal en campo, donde sin acceso físico es irrecuperable. Además, `scripts/build_pos_apk.sh` declara que los builds de flota provisionan el backend en runtime, pero ese camino no existe en el código del POS: la identidad del terminal sí tiene path de flota (persistida en `local_configs`), la URL no.
- **Anclas de evidencia**:
  - `apps/pos_app/lib/main.dart:129-132` — `String.fromEnvironment('API_URL')` con default `http://127.0.0.1:3000/api`, usado para construir seis clientes Dio.
  - `apps/pos_app/lib/data/network/cloud_auth_interceptor.dart:58` — el único mutador de `baseUrl` en todo `lib/`, y solo normaliza la barra final.
  - `apps/pos_app/lib/data/services/terminal_identity_service.dart` — la identidad sí persiste y sobrevive a un update de APK.
  - `scripts/build_pos_apk.sh` — comentario de flota "provisioned at runtime" y `API_URL_BINDING`.
- **Revisar antes de**: construir el canal OTA de Fase 2, o despachar terminales a un segundo entorno.
