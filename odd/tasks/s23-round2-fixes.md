# S23 ronda 2 — batch de fixes

- **Status:** EN CURSO
- **Rama:** `fix/s23-round2-pos-fixes` (worktree `~/omnifood-ni-s23-fixes`), desde `main` = `c39519ff`.
- **Origen:** los 24 hallazgos de `odd/tasks/soho-s23-round2.md` (ronda cerrada; PR #860). Cada unidad referencia el código del hallazgo.
- **Por qué un batch:** todos los fixes del POS se validan en **un solo APK**; el S23 se re-valida cuando F-10d esté resuelto.

---

## Parte 1 — POS (Dart; exige APK nuevo)

### P1 · F-10d + F-10a + F-10b — la activación dice la verdad
- **Qué:** la Fase 2 muestra *"Ocurrió un error inesperado durante la activación. Revise la conexión e intente de nuevo."* cuando el blocker real es la **tasa FX ausente** (`EXCHANGE_RATE_NOT_CONFIGURED`) o la **impresora** (`PRINTER_AVAILABLE_FAILED`, `TEST_PRINT_FAILED`). Los tres códigos salen además por `[FriendlyError] Unmapped raw error:`.
- **Dónde:** `apps/pos_app/lib/ui/features/config/activation/` (banner de error de la fase), `apps/pos_app/lib/core/localization/label_map.dart` (mapa de `FriendlyError`).
- **Esperado:** el banner muestra el blocker del runner, en español, y nombra la acción concreta; los tres códigos quedan mapeados. El copy del FX apunta al camino real del POS (**Configuración → Perfil del Negocio**), no a la conexión.

### P2 · D-2 — el cliente no sobrevive al carrito
- **Qué:** `clearCart()` (`sale_view_model.dart:1753`) no resetea `_selectedCustomer`; vaciar el carrito a mano deja el cliente puesto para la venta siguiente.
- **Esperado:** al quedar el carrito vacío (o al vaciarlo el operador) el contexto de cliente (cliente + evaluación + recompensa) se limpia.

### P3 · D-3 — el rechazo de la recompensa se ve
- **Qué:** el mensaje del tope se renderiza debajo del carrito, fuera de la vista.
- **Esperado:** el operador ve el rechazo sin minimizar el carrito (junto al CTA/tarjeta, o snackbar).

### P4 · §17.4 + F-8c — el detalle del historial espeja el carrito
- **Qué:** `sales_history_view_model.dart:342` arma los ítems con `toItemDomain` **sin modifiers**; el detalle (`sales_history_view.dart:681-724`) sólo tiene Subtotal/IVA/TOTAL; el subtotal de la NC queda bruto (−125) contra un total neto (−13.75).
- **Esperado:** filas de extras, filas de descuento/promoción/propina, y subtotal coherente (neto) también en la NC.

### P5 · F-6 — el Simulador no puede decir "lista"
- **Qué:** con `PrinterDriverType.mock` la tarjeta dice *"Impresora Conectada y Lista — El cabezal térmico está disponible y cuenta con papel."* (`MockPrinterAdapter` siempre devuelve `ready`).
- **Esperado:** estado/copy propio del simulador ("Modo simulador: no hay impresora física"), sin afirmar hardware. El camino de **impresión** ya es honesto y no se toca.

### P6 · F-8a — la factura acreditada muestra su estado
- **Qué:** tras emitir la NC la factura original no cambia de estado: el detalle sigue ofreciendo NC y ANULAR.
- **Esperado:** marca de "acreditada" (badge en la lista + el detalle sin las acciones) y la NC identificada como tal.

### P7 · F-8b — el rechazo del duplicado en español
- **Qué:** el segundo intento de NC muestra `Error al procesar devolución. Bad state: Credit note cumulative refund exceeds original line quantity`.
- **Esperado:** mensaje en español, sin `Bad state:`, que explique que ya se devolvió todo lo de esa factura.

### P8 · F-4b — el listado local de auditoría no oculta 6 h
- **Qué:** `_buildAuditEntity` guarda el timestamp en **UTC con `Z`** y `getLocalLogs` (`audit_repository_impl.dart:601-604`) compara con límites **locales sin `Z`** como texto → se descartan las filas recientes.
- **Esperado:** comparación coherente (mismo formato o epoch) y un test que falle con el código viejo.

### P9 · F-4c — el detalle de auditoría sin ruido
- **Qué:** uuid pelado en `Factura (ID)`, `SALE_VOIDED` crudo, `CLIENTE_DESISTE` duplicado y crudo.
- **Esperado:** valores humanos (mapa de motivos ya existente en `label_map.dart:211`), uuid fuera de la vista.

### P10 · F-5a — pluralización del bloqueo del Corte Z
- **Qué:** *"Existen 1 vouchers…"*.
- **Esperado:** "Existe 1 voucher" / "Existen N vouchers".

---

## Parte 2 — Backend (TS)

### B1 · D-1 — la proyección de lealtad se recomputa
- **Qué:** `customer_loyalty_account_projection.balance_units` queda stale (1500 vs 704) tras el push del POS por `POST /loyalty/point-transactions/sync`; `balance_after` en 0.00.
- **Esperado:** el ingest recomputa la proyección desde el ledger (y `balance_after` deja de ser 0).

### B2 · F-4a — la entidad en el ledger del dueño
- **Qué:** `audit_logs.target_type`/`target_id` NULL en todas las filas del POS → la columna "entidad" del panel sale "—".
- **Esperado:** la entidad viaja tipada (o el ledger la deriva del metadata sin exponer el blob).

### B3 · F-5b — el cajero en el Corte Z
- **Qué:** el Z imprime *"Cajero: Operador no disponible"* aunque el turno tiene `cashier_name`.
- **Esperado:** el nombre resuelto (o un fallback honesto, nunca el uuid).

### B4 · F-8d — el resumen del día reconcilia
- **Qué:** Subtotal 5414.75 vs Total 5526.00 con IVA 0; el descuento de la NC (111.25) desaparece.
- **Esperado:** identidad Subtotal/Total del resumen diario (subtotal de la NC coherente con el de la venta).

### B5 · F-8e — decidir el documento de la NC upstream
- **Qué:** la nube recibe el evento `CREDIT_NOTE_CREATED` pero no el documento de la NC (DEC-1).
- **Esperado:** decisión explícita (documentar la salvedad o enviar la NC), escrita en el doc.

---

## Parte 3 — Dashboard

### W1 · §17.6 — versiones de receta con selector
- **Qué:** queda `recipes/RecipeForm.tsx#referenceVersionId` como input de texto libre (excepción datada en el guard `no-uuid-inputs.test.ts`).
- **Decisión del dueño:** **endpoint nuevo `GET /recipes/products/:productId/versions` + selector reutilizable** (`components/ui/entity-search-select.tsx`).
- **Esperado:** el guard sin la excepción de `referenceVersionId`, con búsqueda textual por varias columnas.

---

## Restricciones

- Un ítem por vez con su test (test-first cuando hay RED real) y su commit convencional.
- Suites focales; nunca la suite completa en paralelo con un build (techo WSL2 de `AGENTS.md`).
- El `pubspec.yaml` del rig **no** entra en estos commits.
