# SOHO P3 — las dos unidades de higiene que quedaron: la etiqueta del cobro y los últimos formularios

- **Status:** EN EJECUCIÓN
- **Worktree / rama:** `~/omnifood-ni-p3-forms` · `fix/p3-form-sweep-remainder`, desde `main` = `37559d83` (el bloque P3 ya mergeado por #850).
- **Decisión del usuario:** estas dos unidades van juntas en un PR chico porque **el APK de la próxima ronda S23 tiene que llevarlas** (el instalado es anterior a los tres arreglos de lealtad, así que igual hay que compilar uno nuevo). Una sola sesión de aparato cierra los 10 ítems de validación.
- **Origen:** §18.2 del bloque (hallazgo de campo, abierto) y §14 "Cierre del barrido" (los diferidos 1 y 2).

---

## Unidad 1 · §18.2 — la etiqueta del monto del cobro miente

**Lo que mostró el aparato:** total **C$ 202.50**; la sugerencia dice **C$ 203**, pero al tocarla el campo queda en **202.50**.

**Causa exacta** (`apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart`):

```dart
// _buildQuickSuggestionChips, línea ~1199 — la etiqueta
final label = _tenderCurrency == 'USD'
    ? '\$ ${denom.toStringAsFixed(0)}'
    : 'C\$ ${denom.toStringAsFixed(0)}';
// el tap, línea ~1209 — el valor aplicado
onPressed: () {
  _tenderAmountController.text = denom.toStringAsFixed(2);
```

La primera sugerencia es **el total exacto** (`currency_checkout_calculator.dart:117`, `getSuggestedDenominations`), así que es la única que puede llevar centavos; las demás (300, 400, 500, 1000) son enteras.

**Decisión de producto (entre las dos que el doc dejó planteadas):** la etiqueta muestra **exactamente lo que el tap aplica**, con la precisión del propio valor — entera sin decimales, con centavos con dos. Se descarta la otra opción (redondear también el valor aplicado) porque **cambia el dinero**: el operador cobraría 203 por una cuenta de 202.50 y el vuelto se calcularía sobre eso. Esta opción no toca ninguna semántica de dinero: sólo deja de mentir la pantalla.

- [ ] `_formatSuggestionAmount(double)` → `amount == amount.roundToDouble() ? toStringAsFixed(0) : toStringAsFixed(2)`, usado en las dos ramas (NIO y USD).
- [ ] El valor aplicado por el tap **no cambia** (`toStringAsFixed(2)`): el campo de monto usa dos decimales en todo el diálogo.
- [ ] Test de primera: **para cada chip, la etiqueta tiene que ser el mismo monto que el tap aplica**. Con un total de 202.50 el chip dice `C$ 202.50` (antes `C$ 203`), con un total entero dice `C$ 300`, y en los dos casos el campo queda con el mismo número. RED antes del arreglo.
- [ ] Ojo con el `Set` de `getSuggestedDenominations`: acá **no** se toca (la colisión exacto/redondeado era un riesgo de la opción descartada). Verificarlo igual con un total entero que coincida con una denominación fija (300) para que no aparezcan dos chips iguales.

## Unidad 2 · Los cuatro formularios que faltaban del barrido

Los tres primeros son los que **ya** usan RHF + `zodResolver`: sólo les falta `noValidate` y el test que pinnea que el esquema de la app sigue siendo la única guarda.

| Archivo | Línea del `<form>` | Estado |
|---|---|---|
| `src/features/auth/login-page.tsx` | 86 | RHF+zod, sin `noValidate` |
| `src/features/promotions/PromotionForm.tsx` | 144 | RHF+zod, sin `noValidate` |
| `src/features/modifiers/modifier-group-form.tsx` | 278 | RHF+zod, sin `noValidate` |
| `src/features/loyalty/customer-loyalty-profile.tsx` | 75 | **sin RHF**: guardas JS (`delta === 0`, `!reason.trim()`) |

El cuarto es el que el handoff no nombraba. Su único atributo nativo es `type="number"` en el input de puntos (línea 87) y **no** tiene `required`/`min`/`max`: o sea que hoy no bloquea nada, y las guardas reales son las de JS. Se le agrega `noValidate` **igual**, con el comentario que dice por qué es inerte hoy y qué protege mañana (es la convención del barrido: los atributos nativos no son la guarda), más un pin que afirme que un delta 0 o una razón vacía siguen sin mandar request.

**Patrón a copiar** (ya está en el repo, `loyalty-page.tsx:184-190` y `catalog-page.tsx:261-269`):

```tsx
// noValidate: the application's own zod validation (via the RHF resolver) is
// the only guard; the browser's native constraint validation would fire first,
// replacing the design system's Spanish inline errors with the browser's own
// validation bubble (browser language and styling).
```

## Tareas

- [ ] **T1** §18.2: RED del test de equivalencia etiqueta↔tap, después el helper y el arreglo.
- [ ] **T2** `noValidate` + comentario en los 4 formularios, con un pin por formulario (el esquema/guarda de la app sigue siendo la única guarda).
- [ ] **T3** Verificación: suites focales de POS y dashboard; `flutter analyze`; `tsc -b`; `oxlint`.
- [ ] **T4** Commits por unidad de trabajo + PR chico (uno solo, `type:bug`).
- [ ] **T5** (siguiente, fuera de este PR) `odd/tasks/soho-s23-round2.md` con los 10 ítems de validación en aparato.

## Gates

| Gate | Comando | Criterio |
|---|---|---|
| POS: el diálogo | `flutter test --concurrency=1 test/ui/features/sales/multi_currency_checkout_dialog_test.dart` | verde, con el pin nuevo |
| POS: análisis | `flutter analyze` | 0 issues (o sólo los preexistentes conocidos) |
| Dashboard: formateo y tipos | `npx oxlint src` + `npx tsc -b --noEmit` | 0 errores |
| Dashboard: suites de los 4 | los specs de login, promociones, modifiers y `w10-customer-loyalty-profile` | verdes |

**Nunca** suites completas con subagentes vivos (techo de memoria de `AGENTS.md`); Jest con `--maxWorkers=2`, Flutter con `--concurrency=1` ó 2.
