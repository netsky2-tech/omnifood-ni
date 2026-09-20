# NHILOS Client Onboarding V1 — Entry Gate (AP-00)

**Documento:** `AP-00_ENTRY_GATE.md`  
**Ubicación:** `docs/onboarding/evidence/acceptance/AP-00_ENTRY_GATE.md`  
**Estado:** **CERRADO — ONB1.10F PASS (2026-09-20); piloto en local real NOT READY por L1/L2**

**Fecha de creación:** 2026-09-04  
**Autoridad:** `onboarding_acceptance_plan_v1.0.md` §2

---

# 0. Resultado del Entry Gate

```text
╔═══════════════════════════════════════════════════════════╗
║  ONB1.10F (aceptación técnica, hardware real): PASS      ║
║  Release: fp-acceptance-6b15d8a · Cohorte 5/5 PASS       ║
║  TTFSS peor caso 947 ms · 5/5 ANCHORED · 10/10 checks    ║
║                                                          ║
║  Piloto en local real: NOT READY                         ║
║  Motivo: L1 (enrolamiento de producción) y L2            ║
║    (transporte mixto, issue #314) abiertas en            ║
║    AP_KNOWN_LIMITATIONS.md                               ║
╚═══════════════════════════════════════════════════════════╝
```

El PASS de ONB1.10F cubre **sólo** el ciclo de vida de activación en el Q80 físico. No habilita la operación de un local real: el transporte de dispositivo `/v1/sync/*` quedó fuera de alcance (§0.1) y L1/L2 permanecen abiertas.

---

# 0.1 Alcance del piloto físico (ONB1.10F) — decisión de reducción (2026-09-17)

El piloto físico valida el ciclo de vida de activación en hardware real (configuración fiscal `CUOTA_FIJA`, venta offline con ticket, `ACTIVATED`, drenaje del outbox de activación, VOID con `is_canceled`). **La validación del transporte de dispositivo `/v1/sync/*` está FUERA del alcance de esta aceptación**: ninguna evidencia de este piloto implica que el transporte device-only funcione en el Q80. La precondición 2 del cutover DSI **NO está satisfecha** para este piloto.

Las limitaciones conocidas (brecha de enrolamiento de credencial de dispositivo, defecto de transporte mixto en inventario, brecha de nota de crédito con decisión inventory-first) se registran y rastrean en `AP_KNOWN_LIMITATIONS.md`; este gate no las duplica.

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
| ONB1.10 cerrado | ✅ | `ONB1.10_M8_PR24_EVIDENCE.md`, `PR25` + ONB1.10F **PASS** (`AP_Q80_PILOT_EVIDENCE.md`, release `fp-acceptance-6b15d8a`, 2026-09-20) |

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
| Release candidate exacto congelado | ✅ | `fp-acceptance-6b15d8a` (2026-09-20); commit `6b15d8af66aed80260a511aaaded53d04329f1de`; detalles en `AP_FIXTURE_MANIFEST.md` §1 |
| `acceptanceReleaseId` calculado | ✅ | `fp-acceptance-6b15d8a` — derivado del commit final de release + última migración + stage 10 flags. Historial de identidades preservado en `AP_FIXTURE_MANIFEST.md` §1 |
| Migración y schema verificables en el árbol | ✅ | Última migración TypeORM del release: `1809210000000-FixInventoryKardexRunningBalanceTenantHash` (target de cohorte: 85 migraciones aplicadas sobre base vacía); Floor schema version del POS: `53`; POS pubspec: `1.0.0+1` |
| Feature flags/cutover state documentado | ✅ | `AP_FIXTURE_MANIFEST.md` §3 — Stage 10 (todos los flags `true`) |
| No existen P0/P1 conocidos abiertos | ✅ | Architecture audit: P0=0, P1=0; PRD audit: P0=0, P1=0; Acceptance plan re-audit: AP-A01..A10 CLOSED |
| No existe corrupción de Inventory por imports legacy | ✅ | PR-ONB-24: `LegacyImportIntegrityReport` cerrado |

---

# 6. Hardware & Pilot Readiness

