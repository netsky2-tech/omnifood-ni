# Dashboard V2 — QA de staging por régimen fiscal

Objetivo: confirmar en staging que **Rentabilidad** confía en el costo según lo que el
sistema puede probar, y que **ningún valor se fabrica**. El criterio de aprobación no es
"se ve un número": es que el número aparezca **sólo cuando hay evidencia de costo**.

Cada afirmación de este documento está leída del código en `main` (tras #621, merge
`418c81d5`) con archivo y línea. Los identificadores SQL fueron verificados contra las
entidades y migraciones — en particular `invoices.type = 'creditNote'` (camelCase, no
`credit_note`), el prefijo `'invoice:'` de `source_document_id`, y `"averageCost"` entre
comillas dobles.

---

## 0. Qué se está probando de verdad

La cobertura **no** se deriva del monto de costo del período, ni de la frescura. Se deriva
de hechos registrados por venta: `invoices.inventory_outcome` más los movimientos `SALE`
asociados en `inventory_kardex`.

Clasificador de evidencia — `apps/admin_backend/src/modules/inventory/services/inventory-reports.service.ts:87-108`:

| Movimientos `SALE` de la factura | Veredicto |
|---|---|
| `total_cost_nio ≠ 0`, **o** `total_cost_nio IS NULL` con `unit_cost_nio ≠ 0`, y `quantity ≠ 0` | `costed` |
| costo registrado en **0** | `zero` → razón `ZERO_COST_BASIS` |
| sin movimientos, o todos con `quantity = 0` | `missing` → razón `MISSING_COST_BASIS` |

Por estado de la venta (mismo archivo, `:353-417`):

| `inventory_outcome` | Efecto |
|---|---|
| `APPLIED` | costada sólo con evidencia; si no, `ZERO_COST_BASIS` / `MISSING_COST_BASIS` |
| `APPLIED_NO_INVENTORY_IMPACT` | **siempre uncosted**. Razón = `NO_EXPLICIT_INSUMO_MAPPING` sólo si la razón grabada lo dice; si no, `MISSING_COST_BASIS` |
| `APPLIED_INVENTORY_PENDING` | uncosted, `MISSING_INVENTORY_IMPACT` |
| nulo / vacío / desconocido | uncosted, `UNRESOLVED_SOURCE_DOCUMENT` |
| `type = 'creditNote'` o `is_canceled = true` | **fuera del conteo** (predicado de cobertura, `src/core/reporting/sales-reporting-semantics.ts:193-197`) |

Veredicto del período (`:429-441`): `uncosted = 0` → `COMPLETE`; si no, con alguna costada →
`PARTIAL`; si ninguna está costada → `UNAVAILABLE`.

El gate que consume el frente — `apps/owner_dashboard/src/features/dashboard/dashboard-types.ts`,
`evaluateMarginGate`:

| Cobertura | `%` margen | Δ pp | Monto |
|---|---|---|---|
| `COMPLETE` | sí | sólo si el comparativo también es `COMPLETE` | sí |
| `PARTIAL` | **no** | no | **sí**, con caveat |
| `UNAVAILABLE` | no | no | no |

> **Aclaración importante:** no existe un código `INVENTORY_COST_NOT_CONFIGURED`. El set
> cerrado son los seis de `src/modules/inventory/dto/inventory-reports.dto.ts:44-50`, y
> `INCOMPLETE_SYNC` está declarado pero **no se emite nunca** porque el servicio no puede
> probarlo desde lo que lee. La cobertura tampoco consulta el régimen fiscal: el régimen
> cambia *qué datos existen*, no el veredicto.

---

## 1. Preparación

Hace falta un tenant por caso. `:tenantGral` / `:tenantFija` son `tenant_id` uuid.

