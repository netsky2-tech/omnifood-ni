# Metricas de Convenios y Clientes Corporativos — Fase 3 (Nivel 3)

Feature: Reporteria operativa y exportacion consolidada (CSV/Excel) de convenios y detalle de consumo por empresa en el Owner Dashboard.
Documento base: odd/tasks/metricas-convenios-fase3.md

## Specs

- S1: Exportador CSV compatible con Excel (UTF-8 con BOM `\uFEFF`) para la tabla de ranking general de empresas del periodo seleccionado.
- S2: Columnas de exportación general: Empresa, RUC, Convenio Activo, Tickets, Venta Bruta (NIO), Descuentos (NIO), Venta Neta (NIO), % Efectivo, Ticket Promedio (NIO).
- S3: Exportador CSV individual en el panel de detalle por empresa: Producto, Cantidad (uds), Venta Neta (NIO), Descuento Otorgado (NIO).
- S4: Botones con icono `Download`, feedback mediante Toast accesible y pruebas unitarias en `corporate-metrics.test.tsx`.
- S5: Verificacion y build limpio de `owner_dashboard`.

## Tasks

- T1 [S1, S2, S3, S4] Frontend UI: Implementar funciones de exportación CSV con BOM y botones de descarga general y por empresa en `CorporateMetricsTab`.
- T2 [S4, S5] Verificación y Tests: Agregar pruebas unitarias en `corporate-metrics.test.tsx` y validar build de producción.

## Log

- L1: Peticion original: implementar Fase 3 (exportación para liquidación y RRHH de empresas).
- L2: Aprobación del usuario para culminar Nivel 3 antes de pasar al Dashboard Principal.
