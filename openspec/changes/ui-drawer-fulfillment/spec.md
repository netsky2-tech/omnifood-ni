# Delta: UI Drawer Fulfillment

## Propósito

Completar el menú de navegación (Drawer) en Flutter POS exponiendo rutas implementadas pero no vinculadas, e implementar la lógica de compras vacía.

---

## ADDED Requirements

### Requirement: User Management accesible desde Drawer

La ruta `/identity/users` DEBE estar expuesta en el menú Drawer como entrada debajo de "CONFIGURACIÓN" para permitir acceso directo a la gestión de персонал.

#### Scenario: Acceso a User Management desde Drawer

- GIVEN el usuario tiene sesión activa en POS
- WHEN abre el Drawer y hace tap en "Gestión de Usuarios"
- THEN navega a la vista UserManagementView

#### Scenario: User Management oculto sin usuarios

- GIVEN no hay usuarios activos en el sistema
- THEN la entrada "Gestión de Usuarios" NO debe mostrarse en el Drawer

---

### Requirement: Audit Logs accesible desde Drawer

La ruta `/identity/audit` DEBE estar expuesta en el menú Drawer como entrada debajo de "CONFIGURACIÓN" para cumplir requisitos DGI de auditoría.

#### Scenario: Acceso a Audit Logs desde Drawer

- GIVEN el usuario tiene sesión activa
- WHEN abre el Drawer y hace tap en "Bitácora de Auditoría"
- THEN navega a la vista AuditLogView

#### Scenario: Audit Logs solo para roles superiores

- GIVEN el usuario tiene rol CASHIER o WAITER
- THEN la entrada "Bitácora de Auditoría" NO debe mostrarse en el Drawer

---

### Requirement: Sales History accesible desde Drawer

La ruta `/sales/history` DEBE estar expuesta en el menú Drawer como entrada debajo de "VENTAS (POS)" para permitir acceso a devoluciones y rectificaciones.

#### Scenario: Acceso a Sales History desde Drawer

- GIVEN el usuario tiene sesión activa
- WHEN abre el Drawer y hace tap en "Historial de Ventas"
- THEN navega a la vista SalesHistoryView

---

## MODIFIED Requirements

### Requirement: Purchase Recording (Modificado)

El sistema DEBE registrar cada compra de Insumos/Productos desde un Proveedor, persistiendo localmente en SQLite y sincronizando con el backend.

(Previously: Solo registraba sin lógica - comentario "// Logic to be implemented...")

#### Scenario: Registrar compra exitosa

- GIVEN el usuario selecciona un Insumo, Proveedor, Presentación, cantidad y costo
- WHEN ejecuta `recordPurchase()` con todos los parámetros válidos
- THEN DEBE crear un Purchase en SQLite, actualizar el stock del Insumo, y marcar para sincronización con backend.

#### Scenario: Registrar compra con conversión de unidades

- GIVEN un Insumo "Café" con conversión 1 Saco = 22680g
- WHEN registra compra de 2 Sacos a C$100 cada uno
- THEN el stock DEBE aumentar en 45360g (2 × 22680), el costo DEBE ser C$200, y el movimiento DEBE registrar tipo "PURCHASE".

#### Scenario: Error de red al registrar compra

- GIVEN hay conexión activa pero el backend no responde
- WHEN `recordPurchase()` intenta sincronizar
- THEN DEBE completar la transacción local (offline-first) y reintentar sync más tarde.

---

## REMOVED Requirements

### Requirement: Purchase Recording vacío

(Reason: Reemplazado por implementación completa - ver MODIFIED above)

---

## Criterios de Aceptación

| ID | Criterio | Prioridad |
|----|---------|----------|
| AC-1 | Drawer muestra "Gestión de Usuarios" debajo de Configuración | Alta |
| AC-2 | Drawer muestra "Bitácora de Auditoría" debajo de Configuración | Media |
| AC-3 | Drawer muestra "Historial de Ventas" debajo de Ventas | Media |
| AC-4 | Click en cada entrada navega a la View correcta | Alta |
| AC-5 | `recordPurchase()` persiste Purchase en SQLite | Alta |
| AC-6 | `recordPurchase()` actualiza stock de Insumo | Alta |
| AC-7 | `recordPurchase()` sincroniza con backend en background | Alta |
| AC-8 | Test unitario de `recordPurchase()` pasa | Alta |