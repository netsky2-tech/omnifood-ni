# Delta: Lo que el terminal puede vender es lo que la nube puede registrar

## ADDED Requirements

### Requirement: SP-01 — La disponibilidad de un insumo por lotes es la de sus lotes

Un insumo gestionado por lotes MUST estar disponible por la **suma del saldo de sus
lotes** (los no vencidos, en orden FEFO), que es la cantidad que la nube va a dibujar
de ellos.

Un insumo **sin** lotes MUST seguir disponible por su stock agregado: sin lotes, el
agregado es la única verdad.

La nube MUST NOT inventar lotes para cubrir una diferencia, y el terminal MUST NOT
vender contra el agregado de un insumo cuyos lotes no cubren la salida.

#### Scenario: El terminal no vende lo que la nube no puede registrar

- GIVEN un insumo con 150 ml de stock agregado y 50 ml en sus lotes
- WHEN la terminal prepara una venta que consume 100 ml de ese insumo
- THEN la venta MUST ser rechazada antes de cobrar
- AND el motivo MUST señalar la disponibilidad por lotes.

#### Scenario: Un insumo sin lotes se comporta como antes

- GIVEN un insumo sin lotes registrados y 150 ml de stock
- WHEN la terminal prepara una venta que consume 100 ml
- THEN la venta MUST aceptarse
- AND la regla MUST seguir siendo la del stock agregado.

### Requirement: SP-02 — La nube publica el disponible por lote

La nube MUST publicar, en el delta de insumos que la terminal ya espeja, la suma del
saldo de los lotes de cada insumo (`lotAvailableStock`) y si ese insumo se gestiona por
lotes (`isBatchManaged`).

Para un insumo sin lotes, `lotAvailableStock` MUST ser nulo.

La publicación MUST NOT abrir un canal nuevo: viaja con el delta existente.

#### Scenario: El delta lleva el disponible por lote

- GIVEN un insumo con 50 ml en sus lotes
- WHEN la terminal pide el delta de insumos
- THEN ese insumo MUST llegar con `lotAvailableStock` = 50 y `isBatchManaged` = verdadero.

#### Scenario: Un insumo sin lotes llega con el disponible en nulo

- GIVEN un insumo sin lotes registrados
- WHEN la terminal pide el delta de insumos
- THEN ese insumo MUST llegar con `lotAvailableStock` = nulo.

### Requirement: SP-03 — El fallo seguro es usar el agregado

Cuando la terminal NO tiene el dato de lotes (una terminal que no ha recibido el delta,
o una fila anterior a la publicación), MUST seguir aplicando la regla del stock
agregado.

La terminal MUST NOT bloquear una venta por falta de información de lotes.

#### Scenario: Sin dato de lotes, la venta se decide por el agregado

- GIVEN un insumo con 150 ml de stock y sin dato de lotes publicado
- WHEN la terminal prepara una venta que consume 100 ml
- THEN la venta MUST aceptarse.

### Requirement: SP-04 — La combinación imposible se rechaza con su razón

Un insumo perecedero (gestionado por lotes) MUST NOT poder configurarse con la política
`ALLOW_TEMPORARY` (vender sin existencias): la política permite una venta que la nube
no puede registrar, porque un lote sin fecha de vencimiento real no se puede crear.

El servidor MUST rechazar la configuración con un mensaje que explique el porqué, y el
formulario del backoffice MUST explicar lo mismo y ofrecer la corrección.

#### Scenario: El servidor rechaza la combinación

- GIVEN un insumo perecedero
- WHEN se intenta guardarlo con la política `ALLOW_TEMPORARY`
- THEN el servidor MUST rechazar el guardado
- AND el mensaje MUST explicar que un lote sin vencimiento real no se puede crear.

#### Scenario: El formulario corrige el dato

- GIVEN un insumo con la política `ALLOW_TEMPORARY`
- WHEN el dueño marca el insumo como perecedero
- THEN el formulario MUST ofrecer la política que sí se puede usar
- AND MUST explicar por qué la otra no está disponible.

### Requirement: SP-05 — La diferencia no se fabrica

Con la terminal y la nube leyendo la misma disponibilidad, una venta normal MUST NOT
producir una divergencia de inventario.

Una divergencia MUST seguir siendo posible (y declararse) cuando la nube cambia entre
la proyección que la terminal recibió y la venta: eso es una carrera real entre
terminales, y se DECLARA (FD-01), no se bloquea.

#### Scenario: Una venta normal no genera divergencia

- GIVEN un insumo por lotes con 50 ml en los lotes y la terminal al día
- WHEN se vende 40 ml
- THEN la nube MUST aceptarla sin declarar ninguna diferencia.

#### Scenario: La carrera entre dos terminales se declara

- GIVEN dos terminales con la misma proyección de 50 ml en los lotes
- WHEN las dos venden 40 ml antes de sincronizar
- THEN la nube MUST aceptar la segunda declarando la diferencia
- AND MUST NOT bloquear el flujo fiscal.