| Check | Estado | Evidencia |
|---|---|---|
| Founder pilot completado en hardware real | ✅ PASS | Cohorte 5/5 en el Q80 físico (release `fp-acceptance-6b15d8a`); evidencia en `AP_Q80_PILOT_EVIDENCE.md` §8.1–§8.2 |
| TTFSS <= 15 min medido formalmente | ✅ PASS | 5/5 runs elegibles y ANCHORED; TTFSS 900/930/936/947/866 ms contra límite de 900 s; detalle en `TTFSS_REFERENCE_SUMMARY.md` y `TTFSS_REFERENCE_RUNS.csv` |
| Impresión de ticket verificada | ✅ PASS (rehearsal) | Ticket físico 80 mm, `COMPROBANTE DE VENTA` / `NO RECAUDA IVA`, RUC del emisor presente (FREEZE-06, §8.0 de la evidencia); la cohorte imprimió en modo simulado por cambio de protocolo declarado |
| WAN outage real verificada | ⚠️ PASS con método declarado | **Sin corte físico de WAN:** offline aplicado y probado en-harness con `httpRequests: 0` en el recibo de la fase `offline` de cada run. Un corte físico de router/airplane mode no formó parte del instrumento |
| Restart recovery en dispositivo verificada | ❌ NOT CAPTURED | El ciclo de reinicio del dispositivo no fue ejercitado por el instrumento de cohorte; no se fabrica evidencia |

---

# 7. Documentation Readiness

| Check | Estado | Evidencia |
|---|---|---|
| `onboarding_acceptance_plan_v1.0.md` aprobado | ✅ | Re-auditoría cerrada (AP-A01..A10 = CLOSED) |
| `AP_FIXTURE_MANIFEST.md` creado | ✅ | v2.0 — congelado con identidad `fp-acceptance-6b15d8a`, fixtures F2–F5 vinculados por hash y hardware capturado |
| `AP_REFERENCE_RUN_PROTOCOL.md` creado | ✅ | v1.1 — protocolo ejecutado; operador (harness) y método WAN (offline en-harness) registrados |
| `onboarding_execution_roadmap.md` v1.1 aprobado | ✅ | Re-auditoría cerrada (ER-01..ER-09 = CLOSED) |

---

# 8. Decisión

```text
ONB1.10F (aceptación técnica):  PASS — 2026-09-20, release fp-acceptance-6b15d8a
Piloto en local real:           NOT READY — L1 y L2 abiertas

Checks al cierre:
  §1 Architecture Authority:     PASS (P0=0, P1=0)
  §2 Implementation Completeness: PASS (ONB1.0–ONB1.10 cerrados, incl. ONB1.10F)
  §3 Regression Completeness:     PASS (74/74 escenarios verdes)
  §4 Baselines & Restoration:     DEFERRED (post-piloto con datos reales)
  §5 Release Candidate:           PASS (fp-acceptance-6b15d8a congelada)
  §6 Hardware & Pilot Readiness:  ONB1.10F PASS; restart recovery NOT CAPTURED;
                                  WAN outage probada en-harness (httpRequests=0),
                                  sin corte físico
  §7 Documentation Readiness:     PASS (manifest v2.0 congelado; protocolo v1.1
                                  ejecutado; CSV y summary TTFSS creados)

Resultado técnico (cohorte 5/5):
  Runs elegibles y ANCHORED:     5/5
  TTFSS:                         900/930/936/947/866 ms (límite 900 s)
  Activación:                    10/10 checks PASS por run;
                                 lifecycle = ACTIVATED confirmado desde backend

Alcance del PASS:
  El PASS cubre SOLAMENTE el ciclo de vida de activación en el Q80 físico.
  El piloto en local real queda NOT READY mientras:
    L1 — enrolamiento de credencial de dispositivo en producción (abierta)
    L2 — transporte mixto de sincronización, issue #314 (abierta)
  y el transporte de dispositivo /v1/sync/* sigue fuera del alcance validado.

Pendiente posterior a la aceptación:
  1. Cerrar L1 y L2 (con confirmación en ejecución)
  2. Registrar el anuncio de la brecha de L3 y entregar DSI-6
  3. Restart recovery en dispositivo (no capturado en esta aceptación)
  4. Baselines & Restoration con datos reales (§4)
  5. Recién entonces reevaluar la preparación del local real
```

---

# 9. Firma

```text
Revisado por:    Harness ONB1.10F attachado sobre el Q80 físico; operador con nombre no capturado
Fecha:           2026-09-20
Decisión:        ONB1.10F PASS (aceptación técnica); piloto en local real NOT READY (L1/L2 abiertas)
acceptanceReleaseId: fp-acceptance-6b15d8a
Next gate:       Cierre de L1/L2 y DSI-6 antes de reevaluar la preparación del local real
```
