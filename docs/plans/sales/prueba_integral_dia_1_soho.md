# Prueba Integral — Día 1 SOHO (go-live viernes)

Documento operativo de validación. El objetivo no es "probar features": es garantizar que
**la terminal opere un día de trabajo completo sin intervención**. Nos jugamos la imagen.

## Marco de aceptación

Regla del proyecto: `docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md`.

Aplica el **§4 Core Promise First** y su **§4.1 Core Promise blockers**. Un módulo falla de
inmediato si su flujo principal:

| Blocker NHILOS §4.1 | Dónde lo tenemos hoy |
|---|---|
| produce información de negocio incorrecta | IVA en 0 (ver R-1) |
| oculta un efecto secundario material | error de venta invisible bajo el carrito (R-4) |
| convierte dato desconocido/parcial en valor válido | tenant vacío → camino legacy (corregido) · badge contando mal (corregido) |
| hace ambigua una acción irreversible | factura de activación consume consecutivo DGI (R-7) |
| pierde trabajo ingresado por el usuario innecesariamente | por validar: carrito ante fallo de venta |
| expone inaccesible una acción crítica | por validar: COBRAR con error de dominio |

Regla de oro para cada check: **¿el operador completa su trabajo, y el sistema dice la verdad
sobre lo que pasó?**

## Escenario bajo prueba (alcance explícito)

- El cliente entrega **solo menú y precios**. Sin recetas, sin insumos, sin conteo inicial.
- Todos los productos deben quedar **SIMPLE**.
- Insumos y recetas se integran **después** del go-live, con remediación retroactiva
  (`POST /api/inventory/remediations/sale-inventory`).
- Todo lo que quede fuera de este alcance no bloquea el viernes, pero debe estar documentado.

---

# Fase 0 — Habilitación (antes de tocar la terminal)

**Promesa: el negocio existe, tiene menú y su numeración fiscal es real.**

### Menú real del cliente — VALIDADO

| | |
|---|---|
| Fuente | `Menú SOHO.pdf` (2 páginas) |
| Resultado del preview | `categories: 7`, `productsToCreate: 56`, `productsToUpdate: 2`, **`recipesToCreate: 0`**, **`insumosToCreate: []`**, **`errors: []`**, **`warnings: []`** |
| Total | **58 productos, todos SIMPLE** |
| Artefacto | `Menu_SOHO_import_listo.xlsx` (58 filas, 0 con insumo, fila de ejemplo borrada de las 8 hojas) |

Composición: CAFÉ CALIENTE 16 · CAFÉ HELADO 11 · BEBIDAS 12 · BATIDOS 4 · POSTRES 4 · DESAYUNOS 5 · COMIDA 6.

Decisiones confirmadas por el cliente:
- **Cuota Fija, no aplica IVA** (Art. 244 Ley 822). El precio listado en el menú es el precio final; el PDF dice "los precios no incluyen IVA" pero bajo este régimen no se recauda IVA, así que no se agrega nada.
- Los **tamaños son productos separados** (`Cappuccino 12oz` / `Cappuccino 8oz`): el import del menú no soporta variantes. 58 ítems donde el cliente ve ~30.
- Los precios reconstruidos de la extracción del PDF (Latte 125/100, Flat White 135/125, Mocca 140/110, Matcha Latte 140/120) fueron **revisados y confirmados** por el cliente.

Los 2 productos `productsToUpdate` son `Espresso Doble` y `Latte 12oz`, que quedaron **COMPOUND** en el tenant de pruebas por la corrección de recetas inertes de hoy. El import hace actualización de precio únicamente y **nunca toca el tipo**, así que siguen COMPOUND ahí. En el tenant limpio del cliente los 58 se crean SIMPLE.

**Criterio de control:** si el preview en el tenant del cliente no da `56 a crear / 2 a actualizar / 0 recetas / 0 insumos / 0 errores`, **parar** e investigar antes de commitear.

