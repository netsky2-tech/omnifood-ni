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
