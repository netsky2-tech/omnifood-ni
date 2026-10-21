# Delta: La facturación no se congela por un problema de inventario

## ADDED Requirements

### Requirement: FD-01 — La factura nunca se rechaza por un problema de inventario

Un registro de venta MUST aplicar su **capa fiscal** (factura, correlativo, pagos y
verificación) con independencia de si la **capa de inventario** puede cuadrar. Un
problema de inventario MUST NOT producir el rechazo del registro, MUST NOT dejar el
registro en `pending` en el terminal y MUST NOT producir un hueco en la numeración.

La capa de inventario MUST quedar registrada con la diferencia que no pudo aplicarse.

#### Scenario: La venta excede lo que respaldan los lotes

- GIVEN un insumo gestionado por lotes con 50 ml en sus lotes y 150 ml en el agregado
- AND una venta que consume 150 ml de ese insumo
- WHEN la nube aplica el registro de la venta
- THEN la factura MUST quedar aplicada con su correlativo
- AND la diferencia de 100 ml MUST quedar registrada como una divergencia
- AND el flujo fiscal MUST NOT quedar bloqueado.

#### Scenario: La venta excede incluso el stock declarado

- GIVEN un insumo con 50 ml de stock declarado y una venta que consume 150 ml
- WHEN la nube aplica el registro de la venta
- THEN la factura MUST quedar aplicada
- AND el movimiento contra el stock agregado MUST quedar aplicado
- AND el exceso MUST quedar registrado como una divergencia
- AND el registro MUST ser reportado como aceptado con la diferencia.

#### Scenario: El siguiente registro del mismo flujo

- GIVEN una venta aceptada con divergencia
- WHEN la terminal envía la venta siguiente del mismo flujo y dispositivo
- THEN esa venta MUST poder aplicarse sin esperar a ninguna conciliación
- AND su correlativo MUST ser el siguiente correlativo, sin huecos.

### Requirement: FD-02 — Sólo los fallos fiscales bloquean el flujo

El bloqueo de un flujo de sincronización MUST reservarse para los fallos que son
**fiscales** (la numeración, la nota de crédito, la ruptura de la secuencia). Un fallo de
**inventario** MUST NOT bloquear el flujo.

El terminal MUST NOT dejar un registro *pending* por un rechazo de inventario, y MUST NOT
detener la emisión de correlativos por esa causa.

#### Scenario: Una divergencia no arrastra a las ventas siguientes

- GIVEN una venta que dejó una divergencia de inventario
- WHEN el terminal envía tres ventas más del mismo flujo
- THEN las tres MUST aceptarse en el mismo envío
- AND ninguna MUST reportarse como `BLOCKED_BY_PRIOR_FAILURE`.

#### Scenario: Un fallo fiscal sí bloquea

- GIVEN una venta cuyo correlativo choca con la secuencia esperada
- WHEN la nube la procesa
- THEN el flujo MUST quedar bloqueado a partir de ese registro
- AND el código MUST seguir siendo el de la ruptura de secuencia.

### Requirement: FD-03 — La diferencia queda registrada y es conciliable

Toda diferencia entre lo aplicado y lo que el inventario respaldaba MUST quedar registrada
como una **divergencia** con: el tenant, la venta que la originó (identificador y
número), el insumo, las **unidades** sin respaldo, el **valor** de esas unidades, la causa
y su estado.

La divergencia MUST NOT existir sin su venta: un registro sin su origen no es auditable.

La conciliación MUST ser un acto contable con evidencia (una regularización del insumo),
y MUST quedar registrada contra la divergencia.

#### Scenario: La divergencia describe la venta que la originó

- GIVEN una venta que consumió 150 ml de un insumo con 50 ml en sus lotes
- WHEN la divergencia queda registrada
- THEN MUST registrar la venta, el insumo, 100 ml sin respaldo y su valor
- AND su causa MUST identificar que los lotes no cubrieron la salida.

#### Scenario: La conciliación es una regularización

- GIVEN una divergencia abierta del insumo X
- WHEN se aplica una regularización del insumo X
- THEN la divergencia MUST quedar cerrada
- AND MUST registrar la regularización que la cerró.

### Requirement: FD-04 — El backoffice nombra el origen de la diferencia

