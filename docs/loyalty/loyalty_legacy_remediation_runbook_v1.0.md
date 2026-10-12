# Runbook de remediación legacy — migración 70→71 del ledger de lealtad (POS)

**v1.0 — 2026-02-14 · Audiencia: operador / soporte técnico · Producto: NHILOS POS (Flutter/Floor, SQLite)**
**Origen:** follow-up #3 de la tabla post-gate de lealtad. Issue #881 cerró T4; este runbook cubre el procedimiento operador previo/al despliegue de la build que contiene `migration70_71`.

---

## 1. Qué hace la migración y por qué puede abortar

Al abrir por primera vez una build con la migración `70 → 71`
(`apps/pos_app/lib/data/database/migrations.dart` → `ensureLoyaltyLedgerIdentitySchema`),
el POS instala sobre `customer_point_transactions`:

1. **Cuatro índices únicos parciales** (identidades V1, arch §9.3):
   | Identidad | Clave | Predicado |
   |---|---|---|
   | idempotencia | `idempotency_key` | `idempotency_key IS NOT NULL` |
   | EARN | `ticket_id, loyalty_program_id` | `LOWER(transaction_type)='earn'` |
   | REDEEM | `ticket_id` | `LOWER(transaction_type)='redeem'` |
   | REVERSAL | `reversal_of_transaction_id` | `LOWER(transaction_type)='reversal'` |
2. **Triggers BEFORE INSERT/UPDATE** que aplican la semántica de clave §9.3 de aquí en adelante.

Antes de cualquier DDL, la migración **escanea en solo lectura** las filas
existentes y **aborta fail-closed** si encuentra datos que violarían esas reglas.
Nunca borra, reescribe ni salta filas del ledger. Las filas con
`transaction_type IS NULL` son el **namespace legacy/transicional**: no hacen
ninguna declaración de identidad V1 y **nunca son violaciones** — así permanece
vivo el historial pre-V1 y el path pre-V1 no atribuido (T4).

> **Regla dura (DGI / append-only):** este runbook jamás indica `DELETE` sobre
> `customer_point_transactions`. Toda remediación es completar una clave o
> re-clasificar la declaración de tipo.

## 2. Qué ve el operador cuando la migración aborta

La app no arranca y el reporte es un `StateError` legible con uno de dos prefijos:

- **`LOYALTY_LEDGER_TYPE_SEMANTICS_VIOLATION`** — filas con tipo declarado que
  no cumplen la forma: `EARN` sin `ticket_id` o sin `loyalty_program_id`;
  `REDEEM` sin `ticket_id`; `REVERSAL` sin `reversal_of_transaction_id`.
  El reporte trae: regla violada, conteo y hasta 10 `id` de muestra.
- **`LOYALTY_LEDGER_DUPLICATE_IDENTITY`** — grupos de filas que chocan contra
  una identidad única (ej. dos `EARN` con el mismo `ticket_id` +
  `loyalty_program_id`). El reporte trae: nombre del índice, grupos en
  conflicto, ocurrencias y `id` de muestra.
- **`LOYALTY_LEDGER_INDEX_DRIFT`** — existe un índice con el mismo nombre en
  otra relación o con otra definición. **No es un problema de datos**: es
  esquema, y se resuelve dropeando/renombrando el índice desviado. No siga este
  runbook; escale a ingeniería.

Después de remediadas las filas, **no hay que reintentar nada manualmente**: la
migración corre de nuevo sola en el siguiente arranque de la app.

## 3. Procedimiento de detección (solo lectura)

Ejecutar sobre la base del dispositivo (vía `adb shell sqlite3` o copia local).
Estas consultas reproducen exactamente los escaneos de la migración:

### 3.1 Violaciones de forma (semántica de tipo)

```sql
-- EARN declarada sin ticket o sin programa
SELECT id, customer_id, ticket_id, loyalty_program_id, created_at
  FROM customer_point_transactions
 WHERE LOWER(transaction_type) = 'earn'
   AND (ticket_id IS NULL OR loyalty_program_id IS NULL);

-- REDEEM declarada sin ticket
SELECT id, customer_id, ticket_id, created_at
  FROM customer_point_transactions
 WHERE LOWER(transaction_type) = 'redeem' AND ticket_id IS NULL;

-- REVERSAL declarada sin vínculo al movimiento revertido
SELECT id, customer_id, reversal_of_transaction_id, created_at
  FROM customer_point_transactions
 WHERE LOWER(transaction_type) = 'reversal'
   AND reversal_of_transaction_id IS NULL;
```

### 3.2 Duplicados de identidad

```sql
-- EARN duplicada por (ticket_id, loyalty_program_id)
SELECT ticket_id, loyalty_program_id, COUNT(*) AS n,
       GROUP_CONCAT(id) AS ids
  FROM customer_point_transactions
 WHERE LOWER(transaction_type) = 'earn'
 GROUP BY ticket_id, loyalty_program_id HAVING n > 1;

-- REDEEM duplicada por ticket
SELECT ticket_id, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
  FROM customer_point_transactions
 WHERE LOWER(transaction_type) = 'redeem'
 GROUP BY ticket_id HAVING n > 1;

-- REVERSAL duplicada por movimiento revertido
SELECT reversal_of_transaction_id, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
  FROM customer_point_transactions
 WHERE LOWER(transaction_type) = 'reversal'
 GROUP BY reversal_of_transaction_id HAVING n > 1;

-- Idempotencia duplicada (filas con key, cualquier tipo, incl. NULL)
SELECT idempotency_key, COUNT(*) AS n, GROUP_CONCAT(id) AS ids
  FROM customer_point_transactions
 WHERE idempotency_key IS NOT NULL
 GROUP BY idempotency_key HAVING n > 1;
```

