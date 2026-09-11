# NHILOS Client Onboarding V1 — M5 Evidence Receipt: PR-ONB-15 (ONB1.6A–C)

**Documento:** `ONB1.5_M5_PR15_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.5_M5_PR15_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.6A`, `ONB1.6B`, `ONB1.6C`  
**Fecha de ejecución:** 2026-09-03  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real & Floor SQLite real) -> E2E sin mocks de persistencia.

---

# 1. Resumen de Entregables Físicos

### 1.1 ONB1.6A — Fiscal Config Versioning (`apps/admin_backend`)
- **Version Contract**: `FiscalConfigVersion: { revision: number, fingerprint: string }`.
  - `revision`: Entero estrictamente monotónico por tenant que se incrementa única y exclusivamente ante cambios materiales de configuración fiscal efectiva (`fiscalRegime`, `taxRate`, `pricesIncludeTax`, `commercialFxSpread`, `businessName`, `ruc`). Idempotente ante re-guardados idénticos.
  - `fingerprint`: SHA-256 de la serialización canónica RFC-8785 (JCS) del payload efectivo determinista.
- **Snapshot Contract**: `FiscalConfigSnapshot`:
  `{ tenantId, businessName, ruc?, fiscalRegime, taxRate, pricesIncludeTax, commercialFxSpread?, configVersion: { revision, fingerprint }, generatedAt }`.
- **Integrity Conflict Invariant (`INTEGRITY_CONFLICT`)**:
  - Misma revisión recibida o validada con fingerprint alterado (`revision == local.revision && fingerprint != local.fingerprint`) dispara un conflicto terminante de integridad (`ConflictException: INTEGRITY_CONFLICT`) bloqueando la escritura.
- **Persistencia Backend & RLS**:
  - Entidad `FiscalConfigRevision` con tabla PostgreSQL `fiscal_config_revisions`.
  - Constraint única `uq_fiscal_config_revisions_tenant_revision (tenant_id, revision)`.
  - RLS activado en migración `1799000000000-CreateFiscalConfigRevisions.ts`.
  - Pruebas reales en PostgreSQL contra esquemas aislados (`fiscal-config-version.service.db.spec.ts`).

### 1.2 ONB1.6B — Fiscal Outbound Sync & Local SQLite Projection (`apps/admin_backend` & `apps/pos_app`)
- **Sync Master-Data Envelope Extendido**:
  - Reutilización del transporte existente `GET /v1/sync/inbound/deltas` y `InboundSyncDeltasDto` sin crear transportes paralelos.
  - `InboundSyncService` proyecta `FiscalConfigSnapshot` en el payload de deltas y raíz de respuesta.
- **Local SQLite Projection en Flutter POS (`apps/pos_app` con Floor)**:
  - Tabla `fiscal_config_local`:
    ```sql
    CREATE TABLE fiscal_config_local (
      tenant_id TEXT PRIMARY KEY NOT NULL,
      revision INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      payload TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    ```
  - Entidad `FiscalConfigLocalEntity` y DAO `FiscalConfigLocalDao`.
  - **Floor Rule Cumplida**: Método `@transaction` en DAO utiliza argumentos posicionales (`applyFiscalConfig(FiscalConfigLocalEntity entity)`), preservando la compatibilidad de generación `.g.dart`.
  - Migración `migration42_43` de Floor ejecutada (Database version 43).
- **POS ACK**:
  - Endpoint `POST /v1/sync/inbound/fiscal/ack` confirma la aplicación local efectiva en la base de datos SQLite antes de considerar cerrada la sincronización, no meramente la recepción de bytes en el buffer de red.

### 1.3 ONB1.6C — Fiscal Inbox Idempotency & Conflict Handling (`apps/pos_app`)
- **Idempotencia**: Snapshot duplicado con igual `{ revision, fingerprint }` resulta en `FiscalInboxStatus.idempotentNoOp` sin mutación en SQLite ni alteración de timestamps `applied_at`.
- **No-downgrade (Anti-stale)**: Snapshot con `revision < localRevision` se rechaza arrojando `StaleFiscalRevisionException` y manteniendo intacta la proyección local.
- **Integrity Conflict**: Misma revisión con fingerprint alterado bloquea la aplicación con `FiscalIntegrityConflictException`.
- **Offline Durability**: Un reinicio del terminal o cierre del SQLite sin conexión WAN conserva íntegra y legible la proyección en `fiscal_config_local`.

---

# 2. Evidencia de Tests y Cobertura Real

### 2.1 Backend Unit & Triangulation (`apps/admin_backend`)
```bash
npm test -- --testPathPattern="(fiscal|inbound-sync|canonical-jcs)"
```
Resultado:
- `canonical-jcs.spec.ts`: 4 tests passed (RFC-8785 ordering, nested objects, deterministic hashing).
- `fiscal-config-version.service.spec.ts`: 7 tests passed (effective payload, baseline rev 1, monotonic increments, integrity conflicts).
- `fiscal-setup.service.spec.ts`: 8 tests passed.
- `fiscal-setup.controller.spec.ts`: 4 tests passed.
- `inbound-sync.service.spec.ts`: 8 tests passed (fiscal snapshot inclusion, fiscal ACK recording, auth mismatch rejection).
- `inbound-sync.controller.spec.ts`: 5 tests passed (fiscal ACK route delegation).
Total: 8 suites, 43 tests passed.

### 2.2 Backend Real PostgreSQL DB Tests (`apps/admin_backend`)
```bash
npm run test:db -- --testPathPattern="fiscal-config-version.service.db.spec.ts"
```
Resultado:
- `fiscal-config-version.service.db.spec.ts`: 4 tests passed in real PostgreSQL:
  - Baseline revision 1 initialized with canonical fingerprint in database.
  - Strictly monotonic revision increment upon material changes & idempotency.
  - INTEGRITY_CONFLICT detection on mismatched fingerprint.
  - Multi-tenant schema isolation across revisions.

### 2.3 Flutter Floor SQLite & Sync Tests (`apps/pos_app`)
```bash
flutter test test/data/database/fiscal_config_local_database_test.dart test/data/services/fiscal_inbox_handler_test.dart test/data/services/sync_service_fiscal_projection_test.dart
```
Resultado:
- `fiscal_config_local_database_test.dart`: 4 tests passed (real SQLite CRUD, replace on conflict, positional transactional apply).
- `fiscal_inbox_handler_test.dart`: 5 tests passed (application, idempotency, integrity conflict blocks, anti-downgrade rejection, upgrade).
- `sync_service_fiscal_projection_test.dart`: 2 tests passed (pullInboundDeltas SQLite projection + cloud ACK, offline durability restart test).
Total: 11 tests passed in Flutter SQLite.
