# NHILOS — TTFSS Reference Summary — Cohorte ONB1.10F

**Documento:** `TTFSS_REFERENCE_SUMMARY.md`
**Ubicación:** `docs/onboarding/evidence/acceptance/TTFSS_REFERENCE_SUMMARY.md`
**Fuente:** `AP_Q80_PILOT_EVIDENCE.md` §8.1 (cohorte final, 2026-09-20)
**Estado:** **CERRADO — cohorte 5/5 PASS**

```text
ONB1.10F (aceptación técnica):  PASS — release fp-acceptance-6b15d8a
Piloto en local real:           NOT READY — L1 (enrolamiento de producción) y
                                L2 (transporte mixto, issue #314) abiertas en
                                AP_KNOWN_LIMITATIONS.md
```

## Resultado del cohort

| Criterio | Resultado |
|---|---|
| Runs ejecutados | **5/5** |
| measurementEligible = true | **5/5** |
| clockConfidence = ANCHORED | **5/5** |
| TTFSS <= 15:00 (900 s) | **5/5** — peor caso 947 ms |
| Checks de activación por run | 10/10 PASS en cada run |
| Offline probado por run | `httpRequests: 0` en la fase `offline` (sin corte físico de WAN) |
| Estado final por run | `attempt.status = PASS`, `session.lifecycleState = ACTIVATED` confirmados desde el backend |
| Runs DEGRADED reemplazados | ninguno |
| **COHORT RESULT** | **PASS** |

## TTFSS (ms)

| Métrica | Valor |
|---|---|
| Runs | 900 · 930 · 936 · 947 · 866 |
| Mínimo / Máximo | 866 / 947 |
| Promedio | 915.8 |
| Límite del protocolo | 900 000 ms (15:00) |

Detalle por run con timestamps, hashes de ticket y de claim: `TTFSS_REFERENCE_RUNS.csv`.

## Procedencia

| Campo | Valor |
|---|---|
| acceptanceReleaseId | `fp-acceptance-6b15d8a` |
| Commit de release | `6b15d8af66aed80260a511aaaded53d04329f1de` (2026-09-20 10:39:28 -0600) |
| Instrumento | `apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart`, attachado al Q80 físico |
| Target | Base de aceptación dedicada, recreada desde cero: 85 migraciones aplicadas, cola exacta `1809210000000-FixInventoryKardexRunningBalanceTenantHash` |
| POS APK | `1.0.0+1`; reconstruido por run; **SHA-256 del binario de cohorte no capturado** (el hash `f93b6310…` corresponde al rehearsal, no se sustituye) |
| Impresión en cohorte | `PILOT_PRINTER_MODE=simulated`: `PRINTER_AVAILABLE`, `TEST_PRINT` y `SALE_RECEIPT_PATH` satisfechos por simulación; **el TTFSS excluye la latencia de impresión física** (levemente optimista) |
| Evidencia física de impresión | Rehearsal FREEZE-06 (§8.0 de la evidencia): 80 mm, `COMPROBANTE DE VENTA` / `NO RECAUDA IVA`, RUC del emisor presente (hash `46cef85f…`) |

## Salvedades declaradas (no fabricadas)

- **Sin corte físico de WAN:** el offline se aplicó y probó en-harness (`httpRequests: 0`), no con airplane mode/router.
- **Restart recovery no capturado:** el ciclo de reinicio del dispositivo no formó parte del instrumento.
- **Capturas de pantalla no capturadas:** la ejecución del APK se observó, pero no se guardó captura por run.
- **Workstation y WiFi SSID no capturados:** la cohorte fue harness-driven.
- `tenantIdHash` conserva el prefijo de 128 bits de SHA-256 exigido por el protocolo; `firstSaleClaimEventIdHash` conserva el SHA-256 completo y `verificationTicketIdHash` el formato de 128 bits emitido por la evidencia. Ni RUC crudo ni PIN offline se registran en el repositorio.

## Alcance del resultado

Este PASS valida **sólo** el ciclo de vida de activación en hardware real. No valida el transporte de dispositivo `/v1/sync/*` (fuera de alcance, §0.1 de `AP-00_ENTRY_GATE.md`) y no habilita la operación de un local real mientras L1/L2 sigan abiertas.
