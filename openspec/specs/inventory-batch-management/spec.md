# Specification: Inventory Batch Management

## Purpose
Track inventory at the batch level for perishable items to enable FIFO consumption and expiration monitoring.

## Requirements

### Requirement: Batch Creation
The system MUST create a new batch record upon every purchase of an `isPerishable` item.

#### Scenario: Auto-batch creation on purchase
- GIVEN an Insumo "Leche" (isPerishable: TRUE)
- WHEN a purchase of 10L with expiration "2026-05-30" is recorded
- THEN the system MUST create a new `Batch` record with the expiration date and stock balance of 10L.

### Requirement: Batch Management
The system MUST allow editing batch details or manually adjusting stock.

#### Scenario: Manually adjusting batch
- GIVEN a batch with 5L of "Leche"
- WHEN the user adjusts the batch stock to 4.5L due to spoilage
- THEN the batch stock SHALL be updated to 4.5L AND an adjustment movement recorded.

### Requirement: Batch-Aware Production and Consumption
Batch-managed items MUST keep per-batch balances consistent with aggregate stock after purchases, production receipts, and consumption outflows.

#### Scenario: Production receipt into batch-managed sub-recipe
- GIVEN a sub-recipe item is batch-managed
- WHEN production receipt is posted
- THEN the system SHALL create or update a batch record and align aggregate stock with batch totals

### Requirement: Batch Cost Traceability
Each batch-affecting movement SHALL preserve valuation metadata at `NUMERIC(14,4)` for audit and FIFO usage.

#### Scenario: Consuming from multiple batches
- GIVEN two batches are partially consumed by one sale
- WHEN movement posts
- THEN the ledger SHALL capture per-batch consumed quantity and valuation at 4 decimals

### Requirement: CS-01 — El conteo declara el lote de la observación
Cada entrada de un conteo MUST poder declarar en qué lote se hizo la observación (`batchId` y el número del lote tal como se vio en la estante). El lote MUST pertenecer a la observación (la entrada), no a la línea: una línea MUST poder tener varias entradas, una por lote. La nube MUST rechazar un lote que no exista o que no sea del insumo contado.

#### Scenario: El conteo declara el lote
- GIVEN un conteo de un insumo con dos lotes
- WHEN el operador cuenta el primer lote y registra la observación con su lote
- THEN la entrada MUST quedar guardada con el lote y su número.

#### Scenario: Un lote ajeno se rechaza
- GIVEN un conteo de un insumo
- WHEN la entrada declara un lote de otro insumo
- THEN la nube MUST rechazar el conteo con un mensaje que lo diga.

### Requirement: CS-02 — El sobrante entra por el lote que se contó
Una varianza positiva de un conteo MUST entrar al lote declarado, de modo que el stock agregado y la suma de los lotes vuelvan a coincidir.

#### Scenario: El sobrante entra por su lote
- GIVEN un insumo con 50 ml de stock agregado y un lote con 50 ml
- WHEN el conteo encuentra 70 ml y la entrada declara ese lote
- THEN el lote MUST quedar en 70 ml
- AND el stock agregado MUST quedar en 70 ml.

### Requirement: CS-03 — Un sobrante sin lote declarado no se postea
Para un insumo gestionado por lotes, una varianza positiva cuya entrada NO declara el lote MUST impedir el posteo del conteo, con un mensaje que diga que falta declarar en qué lote está el sobrante. Un insumo sin lotes MUST conservar su comportamiento (la varianza entra en el agregado).

#### Scenario: El conteo sin lote se rechaza
- GIVEN un insumo con lotes y un conteo que encuentra más existencia
- WHEN la entrada no declara el lote
- THEN el conteo MUST ser rechazado
- AND el mensaje MUST pedir el lote del sobrante.

#### Scenario: Un insumo sin lotes no cambia
- GIVEN un insumo sin lotes
- WHEN el conteo encuentra más existencia
- THEN el conteo MUST postearse
- AND el stock agregado MUST quedar ajustado.

### Requirement: IM-03 — La paridad entre el agregado y los lotes
Después de un conteo, el stock agregado del insumo MUST coincidir con la suma del saldo de sus lotes, siempre que el conteo haya declarado el lote de la observación. Un conteo que no declara el lote MUST NOT postearse (para un insumo por lotes), en vez de dejar el agregado y los lotes descuadrados.

#### Scenario: La paridad se restaura con el conteo
- GIVEN un insumo cuyo agregado no cuadra con sus lotes
- WHEN el conteo declara el lote y postea
- THEN el agregado y los lotes MUST volver a coincidir.
