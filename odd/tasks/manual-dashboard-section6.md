# ODD: Manual Owner Dashboard — sección 6 paso a paso + refresco de capturas dsh

**Rama:** `docs/dashboard-manual-section6` (desde `main` 601edc90) · **Worktree:** `/home/octavio_morales/omnifood-ni-modifiers-web-e2e`
**Alcance (elegido por el usuario):** reescribir la sección 6 (Modificadores) del manual como walkthrough paso a paso con captura por paso, Y re-capturar las 9 imágenes `dsh_*` existentes contra el estado actual. El resto del manual no se toca salvo versión.
**Por qué ahora:** el flujo de modifiers quedó verificado y mergeado (features `0cad99c3`…`601edc90`); las capturas actuales (`dsh_07/08/09`) son del 7/10, anteriores al fix del contrato decimal.

## Contexto y decisiones
- Manual: `docs/nhilos/manuals/nhilos_owner_dashboard_manual_v0.2.md` (renombrado desde v0.1; voseo, NH-MAN-DSH-001, CLIENT-READY; §6 reescrita en esta feature).
- Capturas: `docs/nhilos/manuals/images/dsh_NN_desc.png` (convención existente; dsh_01..09 se REEMPLAZAN con mismo nombre, walkthrough agrega dsh_10+).
- **Tenant de captura: `soho`** (no el fixture) para consistencia con el manual (58 productos SOHO, grupos Leche/Endulzante/Extras). Login `admin@soho.com` / `C0ntr4sen4` / `tenantSlug: soho` → `http://soho.localhost:5174`.
- **Cambio de entorno (DB dev local):** el hash del owner de SOHO no matcheaba password conocido → `UPDATE users SET password_hash` (bcrypt 10) a `C0ntr4sen4` en la DB `omnifood` de este host. Solo DB dev, cero cambios de repo.
- Stack: backend `:3300` (CORS con `soho.localhost:5174`) + vite `:5174`, logs `/tmp/mwe-backend.log`, `/tmp/mwe-vite.log`.
- Método: spec Playwright **live** dedicada (gate propio `NHILOS_MANUAL_CAPTURE=1`, script `test:e2e:capture` — NO corre en la suite live normal) que recorre el flujo real y escribe los PNG en `docs/nhilos/manuals/images/` — reutilizable para futuras actualizaciones del manual ("aprovechando el flujo de e2e").
- Escritura: un solo writer (superficies: spec + manual), capturas correrán después, verificación final serial.

## Tareas
- [x] **T1** Rama + credenciales soho + stack real
- [x] **T2** Writer: spec Playwright live de capturas (`apps/owner_dashboard/e2e/manual-screenshots.live.spec.ts`, 8 tests seriales, cleanup inclusive) + reescritura de la sección 6 a walkthrough paso a paso (voseo, 8 pasos, refs dsh_07..14) + bump `Versión: 0.2`
- [x] **T3** Correr la spec → 14 PNG escritos/reemplazados en `docs/nhilos/manuals/images/` (todos 1440×900)
- [x] **T4** Revisión del manual contra las imágenes reales + fix del defecto D-2 (ver Hallazgos): labels de UI verificados contra código, 8 capturas §6 revisadas visualmente, §3/§5 alineado a capturas nuevas
- [x] **T5** Verificación (delegate `gentle-ai-verify`, 7 checks): refs 14/14 resuelven · 14 PNG 1440×900 · 0 orphans (38 PNG = 14 dsh + 24 pos) · tsc 0 · oxlint 0 · git status solo artefactos esperados · refs `manual_v0.1` corregidas (CD-12 registry + cierre-oom + este doc)
- [x] **T6** Commits convencionales: `7556739b` (spec+script), `1b78a261` (manual v0.2 + imágenes), `4a1e37b7` (ODD)
- [x] **T7** Revisión nativa: candidato = rama como PR slice (`baseRef=601edc90`, committedOnly) · lineage `review-3d8f0ac96df7abae` · medium tier (1 lente `review-reliability`, riesgo `executable_change` por el spec) · **APPROVED** + authority burned (`gentle-ai.review-acknowledged/v1`, target `f4299be8`, revision `2aa5251d`) · 4 hallazgos advisories informativos (R3-A WARNING spec:404-405; R3-B/C/D SUGGESTION spec:37-39 / 473-596 / 122-131) — ninguno bloqueante, sin corrección ofrecida
- [x] **T8** Reporte entregado (primera ronda)

