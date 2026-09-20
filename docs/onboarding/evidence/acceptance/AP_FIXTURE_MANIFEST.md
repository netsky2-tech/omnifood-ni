# NHILOS Client Onboarding V1 — Acceptance Fixture Manifest

**Documento:** `AP_FIXTURE_MANIFEST.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_FIXTURE_MANIFEST.md`  
**Estado:** **FROZEN — `fp-acceptance-6b15d8a` (2026-09-20). ONB1.10F PASS; piloto en local real NOT READY por L1/L2.** Fixtures deterministas vinculados por hash; hardware y datos de campo capturados

**Versión:** 2.0 (identidad congelada en FREEZE-08; fixtures F2–F5 con hash vinculado; hardware fixture capturado)
**Fecha de creación:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §4

---

# 0. Instrucciones

Este manifest quedó congelado una sola vez para el run de aceptación. Cualquier cambio de código, migration, configuración funcional o fixture requiere un nuevo manifest y un nuevo `acceptanceReleaseId`.

El `acceptanceReleaseId` vigente es `fp-acceptance-6b15d8a` (§1). Los campos marcados con `«COMPLETAR»` restantes ya no existen en este manifest; los campos opcionalmente no capturados se marcan explícitamente **no capturado** con su limitación de origen.

**Resultado de la aceptación (2026-09-20):** ONB1.10F **PASS** (cohorte 5/5, TTFSS peor caso 947 ms). El piloto en local real permanece **NOT READY** mientras L1 (enrolamiento de producción) y L2 (transporte mixto de sincronización, issue #314) sigan abiertas en `AP_KNOWN_LIMITATIONS.md`.

**Alcance del piloto (decisión del founder, 2026-09-17):** el piloto físico ONB1.10F valida el ciclo de vida de activación en hardware real. La validación del transporte de dispositivo `/v1/sync/*` está **FUERA de alcance** para esta aceptación, y la precondición 2 del cutover DSI **NO está satisfecha** para este piloto. Las limitaciones conocidas se registran en `AP_KNOWN_LIMITATIONS.md` (documento de referencia; este manifest no duplica su contenido). Ningún campo de este manifest implica que el rehearsal valide el transporte device-only.

---

# 1. Release Identity

**ESTADO: FROZEN.** Identidad acuñada como `fp-acceptance-6b15d8a` sobre la cohorte de captura de campos (2026-09-20).

| Campo | Valor |
|---|---|
| `acceptanceReleaseId` | `fp-acceptance-6b15d8a` |
| Fecha de congelación | 2026-09-20 |
| Branch congelada | `docs/fp-acceptance-closeout` (rama de aceptación que contiene el commit de release; verificado con `git branch --contains`) |
| Último commit congelado | `6b15d8af66aed80260a511aaaded53d04329f1de` (2026-09-20 10:39:28 -0600) |

Historial de identidades (preservado, no sobrescrito): `fp-acceptance-96440859` (rehearsal FREEZE-06) → `fp-acceptance-4b13e4e` (primera cohorte) → `fp-acceptance-6b15d8a` (cohorte de captura de campos, vigente). El motivo de cada reacuñación está registrado en `AP_Q80_PILOT_EVIDENCE.md` §1.

---

# 2. Builds

| Componente | Commit SHA | Build / Image | Notas |
|---|---|---|---|
| Backend (NestJS) | `6b15d8af66aed80260a511aaaded53d04329f1de` | NestJS ^11.0.1 / TypeORM ^0.3.28 | `apps/admin_backend` |
| Owner Dashboard | `6b15d8af66aed80260a511aaaded53d04329f1de` | v0.0.0 (SPA build) | `apps/owner_dashboard` |
| POS (Flutter) | `6b15d8af66aed80260a511aaaded53d04329f1de` | pubspec declara `1.0.0+1`; el APK de cohorte se reconstruyó por run y **su SHA-256 no fue capturado** (no se sustituye por el hash del rehearsal) | `apps/pos_app` — Dart SDK ^3.11.5 |
| Database migration version | `1809210000000-FixInventoryKardexRunningBalanceTenantHash` | Última migración TypeORM del release; **el target de la cohorte aplicó 85 migraciones sobre base vacía con esta cola exacta** | PostgreSQL |
| SQLite schema version | `53` | Floor database version en el release `6b15d8a` (`apps/pos_app/lib/data/database/app_database.dart`) | POS local |

---

# 3. Feature Flags / Cutover State

Flags según `OnboardingFeatureRolloutService` — estado congelado para acceptance:

| Flag | Estado | Required By |
|---|---|---|
| `onboarding.session_v1` | `true` | — |
| `onboarding.setup_center_v1` | `true` | `session_v1` |
| `onboarding.template_safe_v1` | `true` | `session_v1` |
| `onboarding.import_contract_v1` | `true` | `session_v1` |
| `onboarding.required_config_v1` | `true` | `session_v1` |
| `onboarding.activation_v1` | `true` | `session_v1` + `required_config_v1` |

**Nota:** Para el cohort TTFSS formal (AP-07), **todos los flags deben estar `true`** (Stage 10 — founder tenant pilot). Si se ejecuta acceptance en un stage parcial, documentar la desviación y su justificación.

---

# 4. Infrastructure

| Componente | Versión / Config |
|---|---|
| PostgreSQL | **No capturado** — `SELECT version()` del entorno de piloto no quedó registrado en el repositorio; el target de cohorte es lo documentado en la evidencia (85 migraciones, cola `1809210000000`) |
| Node.js | v24.19.0 |
| Flutter SDK | **No capturado** — salida de `flutter --version` de la máquina de build del APK no registrada |
| Dart SDK | ^3.11.5 (constraint de pubspec.yaml) |

---

# 5. Founder Hardware

| Campo | Valor |
|---|---|
| Device model | MIRAY Q80 (iPOS) — modelo `TPM4G_E9863`, fabricante `NB55`, Android 12 (SDK 31) |
| Device serial hash | `680f14116c61725b6f5aaf76fa99d8b8fbc7855deeb77a4d79903415c1eb56ec` — el serial crudo se leyó en campo y **no se persistió** |
| Terminal ID (DevicePrincipal) | `Q802024120001` (fijo según seed script) |
| OS version | Android 12 (SDK 31), security patch 2022-11-05 |
| Firmware | `Q80_SC_V1.0.1_B241225.163320` |
| Printer adapter | `SUNMI_V2S` vía `net.nyx.printerservice` — **versión del servicio no verificada** |
| Printer paper width | **80 mm** (rollo incluido en el Q80). Es el único perfil físicamente calibrado en este equipo: Nyx `TLMono` font 4, 40 columnas, 576 dots, leftPadding 8. El soporte de 58 mm existe en software (32 columnas / 384 dots) pero **no está validado físicamente** en el piloto |
| Network profile | **No capturado** — WiFi SSID del entorno no registrado por ser la cohorte harness-driven |
| WAN outage method | **Sin corte físico.** Offline aplicado por el propio harness y probado con `httpRequests: 0` en el recibo de la fase `offline` de cada run |

---

# 6. Workstation (Owner Dashboard / Browser)

| Campo | Valor |
|---|---|
| Browser + version | **No capturado** — la cohorte fue harness-driven: el Dashboard fue operado por el instrumento, no por un browser humano observado |
| OS | **No capturado** — mismo motivo |
| Screen resolution | **No capturado** — mismo motivo |

---

# 7. Reference Tenant Seed

| Campo | Valor |
|---|---|
| Seed script | `apps/admin_backend/src/scripts/seed-onboarding-founder-pilot.ts` |
| Seed command | `npm run seed:onboarding-founder-pilot` (confirmado en package.json scripts) |
| Tenant name pattern | `Founder Pilot Q80 <runId>` |
| Owner role | `OWNER` |
| Owner offline PIN | 6 dígitos (generado por el seed script — capturado en campo del output JSON; **no se persiste en el repositorio**) |
| Tenant RUC | El seed provee el placeholder `J0000000000000`, pero la ejecución usó `ONBOARDING_FOUNDER_RUC` con el **RUC real del founder**: `rucPresent: true`, hash `46cef85fa3720cb8a1dee8b02aa4b59ab5bab3c1e116f0763759564d20581841`; el valor crudo no se registra en el repositorio (§9) |
| Tenant initial state | `is_active=true`, `OnboardingSession` NO iniciada, sin milestones |

**IMPORTANTE:** Cada reference run crea un tenant nuevo. El seed se ejecuta antes de cada run, no se reutiliza entre runs.

---

# 8. Reference Fixture — F1 Template Path

| Campo | Valor |
|---|---|
| Industry Template | `BAR_RESTAURANTE` (Bar & Restaurante) — aplicada en todos los runs |
| Productos aplicados | `Hamburguesa Clásica con Papas`, `Cerveza Toña 350ml`, `Trago Ron FDC 7 Años`, más 9 insumos de la template |
| Adquisición adicional por run | Una fila CSV (fixture F2–F5 según el run) y un producto manual |
| Template selection | Operador selecciona subconjunto suficiente para catálogo vendible |

---

# 9. Fiscal Fixture

| Campo | Valor |
|---|---|
| RUC | **RUC real del founder, usado en la ejecución** (override `ONBOARDING_FOUNDER_RUC`). Valor crudo omitido: `rucPresent: true`, hash `46cef85fa3720cb8a1dee8b02aa4b59ab5bab3c1e116f0763759564d20581841`. El placeholder `J0000000000000` nunca emitió documento fiscal |
| Régimen | `CUOTA_FIJA` — **RESUELTO (decisión del founder, 2026-09-17)**: el fixture declarado es la autoridad y el harness attachado real también envía `CUOTA_FIJA` (ver registro de resolución abajo). No mezclar regímenes en el cohort |
| Nombre comercial | `NHILOS POS` (provisto por el founder) |
| Dirección fiscal | `Managua` (provista por el founder) |
| Teléfono | `81948526` (provisto por el founder) |

**ORDEN BLOQUEANTE:** el RUC placeholder debe reemplazarse por el RUC real del founder **antes de emitir el primer documento fiscal**. Los documentos emitidos son inmutables ante DGI: no se borran, no se re-numeran y no se corrigen retroactivamente. Corregir el RUC después de la primera factura deja esa factura con un identificador inválido de forma permanente. El RUC placeholder `J0000000000000` queda visiblemente prohibido para ejecución fiscal: ninguna emisión, TEST_PRINT ni rehearsal puede ejecutarse con él.

### Régimen tributario resuelto (ex BLOQUEANTE PRE-REHEARSAL)

**Decisión registrada (2026-09-17):** el régimen real del tenant piloto es `CUOTA_FIJA` (IVA 0.00%). El fixture declarado en este documento es la autoridad del piloto, y **la ruta de aceptación queda alineada**: el harness attachado real (`apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart`) ya envía `regime: 'CUOTA_FIJA'` a `onboarding/fiscal-setup`, igual que el rehearsal simulado (`apps/pos_app/test/integration/onb1_10_founder_pilot_rehearsal_e2e_test.dart`), que ya usaba `CUOTA_FIJA`. El `tax_regime` persistido en el dispositivo se deriva de la respuesta de `fiscal-setup`, así que el valor enviado por el harness es el que gobierna el run físico.

**Alcance de esta afirmación:** la alineación es de la ruta de aceptación, no de todo el repositorio. `business_profile_view_model.dart` conserva un default `REGIMEN_GENERAL` para perfiles nuevos, preexistente y fuera del alcance del piloto; en el run de aceptación ese default queda sobrescrito por la configuración persistida y por el payload fiscal. Si un run mostrara un régimen distinto de `CUOTA_FIJA`, prevalece la regla de troubleshooting del checklist: no emitir documentos y repetir.

**Semántica del ticket físico resuelta:** el rehearsal debe emitir `COMPROBANTE DE VENTA` / `NO RECAUDA IVA`, papel 80 mm. Bajo `CUOTA_FIJA` (DGI / Ley 822) no se emite `FACTURA DE VENTA` ni desglose de IVA (15%); esa semántica corresponde únicamente a `REGIMEN_GENERAL`, que queda fuera del piloto.

La emisión de documentos fiscales sigue bloqueada por el RUC placeholder hasta que se registre el RUC real del founder (bloqueante separado, arriba). Ninguna evidencia de campo fue inventada en esta resolución: el valor observado del ticket físico se captura en el rehearsal (FREEZE-06).

---

# 10. Verification Product

| Campo | Valor |
|---|---|
| Product name | `VERIFICACION FISICA ONB1.10F-Q80-<epoch>-setup` (el `<epoch>` es el del runId de cada corrida) |
| SKU | **No producido ni capturado** — el producto de verificación se creó sin SKU |
| sellPrice | `C$ 1.00` (observado en los runs) |
| active | `true` |
| Pinneado en Activation | **No capturado** — el instrumento no registró el pinning de revisión/fingerprint para este producto |

---

# 11. CSV Fixtures

| Fixture | Descripción | Estado |
|---|---|---|
| F2 — CSV Clean | 25 filas válidas, headers oficiales, sin stock/costo | **Congelado.** SHA-256 `2751c8e62664daeab095a19c79072a604d2995a81f2f6900a82cdb3b7eb709bc` |
| F3 — CSV Mixed | 20 válidas + 5 inválidas + alias + columna desconocida | **Congelado.** SHA-256 `fd525b2f5874db3af0c3110d06ffcb481e77c2ae16ad02df1d333c977a8762a9` |
| F4 — CSV Duplicate | Productos existentes para REPLACE/SKIP/FAIL | **Congelado.** SHA-256 `2279c1c9bcefe3b881258db093d2804201f0d93df421f3dd657e24d7b1c76d25` |
| F5 — Legacy Unsafe | Columnas legacy: stock_inicial, costo, barcode | **Congelado.** SHA-256 `6ec18aa73493e5046c3ee607f283d13b40a0397fd843c0ba28644e21fe8a4307` |

Hashes verificados con `sha256sum` contra `fixtures/` al cierre (FREEZE-08, 2026-09-20).

---

# 11.1 Estado del freeze (cerrado en FREEZE-08)

| Campo | Estado |
|---|---|
| `acceptanceReleaseId` | **FROZEN: `fp-acceptance-6b15d8a`** (§1), acuñado para la cohorte de captura de campos (2026-09-20) |
| Último commit congelado / builds (§1, §2) | `6b15d8af66aed80260a511aaaded53d04329f1de`; SHA-256 del APK de cohorte **no capturado** (reconstruido por run; declarado en `AP_Q80_PILOT_EVIDENCE.md` §1) |
| Database migration version (§2) | Cola exacta del target de cohorte: `1809210000000-FixInventoryKardexRunningBalanceTenantHash` (85 migraciones aplicadas) |
| SQLite Floor schema version (§2) | `53` |
| Versión POS (§2) | pubspec `1.0.0+1` |
| CSV fixtures F2–F5 (§11) | **Congelados con hash vinculado** |
| Régimen tributario (§9) | `CUOTA_FIJA` — confirmado por el TEST_PRINT físico del rehearsal (§8.0 de la evidencia) |
| Capturas de campo (§5, §6) | Capturadas; WiFi SSID y fixture de workstation **no capturados** explícitamente (cohorte harness-driven) |

---

# 12. Release Integrity Rules

1. Cambio de código → nuevo `acceptanceReleaseId`
2. Cambio de migration → nuevo `acceptanceReleaseId`
3. Cambio de feature flags → nuevo `acceptanceReleaseId`
4. Cambio de fixture → nuevo `acceptanceReleaseId`
5. Cambio de hardware → nuevo manifest completo + re-baseline TTFSS
6. `AP_FINAL_SIGNOFF.md` no puede combinar PASS de distintos `acceptanceReleaseId`

---

# 13. Firma de Congelación

Cuando este manifest se llene con datos reales, el responsable firma:

```text
Firmado por:           Harness ONB1.10F attachado sobre el Q80 físico; operador con nombre no capturado
Fecha de congelación:  2026-09-20
acceptanceReleaseId:   fp-acceptance-6b15d8a

Resultado: ONB1.10F PASS — piloto en local real NOT READY (L1/L2 abiertas en
AP_KNOWN_LIMITATIONS.md)
```
