# Normalización de forma de predicados — transaction_type canónico en escritura

**Estado:** CERRADO
**Fecha:** 2026-02-14
**Origen:** Follow-up #5 de la tabla post-gate de lealtad.
**Issue:** #888 · **PR:** #889 · **Review nativa:** `review-3a4aef6867ed4b17` (APPROVED, risk+reliability)

## Problema

Las formas textuales de `transaction_type` convivían sin convención única:
POS escribía mayúsculas del spec ('EARN'/'REVERSAL'), el backend normaliza a
los miembros minúsculas del enum PG, el spec DDL declara mayúsculas, y los
guards SQLite eran case-insensitive por necesidad — no por contrato. Peor: un
**tipo declarado desconocido** (p.ej. 'MILESTONE') no violaba ninguna regla de
forma del guard T2b (ninguna regla lo selecciona) y evadía todas las
identidades V1.

## Implementación

- **Dominio POS** (`customer_point_transaction.dart`): `loyaltyLedgerTypeForms`
  (formas canónicas §9.3) + `canonicalLoyaltyLedgerType` — normaliza a la forma
  canónica; un tipo no clasificable (desconocido, blank) degrada al namespace
  legacy NULL (mismo espíritu fail-safe que T4: nunca fabricar una declaración
  que evade las reglas de forma).
- **Mapper** (`customer_mapper.dart`): `toPointTransactionEntity` aplica la
  forma canónica en el único punto de mapeo de escritura POS.
- **Guard T2b** (`migrations.dart`): regla `type_domain` en el scan fail-closed
  + trigger BEFORE INSERT/UPDATE — tipo declarado fuera del dominio §9.3 se
  rechaza; NULL-legacy sigue permitido.
- **Spec** (`loyalty_architecture_spec.md` §9.3): convención textual — SQLite
  persiste mayúsculas del DDL, PostgreSQL miembros minúsculas del enum
  (conversión en el límite del escritor), guards case-insensitive = defensa en
  profundidad.
- **Backend**: sin cambios — el enum PG ya normaliza y refuerza el dominio
  (`toLegacyPointTransactionType`).

## Verificación

- TDD RED→GREEN: 4 tests de mapper (canónicas pasan, minúsculas normalizan,
  desconocido→NULL, NULL→NULL) + 1 test de dominio en el guard
  ('MILESTONE' rechazado, NULL-legacy permitido) — 25/25 en las suites.
- Review nativa APPROVED con 3 hallazgos no bloqueantes:
  - `R1-silent-null-downgrade` (WARNING, customer_mapper.dart:109)
  - `R3-001` (WARNING, migrations.dart:3037)
  - `R3-002` (SUGGESTION, customer_point_transaction.dart:33)

## Log

- L1 2026-02-14 — rama apilada sobre #4; tras merge de #885 rebase limpio a
  main (`e15f9a98`, descartando el commit duplicado por squash).
- L2 2026-02-14 — CI verde (lint-and-test 13m02s, build-check, Cloudflare
  Pages, GitGuardian). Squash merge `dcb58057`; issue #888 CLOSED.
