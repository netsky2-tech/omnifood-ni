# Feature: Configuración de Políticas de Arqueo Ciego, Corte X y Anulaciones en Owner Dashboard y Admin Backend

- **Módulos:** `apps/admin_backend` y `apps/owner_dashboard`
- **Estado:** Implementado, Verificado y Probado
- **Fecha:** 2026-11-03

## Specs

### S1: Extensión del Contrato y DTO en Admin Backend
En `apps/admin_backend/src/modules/supervision/contracts/supervision-policy.contract.ts`:
- Interfaz `SupervisionPolicy` extendida con:
  - `readonly blindCountEnabled: boolean;`
  - `readonly supervisorRequiredForPartialXReport: boolean;`
  - `readonly supervisorRequiredForVoid: boolean;`
- En `defaultSupervisionPolicy(isFoodParkQsr: boolean)`:
  - `blindCountEnabled: true`
  - `supervisorRequiredForPartialXReport: !isFoodParkQsr`
  - `supervisorRequiredForVoid: !isFoodParkQsr`
- En `parseSupervisionPolicy(raw: unknown)`:
  - Lee los 3 flags booleanos con degradación segura a `false` para compatibilidad con payloads legacy.
- En `supervisionPolicyToJson`:
  - Serializa los 3 flags en el JSON canónico ordenado que se persiste en `system_parameters_config`.
En `apps/admin_backend/src/modules/supervision/dto/supervision-policy.dto.ts`:
  - Agregados campos con `@IsOptional()` e `@IsBoolean()`.

### S2: Tipos y Esquema Zod en Owner Dashboard
En `apps/owner_dashboard/src/features/supervision/types.ts`:
- `SupervisionPolicy` y `supervisionPolicySchema` actualizados con los 3 campos obligatorios de UI.
- `resolveSupervisionPolicy` adaptado para leer los 3 valores desde el payload con fallback seguro a la política por defecto.

### S3: Switches en `SupervisionPolicyCard`
En `apps/owner_dashboard/src/features/supervision/supervision-policy-card.tsx`:
- Nuevo fieldset **"Control de caja y anulaciones"**:
  1. `blindCountEnabled`: "Ocultar saldos esperados en el arqueo (Arqueo ciego)" — Los cajeros ven saldos ocultos (••••••) en pantalla y deben contar el efectivo físico a ciegas al cerrar turno.
  2. `supervisorRequiredForPartialXReport`: "Exigir PIN de supervisor para lectura parcial (Corte X)" — Evita que los cajeros consulten el acumulado de ventas antes del cierre para anticipar el saldo esperado.
  3. `supervisorRequiredForVoid`: "Exigir PIN de supervisor para anular facturas" — Solicita autorización obligatoria de un supervisor mediante PIN para cancelar cualquier factura emitida.
- Conectados a react-hook-form, mutaciones PUT y botón de Restablecer.

### S4: Verificación con Tests
- Backend: `apps/admin_backend/src/modules/supervision/contracts/supervision-policy.contract.spec.ts` y `supervision-policy.service.spec.ts` pasando 22/22 tests Jest.
- Dashboard: `apps/owner_dashboard/src/__tests__/supervision-policy-card.test.tsx` pasando 9/9 tests Vitest con Testing Library simulando interacciones DOM completas con `userEvent`.
- E2E Playwright: Creado `apps/owner_dashboard/e2e/supervision-policy.spec.ts` con cobertura de navegación, conmutación de los 3 switches y aserción de payload PUT.

## Tasks
- [x] T1: Extender `supervision-policy.contract.ts` y DTOs en `apps/admin_backend`.
- [x] T2: Ejecutar y validar tests unitarios de `admin_backend`.
- [x] T3: Extender tipos, Zod schema y `resolveSupervisionPolicy` en `apps/owner_dashboard`.
- [x] T4: Agregar los switches en `SupervisionPolicyCard` y conectar al formulario.
- [x] T5: Actualizar y verificar `supervision-policy-card.test.tsx` en `owner_dashboard` y escribir spec Playwright `e2e/supervision-policy.spec.ts`.

## Log
- L1: 2026-11-03 — Inicialización tras solicitud del usuario para conectar Dashboard y Backend.
- L2: 2026-11-03 — Implementación en backend completada y verificada (22 tests verdes).
- L3: 2026-11-03 — Implementación en dashboard completada con nuevo fieldset accesible y verificada (9 tests verdes).
- L4: 2026-11-03 — Documentado spec Playwright `e2e/supervision-policy.spec.ts`.