```sql
-- Panorama: regimen vigente, productos con costo, y volumen de facturacion.
SELECT t.id, t.slug,
       (SELECT f.payload->>'regime'
          FROM fiscal_config_revisions f
          WHERE f.tenant_id = t.id
          ORDER BY f.revision DESC LIMIT 1) AS regimen,
       (SELECT count(*) FROM products p
         WHERE p.tenant_id = t.id AND p."averageCost" > 0) AS productos_con_costo,
       (SELECT count(*) FROM invoices i
         WHERE i.tenant_id = t.id AND i.is_canceled = false
           AND i.created_at >= now() - interval '30 days') AS facturas_30d
FROM tenants t
WHERE t.id IN (':tenantGral', ':tenantFija');
```

Si `productos_con_costo = 0` en el tenant que querés usar para el Caso A, **no hay Caso A
que probar**: cargá costo real (o una receta con insumos que tengan costo promedio no nulo)
antes de seguir. Un `UNAVAILABLE` general no demuestra nada sobre el camino `COMPLETE`.

---

## 2. Los tres casos, con su consulta de verificación

### Caso A — todo costeado → `COMPLETE`, `%` y monto visibles

```sql
SELECT i.invoice_number, i.type, i.inventory_outcome,
       count(k.id) AS movimientos_sale,
       sum(coalesce(k.total_cost_nio, k.unit_cost_nio * k.quantity)) AS costo_registrado
FROM invoices i
LEFT JOIN inventory_kardex k
       ON k.source_document_id = 'invoice:' || i.id::text
      AND k.movement_type = 'SALE'
WHERE i.tenant_id = ':tenantGral'
  AND i.is_canceled = false
  AND i.type <> 'creditNote'
  AND i.created_at::date BETWEEN ':desde' AND ':hasta'
GROUP BY i.id, i.invoice_number, i.type, i.inventory_outcome
ORDER BY i.invoice_number;
```

**Esperado en datos:** cada fila `APPLIED` con `costo_registrado` no nulo y ≠ 0.
**Esperado en la UI** (rango = mes en curso):
- `% de margen` visible, `Monto de margen` visible.
- Sin caveat de cobertura ni en la tarjeta ni en el tile.
- El Δ pp aparece **sólo** si el período comparativo también cierra `COMPLETE`.

### Caso B — ventas sin evidencia de costo → `UNAVAILABLE`, **ni % ni monto**

El caso típico de **Cuota Fija** sin recetas cargadas: vende, pero el sistema no tiene de
dónde sacar el costo.

```sql
SELECT i.inventory_outcome,
       i.inventory_outcome_reason,
       count(*) AS ventas
FROM invoices i
WHERE i.tenant_id = ':tenantFija'
  AND i.is_canceled = false
  AND i.type <> 'creditNote'
  AND i.created_at::date BETWEEN ':desde' AND ':hasta'
GROUP BY 1, 2
ORDER BY ventas DESC;
```

**Esperado en datos:** ventas en `'APPLIED_NO_INVENTORY_IMPACT'`, o `APPLIED` sin
movimientos `SALE` costeados. Ninguna sale `costed` → veredicto `UNAVAILABLE`.

**Esperado en la UI:**
- La tarjeta **Rentabilidad no se renderiza** con monto; el tile muestra `—`, **nunca**
  `0.0%` ni `100%`.
- Caveat en dos líneas: `Costo de ventas no disponible` + `Razones: <códigos>`.
- Con `inventory_outcome_reason` nulo o `{}` tenés que ver **`MISSING_COST_BASIS`**, no
  `NO_EXPLICIT_INSUMO_MAPPING`: el read de cobertura no junta contra `invoice_items`, así
  que no puede probar que falte el mapeo del insumo. Ver `NO_EXPLICIT_INSUMO_MAPPING` con
  razón nula es un **bug** (lo introdujo la remediación D6, corregido en `00211f45`).

### Caso C — mixto: parte costeada, parte no → `PARTIAL`, monto con caveat y **sin %**

El más frecuente en un food park real: los productos con receta cargada costean; los de
reventa directa (gaseosas, snacks) no.