| # | Check | Evidencia esperada | Estado |
|---|---|---|---|
| 0.1 | Tenant provisionado (`npm run provision`) con nombre, RUC y slug correctos | fila en `tenants`, `is_active=true` | |
| 0.2 | Dueño creado con email, contraseña y PIN de 6 dígitos | login del dueño funciona | |
| 0.3 | **Serie fiscal DGI configurada** (prefijo + consecutivo inicial de la autorización) | `initializeRange()` ejecutado; sin esto `FiscalSequenceUnconfiguredError` **bloquea toda facturación** | |
| 0.4 | Menú importado por Excel (`Configuración → Importar menú`) | preview sin errores; ver Fase 0-bis | |
| 0.5 | Productos creados como **SIMPLE** con precio > 0 y `is_active=true` | ver Fase 0-bis | |

### Fase 0-bis — Import del menú (reglas que causan fallos reales)

| # | Check | Por qué |
|---|---|---|
| 0.6 | Se usó **la plantilla oficial**, no un Excel propio | las **5 columnas son obligatorias** como encabezado: `producto, precio, insumo, cantidad, unidad`. Un archivo de 2 columnas es **rechazado** |
| 0.7 | Se **borró la fila de ejemplo** de las 6 hojas | si queda, crea un producto real `Cappuccino 8oz` (COMPOUND) + insumo `Café molido`. Es comportamiento diseñado, no un bug, y ensucia el menú |
| 0.8 | `insumo`, `cantidad`, `unidad` quedaron **vacías** en todas las filas | es lo único que separa SIMPLE de COMPOUND |
| 0.9 | Se pasó por **preview** antes de commit | `productsToCreate`, `recipesToCreate: 0`, `insumosToCreate: []`, `errors: []` |
| 0.10 | Precio por fila numérico y sin conflicto | precio faltante o contradictorio bloquea el commit completo |

**Salida de fase:** el preview reporta 0 recetas, 0 insumos, 0 errores.

---

# Fase 1 — Arranque y login inicial

**Promesa: el sistema autentica al negocio y a su gente, y sabe quién puede operar.**

| # | Check |
|---|---|
| 1.1 | Arranque en frío sin crash ni pantalla en blanco |
| 1.2 | Login online con credenciales del dueño (email + contraseña) |
| 1.3 | El staff se sincroniza y aparece completo en la selección de usuario |
| 1.4 | Un usuario con tenant vacío **no** degrada la terminal (regresión del defecto de hoy) |
| 1.5 | La terminal queda vinculada al tenant (`local_configs['tenant_id']` presente) |
| 1.6 | Con red caída, el login online falla con mensaje claro y **no** destruye la sesión de dispositivo |

**Señal de alerta:** si algún usuario local queda con `tenant_id` NULL, la venta cae al camino
legacy y los COMPOUND se vuelven invendibles. Hoy está curado en cada pull, pero se verifica.

---

# Fase 2 — Login por PIN offline

**Promesa: el cajero entra a operar aunque no haya internet.**

| # | Check |
|---|---|
| 2.1 | **Con la red desconectada**, "Modo Operativo (Cajeros con PIN)" lista usuarios |
| 2.2 | PIN correcto entra; PIN incorrecto rechaza con mensaje claro |
| 2.3 | Ningún mensaje muestra UUIDs, códigos internos ni inglés |
| 2.4 | El bloqueo por intentos fallidos funciona y es acotado (no deja la cuenta muerta) |
| 2.5 | Al entrar, la pantalla de ventas se reconstruye limpia y carga el turno del operador correcto |

---

# Fase 3 — Activación de terminal

**Promesa: la terminal queda operativa y verificada.** Ojo: **esta fase factura de verdad.**

| # | Check | Consecuencia |
|---|---|---|
| 3.1 | Vinculación con código de activación | el código expira; no reusar códigos quemados |
| 3.2 | Las 3 fases de onboarding avanzan sin saltos ni estados fantasma | |
| 3.3 | La verificación ejecuta una **factura de prueba real** | |
| 3.4 | **Esa factura consume un consecutivo DGI de forma permanente** | el primer número comercial **no** es el inicial autorizado, es `inicial + 1`. El cliente debe aceptarlo |
| 3.5 | La factura de verificación queda marcada como tal y con `payment_status='paid'` | único camino que hoy setea `paid` |
| 3.6 | El Setup Center **no** vuelve a ofrecer activación para una terminal ya activa | defecto H-3 corregido |
| 3.7 | Al tocar "Ir al POS" el sync se dispara de inmediato | defecto H-4 corregido: antes esperaba 5 min |

