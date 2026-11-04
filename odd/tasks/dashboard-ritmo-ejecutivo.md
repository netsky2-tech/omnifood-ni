# Tarea: Dashboard Ejecutivo y Ritmo de Negocio (Issue #960)

Issue: #960 — Dashboard Ejecutivo y Ritmo de Negocio
Status: completed
Driver: Bloque 2 del path de estabilización del producto — Inteligencia operativa y experiencia del dueño

## Specs

- S1: Corrección de arranque — Al ingresar a `/` sin parámetros `startDate` ni `endDate`, el dashboard precarga automáticamente el rango por defecto de los últimos 30 días (`lastDays(30)` inclusive hoy). La gráfica de evolución de ventas y los widgets cargan de inmediato sin requerir clic manual en el selector de fechas.
- S2: Horas pico de demanda (UTC-6 Managua) — Corrección de timezone en backend (`getHourlySales` usa `managuaHourBucket(invDate)` en lugar de `getUTCHours()`). En el frontend (`HourlySalesChart`), identificación visual de los momentos de alta afluencia con discriminación de picos de Almuerzo (12:00-14:00) vs. Cena (19:00-21:00).
- S3: Afluencia semanal consolidada — Visualización del ritmo operativo de ventas consolidado de Lunes a Domingo (`WeeklyRhythmChart`), calculando el volumen y afluencia por día de la semana a partir de la serie temporal del período.
- S4: Monitoreo de cobro en USD en efectivo — Desglose explícito de dólares físicos captados (`cashUsd`) destacado para el arqueo diario y control cambiario en el desglose de pagos.
- S5: Jerarquía visual NHILOS por capas ejecutivas — Organización en 4 niveles:
  1. KPIs arriba (Ventas Netas, Tickets, Ticket Promedio, Margen Bruto, IVA).
  2. Tendencia (Evolución de ventas 2/3 + Atención requerida 1/3).
  3. Ritmo operativo (Horas pico de demanda almuerzo/cena + Afluencia semanal consolidada Lunes a Domingo).
  4. Desglose financiero y comercial (Mix de pagos con monitoreo USD físico, Top productos, Rentabilidad y Flujos de ventas).

## Tasks

- T1: [backend] Corregir timezone en `getHourlySales` a UTC-6 Managua con `managuaHourBucket` y agregar tests unitarios. (linked: S2)
- T2: [frontend] Precargar rango por defecto de 30 días en `DashboardPage` al entrar sin query params y sincronizar estado. (linked: S1)
- T3: [frontend] Enriquecer `HourlySalesChart` con identificación visual de horas pico (Almuerzo vs. Cena) y badges de alta afluencia. (linked: S2)
- T4: [frontend] Crear componente y dominio para Afluencia semanal consolidada (`WeeklyRhythmChart` Lunes a Domingo). (linked: S3)
- T5: [frontend] Incorporar monitoreo de USD en efectivo físico en la tarjeta de mix de pagos / arqueo diario. (linked: S4)
- T6: [frontend] Reestructurar la página de Dashboard respetando la jerarquía visual NHILOS en 4 capas ejecutivas. (linked: S5)
- T7: [qa] Ejecutar suites de tests y verificar accesibilidad, no regresión y contratos de datos. (linked: S1-S5)

## Log

- L1: 2026-09-28 Inicio de implementación del Issue #960 según requerimientos del Bloque 2:
  - Corrección de arranque con rango por defecto 30 días.
  - Monitoreo de USD en efectivo físico para arqueo.
  - Horas pico de demanda UTC-6 Managua (almuerzo vs cena).
  - Afluencia semanal consolidada (lunes a domingo).
  - Jerarquía visual NHILOS por capas ejecutivas.
- L2: 2026-09-28 T1 completada: corrección de timezone en `sales-reports.service.ts` usando `managuaHourBucket`. Cobertura en `sales-reports-timezone.spec.ts`.
- L3: 2026-09-28 T2 completada: precarga de rango por defecto de 30 días en `DashboardPage` y sincronización con searchParams.
- L4: 2026-09-28 T3 completada: discriminación visual de picos de Almuerzo vs. Cena con badges en `HourlySalesChart` y cálculo en `chart-domain.ts`.
- L5: 2026-09-28 T4 completada: implementación de `WeeklyRhythmChart` y agregador de Lunes a Domingo en `chart-domain.ts`.
- L6: 2026-09-28 T5 completada: tarjeta de monitoreo de dólares físicos en caja (`cashUsd`) y badge de arqueo en `PaymentMixChart`.
- L7: 2026-09-28 T6 completada: reorganización de `PerformanceBand` en capas ejecutivas (Capa 2: Tendencia, Capa 3: Ritmo Operativo, Capa 4: Desglose Comercial y Financiero).
- L8: 2026-09-28 T7 completada: 222 tests ejecutados y aprobados (43 en backend, 179 en frontend) sin regresiones.
