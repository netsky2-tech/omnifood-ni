# T4 — Declarar transaction types conformes a §9.3 en el path pre-V1 de earn/redeem

**Estado:** CERRADO
**Fecha:** 2026-02-14
**Origen:** Follow-up #2 de la tabla post-gate de lealtad (tras cierre de #877/#878).
**Issue:** #881 · **PR:** #882 · **Review nativa:** `review-e3c24c5b87684218` (APPROVED, risk+reliability, medium)

## Problema

Los creators pre-V1 del checkout (`LoyaltyService.createEarnTransaction` /
`createRedeemTransaction` / `createAdjustmentTransaction`) persistían
`transaction_type = NULL`. Toda fila nueva caía en el namespace legacy: los
shape triggers §9.3 quedaban inertes y el ledger no podía probar qué era cada
movimiento. Peor: si un día el tipo se declaraba mal, el trigger abortaba el
insert y el POS dejaba de grabar puntos con los tests en verde (el "silent
failure trap" que motivó tipos declarados obligatorios en §9.3).

## Diseño (fail-safe)

| Movimiento | Se declara cuando | Requisito §9.3 |
|---|---|---|
| `EARN` | programa + ticket presentes | `ticket_id` + `loyalty_program_id` NO-NULL |
| `REDEEM` | ticket presente | solo `ticket_id` |
| `ADJUST` | siempre | — |

- Sin atribución de programa → la fila permanece en el **namespace legacy NULL**
  (cero aborts; nunca se fabrica una atribución).
- `SaleViewModel`: redención por reward lleva el `loyaltyProgramId` del reward;
  el resto se atribuye solo con **exactamente un** programa activo en la
  evaluación (multi-programa → NULL).
- Idempotency keys deterministas solo en filas declaradas:
  `loyalty:earn:{programId}:{ticketId}` / `loyalty:redeem:{ticketId}`.
- Units con signo + `origin: 'POS'` en toda fila declarada.

## Limpieza

`LoyaltyEarningHandler` eliminado (huérfano: cero llamadores, cero tests; era el
último escritor de earns con `loyaltyProgramId: null`).

## Contrato y decisiones

- **Sin backfill**: filas NULL existentes permanecen NULL (ledger append-only).
  Un backfill sería una decisión separada del owner con su propio runbook
  (relacionado con follow-up #3).
- La clave redeem va solo sobre `{invoiceId}` — si un mismo ticket tiene
  redención por reward y legacy points, comparten key (SUGGESTION del reviewer
  R1; no bloqueante: el flujo real nunca mezcla ambos en un ticket).

## Verificación

- TDD RED→GREEN: 5 tests de creators + 2 de wiring checkout
  (`sale_view_model_loyalty_wiring_test.dart`, grupo "T4").
- Suite POS completa verde con `--concurrency=2` (3561 tests; 2 flakes
  WebSocket conocidos del host WSL2, archivo pasa aislado).
- Review nativa APPROVED con 3 hallazgos no bloqueantes:
  - `R1-redeem-key-invoice-only` (SUGGESTION, loyalty_service.dart:152)
  - `R1-units-rounding-divergence` (WARNING, loyalty_service.dart:96)
  - `R3-001` (WARNING, loyalty_service.dart:97)

## Log

- L1 2026-02-14 — commit `06c8ace0` (creators + VM + tests + delete handler);
  issue #881; PR #882; review `review-e3c24c5b87684218` APPROVED y acknowledged
  (authority burned; 3 hallazgos no bloqueantes: R1-redeem-key-invoice-only
  SUGGESTION, R1-units-rounding-divergence WARNING, R3-001 WARNING).
- L2 2026-02-14 — CI verde (lint-and-test 8m49s, build-check 1m50s, Cloudflare
  Pages, GitGuardian). Squash merge `321f6c4e` en main; issue #881 CLOSED;
  branch eliminada. T4 CERRADO — sigue follow-up #3 (runbook de remediación
  legacy para la migración v71).
