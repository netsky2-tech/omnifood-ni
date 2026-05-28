# Archive: Gestión de Identidad, Acceso y Auditoría

## Goal
Cerrar el change `prd_gestion_identidad_acceso_y_auditoria` con cumplimiento funcional de los escenarios de identidad/auditoría definidos en OpenSpec, manteniendo foco offline-first y evidencias trazables para cierre.

## Summary of Work
- **Foundation**: Se incorporó `SecurityProfile` como agregado de credenciales (PIN/TOTP) y se aisló la lógica de autenticación local/offline.
- **Forensic Audit**: Se implementó y endureció la cadena forense (`sequence_no`, `prev_hash`, `entry_hash`) con validaciones de continuidad, semántica append-only y remediaciones de migración no destructivas.
- **Cash Models**: Se formalizó `tipo_modelo` (`CAJA_CENTRAL`, `CARTERA_MESERO`) con persistencia, migración de sesiones activas legadas y pruebas de comportamiento.
- **Runtime Security Flows**: Se cableó `SupervisorOverrideModal` en flujo restringido real (cierre de caja) con pruebas runtime para PIN y TOTP offline.
- **Stability/Verification Remediations**: Se cerraron slices R1–R26, incluyendo regeneración Floor/build_runner y correcciones mínimas asociadas al codegen.

## Final Verification State
- **Verdict**: `PASS WITH WARNINGS`
- **Spec compliance**: **8/8 COMPLIANT**, 0 partial, 0 failing
- **Tasks**: **43/43 completas**
- **TDD compliance**: **6/6 confirmado**

## Accepted Warnings at Closure (Non-blocking)
1. Baseline de lint backend todavía ruidosa (issues heredados de ESLint/Prettier en módulo identity).
2. Warnings de higiene de tests backend (`pg` deprecations/open handles) aún presentes.
3. Cobertura por archivos cambiados desigual (especialmente en orquestación UI/VM POS y `auth.service.ts`).
4. `User.pin_hash` permanece como campo nullable legado de compatibilidad (sin dependencia runtime de negocio en esta entrega).

## Why Closure Is Acceptable
Este cierre es aceptable porque los criterios funcionales del change quedaron satisfechos con evidencia ejecutable y reproducible: suites backend/POS en verde, escenarios OpenSpec de identidad y sales-core completos, y brecha final de TOTP runtime cerrada en el micro-slice R26.

Los warnings remanentes son deuda de calidad/proceso, no bloqueadores de conformidad funcional del change.

## Key Closure Decisions
- Se priorizó cierre funcional verificable del dominio IAM/auditoría sobre limpieza total de deuda histórica de lint/cobertura.
- Se mantuvo compatibilidad controlada (`User.pin_hash` legacy) para no romper continuidad operativa durante transición.
- Se consolidó política de auditoría forense inmutable con continuidad robusta y remediación no destructiva de historial.

## Next Steps (Post-Archive)
1. Abrir change nuevo orientado a sign-off del set extendido PRD (`docs/Scenarios/gestion_identidad_acceso_auditoria.md`).
2. Planificar hardening de calidad transversal: reducción de baseline lint, mejora de cobertura en archivos críticos y limpieza de warnings de runner backend.
3. Definir ventana para retiro formal del ballast legado `User.pin_hash` cuando la compatibilidad operativa lo permita.
