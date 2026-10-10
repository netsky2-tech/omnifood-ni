# SOHO P3 — desbloqueo de la entrega (gates rojos) y arranque de detalles

- **Status:** EN EJECUCIÓN (fix-forward; merge pendiente de decisión del usuario)
- **Worktree / rama:** `~/omnifood-ni-p3` · `feat/soho-p3-operational-surfaces` (47 commits sobre `main`, 23 sobre `origin`)
- **Base:** `main` = `c1109d47` (Admin Backend CI `success e1452a87`, Owner Dashboard CI `success bc8ea6ff`)
- **Decisión del usuario (2026-10-10):** (1) **fix-forward + UN PR `integración → main`**, cerrando los 8 PRs apilados como entregados por ese PR; (2) primer frente de detalles: **§18.2 (etiqueta del cobro) + los 3 formularios que sólo necesitan `noValidate`**.
- **S5 y KDS:** explícitamente al final (requieren campo y decisiones de producto).

---

## 1. Por qué la cadena no se podía mergear

### 1.1 Hallazgo estructural (medido)

Los 8 PRs apilados cubren **sólo los 23 commits nuevos** (los slices 25–47). Los **23 commits viejos** del mismo bloque (topes de descuento, promociones cloud-authoritative, historial de ventas auditable, bitácora en el panel, tumba nula, base del barrido) **no tienen ningún PR**: viven sólo en la rama de integración.

`git cherry -v main feat/soho-p3-operational-surfaces` → 46 de 47 commits con `+` (no están en main); uno con `-`:
`ce002af1` (modifier decimals) ya está en main por parche equivalente (`0cad99c3`).

**Consecuencia:** el paso `integración → main` es inevitable, y mergear los 8 PRs contra la integración **no le agrega ni un byte a main** (los commits ya están ahí). Son 8 ciclos de CI de ceremonia.

### 1.2 Bloqueador 1 — Admin Backend CI rojo, y enmascara los steps siguientes

`apps/admin_backend/package.json` → `lint: eslint "{src,apps,libs,test}/**/*.ts" --fix`.

El `--fix` **borra** las aserciones `as PersistedBreakdownRow[]` (las marca `no-unnecessary-type-assertion`) y al borrarlas **deja la interfaz huérfana**. El residuo no-fixeable es lo que CI ve.

Log crudo del job `114083494798` (run `38008726341`), línea 935:

```
✖ 485 problems (8 errors, 477 warnings)
```

Y GitHub anotó **un solo** error (`PersistedBreakdownRow`), así que el diagnóstico superficial atribuyó todo a un archivo. El lint va **primero**: al morir, se saltan `test:no-only`, `test`, `test:db`, `test:e2e` y `verify-schema-build`.

**Errores medidos en el tip** (11; plugin local `@typescript-eslint` 8.59.1 sobre `recommendedTypeChecked`). Todos introducidos por el bloque; main está verde, así que ninguno es preexistente:

| # | Archivo | Línea | Regla | Causa |
|---|---|---|---|---|
| 1 | `src/modules/sales/services/invoices.service.ts` | 290 | `no-unused-vars` | `({ modifiers, ...item })` omite la clave a propósito |
| 2 | `src/modules/sales/services/reconciliation-list.service.ts` | 163 | `unbound-method` | `rows.map(ReconciliationListService.toDto)` |
| 3 | `src/modules/audit/audit-logs.service.spec.ts` | 87 | `no-base-to-string` | `String(entity)` con `entity: unknown` |
| 4 | `src/modules/onboarding/services/fiscal-config-version.service.spec.ts` | 517, 518 | `no-unused-vars` | `_amount`, `_percent` (rest siblings) |
| 5 | `test/audit/audit-logs-read-rls.db.e2e-spec.ts` | 75 | `no-unused-vars` | `SHARED_DEVICE_ID` declarada y nunca usada |
| 6 | `test/modifiers/modifier-decimals.db.e2e-spec.ts` | 63 | `no-require-imports` | el disable apunta a `no-var-requires` (nombre v7) |
| 7 | `test/sales/pos-modifier-payload.db.e2e-spec.ts` | 104, 254 | `no-require-imports` + `no-unused-vars` | mismo disable viejo + interfaz huérfana |
| 8 | `test/sales/pos-payload-discount-origin.db.e2e-spec.ts` | 72, 269 | `no-require-imports` + `no-unused-vars` | mismo disable viejo + interfaz huérfana |

**Nota de entorno:** el lint local **no es fiel** al de CI (el worktree resuelve `@typescript-eslint` 8.59.1 por pnpm; CI instala con `npm ci` desde `apps/admin_backend/package-lock.json`). La verificación que vale es CI. Lo que sí es comparable: el conjunto de **errores** (no los 477 warnings de `no-unsafe-argument`, que la config declara `warn`).

### 1.3 Bloqueador 2 — el dashboard no compila (Cloudflare Pages rojo desde #836)

`apps/owner_dashboard` → `build: tsc -b && vite build`. Reproducido en el tip:

