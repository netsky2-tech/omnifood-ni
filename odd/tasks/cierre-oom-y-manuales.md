# Cierre: guardrails de memoria para tests + manuales del feature "Factura con nombre"

Sesión de cierre posterior a la entrega de `factura-con-nombre` (main `8858d6c1`, ver
`odd/tasks/factura-con-nombre.md` §9). Dos frentes independientes, ambos nacidos de follow-ups
registrados allí: FU-9 (OOM de WSL2) y la brecha de documentación de usuario del feature.

## 0. Hechos verificados antes de escribir

### OOM (FU-9)

- `.wslconfig` real en `/mnt/c/Users/Octavio Morales/.wslconfig`: `memory=12884901888` (12 GiB),
  `swap=4294967296` (4 GiB). Host: 24 GiB. `nproc` = 12.
- `/var/log/kern.log` registra `oom-kill:constraint=CONSTRAINT_NONE,...,global_oom` y
  `Out of memory: Killed process ... (engram)`. `engram` y `moshi-hook` corren como servicios
  systemd de usuario y son las primeras víctimas: cuando el OOM mata `engram`, se corta la
  plomería de tools de la sesión. Ese es el mecanismo real detrás de los "No result provided".
- jest levanta 11 workers por defecto en 12 núcleos. Cada worker es un proceso node con ts-jest
  (cada uno compila TypeScript en memoria). El peak conjunto cruza el techo de 12 GiB + 4 GiB.
- Receta que funcionó en esta sesión: `npx jest --maxWorkers=2` → 3700/3700 con peak ~1.5 GiB
  usado y ~10 GiB disponibles. `flutter test --concurrency=2` por bloques de directorio.
- `test:db` y `test:e2e` ya usan `--runInBand` en `package.json`; solo `npm test` (y `jest` a
  secas) queda sin tope.
- CI (`admin-backend-ci.yml`) corre `npm test` en `ubuntu-latest`, que tiene 2-4 cores: fijar
  `maxWorkers: 2` en la config es inocuo ahí y deja de depender de que el que corre acuerde del flag.

### Manuales

Brechas confirmadas contra el código entregado:

- `docs/nhilos/manuals/nhilos_pos_user_manual_v0.1.md:212` — el paso 2 de §7.1 describe el campo
  de cliente como "número de Buzzer / Pager o el nombre del cliente **para entrega en barra**".
  Reducento: hoy ese campo es fiscal, no logístico.
- No existe ninguna sección que documente el cobro con nombre ni el RUC/Cédula.
- `apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart:507,535` —
  etiquetas reales: `Nombre Cliente` (hint `Ej: Juan`) y `RUC / Cédula (Opcional)`
  (hint `Ej: 001-120590-0001A o J0310000000001`).
- `apps/pos_app/lib/domain/services/printer/receipt_layout_formatter.dart:523-542` — contrato del
  bloque de cliente impreso: venta anónima → `Cliente: Contado`; con nombre → `Cliente: <nombre>`;
  sólo RUC → **únicamente** `RUC/Cedula: <ruc>` (la pareja contradictoria
  `Cliente: Contado` + RUC está prohibida); `N/A`/blanco cuenta como ausencia.
- `docs/nhilos/manuals/nhilos_pos_user_manual_v0.1.md` §10 (DGI) no dice que el nombre/RUC son un
  **snapshot** que no se retroactiva.
- `docs/nhilos/manuals/nhilos_owner_dashboard_manual_v0.2.md` (en v0.1, líneas 150-151) — §8.2 "Exportación de Datos
  para Contador" no menciona que el libro de ventas ahora tiene columna de cliente.
- `apps/admin_backend/src/modules/sales/services/sales-export.service.ts:955` (CSV `Cliente`),
  `:1049` (xlsx `Cliente / RUC`), `:441-466` (precedencia: snapshot de la factura → nombre del
  catálogo para filas legacy → literal `CONSUMIDOR FINAL`; el UUID interno nunca aparece).
- Divergencia terminológica real y no resuelta: el ticket dice `Contado`, el export del dashboard
  dice `CONSUMIDOR FINAL`. Documentarlas como son, no unificarlas de palabra.

## 1. Decisiones de esta sesión

| # | Decisión | Motivo |
|---|---|---|
| D-1 | Tope de paralelismo se fija **en la config del repo**, no como costumbre de flags | Un lineamiento oral no protege de la próxima sesión que lo olvida |
| D-2 | `.wslconfig` se deja **preparado en el repo**, no se escribe en `/mnt/c` | Aplicarlo requiere `wsl --shutdown`, que mata esta sesión; el dueño elige el momento |
| D-3 | Manuales: texto ahora, **sin capturas falsas** | Generar una imagen y hacerla pasar por screenshot del POS sería documentar algo que no existe |
| D-4 | Voz de los manuales: voseo, imperativo, igual que el resto del documento | Coherencia con el documento que se extiende |

## 2. Tareas

- [x] **T15** — `apps/admin_backend/package.json`: `maxWorkers: 2` en el bloque `jest`.
- [x] **T16** — `AGENTS.md`: sección de límites de recursos para suites locales.
- [x] **T17** — `docs/devex/wsl2-memory-limits.md` + `.wslconfig` propuesto (16 GiB / 8 GiB) con
      procedimiento de aplicación y verificación.
- [x] **T18** — Manual POS: nueva §7.5 "Facturar a nombre de un cliente", corrección del paso 2 de
      §7.1, nota de inmutabilidad en §10, fila de changelog.
