# Batch 6 — Spanish user manual (B6a) + technical manual (B6b)

Status: IN PROGRESS · Branch: `docs/batch6-manuals` · Worktree: `batch6-manuals` · Issue: #589
Basis: D-5 / DT 09-2007 ordinal SEGUNDO 1.5. Deliverables, not code.

## Audience & language

- **B6a `docs/manuals/manual-usuario.md`** — the client's staff (SOHO first). Neutral Spanish, **usted**, no voseo. Task-oriented: what a cashier/owner does day to day.
- **B6b `docs/manuals/manual-tecnico.md`** — auditors (DGI-facing) and maintainers. Spanish, precise; describes controls and states truthfully.

## Ground rules (definición ≠ feature)

Document ONLY shipped behavior on main. Explicitly NOT documented as existing: blind cash count (#529, parked), server-side kardex compensation (#519), cloud projection of remaining fiscal fields (#551), per-terminal series (deferred, D-21 note), portal features. Where a known gap exists, the manual may state the safe practice instead of inventing a feature.

## Content plan

### B6a user manual
1. Inicio de sesión y apertura de turno (PIN, roles).
2. Venta: cobro, pagos mixtos, propina/split (what exists), impresión.
3. Numeración fiscal para el operador: el consecutivo avanza solo; estados "Sin configurar" y mensajes nombrados; nunca reutiliza números.
4. Anulación (D-11/D-15): quién puede, turno vigente, mensaje de guía; mismo día.
5. Reimpresión (qué marca lleva el papel).
6. Notas de crédito: SOLO por backoffice (D-14) — el POS no las emite.
7. Configuración del perfil de negocio: código de autorización DGI (formato = el de la carta), fechas emisión/vencimiento, aviso de vencimiento a 30 días, prefijo opcional (vacío = consecutivo numérico).
8. Contingencia offline: la venta funciona sin internet; qué se sincroniza después.
9. Qué hacer si algo falla: apagar/encender no repara la secuencia (D-6); llamar al procedimiento de incidente (link).

### B6b technical manual
1. Descripción general del sistema (POS Flutter/Floor offline-first; backend NestJS/PostgreSQL; dashboard React; sync eventual).
2. Modelo de numeración fiscal (D-21): código de autorización + fechas + consecutivo inicial/actual; sin rango; numeración consecutiva, progresiva, sin huecos; folio plano vs prefijo.
3. Controles (D-16/D-18/D-1): estados fail-closed nombrados (`FISCAL_SEQUENCE_UNCONFIGURED`, `FISCAL_SEQUENCE_RECOVERY_REQUIRED`), nunca defaults inventados, cursor nunca retrocede.
4. Reemplazo de terminal (D-6) y procedimiento de incidente.
5. Seguridad: multi-tenant con RLS PostgreSQL, users FORCE RLS, roles/permisos, auditoría.
6. Datos: SQLite local como fuente de verdad; sync event-driven; snapshot fiscal versionado (revision/fingerprint).
7. Respaldo y recuperación (what exists: staging runbook, incident procedure — be honest about limits).
8. Anexos: referencias a directivas D-1..D-21 y docs/operations.

## Sources

- odd/plans/founder-pilot-execution-plan.md (D-1..D-21)
- docs/operations/pilot-terminal-incident-procedure.md, q80-runbook.md, staging-cutover.md
- docs/client-onboarding/SOHO_REQUISITOS_PUESTA_EN_MARCHA.md
- The #554 D-21 model (this branch's parent series, PR #588)

## Units

1. **U-B6a**: user manual drafted + parent read-through.
2. **U-B6b**: technical manual drafted + parent read-through.
3. PR closing #589 (type:docs).