```sql
SELECT CASE
         WHEN k.id IS NULL THEN 'sin_movimiento'
         WHEN coalesce(k.total_cost_nio, k.unit_cost_nio * k.quantity) = 0 THEN 'costo_cero'
         ELSE 'costeada'
       END AS evidencia,
       count(DISTINCT i.id) AS facturas
FROM invoices i
LEFT JOIN inventory_kardex k
       ON k.source_document_id = 'invoice:' || i.id::text
      AND k.movement_type = 'SALE'
WHERE i.tenant_id = ':tenantGral'
  AND i.is_canceled = false
  AND i.type <> 'creditNote'
  AND i.created_at::date BETWEEN ':desde' AND ':hasta'
GROUP BY 1;
```

**Esperado en datos:** al menos una `costeada` **y** al menos una no costada → `PARTIAL`.

**Esperado en la UI:**
- `% de margen`: `—`. Δ pp: oculto. `Monto de margen`: **visible**.
- Caveat exacto, en este orden, **idéntico en el tile y en la tarjeta**:
  1. `Costo parcial: la diferencia Ventas Netas − Costo de Ventas no es el margen real del período.`
  2. `Razones: <códigos>` si hay razones.
- Que el monto dé negativo **no** es bug ni hay que acotarlo: pasa legítimamente cuando un
  período chico recibe una devolución grande.

---

## 3. Invariantes que deben seguir valiendo en los tres casos

```sql
-- Paridad serie diaria vs KPI (FR-SYNC-06 / AC-07): comparalo con el JSON del endpoint.
SELECT round(sum(i.subtotal)::numeric, 2) AS ventas_netas_sql
FROM invoices i
WHERE i.tenant_id = ':tenantGral'
  AND i.is_canceled = false
  AND i.created_at::date BETWEEN ':desde' AND ':hasta';
```

> **No agregues `AND i.type <> 'creditNote'` a esta query.** El KPI Ventas Netas usa el
> predicado de ingresos, que **sí** incluye las notas de crédito con su signo persistido
> (`sales-reporting-semantics.ts:162-166`, `return !row.isCanceled`; y `salesRowNetSales`
> toma `subtotal` en `:200-202`).
> Excluirlas acá rompería la paridad que estás tratando de medir. Esa asimetría —el monto
> netea devoluciones y el conteo de tickets no— es exactamente lo que abre #624.

- **`Σ Ventas Netas == KPI Ventas Netas`** del mismo rango, y lo mismo para `Δ pp` contra
  el período desplazado completo.
- **`Σ share% > 100` es legal** en Top Productos: el denominador es Net Sales neto de
  devoluciones mientras cada numerador es el ingreso neto de un producto. Si ves `111.1%`,
  el número está bien y la nota de la tarjeta lo explica (ver #626, hallazgo S1).
  Lo que **no** puede pasar es que el share esté topado en 100 o que el `—` aparezca con
  denominador presente.
- **`Ticket promedio` puede dar negativo** con una devolución grande sobre pocos tickets:
  es la fórmula literal del PRD §7.5 (`Net Sales / Completed Tickets`). Está abierto como
  enmienda en **#624**; hasta que se apruebe, `-C$50.00` es comportamiento esperado y **no**
  es un fallo de QA.

---

## 4. Registro de ejecución

| Caso | Tenant | Rango | Cobertura esperada | Observado | OK |
|---|---|---|---|---|---|
| A Costeado | | `COMPLETE` + % + monto + Δ | | ☐ |
| B Sin evidencia | | `UNAVAILABLE`, `—`, razón correcta | | ☐ |
| C Mixto | | `PARTIAL`, monto + caveat, sin % | | ☐ |
| Paridad Σ diario == KPI | | igualdad exacta | | ☐ |

**Cómo clasificar un fallo:**
- A muestra `PARTIAL`/`UNAVAILABLE` → el costo no llega al kardex. Es un problema de
  ingesta/sync, **no** del dashboard: verificar antes `inventory_kardex` que el movimiento
  `SALE` exista con `total_cost_nio` no nulo.
- B muestra un `%` de margen → **bloqueante**: el gate se está saltando.
- C con caveat distinto entre tile y tarjeta → **bloqueante**: se perdió la copia compartida
  de `coverage-notes.ts`.
- B con `NO_EXPLICIT_INSUMO_MAPPING` y razón nula grabada → **bloqueante**: se está
  adivinando la causa desde el resultado.
