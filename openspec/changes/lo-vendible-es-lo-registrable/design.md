# Design: Lo que el terminal puede vender es lo que la nube puede registrar

## 1. El problema, en una frase

El terminal decidía con el **agregado** y la nube con los **lotes** ⇒ el terminal vendía
lo que la nube rechazaba, y ese rechazo congelaba la facturación.

## 2. La idea

> **La nube publica el número con el que va a decidir; el terminal decide con ese
> número.**

Ni un canal nuevo, ni una segunda fuente de verdad: el disponible por lote viaja en el
delta de insumos que la terminal ya espeja. Y la regla es **exactamente** la que la
nube aplica al dibujar (`drawBatchOutflow`: si hay lotes, se dibuja de ellos; si no, el
agregado es la única verdad).

## 3. El contrato publicado

```ts
// en el delta de insumos (inbound sync)
lotAvailableStock: number | null;  // la suma del saldo de sus lotes
isBatchManaged: boolean;           // si ese insumo se gestiona por lotes
```

`lotAvailableStock` es **null** cuando el insumo no tiene lotes ⇒ el agregado es la
única verdad ⇒ la terminal sigue como antes.

### Por qué el TOTAL y no los lotes individuales

La terminal no necesita saber **qué** lote sale (eso es FEFO, y es del cloud): necesita
saber **cuánto** hay. Un número, una regla, sin duplicar la lógica de rotación en el
terminal (que ya existe en `movement_engine_impl`, pero para los lotes que el terminal
mismo creó).

### Por qué no se rompe el delta incremental

El delta de insumos se arma con `insumos.updated_at > sinceDate`. El saldo de los lotes
cambia **siempre junto con** el agregado (el mismo movimiento toca los dos) ⇒ la fila
del insumo cambia también ⇒ el delta la cubre. Un cambio en el saldo de un lote que no
moviera el agregado no ocurre (la compra, la producción y el consumo mueven ambos).

## 4. La regla en el terminal

```dart
// un insumo por lotes: disponible por sus lotes (lo que la nube dibujará)
// un insumo sin lotes: disponible por su agregado (la única verdad)
final availableStock = insumoRow.isBatchManaged &&
        insumoRow.lotAvailableStock != null
    ? insumoRow.lotAvailableStock!
    : insumoRow.stock;
```

**El fallo seguro es el agregado.** Sin dato de lotes (una terminal que no ha recibido
el delta, o una fila anterior a la publicación), la terminal decide como antes ⇒ el
peor caso es una diferencia declarada (FD-01), nunca una venta imposible de registrar.

## 5. La configuración imposible

`ALLOW_TEMPORARY` significa «vende aunque no haya existencias». Para un insumo por
lotes eso es **una venta que la nube no puede registrar**: el agregado puede quedar
negativo, pero un lote no puede quedar negativo (su vencimiento es real y no se
inventa).

⇒ El servidor **rechaza** la combinación (crear y actualizar), con el porqué en el
mensaje. El formulario del backoffice la explica y, al marcar el insumo como
perecedero, **ofrece la política que sí se puede usar** (así el dueño puede corregir
un dato existente sin pelearse con el servidor).

**Por qué «perecedero» y no «tiene lotes»**: el control de configuración tiene que ser
una **capacidad** del insumo, no un hecho que cambia con los datos. Y la capacidad ya
existe: la compra crea el lote de un insumo perecedero (`requiresBatchTracking =
is_perishable`). El dato dinámico (tiene lotes hoy) es lo que viaja en el delta y lo
que decide en runtime.

## 6. Lo que NO cambia

- **La nube**: su regla de dibujo no se toca (ya era la correcta). Lo nuevo es que
  publica el número.
- **FD-01**: la nube sigue aplicando la factura y declarando la diferencia. Este
  change reduce las diferencias **fabricadas**; no elimina las **reales** (la carrera
  entre dos terminales).
- **El agregado**: sigue siendo el número que se reporta y el que se compara con los
  lotes en el diagnóstico de paridad.

## 7. La carrera entre dos terminales (y por qué no se puede evitar)

Dos terminales con la misma proyección de 50 ml en los lotes ⇒ las dos pueden vender
40 ml ⇒ la segunda la nube la acepta y declara la diferencia (FD-01).

**No se puede evitar sin un protocolo de reserva** (bloquear los lotes en la nube antes
de vender, con su propio contrato y su propio modo de fallo). Ese es un change mayor,
con su propia decisión de producto (¿bloquear en la nube? ¿qué pasa si la nube no
responde?). Y el daño está acotado: la diferencia se declara y se concilia, y **nadie
se congela** (FD-01).

## 8. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Que la terminal calcule el disponible con **sus** lotes | Los lotes de la terminal son los que ella creó; la nube tiene el saldo real (compras y producción del backoffice). Dos verdades. |
| Que la terminal pregunte a la nube antes de cada venta | Rompe el offline-first: una venta sin señal no se puede cerrar. |
| Un canal nuevo para el disponible por lote | El delta de insumos ya viaja y ya se espeja; un canal nuevo es una segunda fuente de verdad que se desincroniza. |
| Prohibir `ALLOW_TEMPORARY` sólo cuando el insumo **tiene** lotes | Sería un hecho, no una capacidad: aparecería y desaparecería con los datos, y el error llegaría en el momento de cobrar. |
| Un protocolo de reserva de lotes en la nube | Es el arreglo DEFINITIVO de la carrera entre terminales, pero es un change mayor con su propia decisión de producto. Se deja declarado (tarea A-3 del change hermano). |