### Ronda 2 (feedback del usuario, incorporado al alcance)
- [x] **T9** Fix de renderizado: `$` escapado en §3/§8 (líneas 42, 49, 183) — validado: único `$` sin escapar es el de la línea 75 dentro de code span (protegido)
- [x] **T10** Terminología: `allow_quantities`, «Price Delta», params `min`/`max`, «Sync Freshness» eliminados — grep final: 0 términos restantes; conservado copy literal UI en español («Permitir cantidades», «Precio adicional», «Mínimo/Máximo de selección»)
- [x] **T11** §4.1 reescrita como «Reportes de Ventas» con las 6 pestañas reales (scout `mv1fkvkt-8-vihd`, path:line) + Nota de ausencia de lista cronológica (diseño: factura-level → Fiscal › Exportaciones); §4.2 reubican en **Fiscal › Anulaciones** con columnas reales (Factura/Cajero/Total/Motivo/Fecha) y sin claim de PIN de supervisor; alt de `dsh_03` corregido; changelog v0.2 ampliado
- [x] **T12** Inventario: 33→38 PNG (L307/L336), Backoffice 9→14, fila de sesión `2026-10-09` agregada, peso ~3.5→~4.1 MB y rango 25–170 KB; las 2 menciones restantes a 33 son históricas fechadas (método del 10-08 y «contenía» en pasado)
- [x] **T13** Verificación inline (greps de `$`/términos/§4 leído de vuelta + conteos inventario) + commits `efd5c9cd` (manual+inventario) y `2ef02fac` (ODD ronda 2) + revisión nativa del candidato ronda 2

