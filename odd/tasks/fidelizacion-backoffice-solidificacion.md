# Fidelización (Loyalty) Backoffice: Solidificación Integral y Estándar NHILOS

Documento de seguimiento ODD para la remediación integral del módulo de Fidelización (Loyalty) en el Backoffice (`owner_dashboard`) y Backend (`admin_backend`).

## Specs

- **S1**: Eliminar el error 400 de creación de programa (`eligibility_rule must be an object`). `CreateLoyaltyProgramDto` debe marcar `eligibility_rule` como opcional y `loyalty.service.ts` debe aplicar fallback a `{}` si viene omitido. Se debe verificar bajo el `ValidationPipe` real de producción (`whitelist: true, forbidNonWhitelisted: true, transform: true`).
- **S2**: `ProgramForm` y `RewardForm` en el dashboard deben eliminar completamente el "Modo JSON avanzado" (textarea y toggle). La interfaz debe ser 100% guiada y amigable para el operador de negocio (§17.1 NHILOS).
- **S3**: `ProgramForm` debe emitir siempre el payload canónico completo incluyendo `eligibility_rule: {}` y debe soportar fechas de vigencia (`starts_at` y `ends_at`) con validación de coherencia temporal (`starts_at < ends_at`).
- **S4**: Las tarjetas de programa en `/loyalty` deben mostrar un resumen legible en lenguaje de negocio de la regla de acumulación configurada (§7.3 NHILOS), en lugar de sólo el tipo técnico y la versión.
- **S5**: Los badges de estado en `/loyalty` deben seguir la semántica de color NHILOS (§26): `INACTIVE` debe ser neutro (`secondary` u `outline`), nunca `destructive` (rojo).
- **S6**: La desactivación de programas y recompensas activas debe exigir confirmación explícita con diálogo de advertencia de impacto (§15 NHILOS) para prevenir toques involuntarios.
- **S7**: Los controles de mutación en `/loyalty` deben respetar el rol del usuario (§9 NHILOS): si el rol no es `OWNER`, los botones de crear, editar, activar y desactivar deben deshabilitarse con explicación o no presentarse.
- **S8**: El diálogo de ajuste manual de puntos en `CustomerLoyaltyProfile` (`/customers?tab=loyalty`) debe permitir seleccionar a qué programa de lealtad aplica el ajuste y enviar `loyalty_program_id`, garantizando que la proyección `customer_loyalty_account_projection` se actualice en la base de datos y se refleje en el terminal POS.
- **S9**: La página `/loyalty` debe ofrecer navegación o enlace visible hacia la pestaña de Fidelización de Clientes (`/customers?tab=loyalty`) para evitar callejones sin salida (§10 NHILOS).
- **S10**: Pruebas automatizadas completas: DTO spec en backend con `ValidationPipe` real, y pruebas unitarias/integración actualizadas en frontend sin mockeos engañosos de contratos.

## Tasks

- [x] T1: Backend DTO & Service: hacer `eligibility_rule` opcional en `CreateLoyaltyProgramDto`, fallback a `{}` en servicio, y suite de pruebas `loyalty-program.dto.spec.ts` con `ValidationPipe` de producción. (Vinculado a S1, S10) [commit `4a467588`]
- [x] T2: Dashboard Forms: remover "Modo JSON avanzado" de `ProgramForm` y `RewardForm`, agregar campos de vigencia (`starts_at`, `ends_at`) en `ProgramForm`, y emitir payload canónico. (Vinculado a S2, S3) [commit `4a467588`]
- [x] T3: Customer Loyalty Profile: agregar selector de programa en `AdjustDialog` y pasar `loyalty_program_id` al backend para actualizar la proyección de balance. (Vinculado a S8) [commit `4a467588`]
- [x] T4: Experiencia NHILOS en `/loyalty`: resumen comercial en tarjetas de programa, badge inactivo en gris neutro, diálogo de confirmación para desactivación, control de roles y enlace a saldos de clientes. (Vinculado a S4, S5, S6, S7, S9) [commit `4a467588`]
- [x] T5: Verificación integral y actualización de suites de pruebas en frontend y backend. (Vinculado a S10) [commit `4a467588`]

## Log

- **L1**: El usuario reporta el error en producción al crear un programa de lealtad: `{"message": ["eligibility_rule must be an object"], "error": "Bad Request", "statusCode": 400}`. Instrucción: "En lugar de centrarnos en ese error si, veamos le feat completa, que cumpla con nhilso standard experience backoffice, y que todos los scenarios, edge cases y funcionalidades funciones de punta a punta, no es posible que incluso con testing, en production me tope con este error". Instrucción adicional: "en modo avanzado JSON lo quitemos, son metodologías técnicas que no suele usar nuestros usuarios finales. Procedamos".
