# Metricas de Convenios y Clientes Corporativos — Fase 1 (Nivel 1)

Feature: Seguimiento y analitica mensual de compras por empresa, descuentos otorgados por convenio, ticket promedio y KPIs corporativos en el Owner Dashboard.
Documento base: odd/tasks/metricas-convenios-fase1.md

## Specs

- S1: El backend debe definir los DTOs `CorporateMetricsQueryDto`, `CorporateCustomerSummaryDto`, `CorporateMetricsKpisDto` y `CorporateMetricsReportDto` en `apps/admin_backend/src/modules/sales/dto/sales-reports.dto.ts` soportando filtrado por `startDate` y `endDate`.
- S2: `SalesReportsService.getCorporateMetrics(tenantId, query)` debe calcular con timezone bounds:
  - Facturacion bruta (subtotal + descuentos de promocion)
  - Descuentos de convenio aplicados (extraidos de `invoice_items.discount_origin->>'promotion'` en facturas no canceladas)
  - Facturacion neta (total cobrado)
  - Tasa efectiva de descuento (`(descuento / bruta) * 100`)
  - Conteo de tickets y ticket promedio por empresa
  - Cruce con `customers` (`name`, `tax_id`, `customer_type`) y `promotions` (`code`, `name` donde `target_customer_id = customer.id`)
  - KPIs globales del periodo (Total facturado corporativo, total descuentos, tickets corporativos, ticket promedio corporativo).
- S3: `ReportsController` debe exponer `GET /sales/reports/corporate-metrics` con guardas de autenticacion, roles (`OWNER`, `MANAGER`), interceptor RLS y limitador de tasa de reportes.
- S4: Pruebas unitarias en `sales-reports.service.spec.ts` para `getCorporateMetrics` validando calculo de metricas, exclusion de canceladas y redondeo a 2 decimales.
- S5: En `apps/owner_dashboard`, implementar servicio API y hook React Query `useCorporateMetrics(startDate, endDate)`.
- S6: Componente de UI `CorporateMetricsTab` con selector de fechas, 4 tarjetas de KPIs globales, tabla de ranking de empresas con badges de convenio y formato de moneda en Córdobas (C$).
- S7: Integrar el tab `Convenios y Empresas` (`corporate-metrics`) en `apps/owner_dashboard/src/features/customers/customers-page.tsx`.
- S8: Validacion funcional y suites de pruebas de backend y frontend pasando limpiamente.

## Tasks

- T1 [S1, S2, S3] Backend: Crear DTOs, logica de calculo en `SalesReportsService` y endpoint en `ReportsController`.
- T2 [S4] Backend Tests: Agregar pruebas unitarias en `sales-reports.service.spec.ts`.
- T3 [S5] Frontend API: Crear DTOs/tipos TypeScript, cliente API y hook `useCorporateMetrics`.
- T4 [S6, S7] Frontend UI: Construir componente `CorporateMetricsTab` e integrarlo como nuevo tab en `CustomersPage`.
- T5 [S8] Verificacion: Ejecutar tests de backend y compilacion de `owner_dashboard`.

## Log

- L1: Peticion original del usuario: "Hizo falta agregar algo, y es que la idea era poder tener metricas de seguimiento, para ver que empresas compran mas por mes, los descuentos otorgados, entre otro tipo de reportes que podamos generar. Veamos la feat, los datos que maneja y veamos las opciones de metricas y reportería que son posibles generar para ver cuales optamos por agregar al sistema".
- L2: Decision del usuario: implementar los 3 niveles por fases, iniciando con Nivel 1 (ranking mensual de empresas, ventas brutas/netas, descuentos y ticket promedio) ubicado en un nuevo tab dentro de `/customers`.