El backoffice MUST permitir ver las divergencias abiertas con sus unidades y su dinero,
y MUST poder señalar los insumos cuyo stock agregado **no cuadra** con la suma de sus
lotes, con la magnitud del desajuste.

Un insumo con desajuste MUST quedar nombrado: sin nombrarlo, el dueño persigue la
diferencia a ciegas.

#### Scenario: El desajuste se nombra

- GIVEN un insumo con 150 ml de stock agregado y 50 ml en la suma de sus lotes
- WHEN el dueño abre el diagnóstico de paridad
- THEN ese insumo MUST aparecer con su desajuste de 100 ml.

#### Scenario: Las divergencias se listan

- GIVEN un negocio con divergencias abiertas
- WHEN el dueño abre el panel de divergencias
- THEN MUST_listar cada divergencia con su venta, su insumo, sus unidades y su valor.

### Requirement: FD-05 — La paridad se mantiene tras el movimiento

Tras aplicar una venta, el stock agregado del insumo MUST seguir cuadrando con la suma
de sus lotes. La parte de la salida que los lotes respaldan MUST consumirse de ellos
(FEFO); la parte que no respaldan MUST registrarse como divergencia y MUST quedar cargada contra el
stock agregado.

#### Scenario: El dibujo parcial consume lo que hay

- GIVEN un insumo con 50 ml en un lote y 150 ml de stock agregado
- WHEN se aplica una venta que consume 150 ml
- THEN el lote MUST quedar en 0 ml
- AND el stock agregado MUST quedar en 0 ml
- AND la divergencia MUST registrar 100 ml sin respaldo.

### Requirement: FD-06 — El terminal ve un aviso, nunca un bloqueo

Cuando la nube acepte una venta con una divergencia de inventario, el terminal MUST
informar el resultado con la diferencia MUST NOT presentarlo como un error que impida
seguir vendiendo, y MUST NOT mantener la venta en una cola de reintento.

#### Scenario: La venta con diferencia queda en el terminal

- GIVEN una venta aceptada con divergencia de inventario
- WHEN la terminal sincroniza
- THEN el resultado MUST reportarse como aceptado con la diferencia
- AND la venta MUST NOT quedar pendiente de reintento
- AND el operador MUST poder ver que la diferencia está por conciliar.

## MODIFIED Requirements

### Requirement: IM-02 — El dibujo de una salida por lotes

Cuando una salida por lotes no puede ser cubierta en su totalidad por las existencias de
los lotes, el sistema MUST **declarar la diferencia** en lugar de rechazar el movimiento,
y MUST NOT inventar existencias: un lote sin fecha de vencimiento real MUST NOT ser
creado para cubrir la diferencia.

El dibujo MUST NOT quedar por debajo de la salida cuando el sistema puede aplicarla
parcialmente contra el stock agregado declarado: el movimiento de la mercancía MUST
aplicarse, y lo que los lotes no respaldan MUST quedar como divergencia.

> Nota: este change aplica la excepción a la **ruta de venta**. Las rutas que no son
> fiscales (merma, variación de conteo) conservan el rechazo estricto, porque un
> faltante en una merma o en un conteo es un hecho físico que no se puede inventar.

#### Scenario: La salida se declara en vez de rechazarse

- GIVEN un insumo con lotes que no cubren la salida
- WHEN se aplica la venta
- THEN el movimiento MUST quedar aplicado
- AND la diferencia MUST quedar registrada como divergencia.

#### Scenario: Un insumo sin lotes no cambia de comportamiento

- GIVEN un insumo sin lotes registrados
- WHEN se aplica una venta
- THEN su stock agregado MUST funcionar como la única verdad, como hasta ahora.

## Out of Scope (declarado, no ignorado)

- **La varianza positiva de conteo sin lote** (`batches.expiration_date` es NOT NULL ⇒ no
  se puede crear un lote sin vencimiento real): es una fábrica de divergencias
  documentada en `docs/inventario_marco_normativo.md`. Se **abre como tarea**; este change
  garantiza que, mientras exista, **no** bloquee la facturación.
- **El ledger de lealtad**: un fallo de lealtad hoy también bloquea el flujo (el mismo
  defecto, hermano). Se **abre como tarea**: es otro ledger y merece su propio análisis.