- [x] **T19** — Manual Owner Dashboard: columna `Cliente` / `Cliente / RUC` en §8.2, precedencia de
      resolución y divergencia `Contado` vs `CONSUMIDOR FINAL`, fila de changelog.
- [x] **T20** — Verificación: `npm test` verde con el tope puesto, `flutter analyze`, links de
      imágenes de los manuales, y dos PRs (`chore(devex)` y `docs(nhilos)`) con su issue.

## 2b. Correcciones al borrador del writer (registradas porque son el tipo de error que la doc delegada produce)

El writer entregó texto fiel al estilo pero con tres afirmaciones no sustentadas en código. Se corrigieron antes de comitear:

1. "si lo dejás vacío, la venta se trata como **venta al contado**" → colisiona con `Condicion: Contado` del mismo ticket, que es forma de pago, no identidad del comprador. Ahora dice qué se imprime y qué significa esa línea en el comprobante.
2. Mapear `001-…A` a persona y `J031…` a empresa → **falso como regla**: el tenant SOHO es empresa con RUC `0011112930059D`, formato de cédula. Ahora indica copiar el número tal como figura en el documento de la DGI.
3. "suena cuando el pedido está listo" → comportamiento del buzzer inventado, sin fuente. Eliminado.

## 3. Verificación

- `npm test` sin flags con el tope en config: **3700 passed, 8 skipped, 3708 total** (326 suites
  passed + 3 skipped) en 35 s. `jest --showConfig` sin flags reporta `"maxWorkers": 2`, y
  `src/modules/sales` aislado 499/499. Nota de método: la primera vez leí mal esa salida y
  reporté "no imprimió resumen"; el resumen de jest va por stderr y sí estaba, así que el número
  completo sí está medido. y el comando de CI sigue siendo el mismo.
- Manual: cada imagen referenciada debe existir en `docs/nhilos/manuals/images/`.
- Ninguna afirmación del manual puede exceder lo que el código imprime (contrato §0).

## 4. Fuera de alcance

- Screenshots reales del modal con los campos nuevos (requiere el equipo físico / emulador).
- Unificar `Contado` y `CONSUMIDOR FINAL` (decisión de producto, es FU-3).
- Cambiar la memoria del host sin reinicio, o cualquier edición directa de `/mnt/c`.

## 5. Cierre (2026-10-07)

Ambos frentes entregados y verificados sobre el main integrado:

| PR | Merge en main | Issue |
|---|---|---|
| #809 `chore(devex)` | `c61ef6bb` | #807 |
| #810 `docs(nhilos)` | `9cd6dd9c` | #808 |

Verificación post-fusión sobre `origin/main`: `npx jest --showConfig` sin flags reporta
`"maxWorkers": 2`; `src/modules/sales` + `src/modules/customers` **516/516**; `flutter analyze` sin
issues (ningún `.dart` cambió en estos dos PRs, es chequeo de control); los dos manuales contienen
7.5 / nota DGI / columna de cliente exportada.

Rojo preexistente confirmado como tal con el log: `lint-and-test` de #809 falló en
`cash-shift-sync-ingestion.service.db.spec.ts` con `3 failed / 317 passed / 320 total`, idéntico a la
línea base de main. El tope nuevo no lo toca: `test:db` corre con `--config ./test/jest-db.json` y
`--runInBand`, o sea ni lee el bloque `jest` de `package.json`.

El dueño aplicó `docs/devex/wsl2/.wslconfig` (16 GiB / 8 GiB) y reinició el VM con `wsl --shutdown`.

**Post-reinicio verificado:** RAM del VM **15 GiB** y swap **8 GiB** (antes 11 / 4). `nproc` sigue en 12.
Respaldo del valor viejo: `.wslconfig.bak-20261007-184236` (con su mtime original, útil como auditoría de rollback).
`npm test` sin flags: **3700 passed, 8 skipped, 3708 total**, idéntico a antes del cambio — el tope nuevo no alteró
resultados, solo sumó headroom. Servicios del harness: `engram-http.service` y `moshi-hook.service` activos.

Lección de triage: **no existe `engram.service`**. `systemctl --user is-active engram` responde `inactive` porque la
unidad no está encontrada, y eso se lee como "el servicio murió". Listar primero:
`systemctl --user list-unit-files | grep -iE "engram|moshi"` → la unidad real es `engram-http.service`. FU-9 queda
cerrado en las dos capas: config del repo (`maxWorkers: 2`) y techo del host (16 GiB).

FU-7 queda **fuera del alcance de este repo**. El defecto es de `gentle-pi`: `lib/inprocess-reviewer.ts` no tiene rama
para `stopReason === "length"`, así que submissiona JSON truncado como si fuera veredicto y native lo rechaza con un
mensaje que señala el transporte. Está reportado aguas arriba en gentle-shell #1483 / #1607 / #1661 / #1259; el dueño
decidió no abrir duplicado y esperar el update del harness. Mi diagnóstico inicial ("bound fijo en 4672" y "el relay
cachea el artefacto roto") está **refutado** con datos en `odd/tasks/factura-con-nombre.md` §9. El lineage
`review-75107ffde7dd9222` quedó **abandonado** con `operator_disposition` (registro en
`review-transactions/quarantine/review-75107ffde7dd9222-546714406`) en lugar de colgado.

La verificación física del ticket en una terminal SOHO real queda **pendiente hasta la próxima reunión con el
cliente**: los fixtures afirman la geometría byte a byte, pero un fixture no prueba papel. No es un defecto conocido;
es una verificación que acá no se puede hacer.