---

# Fase 4 — Apertura de caja

**Promesa: el turno arranca con un fondo declarado y auditable.**

| # | Check |
|---|---|
| 4.1 | No se puede vender sin turno abierto (la pantalla de ventas muestra la apertura en su lugar) |
| 4.2 | Apertura con fondo en **NIO y USD** por separado |
| 4.3 | El fondo declarado se refleja como efectivo esperado del turno |
| 4.4 | El turno queda ligado a **usuario + terminal** (no al terminal solo) |
| 4.5 | El turno sincroniza al cloud (`cashier_sessions.sync_status` pasa a `synced`) |

**Riesgo abierto R-3:** hoy un turno abierto puede quedar `sync_status='pending'`
indefinidamente. El endpoint `POST /api/sales/shifts/sync` existe, así que hay que verificar
si es un fallo o una feature a medias. **No bloquea la venta local, sí la verdad en el cloud.**

---

# Fase 5 — Venta simple con efectivo y vuelto

**Promesa: cobro exacto, vuelto correcto, descuento de inventario honesto.**

| # | Check |
|---|---|
| 5.1 | Producto del menú (SIMPLE) se agrega y muestra precio correcto |
| 5.2 | Cobro con monto exacto cierra la venta |
| 5.3 | **Cobro con monto mayor calcula el vuelto correcto** (el caso reportado hoy) |
| 5.4 | Vuelto en NIO y en USD, con el tipo de cambio comercial aplicado |
| 5.5 | El vuelto **no** infla el monto del pago en el registro |
| 5.6 | La factura queda `APPLIED_NO_INVENTORY_IMPACT` con razón `NO_EXPLICIT_INSUMO_MAPPING` (SIMPLE sin insumos) |
| 5.7 | **No** se escribe ningún movimiento de kardex |
| 5.8 | Numeración DGI consecutiva, sin saltos |
| 5.9 | La factura sincroniza al cloud con totales correctos |

**Riesgo abierto R-2:** `payment_status` queda `'pending'` en **toda** venta normal — nada lo
setea a `paid` salvo el camino de activación. Si el cliente mira su dashboard, verá facturas
cobradas como impagas. **Corregir antes del viernes.**

---

# Fase 6 — Venta con tarjeta

**Promesa: el cobro con tarjeta queda registrado con su rastro completo.**

| # | Check |
|---|---|
| 6.1 | Diálogo de datáfono completo (marca, tipo débito/crédito, banco) |
| 6.2 | Voucher rápido (`PENDIENTE`) permitido para no frenar la cola |
| 6.3 | El pago llega al cloud con marca, banco y estado de conciliación |
| 6.4 | La venta no queda bloqueada esperando autorización |

# Fase 7 — Pago dividido (multi-tender)

**Promesa: un ticket se cobra con varios medios sin perder un centavo.**

| # | Check |
|---|---|
| 7.1 | Efectivo + tarjeta en el mismo ticket, saldo restante baja a 0.00 |
| 7.2 | Efectivo NIO + efectivo USD + tarjeta (3 medios) |
| 7.3 | El botón de cobro se **deshabilita** mientras no esté saldado |
| 7.4 | Ambos pagos llegan al cloud ligados a la misma factura |
| 7.5 | La suma de pagos cuadra exactamente con el total |

# Fase 8 — Anulación, nota de crédito y reimpresión

**Promesa: se puede corregir un error sin romper la ley ni la trazabilidad.**

| # | Check |
|---|---|
| 8.1 | La factura **no se borra nunca**: solo se marca anulada |
| 8.2 | Anulación exige autorización (rol y/o PIN de supervisor) |
| 8.3 | La nota de crédito revierte totales y respeta la cadena fiscal |
| 8.4 | Anular dos veces se rechaza con mensaje honesto y en español |
| 8.5 | La reimpresión reproduce el documento **como se emitió** (snapshot), no recalcula |
| 8.6 | Si la impresora no imprime, el sistema **lo dice** en vez de mentir con un éxito |

