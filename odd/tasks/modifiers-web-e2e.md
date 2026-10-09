# Modificadores/Extras en la web — verificación E2E contra backend real

**Estado:** en curso.
**Origen:** pedido del usuario (2026-10-09): el flujo de gestión de extras/modificadores de la web
nunca se validó de inicio a fin contra un backend levantado de verdad. El POS sí está verificado
(T4.3b en S23) y el dashboard solo tiene tests de unidad/integración con mocks.
**Decisión de entorno (usuario, 2026-10-09):** backend **local real** (NestJS + Postgres `omnifood`
desde este worktree aislado), NO producción.

---

## 1. Por qué existe este documento

La Fase 1 (T1.2/T1.3/T1.4) y el `modifier-ops-center` (U1–U4) cerraron con recibos quemados sobre
tests de unidad y specs con mocks. Lo que **nadie recorrió** es el flujo real que usa el dueño:

1. Login real en el panel (tenant por subdominio).
2. Crear grupo con reglas (min/max, cantidades) → agregar opciones con delta de precio → persistencia
   real en Postgres y reaparición tras reload.
3. Enganchar el grupo a una categoría ("Por categoría") y crear la excepción por producto
   ("Por producto", incluido el heredado).
4. Resolución efectiva server-side (`GET /modifier-groups/effective`) = categoría ∪ producto.
5. **El handoff web → POS**: el delta `modifierGroups` / `categoryModifierGroups` /
   `productModifierGroups` de `GET /v1/sync/inbound/deltas` lleva el estado recién creado.
6. Caminos de error contra reglas reales: `min > max` → 400, nombre duplicado → 409,
   contrato decimal de `price_delta` (clase `numeric(12,2)` → string en el wire).

**Riesgo conocido de arranque:** en `main` **no** está el fix del contrato decimal de `price_delta`
(el commit `ce002af1` vive solo en la rama `feat/soho-p3-operational-surfaces`). Si el E2E lo
exponé, se arregla aquí sin depender de la otra sesión (ver §4).

## 2. Entorno real (trazado, no supuesto)

| Pieza | Valor |
|---|---|
| Worktree | `/home/octavio_morales/omnifood-ni-modifiers-web-e2e`, rama `test/modifiers-web-e2e` desde `main` |
| Postgres | 127.0.0.1:5432, db `omnifood`, user `postgres` (cred en `apps/admin_backend/.env`) |
| Backend | NestJS desde este worktree, **PORT=3300** (el 3000 lo ocupa el worktree p3), `CORS_ALLOWED_ORIGINS` con el host del dashboard |
| Dashboard | Vite dev **:5174** con `VITE_API_URL=http://127.0.0.1:3300` (evita chocar con el vite de p3 en 5173) |
| Tenant de prueba | slug `soho-test-fixture` (23 productos, 9 categorías `SALES_PRODUCT_CATEGORY`, **0 grupos modifiers** — limpio) |
| Host del panel | `http://soho-test-fixture.localhost:5174` — el tenant se resuelve SOLO del primer label del hostname (`resolveTenantSlug`, `lib/auth.ts:30`) |
| Credenciales | `sofia@omnifood.ni` / `password123` (OWNER, sembrado por `seed:test`) |
| NO tocar | worktree `omnifood-ni-p3` ni sus servidores en 3000/5173; tenant `soho` (los 3 grupos reales sembrados en §41 del doc madre) |

## 3. Plan de tareas

- [x] **T1** Worktree aislado + `pnpm install` + stack real levantado (backend 3300, vite 5174),
      health-check y login API verificados.
      **Evidencia (2026-10-09):** `pnpm install` 2.2 s desde el store compartido; migraciones:
      0 pendientes de este árbor (el libro tiene una fila ajena `AllowNullParamValue` de p3, inocua);
      backend `nest start` con `PORT=3300` y `CORS_ALLOWED_ORIGINS` → `GET /api/v1/health` 200;
      `POST /api/identity/login` `{email, pass, tenantSlug}` → 201 con token (sin `tenantSlug` → 400);
      `GET /api/modifier-groups` → 200 `[]` (tenant limpio); vite `--port 5174 --strictPort` con
      `VITE_API_URL=http://127.0.0.1:3300` → 200 en `localhost:5174` y `soho-test-fixture.localhost:5174`;
      Playwright 1.63.0 pide chromium **1243** y está en `~/.cache/ms-playwright` (sin descarga).
- [ ] **T2** Scout del flujo web (selectores/copy de `/modifiers`, rutas API) con evidencia `path:line`.
- [x] **T3** Spec Playwright **live** (opt-in `NHILOS_LIVE_E2E=1`) del flujo completo de UI:
      login → crear grupo → opciones con deltas → reload/persistencia → enganche por categoría →
      excepción por producto → desactivación. RED primero.
      **Evidencia (2026-10-09):** 7 tests seriales en `e2e/modifiers-live.live.spec.ts` +
      `playwright.live.config.ts` (Desktop Chrome, webServer :5174 con `VITE_API_URL=:3300`,
      `reuseExistingServer`) + script `test:e2e:live`. Corrido contra el stack real: tests 1-3
      **verdes** (login, alta de grupo, persistencia de opciones tras reload completo); test 4
      **RED por defecto de producto** (D-1, abajo); tests 5-7 serial-skip (nunca ejecutados hasta
      el fix). Copy/selectores del mapa del scout: coincidencia 100 % con la UI en ejecución.
      Bug de spec propio detectado y corregido (aserción de formato `"15"` vs `"15.00"` → ahora
      `Number(value) === 15`, igual de fuerte). 3 grupos residualles run-stamped en el fixture
      (inofensivos, nombres únicos por corrida).
