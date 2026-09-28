# Owner Dashboard Experience Standard V1.0 Implementation

**Trigger:** User request — implementar `docs/nhilos/owner_dashboard_experience_standard_v1.0.md` sobre el dashboard en backoffice (`apps/owner_dashboard`).

**Status:** completed
**Authority:** `docs/nhilos/owner_dashboard_experience_standard_v1.0.md`
**Scope:** Backoffice Owner Dashboard (`apps/owner_dashboard/src/features/dashboard/**` y páginas de destino integradas en `apps/owner_dashboard/src/features/**`).

---

## Plan de Ejecución

### Tarea 1: Utilidades Canónicas de Navegación Contextual y Lenguaje de Comparación (§5, §10, §27.3, §27.4)
- **Status:** done
- **Objetivo:** 
  - Crear contrato canónico `DashboardNavigationContext` y helper para generar URLs con search params URL-first (`buildDashboardDrilldownUrl`).
  - Crear utilitario centralizado de lenguaje humano de comparación (`formatHumanComparisonLabel`) que resuelva "vs ayer", "vs [día] anterior", "vs 7 días anteriores", "vs mismo período del mes anterior" y "Sin base comparable".
- **Evidencia:** `navigation-context.spec.ts` y `comparison-language.spec.ts` pasando al 100%.

### Tarea 2: Habilitación de Navegación Contextual en Páginas de Destino (§5.5, §6, §25)
- **Status:** done
- **Objetivo:**
  - Actualizar `InventoryPage` para leer search params (`tab`, `status`, `startDate`, `endDate`, `source`) y activar la pestaña y filtro correspondiente (ej. `tab=alerts&status=CRITICAL`).
  - Actualizar `SalesPage` para leer search params (`tab`, `startDate`, `endDate`, `productId`, `hour`, `source`) y aplicar el rango y pestaña adecuada.
  - Actualizar `FiscalPage` para leer search params (`tab`, `startDate`, `endDate`, `source`) activando la pestaña (ej. `voided`, `sequence`).
- **Evidencia:** `dashboard-contextual-navigation.spec.tsx` verifica que todas las páginas de destino reciben el contexto de forma precisa.

### Tarea 3: Refinamiento de Atención Requerida y Reflow de Layout (§7, §8, §26 UX-01)
- **Status:** done
- **Objetivo:**
  - En `AttentionBand`, reemplazar etiquetas genéricas "Ver →" por acciones explícitas ("Ver productos", "Revisar vouchers", "Ver anulaciones", "Revisar secuencia", "Ver auditoría") con links que lleven el contexto canónico.
  - En `PerformanceBand`, implementar el reflow real del grid cuando no hay items de atención: si `AttentionBand` no tiene items, `SalesTrendChart` se expande a las 3 columnas completas en desktop sin dejar huecos vacíos.
- **Evidencia:** Tests en `dashboard-v2-attention.spec.tsx` y `dashboard-v2-charts.spec.tsx` verificando los labels contextuales y la expansión de layout sin huecos.

### Tarea 4: Freshness as Care y Human Copy (§9, §11, §23)
- **Status:** done
- **Objetivo:**
  - Actualizar `FreshnessBadge` para hablar de impacto de negocio ("Información parcial · 1 terminal con datos pendientes", "Sincronización demorada", "No se puede verificar la completitud de los datos", etc.) en lugar de texto técnico de terminales/infraestructura.
  - Garantizar que "—" sea el indicador de desconocido/parcial y nunca `0` simulado.
- **Evidencia:** `dashboard-v2-freshness.spec.tsx` y `dashboard-v2-acceptance.spec.tsx` verificados al 100%.

### Tarea 5: Contextual Drill-downs en Gráficos y Cards (§6, §15, §25 CN-03/04)
- **Status:** done
- **Objetivo:**
  - `TopProductsChart`: permitir drill-down contextual por producto hacia `/sales?tab=products` con el producto y rango de fechas.
  - `PaymentMixChart`: drill-down contextual hacia el desglose de pagos en ventas.
  - `HourlySalesChart`: drill-down contextual a la distribución horaria.
- **Evidencia:** Enlaces interactivos con accesibilidad y URLs enriquecidas verificados en `dashboard-contextual-navigation.spec.tsx`.

### Tarea 6: Verificación Integral, Tests de Regresión y Cierre (§28 DoD)
- **Status:** done
- **Objetivo:**
  - Ejecutar la suite completa de tests de `apps/owner_dashboard` (unit + acceptance).
  - Verificar checklist del Definition of Done del estándar.
- **Evidencia:** 85 archivos de test, 1155 tests pasando (0 fallos), typecheck y build limpios.
