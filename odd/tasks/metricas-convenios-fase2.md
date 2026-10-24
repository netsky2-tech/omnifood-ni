# Metricas de Convenios y Clientes Corporativos — Fase 2 (Nivel 2)

Feature: Analisis de comportamiento y consumo por empresa: top productos consumidos, distribucion por dia de la semana y horas pico de afluencia de convenios en el Owner Dashboard.
Documento base: odd/tasks/metricas-convenios-fase2.md

## Specs

- S1: El backend debe extender `CorporateCustomerSummaryDto` y `CorporateMetricsReportDto` en `sales-reports.dto.ts` con:
  - `topProducts: CorporateCustomerProductDto[]` (producto, cantidad, venta neta, descuento) por empresa y global.
  - `timePattern: CorporateCustomerTimePatternDto` (distribucion por dia de semana 0..6 y horas pico en Managua) por empresa y global.
- S2: `SalesReportsService.getCorporateMetrics` debe procesar los items de facturas corporativas para acumular:
  - Ranking de productos por cantidad vendida y venta neta.
  - Distribucion de visitas y venta neta por dia de la semana (Lunes a Domingo).
  - Horas pico de consumo (con conversion a America/Managua UTC-6).
  - Agregados tanto por empresa individual como consolidados del periodo.
- S3: Pruebas unitarias en `sales-reports.service.spec.ts` y pruebas E2E en `test/sales/sales-reports.e2e-spec.ts` validando la agregacion de productos y patrones de afluencia por empresa.
- S4: Frontend: Actualizar tipos en `corporate-metrics-api.ts`.
- S5: Frontend UI:
  - Incorporar en `CorporateMetricsTab` un bloque de analisis de consumo:
    - Widget de Top Productos Mas Consumidos en Convenios.
    - Widget de Afluencia Semanal (Lunes a Domingo) y Horas Pico.
  - Fila expandible o modal/drawer en la tabla de empresas para ver el detalle especifico de consumo de cada empresa aliada.
- S6: Validacion y pruebas:
  - Tests unitarios de backend y frontend pasando.
  - Compilacion de Vite sin errores.

## Tasks

- T1 [S1, S2] Backend: Extender DTOs y calcular top productos y patrones de tiempo en `SalesReportsService`.
- T2 [S3] Backend Tests: Actualizar pruebas unitarias y E2E de backend.
- T3 [S4] Frontend API: Actualizar tipos en `corporate-metrics-api.ts`.
- T4 [S5] Frontend UI: Construir widgets de Top Productos y Afluencia, mas detalle por empresa en `CorporateMetricsTab`.
- T5 [S6] Verificacion: Ejecutar suites de tests y compilacion de `owner_dashboard`.

## Log

- L1: Peticion original del usuario: implementar Nivel 2 (productos/categorias top por empresa y patrones de dias/horas).
- L2: Aprobacion de inicio de Fase 2.