### Ronda 3 (feedback del usuario: follow-ups alcanzables + dsh_02 con «Este mes»)
- [x] **T14** Evidencia (inline): preset «Este mes` en `date-range-picker.tsx:19` (trigger `aria-label="Seleccionar rango de fechas"`, presets botones plain-text); datos oct-2026 soho = **28 facturas / C$ 4,571.00**; páginas existentes `/inventory` (h1 «Inventario»), `/recipes` (h1 «Recetas y BOM»), `/users` (h1 «Gestión de Usuarios» + card «Permisos granulares» `users-page.tsx:168`); estado SOHO: recetas 0, kardex 0, usuarios 2, productos 58; **sin ruta `devices`** (grep «Dispositivos»/fleet sin hits) → §10 diferida; **gap §9**: texto «Ajustes > Usuarios y Permisos» vs ruta real `/users` (sidebar «Administración > Usuarios»)
- [x] **T15** Spec: dsh_02 con preset «Este mes» (asserts: rango del mes, `4,571` visible, «Evolución de ventas» visible y placeholder de 2+ días ausente) + 3 capturas nuevas dsh_15 Inventario / dsh_16 Recetas y BOM / dsh_17 Gestión de Usuarios → **RED** (locator multi-match `4,571.00` en 2 tarjetas, mes ya filtraba ✓) → **GREEN 8/8** (32.6s)
- [x] **T16** Manual: §3 reescrito con datos reales del mes (C\$ 4,571.00 / 28 tickets / C\$ 163.25 / gráfico 1–9 oct / Americano 8oz 14 u C\$ 1,311.00 28.7% / Atención Requerida 4 alertas) + instrucción del preset; §7 con dsh_15/16 (estado Día 1); §9 ruta real «Administración > Usuarios» + dsh_17 + PIN 4-8 dígitos verificado en `user-dialog.tsx:188` + roles visibles; changelog ampliado
- [x] **T17** Inventario 38→41 (L307/L336), Backoffice 14→17, fila de sesión nueva para `dsh_02` recapturado + `dsh_15/16/17`, peso ~4.4 MB (rango 25–170 y 2>180 KB siguen ciertos) · Verificación: 17 refs resuelven · 0 `$` sin escapar · 0 términos ingleses · 0 orphans (41 PNG) · tsc 0 · oxlint 0 · 1440×900
- [ ] **T18** Commits ronda 3 + revisión nativa (spec = cambio ejecutable → candidato real)

### Follow-up diferido (acordado con el usuario)
- Ronda 3 resuelve los alcanzables: §7 (rutas `/inventory`, `/recipes` existen) y §9 (`/users` existe) reciben capturas nuevas.
- **§10 Flota: diferida por decisión del usuario** (confirmado sin evidencia de feature: no hay ruta `devices` ni código «Dispositivos» en el dashboard).
- §11 Asistencia: sin captura posible (canales estáticos, sin página).

## Hallazgos
- **D-2 (corregido): `dsh_09` obsoleto por el reuse-skip del spec.** La rama de reuse saltaba la captura del diálogo de creación, dejando para siempre una imagen de desarrollo cuyo fondo mostraba la fila «Jarabes» ya existente — contradiciendo el Paso 1 ("diálogo todavía vacío" sobre lista sin el grupo). Evidencia RED: corrida completa 8/8 con md5 de `dsh_09` sin cambio (`e957673c…`). Fix (test-first): capturar `dsh_09` en TODA corrida bajo filtro «Activos» con aserción `toHaveCount(0)` de ausencia del grupo (y desactivación previa si una corrida interrumpida lo dejó activo, esperando que el toast salga del frame). GREEN reuse: `dbfc272a…`; GREEN fresh: byte-idéntico (determinismo). Se eliminó también la constante `SLUG` sin uso (oxlint).
- Backend **no tiene hard-delete** de grupos (soft-delete por diseño, disciplina estilo DGI): higiene final del tenant hecha por SQL directo. Estado final: tenant `soho` con exactamente Leche/Endulzante/Extras activos y **cero filas Jarabes** (grupo, opciones y adjuntos eliminados) → futuras corridas de captura arrancan en estado fresh.
- `dsh_10` documenta honestamente el flujo create-then-edit: el diálogo de creación NO tiene editor de opciones (gate `isEditing`), las opciones se agregan reabriendo en edición — el manual lo explica en una nota «Importante».
- **Gap doc-vs-UI (follow-up, fuera de alcance):** §4.1 describe «Historial de Comprobantes» como lista cronológica con drill-down; la UI actual de Ventas tiene pestañas (Resumen, Ventas por Hora, Top Productos, …) y el writer no encontró esa lista. Requiere revisión humana (puede existir en otra ruta).
- §3/§5: los números de ejemplo se reescribieron para calzar con las capturas nuevas (día sin ventas: C$0.00 / 0 tickets / «Sin base comparable»; «Atención Requerida» = 1 voucher C$50 + 1 override C$220; terminal `S23TEST`; descuadres -C$90/-C$270).
- El inventario de medios que afirma "33 PNG" queda desactualizado (pasa a 38): actualizar en su doc de auditoría, no en este cambio.

## Evidencia de comandos
- `UPDATE users … password_hash` (DB dev) → login 201 OWNER, 3 grupos soho: Leche 1×4, Endulzante 0×3, Extras 0×3.
- RED: `npm run test:e2e:capture` 8/8 con md5 `dsh_09` sin cambio (`e957673c…`). GREEN reuse: 8/8, `dbfc272a…`. GREEN fresh (tras psql-delete de Jarabes): 8/8, `dbfc272a…` byte-idéntico.
- `npx tsc --noEmit` 0 · `npx oxlint e2e/manual-screenshots.live.spec.ts` 0 tras eliminar `SLUG` sin uso.
- Limpieza final BD: tenant `soho` = Leche/Endulzante/Extras activos, 0 filas Jarabes.
- Verify battery: 6/7 PASS + CHECK 5 corregido en el momento (3 paths actualizados).
- Revisión nativa: forecast `pi_host_relay`/1 run corrido 2× — 1ª admisión rechazada por campo extra `evidence_extra` en el payload del reviewer (slot no consumido); payload movido a `/tmp/gentle-rejected-backup/` → forecast→ack fresco → APPROVED → ack completado vía facade. Commits cubiertos: `7556739b`, `1b78a261`, `4a1e37b7`.
- Revisión nativa ronda 2: candidato `efd5c9cd`+`2ef02fac` (baseRef `b331cf4f`) · lineage `review-cfe45f1a347f6598` · **low tier, `non_executable_only`, 0 lentes** → aprobación nativa inmediata en START + ack quemado (`gentle-ai.review-acknowledged/v1`, target `4b1be6ef`, rev `27f90117`). `b331cf4f` (evidencia ronda 1) y `2ef02fac` (tracking ronda 2) quedan como docs de cierre posteriores a sus burns, patrón de la feature 1.