Si las cuatro consultas devuelven cero filas, el dispositivo actualizará sin
abortar. **No hace falta ejecutar este runbook preventivamente en toda la flota**:
la migración falla cerrada y con reporte; solo los dispositivos que abortan
necesitan remediación.

## 4. Remediación por clase de violación

### 4.1 Forma violada — opción A: completar la clave (preferida)

Cuando la verdad de negocio es conocida y verificable (la factura existe, el
programa es el del ticket), **complete la clave**:

```sql
-- Ejemplo: EARN sin programa, pero el ticket identifica un único programa activo
UPDATE customer_point_transactions
   SET loyalty_program_id = '<programa-verificado>'
 WHERE id = <id-fila>;
```

Verifique siempre contra la fuente: tabla de facturas locales / programa activo
del período. Si no puede verificar la verdad, use la opción B. **Nunca
invente** una atribución para que la migración pase: el objetivo del guard es
justamente evitar filas EARN mentirosas.

### 4.2 Forma violada — opción B: re-clasificar al namespace legacy

Si la verdad no es reconstruible, devuelva la fila al namespace
legacy/transicional quitándole la declaración de tipo (la fila y sus puntos se
conservan íntegros; solo se cambia la clasificación):

```sql
UPDATE customer_point_transactions
   SET transaction_type = NULL
 WHERE id = <id-fila>;
```

Esto es lo que la migración llama "re-classify". Es un `UPDATE` de una columna
de clasificación, no una reescritura de identidad ni de importes: permitido.
El historial se consume como ledger legacy (así ya se consumen hoy las filas
pre-V1).

### 4.3 Duplicados de identidad

El objetivo: **una fila canónica por clave de identidad**, sin perder puntos.
Antes de tocar nada, verifique si ambas filas ya subieron a la nube
(`sync_status`) y cuál tiene el `idempotency_key` canónico.

1. **Duplicado exacto** (doble escritura del mismo movimiento: mismo ticket,
   mismo programa, mismos puntos): es un artefacto de bug ya corregido.
   Re-clasifique el duplicado al namespace legacy para que el ledger conserve
   la fila sin reclamar la identidad V1:

   ```sql
   -- conserva la fila de id menor como canónica
   UPDATE customer_point_transactions
      SET transaction_type = NULL
    WHERE id = <id-duplicado>;
   ```

2. **Clave colisionada con contenido distinto** (puntos, fechas o cliente
   distintos): **no decida solo** — son dos movimientos reclamando el mismo
   hueco. Re-key una de las dos filas (si corresponde a otro ticket real,
   corríjale el `ticket_id`; si no, re-clasifíquela a NULL) y registre el caso
   en el ticket de soporte con ambos `id`.

3. **Duplicado de `idempotency_key`**: la key pertenece al movimiento
   canónico. Re-clasifique la fila duplicada a `transaction_type = NULL` **y**
   límpiele la key para que no vuelva a chocar:

   ```sql
   UPDATE customer_point_transactions
      SET transaction_type = NULL, idempotency_key = NULL
    WHERE id = <id-duplicado>;
   ```

   Ojo: limpiar la key de una fila **no sincronizada** cambia su semántica de
   reenvío (podría duplicarse en la nube). Si la fila duplicada aún está
   `pending`, consulte primero con ingeniería.

### 4.4 Después de remedi

Vuelva a correr las consultas de detección (§3) — deben dar cero filas — y
abra la app. La migración re-escanea, instala índices y triggers, y la
actualización completa. Verifique en la app que el cliente afectado conserva su
saldo esperado.

## 5. Qué NO hacer

- ❌ `DELETE` sobre `customer_point_transactions` — el ledger es append-only y
  la migración misma se niega a borrar/reescribir.
- ❌ Fabricar `loyalty_program_id` / `ticket_id` solo para pasar el guard.
- ❌ Reintentar la actualización "a ver si ahora sí" sin correr la detección:
  el reporte del abort es la fuente; remediélo y deje que la migración reintente.
- ❌ Dropear índices o triggers `LOYALTY_LEDGER_*` por iniciativa propia (los
  triggers se recrean solos; un índice desviado es `INDEX_DRIFT` → ingeniería).

## 6. Escalado

Si el reporte de abort no calza en las clases de este runbook, o la remediación
requiere tocar filas ya sincronizadas a la nube, abra issue en
`netsky2-tech/omnifood-ni` con: el texto completo del `StateError`, el `id` del
dispositivo/terminal y la salida de las consultas de detección.

---

**Referencias:** arch §9.3/§5.3 (`docs/loyalty/loyalty_architecture_spec.md`),
migración en `apps/pos_app/lib/data/database/migrations.dart`
(`ensureLoyaltyLedgerIdentitySchema`), decisión sin-backfill de T4
(`odd/tasks/loyalty-t4-declared-transaction-types.md`).
