# Formulario de promociones: el contrato roto, y el estándar NHILOS aplicado

- **Status:** EN EJECUCIÓN
- **Rama / worktree:** `fix/promotions-form-contract` en `~/omnifood-ni-promo-fix`, desde `main` = `006d45f6`.
- **Origen:** **ítem 2A de la ronda S23** (2026-10-10). El ítem 2 pedía crear/activar una promoción desde la web y verla llegar al POS sin reiniciar el checkout. No se pudo ni intentar: el formulario no guarda.
- **Obligación del proyecto (no opcional):** todo cambio de UI/UX acá se rige por `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` (2335 líneas) y `docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md` (756). **Hay que leerlos antes de escribir código**, y el resultado tiene que sostenerse contra ellos. El usuario lo pidió explícito: *"debemos aplicar los nhilos standard backoffice y principles, luxury +1, y que los campos a ingresar tengan sentido con el tipo de input adecuado"*.

---

## 1. El defecto, medido en el aparato

El usuario intentó crear una promoción desde el panel y recibió dos cosas, en este orden:

1. En los campos **fecha de inicio** y **fecha final**: *"me pide un número"*.
2. Al darle guardar, un toast con el error crudo del backend: **`property is_active should not exist`**.

**Impacto:** por la decisión **D-B** del bloque, la web es **el único lugar donde se activa una promoción** (el toggle del POS se quitó a propósito para no dejar una reversión silenciosa). Si el formulario no puede guardar, la capacidad de promociones del piloto queda **sin superficie de configuración**: se ven, no se crean ni se activan.

## 2. Causa raíz (verificada en el código)

| Síntoma | Causa | Archivo |
|---|---|---|
| "me pide un número" | el esquema tipa las fechas como **número**: `start_date: z.coerce.number().optional()`, `end_date: z.coerce.number().optional()`, mientras un input de fecha entrega **texto** | `apps/owner_dashboard/src/features/promotions/schema.ts:29-30` |
| `property is_active should not exist` | el formulario manda `is_active` en el payload de **create**, y esa propiedad **sólo existe en el DTO de update**; con `forbidNonWhitelisted` el backend rechaza la petición entera | `PromotionForm.tsx:63,90` (payload) vs `apps/admin_backend/src/modules/promotions/dto/update-promotion.dto.ts:87` |

**Precedente correcto en el propio repo** (para las fechas y el tipo de input):
- `src/features/settings/fiscal-setup-form.tsx:480,492` → `<input type="date">`, y `src/features/settings/types.ts:244` documenta la normalización entre el `YYYY-MM-DD` que da el input y el ISO-8601 completo.
- `src/features/inventory/purchases-form.tsx:562` → `type="date"`; `src/features/recipes/RecipeForm.tsx:291` → `type="datetime-local"`.

## 3. Qué hay que resolver

- [ ] **Fechas:** el esquema valida lo que el input realmente entrega, y el payload sale en el formato que el backend espera. Nada de coerción numérica sobre una fecha.
- [ ] **Tipo de input adecuado:** lo que el usuario pidió explícito. Una fecha se ingresa con un control de fecha (o el patrón que el estándar NHILOS fije para formularios del backoffice), no con un campo de texto libre que después hay que adivinar.
- [ ] **`is_active`:** el payload tiene que coincidir con el contrato de **cada** endpoint. Decisión a documentar con evidencia (el create no lo acepta hoy; el servicio sí lo devuelve al crear, o sea que la entidad lo soporta):
      - **(a)** el DTO de create lo acepta (2 líneas de backend + spec del DTO) → el toggle del operador funciona en un paso; **recomendada**, porque sin ella "crear y activar" son dos operaciones y la segunda vive en otra pantalla.
      - **(b)** el formulario no lo manda al crear y el toggle se aplica después con un update → no se toca el backend, pero la UI ofrece un control que no hace nada en el alta (y eso el estándar lo castiga).
