# Design: UI Drawer Fulfillment

## Enfoque Técnico

Existen dos problemas ortogonales que se abordan de forma independiente:

1. **Exposición de rutas en Drawer**: Agregar 3 entradas de menú que navegan a vistas ya implementadas. Cambio de UI simple, bajo riesgo.
2. **Implementación de compras**: Completar `recordPurchase()` conectando al `MovementEngine` existente. Requiere TDD por `strict_tdd: true`.

El enfoque sigue el patrón MVP propuesto: primero Drawer (bajo riesgo), luego compras (TDD requerido).

---

## Decisiones de Arquitectura

### Decisión: Integración de `recordPurchase()` con `MovementEngine`

| Aspecto | Movimiento |
|--------|------------|
| **Opción 1** | Duplicar lógica de stock/costo en `PurchaseViewModel` |
| **Opción 2** | Delegar a `MovementEngine` existente |
| **Opción 3** | Crear nuevo servicio `PurchaseUseCase` |

**Elección**: Opción 2 — Reutilizar `MovementEngine.recordPurchase(String, double, double)` que ya implementa:
- Cálculo de nuevo stock
- Cálculo de costo promedio ponderado
- Registro de `InventoryMovement` con tipo `PURCHASE`
- Verificación de nivel/par alertas

**Justificación**: DRY (Don't Repeat Yourself). El engine ya existe, está probado, y maneja la semántica de negocios correcta. Duplicar lógica viola el principio de Clean Architecture de única fuente de verdad para reglas de dominio.

---

### Decisión: Sincronización con Backend

| Aspecto | Movimiento |
|---------|------------|
| **Opción 1** | Sync inline (bloquea UI) |
| **Opción 2** | Sync async con retry automático |
| **Opción 3** | Solo local, sync manual |

**Elección**: Opción 2 — Usar el patrón existente de `SyncService` para background sync.

**Justificación**: Offline-First es requerimiento obligatorio. La UI debe completar localmente y el sync ocurre en background. Ver `sales_mapper.dart` y `sync_service.dart` como referencia.

---

### Decisión: Control de Acceso en Drawer

| Aspecto | Movimiento |
|---------|------------|
| **Opción 1** | Mostrar todas las rutas siempre |
| **Opción 2** | Ocultar según rol del usuario |
| **Opción 3** | Mostrar todas, bloquear en navigation guard |

**Elección**: Opción 2 — Ocultar entradas sensibles según rol, siguiendo el requerimiento de spec.

**Justificación**: 
- "Gestión de Usuarios" solo si hay usuarios activos (`user-count > 0`)
- "Bitácora de Auditoría" solo para roles `ADMIN`, `MANAGER` (no `CASHIER`, `WAITER`)
- Esto cumple DGI compliance: logs de auditoría restringidos

---

## Flujo de Datos

### Flujo de Compras (Purchasing)

```
┌─────────────────┐
│ PurchaseView   │
│ (UI: forma)    │
└────────┬────────┘
         │ savePurchase()
         ▼
┌─────────────────┐
│ PurchaseViewModel│
│ recordPurchase() │
└────────┬────────┘
         │
         ├───────────────────────┐
         ▼                       ▼
┌─────────────────┐    ┌────────────────┐
│MovementEngine    │    │ SyncService    │
│.recordPurchase() │    │ .queueSync()  │
│  - stock update │    │  - background │
│  - cost calc   │    │  - retry     │
│  - movement    │    └──────────────┘
└────────┬────────┘
         ▼
┌─────────────────┐
│ SQLite (Floor)  │
│ - insumo.stock │
│ - purchase    │
│ - movement   │
└──────────────┘
```

### Flujo de Navegación (Drawer)

```
┌─────────────────┐
│ AppDrawer       │
│ build()         │
└────────┬────────┘
         │ getCurrentUser()
         ▼
┌─────────────────┐
│ AuthRepository  │
│ .getSession()  │
└────────┬────────┘
         │ role
         ▼
    ┌────┴────────┐
    │ if role     │
    │  ADMIN/MGR  │───► Show "Audit Logs"
    │ else        │───► Hide
    └─────────────┘

    ┌────┴────────────┐
    │ if userCount>0 │───► Show "Users"
    │ else           │───► Hide
    └────────────────┘
```

---

## Cambios de Archivos

| Archivo | Acción | Descripción |
|---------|--------|--------------|
| `apps/pos_app/lib/ui/widgets/app_drawer.dart` | Modificar | Agregar 3 `ListTile` entries con RBAC checks |
| `apps/pos_app/lib/ui/features/inventory/purchases/purchase_view_model.dart` | Modificar | Implementar `recordPurchase()` delegando a MovementEngine |
| `apps/pos_app/lib/data/mappers/purchase_mapper.dart` | Crear | Map `Purchase` ↔ DTO para sync con backend |
| `apps/pos_app/lib/domain/repositories/inventory/inventory_repository.dart` | Verificar | Asegurar `savePurchase()` existe para persistencia local |
| `apps/admin_backend/src/sales/sales.controller.ts` | Verificar | Endpoint `/sales/sync` debe aceptar purchases |

### Detalle de cambios en `app_drawer.dart`

Agregar después de "CONFIGURACIÓN" section (línea 83-88):

```dart
// AFTER: Perfil del Negocio (line 85-88)

// User Management - solo si hay usuarios
if (_userCount > 0)
  ListTile(
    leading: const Icon(Icons.people),
    title: const Text('Gestión de Usuarios'),
    onTap: () => Navigator.pushNamed(context, '/identity/users'),
  ),

// Audit Logs - solo para ADMIN/MANAGER
if (_currentUser?.role != Role.cashier && _currentUser?.role != Role.waiter)
  ListTile(
    leading: const Icon(Icons.history),
    title: const Text('Bitácora de Auditoría'),
    onTap: () => Navigator.pushNamed(context, '/identity/audit'),
  ),

// Sales History - debajo de Ventas (POS)
ListTile(
  leading: const Icon(Icons.receipt),
  title: const Text('Historial de Ventas'),
  onTap: () => Navigator.pushNamed(context, '/sales/history'),
),
```

### Detalle de cambios en `purchase_view_model.dart`

Reemplazar método vacío (líneas 40-48):

```dart
Future<void> recordPurchase({
  required String insumoId,
  required String supplierId,
  required String uomConversionId,
  required double quantity,
  required double unitCost,
}) async {
  // 1. Obtener conversión de unidades
  final conversion = _conversions.firstWhere(
    (c) => c.id == uomConversionId,
    orElse: () => throw ArgumentError('Invalid conversion'),
  );
  
  // 2. Convertir cantidad a unidad base (ej: gramos)
  final quantityInBaseUnit = quantity * conversion.factor;
  
  // 3. Delegar a MovementEngine (calcula stock, costo promedio, movimiento)
  await repository.recordPurchase(insumoId, quantityInBaseUnit, unitCost);
  
  // 4. Persistir Purchase local para sync
  final purchase = Purchase(
    id: DateTime.now().millisecondsSinceEpoch.toString(),
    insumoId: insumoId,
    supplierId: supplierId,
    quantity: quantityInBaseUnit,
    unitCost: unitCost,
    timestamp: DateTime.now(),
  );
  await repository.savePurchase(purchase);
  
  // 5. Encolar para sync con backend
  await repository.queuePurchaseSync(purchase);
  
  notifyListeners();
}
```

---

## interfaces / Contratos

### interfaces existentes a reutilizar

```dart
// En MovementEngine (ya existe)
abstract class MovementEngine {
  Future<void> recordPurchase(String insumoId, double quantity, double cost);
}

// En InventoryRepository (debe existir o crearse)
abstract class InventoryRepository {
  Future<void> savePurchase(Purchase purchase);
  Future<void> queuePurchaseSync(Purchase purchase);
}
```

### Nuevo Mapper para Sync

```dart
// apps/pos_app/lib/data/mappers/purchase_mapper.dart
class PurchaseMapper {
  /// Floor Purchase → DTO para backend
  static PurchaseDto toDto(Purchase purchase) => PurchaseDto(
    id: purchase.id,
    insumoId: purchase.insumoId,
    supplierId: purchase.supplierId,
    quantity: purchase.quantity,
    unitCost: purchase.unitCost,
    timestamp: purchase.timestamp.toIso8601String(),
  );
  
  /// Response backend → local Purchase (para confirmar sync)
  static Purchase fromResponse(PurchaseResponse resp) => Purchase(
    id: resp.id,
    insumoId: resp.insumoId,
    supplierId: resp.supplierId,
    quantity: resp.quantity,
    unitCost: resp.unitCost,
    timestamp: DateTime.parse(resp.timestamp),
  );
}
```

---

## Estrategia de Pruebas

| Capa | Qué probar | Enfoque |
|------|-----------|----------|
| **Unit** | `recordPurchase()` | Mock `InventoryRepository`, verificar llamadas a `MovementEngine`, cálculo de conversión de unidades, persistencia de `Purchase`, encolado de sync |
| **Unit** | AppDrawer RBAC | Mock `AuthRepository`, verificar qué items se muestran/ocultan según rol |
| **Widget** | Navegación Drawer | Verificar que tap en ListTile navega a ruta correcta |

### Test Unit para `recordPurchase()`

```dart
void main() {
  test('recordPurchase delegates to MovementEngine and persists locally', () async {
    // Arrange
    final mockRepo = MockInventoryRepository();
    final vm = PurchaseViewModel(mockRepo);
    vm.conversions = [UomConversion(id: 'c1', factor: 22680)]; // sacks → grams
    
    // Act
    await vm.recordPurchase(
      insumoId: 'insumo-1',
      supplierId: 'supplier-1',
      uomConversionId: 'c1',
      quantity: 2,
      unitCost: 100,
    );
    
    // Assert
    verify(() => mockRepo.recordPurchase('insumo-1', 45360, 100)).called(1);
    verify(() => mockRepo.savePurchase(any())).called(1);
    verify(() => mockRepo.queuePurchaseSync(any())).called(1);
  });
}
```

---

## Migración / Despliegue

No se requiere migración de datos. La implementación es additive:

1. **Fase 1**: Agregar rutas al Drawer (cambio de UI puro, sin lógica)
2. **Fase 2**: Implementar `recordPurchase()` con TDD enabled
3. **Fase 3**: Verificar sync con backend endpoint existente

### Feature Flags

No se requieren. El cambio es forward-only.

### Rollback

- Revertir cambio en Drawer: Simplemente remover las 3 `ListTile`
- Comentar `recordPurchase()` en ViewModel manteniendo el método vacío como estaba

---

## Preguntas Abiertas

- [ ] **Ruta `/identity/users`**: Verificar que la vista existe en `apps/pos_app/lib/ui/features/identity/users/` o si está en otra ubicación. No se encontró en el glob inicial.
- [ ] **Ruta `/identity/audit`**: Verificar que `AuditLogView` existe y su ubicación exacta.
- [ ] **Ruta `/sales/history`**: Verificar que `SalesHistoryView` existe y su ubicación (el glob mostró `sales_history_view.dart`).
- [ ] **Endpoint sync**: Confirmar que `/sales/sync` en backend acepta purchases. Verificar estructura del DTO.
- [ ] **Repo `savePurchase()`**: Confirmar que `InventoryRepository` tiene el método o se debe agregar.

---

## Resumen

| Aspecto | Decisión |
|---------|---------|
| **Approach** | Drawer primero (bajo riesgo), luego compras (TDD) |
| **Reutilización** | `MovementEngine` para lógica de stock/costo |
| **Offline-First** | Sync async con retry via `SyncService` |
| **RBAC** | Ocultar según role en tiempo de build del Drawer |
| **Sync** | Mapper nuevo `PurchaseMapper` reusable |
| **Tests** | Unit: ViewModel + RBAC, Widget: navegación |