- [ ] **T4** Test de integración API contra backend real: CRUD + validaciones (400/409/decimal) +
      `effective` + delta de sync con las 3 keys de modifiers. RED primero.
- [x] **T5** Correr ambos contra el stack real y catalogar defectos (clase, ubicación, severidad).
      **Evidencia (2026-10-09):** UI spec (T3) + API integration test (T4) contra backend vivo
      :3300. **Catálogo: un solo defecto de clase (D-1)**, en 4 superficies independientes:
      PATCH desde el form tras reload (UI, 400), echo del POST de opción, GET de grupo y
      opciones de `effective` (API). 9/12 API y 3/7 UI verdes; validaciones 400/409, attach
      categoría/producto, override effective, filtrado `is_active`/status y soft-delete+404 por
      id verificados correctos. **Sorpresa de contrato documentada:** `?product_id=` en el
      listado devuelve solo adjuntos DIRECTOS (no hereda por categoría) — assertada la verdad real.
- [x] **T6** Fixes de los defectos encontrados (una unidad de trabajo por work unit).
      **Evidencia (2026-10-09):** D-1 = clase `modifiers-decimal-contract`; el fix canónico
      `ce002af1` (en `origin/feat/soho-p3-operational-surfaces`) estaba **ausente de main** y
      sus 11 archivos no divergían de main → **cherry-pick limpio → `0cad99c3`** (+837/−44;
      sin divergencia que resolver cuando p3 mergee). Backend :3300 reiniciado con el fix
      (login 201). Verificación de la batería completa → T7.
- [x] **T7** Verificación final: specs E2E verdes, suites enfocadas backend (modifiers) y dashboard,
      `tsc`, lint — **en serial** (límite de memoria WSL2; nunca backend jest + dashboard vitest juntos).
      **Evidencia (2026-10-09):** jest modifiers **114/114**, vitest modifiers **51/51**,
      `tsc` backend **0** y dashboard **0**, live API **12/12**, live UI **7/7** (21.9s).
      Lint CI real: backend `eslint --fix-dry-run` en módulo modifiers → **0 residuales**
      (48 autofixables + 1 warning que el autofix elimina; el script CI no usa
      `--max-warnings`), `oxlint src` → **exit 0**. Fallo de `route-transport-registry.spec.ts`:
      **reproducido en main limpio 1ed5c0ad** → preexistente, follow-up ajeno a la rama.
- [x] **T8** Commits convencionales por work unit con tests/docs junto al comportamiento.
      **Evidencia:** `0cad99c3` fix decimal (cherry-pick) · `710008d8` spec UI live (7 tests) ·
      `7ff1277f` test API (12 tests) · `cca3c95f` docs ODD. Árbol limpio tras cada commit.
- [ ] **T9** Revisión nativa (inspect por candidato) según el switch RDD del usuario.
- [ ] **T10** Merge a `main` al final (autorizado por el usuario).

## 4. Registro de hallazgos

### D-1 · `price_delta` round-trip: el form hidrata el string del backend y el PATCH revienta con 400 — RESUELTO (0cad99c3)
- **Síntoma (UI, test 4):** tras un reload, "Actualizar" nunca llega a toast "Grupo actualizado";
  aparece "Error al guardar — Revise los datos del formulario: hay valores que no son válidos".
- **Causa raíz (capturada con listener de red):** `PATCH /modifier-groups/:g/options/:id` con
  `{"name":"Extra shot","price_delta":"15.00", …}` → **400**
  `price_delta must be a number conforming to the specified constraints`.
  El backend serializa el `numeric(12,2)` de Postgres como **string**; el form de edición
  reenvía el valor leído sin coercionar. Reenvío idéntico con `15` (number) vía curl → **200**.
- **Por qué los tests de unidad no lo ven:** los fixtures mockean `price_delta` como `number`;
  el defecto solo aparece en el ciclo **load → modify → save** contra datos reales.
- **Contexto:** es exactamente la clase `modifiers-decimal-contract` (obs Engram 9992/9993). El fix
  `ce002af1` (S6a) existe **solo en `feat/soho-p3-operational-surfaces`** — NO está en `main`.
  El E2E acaba de demostrar que en `main` el defecto está vivo. **Resuelto en T6 vía cherry-pick
  limpio → `0cad99c3`** (los 11 archivos idénticos entre ce002af1 y main: cero conflicto).
- **Impacto:** cualquier guardado de un grupo que YA tenía opciones cargadas falla. El alta
  inicial de grupo (sin opciones) y la creación de la primera opción sí funcionan (por eso los
  tests 1-3 pasan); el ciclo completo de edición es inalcanzable.
- **Cosmético asociado:** precio recién tipeado muestra `15`, tras recargar muestra `15.00`
  (misma raíz).

(Los tests 5-7 de UI y el test de integración API nunca llegaron a ejercitar los flujos de
enganche/effective: se ejecutarán en T7 tras el fix de D-1.)

## 5. Cierre

(Pendiente: T9 revisión nativa, T10 merge, limpieza de leftovers del fixture.)
