# Archive: Post-Archive Identity Audit Quality Hardening

## Goal
Cerrar deuda de calidad remanente del change previo de IAM/auditoría, con foco en higiene de tests backend, reducción de hotspots de lint/tipado, mejora de cobertura en rutas críticas de auth, y eliminación del ballast legacy `User.pin_hash`.

## Summary of Work
- **PR1 (higiene/lint base)**:
  - Se estabilizó teardown de tests y se mitigó la ruta real del warning de `pg` (sin supresión por flags).
  - Se reforzó tipado estricto en specs/controladores de identidad.
- **PR2 (coverage + calidad de tests)**:
  - Se fortalecieron escenarios críticos de `auth.service` (roles/scope/continuidad/mascarado).
  - Se eliminó test trivial de entidad y se reemplazó por assertions de mapeo con valor real.
- **PR3 (legacy removal)**:
  - Se removió `pin_hash` del `User` entity.
  - Se agregó migración reversible para drop/re-add de la columna (`up/down`) con pruebas explícitas.
- **Micro-slice final**:
  - Se cerraron errores ESLint pendientes en `user.service.spec.ts`.
  - Se normalizó formato en app module files y se elevó cobertura de `auth.service.ts`.

## Final Verification State
- **Verdict**: `PASS WITH WARNINGS`
- **Closure readiness**: `closure-ready`
- **Tasks**: 15/15 completas
- **Spec compliance**: 7/7 compliant
- **Build/Type checks**: `npm run build` ✅, `npx tsc --noEmit` ✅

## Accepted Warnings at Closure (Non-blocking)
1. `apps/admin_backend/src/core/app/app.module.spec.ts` conserva 4 assertions débiles (`toBeDefined`) de carácter estructural.
2. `apps/admin_backend/src/modules/identity/services/user.service.ts` mantiene branch coverage bajo (~45%), aunque cobertura de líneas y comportamiento crítico requerido están cubiertos.

## Why Closure Is Acceptable
El objetivo de este change era hardening de calidad y limpieza de deuda puntual en identidad/auditoría. Ese objetivo se cumplió: se eliminaron bloqueadores de lint/higiene, se elevó cobertura crítica de auth a niveles altos, y se retiró la compatibilidad legacy de `User.pin_hash` con migración reversible y verificación.

Los warnings restantes no comprometen conformidad funcional ni seguridad del alcance definido; son mejoras incrementales recomendadas para un siguiente ciclo de calidad.

## Key Decisions
- Se decidió remover `User.pin_hash` en esta etapa temprana de desarrollo para simplificar el modelo y reducir riesgo de rutas legacy inconsistentes.
- Se priorizó corrección estructural de warnings (`pg` bootstrap/test lifecycle) sobre silenciamiento por configuración de runner.
- Se mantuvo estrategia de slices encadenados con presupuesto de revisión acotado por PR.

## Next Steps
1. Reemplazar assertions `toBeDefined` restantes en `app.module.spec.ts` por validaciones de comportamiento.
2. Subir branch coverage de `user.service.ts` en paths de error/edge adicionales.
3. Iniciar el siguiente change SDD orientado al set extendido de escenarios PRD (FAIL/PARTIAL -> PASS) ya identificado en `docs/Scenarios`.