---

# Fase 9 — Corte X y Corte Z

**Promesa: leer el turno sin cerrarlo, y cerrarlo de forma inmutable.**

| # | Check |
|---|---|
| 9.1 | **Corte X**: lectura parcial de ventas y efectivo esperado, **sin cerrar** el turno |
| 9.2 | El Corte X no altera la numeración fiscal |
| 9.3 | **Arqueo ciego**: se cuenta físicamente **antes** de ver el esperado |
| 9.4 | La diferencia se calcula después del conteo |
| 9.5 | Discrepancia sobre el umbral exige autorización de gerencia |
| 9.6 | **Corte Z**: congela el turno, calcula diferencias, genera **número Z secuencial** |
| 9.7 | El Corte Z queda bloqueado si hay **vouchers pendientes de conciliar** |
| 9.8 | Un turno cerrado no se puede reabrir ni modificar |
| 9.9 | Corte X y Corte Z en **NIO y USD** |

# Fase 10 — Movimientos de caja

| # | Check |
|---|---|
| 10.1 | Ingreso y retiro manual con motivo |
| 10.2 | Retiro exige **PIN de supervisor** |
| 10.3 | Caja chica y depósito a bóveda (safe drop) |
| 10.4 | Cada movimiento actualiza el efectivo esperado de inmediato |
| 10.5 | Los movimientos quedan auditados con usuario y hora |

# Fase 11 — Conciliación de vouchers

| # | Check |
|---|---|
| 11.1 | La lista muestra los vouchers de tarjeta **del turno activo** |
| 11.2 | Se cargan los códigos de autorización de los vouchers físicos |
| 11.3 | Un voucher conciliado sale de la lista de pendientes |
| 11.4 | El Corte Z se desbloquea al conciliar el último voucher |

---

# Fase 12 — Cambio de operador (pase de turno)

**Promesa: cambiar de cajero sin destruir la sesión del dispositivo.**

| # | Check |
|---|---|
| 12.1 | "Cambiar operador" está disponible en el drawer |
| 12.2 | Con caja abierta, el pase se **rechaza** y manda a cerrar caja primero |
| 12.3 | Sin caja abierta, el pase pide **solo el PIN del que entra** |
| 12.4 | **El sync sigue funcionando tras el pase** (no hay que reloguear) |
| 12.5 | El operador entrante carga **su propio** turno, nunca el del saliente |
| 12.6 | Ninguna venta queda atribuida al operador equivocado |
| 12.7 | "CERRAR SESIÓN" sigue funcionando como cierre de dispositivo |

---

# Fase 13 — Sincronización

**Promesa: el cloud refleja la verdad, y el operador sabe cuándo no.**

| # | Check |
|---|---|
| 13.1 | Badge de sync verde en operación normal |
| 13.2 | **"Pendientes en Outbox: 0"** cuando no hay nada pendiente (regresión del falso positivo de hoy) |
| 13.3 | Cada factura llega al cloud con ítems, pagos y totales íntegros |
| 13.4 | El freshness reporta `COMPLETE` en operación con tráfico |
| 13.5 | Con red caída: se sigue vendiendo, y al volver la red todo sube |
| 13.6 | El badge **no** queda en 1 para siempre por un documento ya entregado |
| 13.7 | Tras un reboot del dispositivo, el sync arranca sin intervención |

# Fase 14 — Reportes y cierre del día

| # | Check |
|---|---|
| 14.1 | Historial de ventas del día completo y correcto |
| 14.2 | Reporte de ventas por tipo de pago |
| 14.3 | Reporte fiscal (DGI) sin huecos de numeración |
| 14.4 | Cierre de caja del último turno con diferencias declaradas |
| 14.5 | Todos los turnos del día cerrados y sincronizados |
| 14.6 | El día siguiente abre con numeración continuada, sin reinicio |

---

