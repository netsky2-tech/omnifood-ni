# Delta: La cantidad del extra la manda el backoffice

## ADDED Requirements

### Requirement: ME-01 — La cantidad del efecto es dato de configuración

El backoffice MUST poder definir, por cada opción de modificador, la **cantidad del
efecto de inventario** que se aplica por unidad vendida, expresada en la unidad de
consumo del insumo afectado, y MUST poder dejarla **sin definir** de forma deliberada
(cuando el efecto se hereda de la receta).

El terminal MUST aplicar esa cantidad sin pedirle nada al operador.

#### Scenario: Opción con cantidad configurada

- GIVEN la opción «Jarabe extra» con `effect_quantity = 25` (ml) e insumo afectado «jarabe»
- WHEN el cajero elige «Jarabe extra» en el diálogo
- THEN la venta MUST aplicar 25 ml de jarabe por unidad vendida
- AND el cajero MUST NOT tener que escribir ninguna cantidad
- AND la línea MUST registrar el origen de la cantidad como `DECLARED`.

#### Scenario: Opción sin cantidad y con receta que hereda

- GIVEN la opción «Leche de almendra» con `effect_quantity = null` (sin definir) y un
  producto cuya receta tiene el componente «leche» en la misma unidad
- WHEN el cajero elige «Leche de almendra»
- THEN la venta MUST aplicar la cantidad del componente de la receta
- AND la línea MUST registrar el origen de la cantidad como `INHERITED`.

#### Scenario: Opción sin cantidad y sin receta que herede

- GIVEN la opción «Extra shot» con `effect_quantity = null` y un producto SIN receta
- WHEN el cajero elige «Extra shot»
- THEN la venta MUST completarse (el efecto nunca bloquea la venta)
- AND la línea MUST registrar el efecto como `PENDING` con motivo `INCOMPLETE`
- AND el backoffice MUST listar esa opción en los pendientes de configurar.

### Requirement: ME-02 — La pantalla anuncia la verdad

El diálogo de modificadores MUST anunciar, en lenguaje de negocio, **qué stock se mueve y
cuánto**, usando siempre el número que **realmente se va a aplicar**.

MUST NOT mostrar al cajero el concepto de «heredar» ni el origen técnico de la cantidad.

#### Scenario: La cantidad configurada se anuncia

- GIVEN la opción «Jarabe extra» con `effect_quantity = 25` y una receta de 15 ml
- WHEN el cajero abre el diálogo
- THEN la línea del extra MUST decir que suma 25 ml de jarabe
- AND MUST NOT decir 15 ml
- AND MUST NOT contener la palabra «heredar».

#### Scenario: La cantidad heredada se anuncia sin jerga

- GIVEN la opción «Leche de almendra» sin cantidad configurada, con receta de 15 ml
- WHEN el cajero abre el diálogo
- THEN la línea del extra MUST decir que suma 15 ml de leche
- AND MUST NOT mencionar que el número viene de la receta.

#### Scenario: El caso pendiente se dice con calma

- GIVEN la opción «Extra shot» sin cantidad configurada y sin receta
- WHEN el cajero abre el diálogo
- THEN la línea del extra MUST decir que su consumo de inventario queda pendiente de
  configuración
- AND MUST NOT pedirle una cantidad al cajero
- AND MUST NOT bloquear el alta del producto.

### Requirement: ME-03 — El backoffice dice qué falta configurar

El backoffice MUST listar las opciones con efecto de inventario cuya cantidad NO se puede
resolver, con el producto que las usa y la razón (sin cantidad configurada / unidades
incompatibles), para que el tenant configure el dato y no lo adivine en el mostrador.

#### Scenario: Listado de pendientes

- GIVEN la opción «Extra shot» con efecto `ADD`, sin `effect_quantity`, usada por un
  producto sin receta
- WHEN el owner entra a «Modificadores» y abre «Pendientes de configurar»
- THEN MUST listar «Extra shot», el producto que la usa y la razón
- AND MUST ofrecer el acceso directo a la configuración de la opción.

#### Scenario: Una opción configurada desaparece del listado

- GIVEN la opción «Jarabe extra» con `effect_quantity = 25`
- WHEN el owner vuelve a «Pendientes de configurar»
- THEN «Jarabe extra» MUST NOT aparecer.

### Requirement: ME-04 — El diálogo es independiente de la resolución

El diálogo de modificadores MUST adaptarse al ancho disponible (usa los breakpoints de
la suite), MUST NOT desbordar en ningún tamaño soportado, y sus controles MUST cumplir el
objetivo táctil de **48 dp** con tipografía legible.

#### Scenario: Sin desbordamiento en el terminal pequeño

- GIVEN el diálogo abierto en una pantalla de 360×640 dp
- WHEN se renderiza con un grupo de modificadores de 6 opciones
- THEN MUST NOT haber overflow
- AND cada opción MUST tener un alto de al menos 48 dp.

#### Scenario: Sin desbordamiento en la tableta del food park

- GIVEN el diálogo abierto en una pantalla de 800×1280 dp
- WHEN se renderiza con el grupo «Extras» y la opción con efecto de inventario
- THEN MUST NOT haber overflow
- AND el texto del efecto MUST ser legible (cuerpo mínimo de 12 dp).

#### Scenario: El tamaño del diálogo sigue al dispositivo

- GIVEN el diálogo abierto en una pantalla de 800×1280 dp
- WHEN se compara con el mismo diálogo en 360×640 dp
- THEN el ancho del diálogo MUST ocupar más en la tableta que en el terminal
- AND el contenido MUST seguir leyéndose igual en ambos.

## MODIFIED Requirements

### Requirement: ME-05 — La cantidad marcada es un override de supervisor

Cambiar a mano la cantidad del efecto de inventario MUST dejar de ser una acción libre
del cajero: MUST exigir la autorización de un supervisor (§33 del estándar POS), MUST
registrar el motivo, y la autorización MUST viajar con la línea.

#### Scenario: El cajero intenta cambiar la cantidad

- GIVEN un cajero sin rol de supervisor
- WHEN intenta cambiar la cantidad del efecto de un extra
- THEN el sistema MUST pedir la autorización de un supervisor
- AND MUST registrar la razón y el supervisor que autorizó.

#### Scenario: La autorización viaja con la línea

- GIVEN un extra con la cantidad cambiada bajo autorización de supervisor
- WHEN la venta se sincroniza con la nube
- THEN la línea MUST conservar la cantidad aplicada, la razón y el identificador del
  supervisor que autorizó
- AND el origen de la cantidad MUST quedar registrado como `OVERRIDE`.
