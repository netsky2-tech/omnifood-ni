# Tasks: UI Drawer Fulfillment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250-350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Drawer routes + recordPurchase logic | PR #1 | Single PR with all changes |

---

## Phase 1: Drawer - Exponer Rutas en Navigation Menu

- [x] 1.1 Modificar `app_drawer.dart` (línea 85-88): Agregar ListTile "Gestión de Usuarios" debajo de "CONFIGURACIÓN" con icono `Icons.people`, navigate a `/identity/users`, con condición `userCount > 0`
- [x] 1.2 Modificar `app_drawer.dart`: Agregar ListTile "Bitácora de Auditoría" debajo de "CONFIGURACIÓN" con icono `Icons.history`, navigate a `/identity/audit`, con condición `role != CASHIER && role != WAITER`
- [x] 1.3 Modificar `app_drawer.dart`: Agregar ListTile "Historial de Ventas" debajo de "VENTAS (POS)" con icono `Icons.receipt`, navigate a `/sales/history` (sin condición de rol)
- [x] 1.4 Agregar imports necesarios en `app_drawer.dart` para `UserManagementViewModel` and `AuthRepository` (obtener userCount y role)

---

## Phase 2: InventoryRepository - Agregar Métodos para Purchases

- [x] 2.1 Modificar `inventory_repository.dart`: Agregar método `Future<void> savePurchase(Purchase purchase)` para persistencia local
- [x] 2.2 Modificar `inventory_repository.dart`: Agregar método `Future<void> queuePurchaseSync(Purchase purchase)` para sync con backend
- [x] 2.3 Modificar `inventory_repository.dart`: Agregar método `Future<int> getUserCount()` para RBAC en Drawer

---

## Phase 3: PurchaseMapper - Crear Mapper para Sync

- [x] 3.1 Crear nuevo archivo `purchase_mapper.dart` en `apps/pos_app/lib/data/mappers/`
- [x] 3.2 Implementar método estático `PurchaseDto toDto(Purchase purchase)` - map Purchase domain → DTO para backend
- [x] 3.3 Implementar método estático `Purchase fromResponse(PurchaseResponse resp)` - map backend response → local Purchase
- [x] 3.4 Implementar método `Map<String, dynamic> toSyncJson(Purchase purchase)` para API call

---

## Phase 4: PurchaseViewModel - Implementar recordPurchase()

- [x] 4.1 Modificar `purchase_view_model.dart` (líneas 40-48): Reemplazar método vacío con implementación que obtenga UomConversion por `uomConversionId`
- [x] 4.2 Implementar conversión de cantidad a unidad base: `quantityInBaseUnit = quantity * conversion.factor`
- [x] 4.3 Llamar `repository.updateInsumoStock()` con nuevo stock calculado
- [x] 4.4 Llamar `repository.updateInsumoCost()` con WAC calculado (delegado a MovementEngine)
- [x] 4.5 Persistir Purchase local: crear Purchase entity y llamar `repository.savePurchase()`
- [x] 4.6 Encolar para sync: llamar `repository.queuePurchaseSync()` con el Purchase
- [x] 4.7 Llamar `notifyListeners()` al final
- [x] 4.8 Importar `MovementEngine` en el ViewModel para usar lógica de cálculo de costo

---

## Phase 5: Testing - Unit Tests para recordPurchase()

- [x] 5.1 Crear test file `purchase_view_model_test.dart` en `apps/pos_app/test/ui/features/inventory/purchases/`
- [x] 5.2 Test: `recordPurchase` con conversión de unidades correcta (2 sacks × 22680 = 45360g)
- [x] 5.3 Test: `recordPurchase` delegando a repository para update stock
- [x] 5.4 Test: `recordPurchase` persiste Purchase local
- [x] 5.5 Test: `recordPurchase` encola para sync
- [x] 5.6 Test: `recordPurchase` lanza error si conversión inválida

---

## Phase 6: Testing - Widget Tests para Drawer

- [x] 6.1 Crear test file `app_drawer_test.dart` in `apps/pos_app/test/ui/widgets/`
- [x] 6.2 Test: Drawer muestra "Gestión de Usuarios" cuando userCount > 0
- [x] 6.3 Test: Drawer oculta "Gestión de Usuarios" cuando userCount == 0
- [x] 6.4 Test: Drawer muestra "Bitácora de Auditoría" para ADMIN
- [x] 6.5 Test: Drawer muestra "Bitácora de Auditoría" para MANAGER
- [x] 6.6 Test: Drawer oculta "Bitácora de Auditoría" para CASHIER
- [x] 6.7 Test: Drawer oculta "Bitácora de Auditoría" para WAITER
- [x] 6.8 Test: Drawer muestra "Historial de Ventas" para cualquier rol
- [x] 6.9 Test: Tap en "Gestión de Usuarios" navega a `/identity/users`
- [x] 6.10 Test: Tap en "Bitácora de Auditoría" navega a `/identity/audit`
- [x] 6.11 Test: Tap en "Historial de Ventas" navega a `/sales/history`

---

## Phase 7: Integration - Verificar Builds

- [x] 7.1 Ejecutar `flutter pub get` para asegurar dependencias
- [x] 7.2 Ejecutar `flutter analyze` para verificar tipos y errores
- [ ] 7.3 Ejecutar `flutter test` para verificar tests pasan
- [ ] 7.4 Build debug APK: `flutter build apk --debug` (opcional, según tiempo)

---

## Criterios de Verificación (Checkpoints)

| ID | Criterio | Tareas |
|----|-----------|--------|
| AC-1 | Drawer muestra "Gestión de Usuarios" debajo de Configuración | 1.1 |
| AC-2 | Drawer muestra "Bitácora de Auditoría" debajo de Configuración | 1.2 |
| AC-3 | Drawer muestra "Historial de Ventas" debajo de Ventas | 1.3 |
| AC-4 | Click en cada entrada navega a la View correcta | 6.9-6.11 |
| AC-5 | `recordPurchase()` persiste Purchase en SQLite | 4.5, 2.1 |
| AC-6 | `recordPurchase()` actualiza stock de Insumo | 4.3 |
| AC-7 | `recordPurchase()` sincroniza con backend en background | 4.6, 2.2 |
| AC-8 | Test unitario de `recordPurchase()` pasa | 5.2-5.6 |

---

## Dependencias y Order de Implementación

```
Phase 1 (Drawer UI)
    └── 1.1 - 1.4: Solo UI, sin lógica nueva

Phase 2 (Repository)
    └── 2.1 - 2.3: Método usado por Phase 4

Phase 3 (Mapper)
    └── 3.1 - 3.4: Nuevo archivo, independiente

Phase 4 (ViewModel Logic)
    └── 4.1 - 4.8: Depende de Phase 2 y 3
         ├── Usa repository.savePurchase() (2.1)
         ├── Usa repository.queuePurchaseSync() (2.2)
         └── Usa PurchaseMapper (3.1)

Phase 5-6 (Tests)
    └── Dependen de implementación completa

Phase 7 (Verification)
    └── Verifica todo funciona insieme
```

---

## Notas de Implementación

1. **TDD**: Phase 4 (recordPurchase) debe seguir TDD - escribir tests en Phase 5 primero, luego implementar en Phase 4
2. **Floor @transaction**: Si se usan transacciones en DAO, usar argumentos posicionales (no nombrados)
3. **Offline-First**: recordPurchase debe completar localmente antes de encolar sync
4. **DGI Compliance**: No eliminar compras, solo marcar con `is_canceled` si se cancela
5. **RBAC**: Verificar role del usuario actual antes de mostrar opciones sensibles en Drawer