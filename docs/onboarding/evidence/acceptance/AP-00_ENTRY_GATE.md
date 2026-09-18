# NHILOS Client Onboarding V1 — Entry Gate (AP-00)

**Documento:** `AP-00_ENTRY_GATE.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP-00_ENTRY_GATE.md`  
**Estado:** **NOT READY FOR ACCEPTANCE**  
**Fecha de creación:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §2

---

# 0. Resultado del Entry Gate

```text
╔═══════════════════════════════════════════════════════════╗
║  RESULTADO: NOT READY FOR ACCEPTANCE                     ║
║  Razón: Piloto físico Q80 pendiente (hardware real)      ║
║          + identidad de release NOT FROZEN (FREEZE-05)   ║
║  Non-hardware checks: PASS salvo Release Candidate       ║
║    (§5 = PENDING: release no congelada)                  ║
║  Acceptance Release ID: NOT FROZEN — pendiente de        ║
║    acuñar en FREEZE-05                                   ║
╚═══════════════════════════════════════════════════════════╝
```

---

# 1. Architecture Authority

| Check | Estado | Evidencia |
|---|---|---|
| `onboarding_architecture_spec.md` aprobado como `APPROVED / ENGINEERING AUTHORITATIVE` | ✅ | `onboarding_architecture_reapproval_audit.md` — AR-01..AR-18 = CLOSED |
| Open architecture P0 = 0 | ✅ | Audit: P0 = 0, P1 = 0, P2 = 0 |
| Open architecture P1 = 0 | ✅ | Audit: FINAL DECISION = APPROVED / ENGINEERING AUTHORITATIVE |

---

# 2. Implementation Completeness

| Check | Estado | Evidencia |
|---|---|---|
| ONB1.0 cerrado | ✅ | `ONB1.0_M0_BASELINE.md` |
| ONB1.1 cerrado | ✅ | `ONB1.1_M1_EVIDENCE.md` |
| ONB1.2 cerrado | ✅ | `ONB1.2_M2_EVIDENCE.md` |
| ONB1.3 cerrado | ✅ | `ONB1.3_M3_EVIDENCE.md` |
| ONB1.4 cerrado | ✅ | `ONB1.4_M4_EVIDENCE.md` |
| ONB1.5 cerrado | ✅ | `ONB1.5_M5_PR15_EVIDENCE.md` |
| ONB1.6 cerrado | ✅ | `ONB1.6_M5_PR16_EVIDENCE.md` |
| ONB1.7 cerrado | ✅ | `ONB1.7_M5_PR17_EVIDENCE.md`, `PR18` |
| ONB1.8 cerrado | ✅ | `ONB1.8_M6_PR19_EVIDENCE.md`, `PR20`, `PR21` |
| ONB1.9 cerrado | ✅ | `ONB1.9_M7_PR22_EVIDENCE.md`, `PR23` |
| ONB1.10 cerrado | ⚠️ PARCIAL | `ONB1.10_M8_PR24_EVIDENCE.md`, `PR25` — ONB1.10F pendiente de hardware |

---

# 3. Regression Completeness

| Check | Estado | Evidencia |
|---|---|---|
| Full regression del roadmap completada | ✅ | 74 escenarios normativos verdes (PR-ONB-25) |
| 74 escenarios normativos con test/evidence mapping | ✅ | `onboarding-74-scenarios-normative.db.e2e-spec.ts` |
| W9 legacy tests verdes o reemplazados | ✅ | `onboarding-w9.db.e2e-spec.ts` (ODAV-31..34) |
| Legacy migration receipts cerrados | ✅ | PR-ONB-24: template scan, staging expiry, import integrity |

---

# 4. Baselines & Restoration

| Check | Estado | Evidencia |
|---|---|---|
| PostgreSQL baseline/restoration procedure disponible | ⚠️ DEFERRED | Se documenta post-piloto con el `pg_dump` del entorno real; el seed script + migraciones TypeORM son la baseline declarativa |
| SQLite founder baseline/restoration procedure disponible | ⚠️ DEFERRED | El POS genera DB fresh por tenant; schema es el Floor database del POS (confirmar versión tras build del APK) |

---

# 5. Release Candidate