```
src/features/dashboard/tips-summary.tsx(62,12): error TS2304: Cannot find name 'TipsSummaryWire'.
src/__tests__/w10-loyalty-programs-rewards.test.tsx(882,9): error TS2532: Object is possibly 'undefined'.
```

- `TipsSummaryWire` **existe** (`dashboard-api.ts:43`); `dcbc87f6` (#836) perdió el import. Un renglón.
- El TS2532 es de `c0df7859` (#837), en un test nuevo: `mock.calls[0][0]` bajo `noUncheckedIndexedAccess`.
- **Por qué nadie lo vio:** `owner-dashboard-ci.yml` corre `lint` → `typecheck` → `test`; el typecheck vive **después** del lint, y Cloudflare Pages es el único gate que typechequea los *tests*. CF Pages falla desde #836 y **nadie leyó el detalle** (la anotación sólo trae un link al dashboard de Cloudflare).

---

## 2. Tareas

- [ ] **T1 · Reset del lint de admin_backend (11 errores → 0).**
  - `eslint.config.mjs`: opciones de `@typescript-eslint/no-unused-vars` — `varsIgnorePattern: '^_'`, `argsIgnorePattern: '^_'`, `caughtErrorsIgnorePattern: '^_'`, `ignoreRestSiblings: true`, con comentario que nombra los tres sitios que dependen de la convención.
  - `invoices.service.ts:290`, `fiscal-config-version.service.spec.ts:517-518`: los resuelve T1a (config).
  - `reconciliation-list.service.ts:163` → arrow que invoca el estático.
  - `audit-logs.service.spec.ts:87` → etiqueta segura para el mensaje del doble.
  - `audit-logs-read-rls.db.e2e-spec.ts:75` → usar `SHARED_DEVICE_ID` en las dos aserciones (`deviceId`), sin tocar el SQL.
  - Tres disables `no-var-requires` → `no-require-imports` (precedente ya en `sales-export.service.ts:14`).
  - Dos interfaces huérfanas → usarlas en una anotación tipada, no en un cast (el `--fix` no puede borrar una anotación).
- [ ] **T2 · Arreglar los 2 errores de tipos del dashboard** (`TipsSummaryWire` import + `calls[0]!`, convención de 14 usos ya existentes).
- [ ] **T3 · Verificación**: `eslint --fix-dry-run` sin errores; `tsc -b` limpio en owner_dashboard; `oxlint` sin errores; specs focales tocados.
- [ ] **T4 · Commits por unidad de trabajo** (config de lint / lint de la API / tipos del dashboard / doc ODD).
- [ ] **T5 · Push + UN PR `integración → main`** con el orden de despliegue (backend primero, migraciones `180962`/`180963`/`180964`) y cierre de los 8 PRs apilados como entregados.
- [ ] **T6 · Frente de detalles elegido**: §18.2 (etiqueta del cobro) + los 3 formularios que sólo necesitan `noValidate` + el 5º formulario de lealtad.

## 3. Gates de verificación

| Gate | Comando | Criterio |
|---|---|---|
| Lint API (fiel) | CI `Admin Backend CI` | 0 errores (warnings permitidos) |
| Tipos dashboard | `cd apps/owner_dashboard && npx tsc -b --noEmit` | 0 errores |
| Lint dashboard | `cd apps/owner_dashboard && npx oxlint src` | 0 errores |
| Suites focales | specs tocados, uno por uno | verdes |
| Build dashboard | `npm run build` (tsc -b + vite) | verde |

**Lo que NO se corre local:** suites completas mientras haya subagentes vivos (tope 12 GiB + 4 GiB swap, OOM mata la sesión). La validación completa es CI.

---

## 4. El PR #850 destapó dos bloqueadores más (2026-10-10)

Al pasar el lint, **los steps que nunca habían corrido empezaron a correr**. Los dos hallazgos siguientes son de la misma familia que el resto del bloque: un gate que muere primero esconde todo lo que viene detrás.

### 4.1 · POS App CI: `Generate code` falla — el `analyzer` del lock no parsea la sintaxis del bloque

Log crudo del job `114116868850`:

```
[WARNING] freezed on integration_test/...: Your current `analyzer` version may not
fully support your current SDK version.
Analyzer language version: 3.4.0
SDK language version: 3.11.0
...
[SEVERE] freezed on test/presentation/features/sales/sale_view_model_loyalty_wiring_test.dart:
sale_view_model_loyalty_wiring_test.dart:70:24: Expected an identifier.
```

- **Causa:** el spec usaba `'tenant_id': ?tenantId` (null-aware element). Es sintaxis más nueva que la language version **3.4.0** del paquete `analyzer` que resuelve `pubspec.lock` (está como `dependency: "direct overridden"`), así que los builders (freezed, json_serializable, floor_generator, mockito) no pueden parsear el archivo.
- **Por qué localmente no se ve:** `dart analyze` usa el analyzer **del SDK** (3.11, sí entiende la sintaxis) mientras `build_runner` usa el `analyzer` **del lock**. La verificación que vale es `flutter pub run build_runner build`. Reproducido local: mismo archivo, misma línea `70:24`, los mismos 4 builders.
- **Arreglo:** `if (tenantId != null) 'tenant_id': tenantId,` — el collection-if existe desde Dart 2.3 y no depende del analyzer.
- **Efecto colateral que importa:** el build fallido **borra** el `part` generado, y el `.mocks.dart` commiteado estaba **rancio**: le faltaban `getPendingSyncCustomers` y `markCustomerSynced` de `CustomerDao`. Regenerado: +32 líneas. El spec corre **27/27**.
- **Follow-up (no hecho, es decisión del dueño):** subir el `analyzer` del lock (`flutter packages upgrade` / bump del override) para que el repo pueda usar sintaxis nueva. Es churn de dependencias de todo el monorepo.

### 4.2 · Admin Backend CI: `Run unit tests` falla — los mocks de dos specs no conocen la entidad nueva

Log crudo del job `114116868885`:

```
FAIL src/modules/sales/services/sale-ack-idempotency.spec.ts
FAIL src/modules/sales/services/sale-time-v1-sync.spec.ts
Test Suites: 2 failed, 3 skipped, 337 passed, 339 of 342 total
Tests:       13 failed, 8 skipped, 3909 passed, 3930 total
```

- **Causa:** `ce2ab1cb` agregó la persistencia de modifiers (`manager.getRepository(InvoiceItemModifier).delete(...)` / `.insert(...)`) al camino de venta, pero **no actualizó** los dos specs de sync, cuyo `getRepository` mock devuelve `{}` para entidades desconocidas. `delete` no existe → `TypeError` → **el lote entero se rechaza** con el código de fallback `BUSINESS_RULE_VALIDATION`, y por eso los 13 fallos comparten la forma `processed: 0`.
- **No lo causó el merge:** el merge sólo trajo 4 archivos a `admin_backend` y ninguno toca el camino de sync. `invoices.service.spec.ts` (el spec grande) **sí** mockeaba la entidad — el patrón estaba en el repo, sólo faltaba copiarlo.
- **Arreglo:** agregar `[InvoiceItemModifier, { delete: jest.fn(), insert: jest.fn() }]` a los dos mocks. **16/16** en los dos specs.
- **Nota de formato:** el CI corre `eslint --fix` **antes** de `npm test`, así que los mismos specs aparecen reformateados (~550 líneas donde el árbol tiene 169). Las líneas del log de CI **no** coinciden con las del repo: es el mismo archivo, no otro.

### Tareas nuevas

- [x] **T7 · Desbloquear POS App CI** (sintaxis + generado rancio).
- [x] **T8 · Desbloquear Admin Backend unit tests** (mocks de los dos specs).

### 4.3 · POS: el e2e de lealtad codificaba el bug que el §18.3 arregló

`test/e2e/loyalty_v1_real_sqlite_e2e_test.dart` **pasa completo en `main`** y fallaba 4 tests en la rama (`currentEvaluation.programs` vacío y `selectReward` sin efecto sobre `selectedReward`). El archivo sembraba cada programa y cada recompensa con `tenantId: customerId` y su config local **nunca tuvo la clave `tenant_id`**: es exactamente el bug del §18.3, pineado en el e2e que la suit unitaria ya había re-clavado. Arreglo: sembrar el binding y re-clavar los 8 fixtures; la aserción del invoice se mueve con el diseño (el beneficio de C$20 es descuento **por línea**, así que el subtotal fiscal de la factura es 350−20 mientras el subtotal del carrito sigue en 350 — aserción que el propio test ya hacía). **6/6.**

### 4.4 · Los 4 fallos preexistentes de `main` en la suite del POS (NO son del bloque)

Suite completa del POS: **3394 pasan, 10 fallan**. Desglose:

- **2 son flakes** de `flutter_tester` (`Unable to connect to flutter_tester process`): desaparecen corriendo los archivos aislados con `--concurrency=1`, que es el ruido de toolchain que AGENTS.md ya documenta bajo presión de memoria.
- **4 son del bloque** (el e2e de lealtad, §4.3) → arreglados.
- **4 son preexistentes de `main`**: `phase5_blind_count_shift_closure_integration_test.dart`, `phase3_complex_multicurrency_split_integration_test.dart` y `phase1_rbac_override_integration_test.dart` (×2). **Reproducidos idénticos en un worktree limpio de `origin/main` (`fc44002b`)**: mismos mensajes (`Bad state: No element` en `firstWhere`, `Expected: true / Actual: false`), mismos tests.

  **Por qué nadie los vio:** `POS App CI` en `main` está rojo **desde 2026-10-08 20:42** (último verde: `958122cf`, 17:02) en el step `Analyze project source`. Con `analyze` fatal, `Run tests` **nunca corrió** en main: la suite completa del POS lleva ~2 días sin ejecutarse en CI. Los dos infos preexistentes que la rompían (`use_function_type_syntax_for_parameters`, en dos tests de vouchers) se arreglan en este PR, así que después de esto la suite vuelve a correr — y expone estos 4 fallos viejos.

  **Decisión pendiente del usuario:** arreglarlos en este PR (fuera del alcance del bloque) o registrarlos como issue propia y entregar con el gate rojo por causa preexistente.