- [ ] **Estándar NHILOS:** el resultado se audita contra el Experience Standard y el Module Audit Template. Mensajes en español, foco/scroll al error accionable, validación por la app (nada de `noValidate` faltante), estados de guardado explícitos.
- [ ] **Tests:** el esquema y el payload pinneados (un test por contrato roto), más el pin de que el submit válido llama la mutación con las claves exactas que el endpoint acepta.

## 4. Gates

| Gate | Comando | Criterio |
|---|---|---|
| Tipos | `npx tsc -b --noEmit` (en `apps/owner_dashboard`) | 0 errores |
| Lint | `npx oxlint src` | 0 errores |
| Suites | `npx vitest run src/features/promotions/PromotionForm.test.tsx` + las contiguas de promociones | verdes |
| Backend (si se toca el DTO) | `npx jest` de los specs de promociones, `--maxWorkers=2` | verdes |

## 5. Cierre esperado de la ronda (ítem 2A)

El ítem 2 se cierra **cuando** una promoción creada y activada desde la web llegue al POS **sin reiniciar el checkout** y el carrito la aplique con origen `promotion`. La mitad B ya está cerrada: con dos capuccinos la fila muestra **-C$150**, igual que el motor (2x1 = 125 + 10% = 25) y que la nube (factura **38**, `{"promotion": 150}`).

---

## 6. Cierre

**Decisión del usuario: opción 2** (la UI dice el hecho, no se toca el backend). La evidencia que la forzó: `services/promotions.service.ts:50-56` hace `create({ ...dto, tenant_id: tenantId, is_active: true })` — el `is_active: true` va **después** del spread, así que descarta cualquier `dto.is_active`. Aceptar el campo en el DTO sin tocar esa línea habría sido un control que no hace nada: falsa certeza. Queda registrado como decisión consciente, no como pendiente.

**Arreglado:** el esquema valida el `YYYY-MM-DD` que el input entrega; el formulario usa `type="date"` (precedente `fiscal-setup`); el submit convierte medianoche local → epoch-ms, el formato del cable, así que la lista sigue funcionando; fechas vacías se **omiten**, nunca `0`; `is_active` fuera del payload de create con el key set pinneado **exacto** contra el whitelist del DTO; y un rechazo del backend muestra español (*"Solicitud inválida…"*), nunca un nombre crudo de propiedad.

**Estándar aplicado** (`nhilos_backoffice_experience_standard_v1.0.md` + plantilla de auditoría v2.1): §38 (fechas) · §17.2/§17.4 + plantilla §22 (sin vocabulario de implementación en texto visible: se fue "timestamp Unix en ms") · §18.2 + AP-10 (sin nombres crudos como copy de usuario) · §21 (el alta responde "¿nace activa?") · §17.5 (barrido de sentido de input) · §20 (el estado del form sobrevive a un fallo del servidor).

**Evidencia:** RED verbatim con **8 pines fallando** antes del arreglo; después **28 passed / 1 skipped** en el archivo y **41 passed / 4 skipped** en promociones; `tsc -b` limpio; `oxlint` 0 errores. El único warning que se movió es preexistente (`react(incompatible-library)` en el `useForm`, igual que en `fiscal-setup-form.tsx` y `modifier-group-form.tsx`).

**Follow-ups hallados y NO arreglados acá:**
1. **`target_product_id` es texto libre para un UUID** (§17.5). Un selector gobernado necesita una superficie de catálogo que el dashboard no tiene (sus hooks son sólo auth, promotions, toast y user). Requiere trabajo propio.
2. **El alta no puede crear una promoción inactiva** (consecuencia consciente de la opción 2).

**Cierre del ítem 2A de la ronda:** cuando este formulario guarde en el panel, hay que crear y activar una promoción desde la web, agregarla al carrito del POS **sin reiniciar el checkout**, y verificar el origen `promotion` en la nube. La mitad B ya está cerrada (factura 38: dos capuccinos → `-C$150` en pantalla, en el motor y en la base).