| Check | Estado | Evidencia |
|---|---|---|
| Release candidate exacto congelado | ⚠️ PENDING | La identidad de release anterior estaba desactualizada y fue retirada. **NOT FROZEN:** el manifest no declara release congelada; acuñar `acceptanceReleaseId` en FREEZE-05 tras estabilizar todo cambio que afecte release |
| `acceptanceReleaseId` calculado | ⚠️ PENDING | **NOT FROZEN** — se acuña una sola vez en FREEZE-05 (commit final de release + última migración + stage 10 flags). Los valores anteriores no corresponden al árbol actual |
| Migración y schema verificables en el árbol | ✅ | Última migración TypeORM: `1809040000000-CreateHumanAuthorizationTenantPublicationState`; Floor schema version del POS: `52`; POS pubspec: `1.0.0+1` |
| Feature flags/cutover state documentado | ✅ | `AP_FIXTURE_MANIFEST.md` §3 — Stage 10 (todos los flags `true`) |
| No existen P0/P1 conocidos abiertos | ✅ | Architecture audit: P0=0, P1=0; PRD audit: P0=0, P1=0; Acceptance plan re-audit: AP-A01..A10 CLOSED |
| No existe corrupción de Inventory por imports legacy | ✅ | PR-ONB-24: `LegacyImportIntegrityReport` cerrado |

---

# 6. Hardware & Pilot Readiness

| Check | Estado | Evidencia |
|---|---|---|
| Founder pilot completado en hardware real | ❌ BLOCKER | Falta APK en Q80/iPOS + ticket impreso |
| TTFSS <= 15 min medido formalmente | ❌ BLOCKER | Requiere cohort de 5 reference runs |
| Impresión de ticket verificada | ❌ BLOCKER | Requiere hardware real |
| WAN outage real verificada | ❌ BLOCKER | Requiere hardware real |
| Restart recovery en dispositivo verificada | ❌ BLOCKER | Requiere hardware real |

---

# 7. Documentation Readiness

| Check | Estado | Evidencia |
|---|---|---|
| `onboarding_acceptance_plan_v1.0.md` aprobado | ✅ | Re-auditoría cerrada (AP-A01..A10 = CLOSED) |
| `AP_FIXTURE_MANIFEST.md` creado | ✅ | v1.0 — estructura disponible; identidad y hardware NOT FROZEN hasta FREEZE-05 |
| `AP_REFERENCE_RUN_PROTOCOL.md` creado | ✅ | v1.0 — protocolo disponible; ejecución WAN/operador pendiente de campo |
| `onboarding_execution_roadmap.md` v1.1 aprobado | ✅ | Re-auditoría cerrada (ER-01..ER-09 = CLOSED) |

---

# 8. Decisión

```text
El Entry Gate NO PASSA por el blocker de hardware y porque la identidad de release aún NO está congelada.

Non-hardware checks:
  §1 Architecture Authority:     PASS (P0=0, P1=0)
  §2 Implementation Completeness: PASS (ONB1.0–ONB1.9 cerrados; ONB1.10F = hardware blocker)
  §3 Regression Completeness:     PASS (74/74 escenarios verdes)
  §4 Baselines & Restoration:     DEFERRED (post-piloto con datos reales)
  §5 Release Candidate:           PENDING (NOT FROZEN — release id se acuña en FREEZE-05)
  §7 Documentation Readiness:     PASS (fixture + protocol v1.0; release identity pendiente)

Blockers:
  §6 Hardware & Pilot Readiness
  Founder pilot en hardware real:    ❌ BLOCKER
  TTFSS <= 15 min (cohort de 5):     ❌ BLOCKER
  Impresión de ticket:                ❌ BLOCKER
  WAN outage real:                    ❌ BLOCKER
  Restart recovery en dispositivo:    ❌ BLOCKER

  Pre-rehearsal adicionales (documentados en el manifest):
  Mismatch de régimen tributario:     ❌ BLOCKER — fixture CUOTA_FIJA vs harness
                                      attachado REGIMEN_GENERAL; resolver antes
                                      del piloto (§9 de AP_FIXTURE_MANIFEST.md)
  RUC placeholder del seed:           ❌ BLOCKER — reemplazar antes de emitir
                                      cualquier documento fiscal

Siguiente acción:
  1. Ejecutar piloto físico en Alacrity Q80/iPOS
  2. Capturar evidencia: APK, ticket impreso, WAN outage, restart
  3. Completar hardware fixture en AP_FIXTURE_MANIFEST.md (§5)
  4. Completar Wan/operador en AP_REFERENCE_RUN_PROTOCOL.md (§1, §6)
  5. Acuñar y congelar el acceptanceReleaseId en FREEZE-05, tras estabilizar
     todo cambio que afecte release (código, migraciones, configuración, fixtures)
  6. Actualizar este gate con resultado
  7. Iniciar AP-01..AP-12
```

---

# 9. Firma

```text
Revisado por:    «COMPLETAR EN CAMPO»
Fecha:           «COMPLETAR EN CAMPO»
Decisión:        NOT READY FOR ACCEPTANCE (hardware blocker + release NOT FROZEN)
Blocker:         ONB1.10F — Physical pilot pending; release id pendiente de FREEZE-05
acceptanceReleaseId: **NOT FROZEN** — «COMPLETAR EN FREEZE-05»
Next gate:       AP-00 re-evaluation post-pilot → AP-01..AP-12
```
