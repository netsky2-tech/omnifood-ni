# Proposal: UI Drawer Fulfillment

## Intent

El menú de navegación (Drawer) en Flutter POS tiene huecos: (1) 3 rutas con Views implementadas no expuestas, y (2) la vista de Compras tiene UI pero lógica vacía. Esto genera confusión operativa y bloquea flujos de trabajo diarios.

## Scope

### In Scope
- Exponer las rutas `/identity/users`, `/identity/audit`, y `/sales/history` en el Drawer.
- Implementar la lógica de `recordPurchase()` en `PurchaseViewModel` conectada al Backend.
- Priorizar: User Management (negocio), Audit Logs (DGI), Sales History (devoluciones), Compras (operación).

### Out of Scope
- Nuevas vistas completa — solo exposición de existentes.
- Funcionalidad de edición avanzada para User Management (crear/editar usuarios desde POS).
- Reportes fuera de Sales History list-view.

## Capabilities

### New Capabilities
- `user-management-ui`: Exponer User Management view en Drawer.
- `audit-logs-ui`: Exponer Audit Logs view en Drawer.
- `sales-history-ui`: Exponer Sales History view en Drawer.

### Modified Capabilities
- `inventory-purchasing`: Implementar lógica de sincronización de compras desde POS.
- `identity`: Ya existe spec — solo exponer en UI.

## Approach

Seguir el patrón MVP: primero agregar las rutas al Drawer (cambio simple, bajo riesgo), luego implementar la lógica de Compras (TDD requerido por strict_tdd: true). Usar el endpoint existente `/identity/staff` para User Management y el endpoint de sync `/sales/sync` como template para compras.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/pos_app/lib/presentation/modules/drawer/` | Modified | Agregar 3 rutas al menú. |
| `apps/pos_app/lib/presentation/modules/purchase/viewmodels/purchase_viewmodel.dart` | Modified | Implementar `recordPurchase()`. |
| `apps/pos_app/lib/data/mappers/` | Modified | Crear mapper de purchases para sync. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Lógica de compras duplica Inventory Module | Med | Usar MovementEngine existente. |
| Rutas nuevas violan permisos RBAC | Low | Verificar role en Drawer antes de mostrar. |

## Rollback Plan

Revertir cambio en Drawer y comment-out `recordPurchase()` manteniendo el método vacío. Las compras se manejarán manualmente hasta siguiente iteración.

## Dependencies

- Endpoint de sync de compras debe existir en Backend o crearse en paralelo.
- Views de las 3 rutas ya implementadas (verificar en exploración).

## Success Criteria

- [ ] Drawer muestra User Management, Audit Logs, Sales History.
- [ ] Click en ruta navega a la View correcta.
- [ ] `recordPurchase()` persiste y sincroniza al Backend.
- [ ] Test unitario de `recordPurchase()` pasa en Flutter.