# Riesgos abiertos ordenados por impacto en el día 1

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| **R-1** | `taxRate`/`isTaxExempt` estaban excluidos del contrato de sync; el POS guardaba `0.0` mientras el cloud decía `0.15` | **DGI** bajo Régimen General: toda línea se declaraba exenta | **CORREGIDO** (`ee55ad9c`) — el backend emite ambos desde las columnas. Cuota Fija (el cliente del viernes) nunca estuvo afectado |
| **R-2** | `payment_status` quedaba `'pending'` en toda venta normal | el dashboard mostraba cobrado como impago | **CORREGIDO** (`5fd5cb76`) — `saveSale` resuelve el estado con el mismo `SplitPaymentCalculator` que habilita COBRAR |
| **R-3** | ~~Turno abierto con `sync_status='pending'`~~ **NO es un defecto — verificado** | El turno abierto **sí** llega al cloud (`status=OPEN`, terminal y cajero correctos, verificado en `cash_shift_sessions`). `sync_service` marca `synced` **solo a los cerrados** a propósito: un turno abierto sigue mutando (los movimientos alteran el esperado) y se re-empuja en cada ciclo. El `pending` local es el estado esperado, no un fallo | Cerrado — falsa alarma |
| **R-4** | Mensaje de error de venta: UUID crudo, en inglés, **oculto bajo el carrito**, y COBRAR reintenta sin límite | ante un fallo el operador no sabe qué pasó y no puede reaccionar | Sin corregir — **§4.1 "hides a material side effect"** |
| **R-5** | La fila de ejemplo de la plantilla crea un producto fantasma COMPOUND | ensucia el menú y agrega un insumo no pedido | Documentado en 0.7 |
| **R-9** | `prepare()` acumula hechos de autoridad **por línea de carrito sin de-duplicar**, y `_validatedFacts` rechaza identidades duplicadas | **Puede morder el DÍA 1**: el mismo producto en dos líneas (distinta variante o modificadores) duplica el `AuthorityProduct` y **aborta el checkout entero**. No requiere recetas. Dos productos que comparten un insumo (dos bebidas con leche) lo mismo | **EN CORRECCIÓN** — hallado al cerrar R-6 |
| **R-6** | Un mapeo directo (`mappingVersionId` + `insumoId`) sin receta no resolvía su insumo (se pueblaba solo desde cierres de receta) y el guard tumbaba **todo** el checkout | Aparece al integrar insumos/mapeos, no el viernes | **CORREGIDO** — hidratación en sync + lectura en `prepare()`, con test end-to-end |
| **R-7** | La factura de prueba de activación consume un consecutivo DGI | el primer número comercial no es el inicial autorizado | Informar al cliente |
| **R-8** | Venta COMPOUND sin receta publicada → `APPLIED_INVENTORY_PENDING` | **no bloquea**: está diseñado, y se remedia al publicar la receta | Cerrado como riesgo |

## Riesgos ya cerrados hoy (con evidencia)

- Tenant borrado por el pull de usuarios → venta COMPOUND invendible. Corregido y verificado.
- Badge de outbox con falso positivo permanente. Corregido y verificado en dispositivo (0 pendientes).
- Recetas inertes por tipo de producto + delta que nunca reenviaba. Corregido.
- Sync no disparado tras la activación (esperaba 5 min). Corregido.
- Cambio de operador destruía la sesión del dispositivo. Corregido.
- Keystore con circuit breaker crónico en tablets sin hardware-backed key. Corregido.
- Setup Center re-ofreciendo activación. Corregido.

---

# Puerta de salida (release gate)

El día 1 se considera **habilitado** solo si:

1. Fases 0 a 14 ejecutadas en una terminal real, en orden, en **un solo día de trabajo simulado**.
2. Ningún **Core Promise blocker** (§4.1) abierto en el flujo principal de venta, caja o fiscal.
3. `0` diferencias entre lo que el POS dice y lo que el cloud muestra, para: facturas, pagos,
   turnos y numeración.
4. Ningún paso requiere conocimiento técnico del operador (ni UUIDs, ni códigos internos, ni inglés).
5. Con la red caída: se vende, se cobra, se da vuelto, y al volver la red **todo** llega al cloud.

**Criterio de honestidad:** si algo no se pudo probar, se declara **no probado**, no "OK".
Un check sin evidencia observada es un check en rojo.
