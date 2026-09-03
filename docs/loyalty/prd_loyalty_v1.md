# PRD — NHILOS Loyalty V1

**Documento:** `prd_loyalty_v1.md`  
**Estado:** **APPROVED / AUTHORITATIVE — Loyalty V1**  
**Versión:** 1.0  
**Fecha de aprobación:** 2026-09-02  
**Baseline:** `loyalty_gap_audit.md` — L0 cerrado  
**Alcance fundador:** SOHO — una ubicación / un terminal, con diseño multi-tenant y preparado para expansión

> **Principio rector:** **El cajero vende; Loyalty escucha el ticket.**
>
> La acumulación ordinaria de puntos o sellos nace exclusivamente de una transacción confirmada. No existe un flujo normal de caja para “Agregar sello” o “Agregar puntos”. Las correcciones manuales son ajustes supervisados, trazables y separados del flujo de venta.

---

## Decisiones normativas de V1

Las siguientes decisiones están **cerradas y son vinculantes para Loyalty V1**. Cualquier implementación, diseño técnico o prueba debe respetarlas; un cambio posterior exige revisión explícita de este PRD.

1. **Un solo ledger de Loyalty.** Puntos, sellos, progreso, redenciones, ajustes y reversos son interpretaciones o proyecciones del mismo historial de movimientos, siempre particionado por `loyaltyProgramId`.
2. **No existen balances independientes** de puntos, sellos o recompensas como fuentes de verdad separadas.
3. **La identidad de Loyalty es el Customer asociado al ticket.** No se crea una entidad paralela `LoyaltyCustomer`.
4. **La acumulación ocurre al confirmarse el ticket como pagado.** Un intento de venta, ticket abierto, hold o pago fallido no genera Loyalty.
5. **`startsAt` y `endsAt` gobiernan únicamente la ventana de acumulación.** Al finalizar `endsAt`, el Customer deja de generar nuevas unidades, pero conserva las acumuladas y puede utilizarlas en Rewards activas mientras el programa permanezca `ACTIVE` y habilitado para redención.
6. **Las unidades de Loyalty son enteras en V1.** No existen fracciones de puntos ni sellos. En `SPEND_POINTS`, los bloques incompletos se descartan mediante `floor`.
7. **Un ticket puede generar múltiples earnings, pero como máximo una instancia de Redemption.** Cada programa elegible puede acreditar su propio earning; V1 no permite consumir dos Rewards ni dos instancias de la misma Reward dentro del mismo ticket.
8. **Los únicos tipos de Reward de V1 son `DISCOUNT_AMOUNT` y `FREE_PRODUCT`.** Los casos comerciales de referencia son `100 puntos -> C$50 de descuento` y `10 sellos -> Cappuccino gratis`.
9. **La participación en programas es automática.** No existe `ProgramMembership`, enrollment explícito ni segmento privado “solo VIP” en V1. Un Customer participa de facto cuando genera actividad elegible en un programa.
10. **El `customerCode`/QR es un identificador bearer, no una credencial secreta.** Sirve para identificar al Customer dentro del tenant; no constituye autenticación fuerte del consumidor.
11. **Una Reward `FREE_PRODUCT` se materializa sobre una línea explícita del ticket.** Debe corresponder al producto/variante configurado; V1 no realiza sustituciones automáticas por productos equivalentes. Sales conserva ownership del ticket, precio, impuestos, BOM, inventario y KDS.
12. **La base `Eligible Spend` se expresa en NIO** y se calcula como `productos elegibles - promociones - descuentos - beneficios Loyalty`. Impuestos, propinas, cargos de servicio, forma de pago, vuelto y conversión de moneda no forman parte de esa base.
13. **La redención se confirma junto con la venta.** Validar o previsualizar una recompensa no debe consumir saldo si el ticket no llega a `PAID`.
14. **Los VOID generan reversos compensatorios.** Nunca se elimina ni reescribe el movimiento original.
15. **Los Adjustments pueden ser positivos o negativos.** Requieren permiso, actor y razón; una corrección administrativa legítima puede producir saldo negativo.
16. **La semántica histórica es inmutable.** Toda transacción debe seguir siendo interpretable con las condiciones comerciales vigentes cuando ocurrió, aunque después cambien Program o Reward.
17. **Loyalty no escribe inventario ni Kardex.** Si una recompensa afecta un producto, Loyalty aplica el beneficio al ticket y Sales/Inventory continúan siendo dueños de la venta, BOM, stock y costo.
18. **Offline-first es obligatorio.** Identificación, consulta de progreso, earning y redención del alcance SOHO deben funcionar sin WAN con la última configuración sincronizada.
19. **No hay expiración de unidades acumuladas en V1.** Puntos y sellos no vencen individualmente; la expiración de una Reward tampoco destruye saldo.
20. **Consumer Portal tiene contrato separado.** No es criterio de cierre de este PRD y deberá definirse en su propio PRD consumiendo la misma proyección del ledger.
21. **La redención offline multi-terminal no se resuelve en V1 fundador.** El alcance de SOHO es un solo terminal. La serialización distribuida de redenciones queda para la topología LAN/Local Edge futura.

---

# 1. Visión

NHILOS Loyalty V1 convierte el núcleo existente de clientes y puntos en una plataforma de fidelización programable, offline-first y multi-tenant, integrada de forma natural con el flujo de venta.

El producto debe permitir que un negocio configure programas de fidelización basados en gasto, productos o visitas; identifique al cliente en caja; acumule progreso automáticamente al cerrar la venta; permita redimir recompensas durante checkout; revierta consecuencias de Loyalty cuando la venta se anula; y ofrezca al Owner control, trazabilidad y visibilidad comercial desde el portal.

La experiencia operativa debe ser invisible cuando no necesita intervención. El cajero no administra el programa: identifica al cliente, vende, opcionalmente aplica una recompensa elegible y cobra. El resto lo resuelve Loyalty a partir del ticket.

### Invariante de producto: un solo ledger

El progreso mostrado al consumidor, por ejemplo:

```text
★★★★★★★☆☆☆
7 / 10
```

no representa una “tarjeta de sellos” persistida como balance independiente. Es una proyección del ledger único filtrado por cliente y programa:

```text
progress(customerId, loyaltyProgramId)
  = proyección de los movimientos del ledger del programa
```

Para programas de puntos, la misma fuente produce el saldo numérico. Para programas de sellos, produce el progreso visual. Para recompensas, determina elegibilidad y costo de redención.

---

# 2. Objetivos

Loyalty V1 debe:

- permitir múltiples programas de Loyalty por tenant sin duplicar dominio;
- soportar `SPEND_POINTS`, `PRODUCT_STAMPS` y `VISIT_STAMPS`;
- reutilizar el Customer existente como identidad única del consumidor;
- permitir identificación por QR/código y mantener teléfono/búsqueda como fallback;
- generar earning automáticamente desde tickets confirmados;
- ofrecer progreso y recompensas elegibles en el POS antes del cobro;
- registrar redenciones vinculadas al programa, recompensa y ticket;
- revertir automáticamente las consecuencias de Loyalty cuando una venta es anulada;
- operar localmente durante pérdida de internet en el alcance fundador de un terminal;
- sincronizar posteriormente sin duplicar movimientos;
- permitir al Owner administrar programas, recompensas, clientes, historial y ajustes;
- exponer el costo estimado del incentivo para evitar recompensas comercialmente destructivas;
- mantener auditoría, aislamiento multi-tenant y permisos granulares;
- conservar el historial de Loyalty como evidencia append-only y reconstruible.

### Resultado comercial esperado

Para SOHO, el flujo objetivo es:

```text
Identificar cliente
  -> vender normalmente
  -> mostrar recompensa elegible si existe
  -> aplicar recompensa opcionalmente
  -> cobrar
  -> confirmar ticket
  -> generar earning automático
  -> mostrar progreso actualizado
  -> imprimir progreso
  -> sincronizar cuando haya conectividad
```

---

# 3. Non-goals

Quedan fuera de Loyalty V1:

- crear un segundo ledger para sellos;
- mantener `points_balance`, `stamp_balance` y `reward_balance` como fuentes de verdad independientes;
- permitir que el cajero agregue manualmente puntos o sellos como flujo ordinario de earning;
- crear una entidad de consumidor separada del Customer existente;
- crear `ProgramMembership`, enrollment explícito o programas privados/segmentados tipo “solo VIP”;
- escribir directamente en inventario, BOM, Kardex o CPP desde Loyalty;
- recalcular retroactivamente tickets históricos cuando cambian las reglas de un programa;
- soportar merge automático de Customers;
- resolver double-spend offline entre varios terminales sin Local Edge/LAN Broker;
- soportar transferencias de saldo entre tenants;
- soportar expiración individual de puntos o sellos;
- soportar unidades fraccionarias de puntos o sellos;
- soportar partial refunds o reversos parciales de Loyalty si Sales todavía no ofrece un evento formal de devolución parcial;
- construir un motor de campañas CRM, email marketing, SMS masivo o automatizaciones de marketing;
- construir en este PRD un portal público/autenticado del consumidor; ese producto tendrá un PRD separado;
- fabricar, imprimir o administrar físicamente tarjetas plásticas; NHILOS solo provee la identidad QR/código que puede representarse en dichas tarjetas;
- sustituir el motor de promociones de Sales con reglas de Loyalty;
- soportar Rewards porcentuales, Rewards compuestas o sustituciones automáticas de productos en V1.

---

# 4. Personas y roles

## Owner

Responsable estratégico del programa. Puede configurar programas, recompensas, reglas, vigencia y consultar desempeño, costo estimado, clientes, historial y auditoría. Puede realizar ajustes si posee el permiso correspondiente.

## Manager

Opera Loyalty bajo delegación. Puede consultar clientes e historial, gestionar programas/recompensas si su política de permisos lo habilita y ejecutar ajustes dentro de los límites autorizados.

## Cashier

Su trabajo principal sigue siendo vender y cobrar. Puede identificar clientes, visualizar progreso mínimo necesario para atenderlos y aplicar una recompensa elegible durante checkout. No puede alterar reglas ni otorgar puntos/sellos manualmente.

## Waiter

Puede identificar clientes y consultar información mínima si el modo de negocio lo requiere. Puede redimir únicamente cuando su rol también tiene autoridad para cobrar el ticket.

## Customer

Consumidor identificado que puede generar actividad en uno o más programas del negocio. La participación es automática: V1 no requiere enrollment ni una membresía persistida por programa. Su historial y progreso pertenecen únicamente al tenant que los generó.

---

# 5. Conceptos de dominio

## Loyalty Program

Contrato comercial que define cómo un Customer acumula unidades de fidelización y qué recompensas puede redimir.

Un programa pertenece a un tenant, tiene un tipo, reglas de earning, reglas de elegibilidad, ventana de acumulación y catálogo de recompensas. Un mismo Customer puede generar earning simultáneamente en varios programas activos del mismo tenant. `startsAt` y `endsAt` limitan la acumulación, no la redención de unidades ya obtenidas.

## Customer

Identidad de cliente ya utilizada por Sales. Loyalty consume esa identidad; no la duplica.

La asociación `Ticket -> Customer` es la única identidad válida para earning y redención en el flujo POS.

## Earning

Movimiento positivo generado automáticamente como consecuencia de un ticket `PAID` que cumple las reglas de un programa.

El earning:

- pertenece a un solo programa;
- pertenece a un Customer;
- referencia el ticket que lo originó;
- es idempotente respecto al mismo ticket/programa;
- no puede crearse manualmente por el cajero;
- puede representar puntos o sellos sin cambiar la naturaleza del ledger.

## Reward

Beneficio que el Customer puede obtener al consumir unidades acumuladas de un programa.

Una Reward no es un balance. Es una definición de beneficio con un costo expresado en unidades del programa.

V1 soporta **exclusivamente** estos dos tipos de Reward:

- **`DISCOUNT_AMOUNT` — descuento monetario fijo** sobre el ticket. Caso de referencia: `100 puntos -> C$50 de descuento`.
- **`FREE_PRODUCT` — producto gratuito / bonificado**, aplicado como beneficio a una línea explícita de venta y procesado posteriormente por Sales/Inventory como cualquier producto del ticket. Caso de referencia: `10 sellos -> Cappuccino gratis`.

Una transacción histórica debe conservar suficiente contexto comercial para seguir siendo interpretable con el costo y beneficio vigentes cuando ocurrió, aunque posteriormente cambie la definición de la Reward.

Un programa puede tener una o más recompensas activas.

## Redemption

Consumo de unidades del programa para obtener una Reward durante checkout.

La redención solo se consolida cuando la venta queda confirmada. El movimiento del ledger es negativo, expresado en unidades enteras, y referencia tanto el ticket como la Reward.

## Adjustment

Corrección manual supervisada, positiva o negativa, sobre un programa específico.

No representa una venta ni debe disfrazarse como earning ordinario. Exige actor, razón y auditoría. Su uso está restringido por permisos. Puede producir saldo derivado negativo cuando la corrección administrativa legítima así lo requiera; esta capacidad nunca pertenece al flujo ordinario de Cashier.

## Reversal

Movimiento compensatorio creado para neutralizar un movimiento previo de Loyalty cuando el evento de negocio que lo originó deja de ser válido, principalmente por `VOID` de un ticket.

El Reversal no borra ni edita el movimiento original. Lo referencia y aplica el monto contrario.

Ejemplo:

```text
EARN      +10  ticket A
REVERSAL  -10  reversalOf=EARN(ticket A)
```

Si un ticket contenía una redención:

```text
REDEEM    -10  ticket A
REVERSAL  +10  reversalOf=REDEEM(ticket A)
```

---

# 6. Tipos de programas

## SPEND_POINTS

Programa basado en gasto elegible.

### Comportamiento

- El Customer acumula puntos enteros según una tasa configurable del programa.
- La base monetaria se expresa siempre en NIO, independientemente de moneda o método de pago.
- `Eligible Spend = productos elegibles - promociones - descuentos - beneficios Loyalty`.
- Impuestos, propinas, cargos de servicio, forma de pago, vuelto y conversión de moneda quedan fuera de `Eligible Spend`.
- El negocio puede excluir categorías o productos de la base elegible.
- Las líneas entregadas como recompensa no generan earning.
- Los bloques incompletos no generan fracciones: `earned = floor(eligibleSpend / spendBlock) × pointsPerBlock`.
- El cálculo se realiza una sola vez por ticket confirmado y programa.

### Ejemplo conceptual

```text
Regla: 1 punto por cada C$10 elegibles
Eligible Spend: C$257
floor(257 / 10) = 25
Earning: +25 unidades en SPEND_POINTS
```

La tasa exacta es configuración del Owner; V1 no impone una tasa comercial global.

## PRODUCT_STAMPS

Programa basado en compra de productos elegibles.

### Comportamiento

- Cada unidad comprada de un producto elegible puede generar una o más unidades enteras de progreso según la regla configurada.
- El cálculo se basa en la cantidad de producto efectivamente incluida en el ticket `PAID`.
- Productos entregados como Reward no generan nuevos sellos.
- La proyección visual utiliza el costo de la recompensa objetivo para mostrar progreso, por ejemplo `7 / 10`.

### Ejemplo conceptual

```text
Producto elegible: Cappuccino
Regla: 1 sello por unidad comprada
Compra: 2 Cappuccinos
Earning: +2 unidades en PRODUCT_STAMPS
```

## VISIT_STAMPS

Programa basado en visitas/transacciones elegibles.

### Comportamiento

- Un ticket `PAID` elegible genera como máximo un earning de visita por programa, expresado en unidades enteras.
- Puede configurarse un monto mínimo de compra para que la visita sea elegible.
- Dividir manualmente una compra en varios tickets no constituye un evento idempotente duplicado; son tickets distintos. V1 mitiga ese abuso mediante permisos, auditoría y reglas de monto mínimo, no mediante reconocimiento biométrico ni heurísticas de comportamiento.

### Ejemplo conceptual

```text
Regla: 1 sello por visita con compra >= C$100
Ticket pagado: C$180
Earning: +1 unidad en VISIT_STAMPS
```

---

# 7. Ciclo de vida del programa

V1 define tres estados de producto:

## DRAFT

- Configurable por Owner/Manager autorizado.
- No genera earning.
- No permite redención.
- No debe distribuirse al POS como programa ejecutable.

## ACTIVE

- Participa en evaluación local.
- Puede generar earning únicamente dentro de su ventana de acumulación (`startsAt` / `endsAt`).
- Puede permitir redención de Rewards activas y elegibles aun después de `endsAt`, porque la ventana del programa no destruye ni congela las unidades acumuladas.

## INACTIVE

- Conserva todo el historial.
- No genera nuevo earning.
- No permite nuevas redenciones mientras permanezca inactivo.
- Puede reactivarse sin alterar el ledger existente.

### Reglas de ventana de acumulación

- Un programa puede definir `startsAt` y `endsAt`.
- `startsAt` y `endsAt` gobiernan **solo el earning**. Antes de `startsAt` y después de `endsAt` no se generan nuevas unidades.
- La redención depende de que el programa permanezca `ACTIVE`, de que la Reward esté activa/disponible y de que el Customer cumpla las demás reglas; no depende de que el ticket esté dentro de `startsAt` / `endsAt`.
- Finalizar `endsAt` no convierte el programa en `INACTIVE` ni elimina saldo.
- Desactivar, reactivar o cambiar reglas no recalcula movimientos históricos.
- Un programa con historial no puede “borrarse” de manera que destruya trazabilidad; debe quedar inactivo/archivado a nivel de experiencia administrativa.

---

# 8. Reglas de acumulación

1. El earning solo puede originarse en un ticket confirmado como `PAID`.
2. Debe existir un Customer asociado al ticket antes de la confirmación del pago.
3. El mismo evento `TicketPaid` no puede generar dos earnings para el mismo programa.
4. Un ticket puede generar earning en varios programas activos si cumple las reglas de cada uno.
5. Cada earning pertenece exactamente a un `loyaltyProgramId`.
6. El earning usa las condiciones vigentes al momento de confirmar la venta.
7. Todo earning se expresa en unidades enteras; V1 no genera fracciones.
8. Cambios posteriores de reglas no modifican el historial ni la semántica con la que debe interpretarse el movimiento original.
9. Las líneas originadas por una Reward quedan excluidas de earning para impedir ciclos de recompensa sobre recompensa.
10. Un ticket que luego es `VOID` conserva sus earnings originales y recibe movimientos `REVERSAL` compensatorios.
11. Un Customer asociado después del pago no obtiene earning retroactivo automático. La corrección, si el negocio la autoriza, se realiza mediante Adjustment supervisado.
12. Un ticket abierto, hold, cancelado antes de pago o con pago fallido no genera movimientos de Loyalty.
13. El cálculo debe poder ejecutarse completamente con datos locales sincronizados previamente.

---

# 9. Reglas de elegibilidad

La elegibilidad se evalúa por programa y por ticket.

Toda operación de Loyalty requiere:

- Customer activo y perteneciente al tenant del ticket;
- programa `ACTIVE`;
- sucursal del ticket dentro del alcance permitido del programa;
- Customer asociado al ticket antes de pago;
- reglas evaluadas con la configuración local vigente para esa operación.

### Elegibilidad de earning

Además de las reglas comunes:

- la fecha/hora del ticket debe estar dentro de `startsAt` / `endsAt` cuando estén definidos;
- el ticket debe contener el gasto, productos o condiciones requeridas;
- la operación no puede corresponder a una línea de recompensa excluida.

### Elegibilidad de redemption

Además de las reglas comunes:

- `startsAt` / `endsAt` del programa **no bloquean** la redención de unidades ya acumuladas;
- la Reward debe estar activa y dentro de su propia ventana de disponibilidad, si la tiene;
- el Customer debe poseer unidades suficientes para redimir;
- la redención no puede exceder el valor o las restricciones del ticket;
- el rol que ejecuta la acción debe poseer permiso de redemption;
- el ticket no puede contener ya otra instancia de Redemption en V1.

### Alcance de sucursal

V1 debe admitir programas aplicables a:

- todas las sucursales del tenant; o
- un conjunto específico de sucursales.

El piloto SOHO utiliza una sola sucursal, pero los movimientos deben conservar el contexto de sucursal y terminal que los originó.

---

# 10. Reglas de recompensa

Cada Reward debe declarar como mínimo:

- programa al que pertenece;
- nombre visible;
- descripción breve;
- costo positivo en unidades enteras del programa;
- tipo de beneficio;
- vigencia/estado;
- condiciones de producto o ticket cuando correspondan;
- criterio de combinabilidad con promociones/descuentos cuando aplique.

### Tipos V1 — catálogo cerrado

#### DISCOUNT_AMOUNT

Otorga una reducción monetaria fija sobre el ticket. Caso comercial de referencia: `100 puntos -> C$50 de descuento`.

Reglas:

- nunca puede reducir el total elegible por debajo de cero;
- el descuento se incorpora al ticket antes de pago;
- el costo de Loyalty se registra por la cantidad de unidades consumidas, no como un “reward balance”.

#### FREE_PRODUCT

Otorga un producto/variante y cantidad definida. Caso comercial de referencia: `10 sellos -> Cappuccino gratis`.

Reglas:

- el beneficio debe aplicarse sobre una línea explícita del ticket; si la línea aún no existe, debe agregarse mediante el flujo normal de Sales;
- la Reward referencia el producto/variante configurado y V1 no realiza sustituciones automáticas por productos equivalentes;
- Sales conserva ownership del precio final y del documento de venta;
- Inventory ejecuta el BOM/Kardex de la línea normalmente;
- Loyalty no genera movimientos de inventario;
- la línea entregada como recompensa no acumula nuevas unidades de Loyalty.

### Próxima recompensa y progreso

Cuando un programa tiene varias Rewards activas:

- si el Customer ya puede redimir una o más, el POS muestra “Recompensa disponible” y las opciones elegibles;
- si aún no puede redimir, el progreso se muestra contra la Reward activa de menor costo que todavía no alcanza;
- el Owner puede ordenar las Rewards para controlar su presentación comercial.

---

# 11. Reglas de redención

1. La redención ocurre dentro del checkout de un ticket asociado al Customer.
2. El POS debe mostrar solo Rewards elegibles.
3. La Reward requiere confirmación explícita del operador/cliente; no se aplica automáticamente al llegar al umbral.
4. V1 permite **como máximo una instancia de Redemption por ticket**. No puede consumirse una segunda Reward ni una segunda instancia de la misma Reward aunque exista saldo suficiente. La definición de la Reward puede contener un beneficio fijo, pero no multiplicarse por saldo dentro del mismo ticket.
5. El saldo se valida contra el programa específico, nunca contra un balance global del Customer.
6. La selección de Reward antes del pago es provisional. No se crea una redención definitiva si el ticket no llega a `PAID`.
7. Al confirmarse la venta, la redención genera un movimiento negativo en el ledger del programa.
8. El movimiento referencia la Reward y el ticket.
9. La misma venta no puede registrar dos veces la misma redención por reintentos o doble tap.
10. Una redención no puede dejar saldo negativo por operación ordinaria.
11. Si el ticket se anula posteriormente, la redención se compensa con `REVERSAL` positivo.
12. Una Reward no puede aplicarse a un ticket de otro tenant o fuera de las sucursales permitidas.
13. Si una promoción y una Reward son incompatibles, Sales debe rechazar la combinación antes del pago y explicar la causa al cajero.

---

# 12. Reglas de reversión

El `VOID` de un ticket pagado debe restaurar el estado económico de Loyalty mediante movimientos compensatorios.

### Algoritmo de producto

Para cada movimiento de Loyalty originado por el ticket:

- `EARN +X` -> append `REVERSAL -X`;
- `REDEEM -Y` -> append `REVERSAL +Y`.

### Invariantes

- Los movimientos originales permanecen intactos.
- Cada Reversal referencia exactamente el movimiento compensado.
- Un movimiento no puede ser revertido dos veces por el mismo evento de VOID.
- Repetir el VOID o reintentar sincronización no duplica reversos.
- Si el ticket nunca llegó a `PAID`, no existen movimientos que revertir.
- La reversión de Loyalty no reemplaza la reversión de Sales/Inventory.

### Balance negativo por reversión legítima

Puede ocurrir este caso:

1. Ticket A genera `+100` puntos.
2. El Customer consume esos 100 puntos en Ticket B.
3. Ticket A se anula posteriormente.
4. El Reversal de A debe registrar `-100` aunque el saldo disponible actual sea menor.

En este escenario V1 **permite un saldo derivado negativo causado por Reversal**, porque la prioridad es preservar la verdad histórica. Mientras el saldo sea negativo:

- el Customer no puede redimir nuevas Rewards;
- futuros earnings reducen el déficit hasta volver a saldo no negativo;
- el Owner puede ver claramente el origen del déficit en el historial.

Un cajero nunca puede crear manualmente ese saldo negativo.

---

# 13. Reglas de expiración

## Unidades acumuladas

En Loyalty V1, puntos y sellos **no expiran individualmente**.

No se crean movimientos automáticos de expiración y no se elimina saldo por antigüedad.

## Programa

- Un programa puede definir `startsAt` y `endsAt` como ventana de acumulación.
- Antes de `startsAt` y después de `endsAt` no genera nuevos earnings.
- Finalizar `endsAt` **no bloquea redenciones** de unidades ya acumuladas mientras el programa permanezca `ACTIVE` y la Reward correspondiente esté activa/elegible.
- El historial permanece consultable.
- Pasar el programa a `INACTIVE` sí bloquea tanto earning como nuevas redenciones sin eliminar saldo.
- Si vuelve a activarse, el saldo derivado previo sigue existiendo.

## Reward

- Una Reward puede tener ventana de disponibilidad.
- Al expirar una Reward, el Customer conserva sus unidades del programa.
- La expiración de una Reward nunca elimina puntos/sellos.

La expiración individual de unidades podrá evaluarse en una versión posterior con un contrato explícito de movimientos de expiración; no se simulará mediante sobrescritura de balances.

---

# 14. Experiencia POS

## 14.1 Identificación

El cajero puede asociar un Customer al ticket por:

1. escaneo de QR;
2. ingreso de `customerCode` legible;
3. teléfono;
4. búsqueda existente por nombre/datos del Customer.

El QR debe resolver a una identidad opaca dentro del tenant y no debe exponer teléfono, cédula/RUC, email ni otros datos personales en texto plano.

El `customerCode`/QR es un **identificador bearer**: quien lo presenta puede identificar esa cuenta de Loyalty. No se trata como contraseña, token de autenticación fuerte ni secreto del consumidor. V1 no exige un segundo factor del Customer para identificarlo o redimir; los controles se apoyan en aislamiento de tenant, permisos del operador, trazabilidad y límites de Reward.

El código debe ser opaco, no secuencial/predecible, único dentro del tenant y revocable/reemplazable sin alterar el historial del Customer.

La asociación al ticket debe ser visible y reversible antes del pago.

## 14.2 Estado de Loyalty durante la venta

Con Customer identificado, el POS muestra de forma compacta:

- programas relevantes;
- saldo/progreso por programa;
- próxima Reward o Rewards ya elegibles;
- CTA de redención solo cuando corresponde.

La información de Loyalty no debe desplazar ni ralentizar el flujo principal de venta.

## 14.3 Checkout

Antes de pagar:

- el cajero puede consultar Reward elegible;
- selecciona una Reward opcionalmente;
- el ticket muestra claramente el beneficio antes de confirmar el pago;
- si deja de ser elegible por cambios en el ticket, la Reward se invalida y debe seleccionarse nuevamente.

## 14.4 Post-pago

Tras `PAID`:

- Loyalty calcula y persiste earning local automáticamente;
- muestra un resumen breve: “Ganaste X puntos”, “2 sellos añadidos”, “Te faltan 3 para tu recompensa”, etc.;
- muestra el progreso actualizado;
- envía la información relevante al formatter de impresión.

No existe un botón de “sellar tarjeta” después de la venta.

## 14.5 Estado offline

La pérdida de internet no debe introducir un modal bloqueante para earning/redemption si el POS cuenta con la configuración local necesaria.

El operador puede ver un estado discreto de “pendiente de sincronización”, pero este no debe convertir Loyalty en un proceso manual.

---

# 15. Experiencia Owner Portal

El Owner Portal debe ofrecer una superficie estratégica de Loyalty.

## Programas

- listar programas;
- filtrar por estado y tipo;
- crear programa;
- editar reglas futuras;
- activar/desactivar;
- definir vigencia;
- definir alcance de sucursales;
- configurar earning y elegibilidad.

## Recompensas

- listar Rewards por programa;
- crear/editar/activar/desactivar;
- definir costo en unidades;
- seleccionar tipo de beneficio;
- asociar producto cuando corresponda;
- ordenar prioridad de presentación;
- revisar vigencia y combinabilidad.

## Clientes

En el perfil de Customer:

- ver programas en los que posee actividad;
- ver saldo/progreso derivado por programa;
- ver Rewards elegibles;
- consultar historial cronológico del ledger;
- distinguir EARN, REDEEM, ADJUST y REVERSAL;
- consultar ticket de origen cuando exista;
- consultar estado de sincronización/frescura cuando aplique.

## Ajustes

Usuario autorizado puede:

- seleccionar programa;
- ingresar delta entero positivo o negativo;
- escribir razón obligatoria;
- confirmar la operación;
- visualizar el resultado en el ledger.

Un Adjustment negativo puede dejar el saldo derivado por debajo de cero cuando representa una corrección administrativa válida. La UI debe mostrar esa consecuencia antes de confirmar.

La UI debe denominar esta acción **Ajuste manual**, nunca “Agregar puntos” o “Agregar sellos”.

## Profit-aware rewards

Para cada Reward, el portal debe mostrar un costo estimado del incentivo con la mejor información disponible:

- descuento monetario: valor nominal del beneficio;
- producto gratuito: costo actual estimado del producto usando su costo/BOM/CPP disponible;
- advertencia visible cuando el costo no pueda calcularse.

Esta métrica es de apoyo para diseño de incentivos; no sustituye contabilidad, P&L ni costo histórico del ticket.

---

# 16. Impresión / comunicación al consumidor

## Ticket térmico

El ticket de venta debe poder incluir un bloque compacto de Loyalty con:

- nombre del programa relevante;
- unidades ganadas en la venta;
- Reward redimida, si existió;
- progreso/saldo posterior a la venta;
- siguiente Reward o mensaje “Recompensa disponible”.

Ejemplo conceptual para sellos:

```text
SOHO CAFÉ CLUB
★★★★★★★☆☆☆  7 / 10
+2 sellos en esta compra
Te faltan 3 para un Cappuccino gratis
```

Ejemplo conceptual para puntos:

```text
SOHO PUNTOS
+25 puntos
Saldo: 180 puntos
Recompensa disponible
```

El formato debe adaptarse a 58mm y 80mm sin comprometer datos fiscales obligatorios.

## QR / código de cliente

Cada Customer elegible para identificación rápida puede tener:

- un `customerCode` legible por humanos;
- una representación QR del mismo identificador opaco.

NHILOS debe poder mostrar estos datos para que el negocio los utilice en tarjetas físicas, material impreso o una futura representación digital. El código identifica; no autentica al consumidor.

La fabricación o diseño industrial de tarjetas físicas queda fuera de este PRD.

## Portal del consumidor

Un portal público/autenticado para que el consumidor consulte su progreso no es requisito de cierre de Loyalty V1 fundador y deberá definirse en un PRD separado. El modelo de V1 debe permitir exponer posteriormente la misma proyección del ledger, sin crear un segundo saldo para ese portal.

---

# 17. Offline-first

Loyalty V1 es operativo sin WAN.

## Invariantes

- Programas, Rewards y reglas necesarias para checkout deben estar disponibles localmente después de sincronización.
- Earning se calcula localmente.
- Progreso se reconstruye localmente.
- Redención funciona localmente en la topología SOHO de un solo terminal.
- Movimientos pendientes sobreviven cierre/reinicio de la app.
- Reintentos de sincronización no duplican EARN, REDEEM ni REVERSAL.
- La venta no se bloquea por estado `pending sync`.
- La nube es espejo eventual; el POS local continúa operando aunque el Owner Portal esté temporalmente desactualizado.

## Configuración desactualizada

Si el POS está offline utiliza la última configuración válida sincronizada. La UI debe poder indicar que la configuración no ha sido actualizada recientemente, sin bloquear una venta ya operable.

## Deuda arquitectónica explícita

La redención concurrente desde varios terminales offline requiere una estrategia de serialización local/LAN y no debe resolverse con “último balance gana”.

Esto pertenece a una fase posterior junto con Local Edge/LAN Broker.

---

# 18. Multi-tenant

1. Todos los programas, Rewards, Customers y movimientos pertenecen exactamente a un tenant.
2. Un Customer no comparte saldo ni progreso con otro tenant.
3. Un `customerCode`/QR se resuelve únicamente dentro del contexto del tenant.
4. Ningún rol puede consultar, ajustar o redimir información de otro tenant.
5. Las reglas y Rewards sincronizadas al POS deben corresponder únicamente a su tenant.
6. El historial debe conservar tenant, sucursal y terminal de origen cuando aplique.
7. La separación multi-tenant debe aplicar tanto online como en los datos cacheados/sincronizados localmente.

---

# 19. Auditoría y antifraude

## Eventos auditables obligatorios

Deben quedar registrados al menos:

- creación de programa;
- actualización de programa;
- activación/desactivación;
- creación/actualización de Reward;
- Adjustment;
- Redemption;
- Reversal;
- cambios administrativos que alteren earning, elegibilidad o costo de recompensa.

## Reglas antifraude

- Ledger append-only: no editar ni borrar movimientos históricos.
- Todo Adjustment exige actor y razón.
- Cashier no puede ejecutar Adjustments.
- Earning ordinario solo proviene de ticket `PAID`.
- Idempotencia impide duplicar movimientos por doble tap, retry o reenvío de sync.
- Reward line no genera earning recursivo.
- Normal redemption no permite saldo negativo.
- Reversal sí puede producir saldo negativo si es la consecuencia verdadera de anular un earning ya consumido.
- Un Customer inactivo no acumula ni redime, pero su historial permanece.
- Los cambios de reglas no alteran movimientos pasados ni cambian cómo debe interpretarse comercialmente una transacción histórica.
- Un movimiento automático debe poder rastrearse hasta ticket, programa, tenant, sucursal y terminal.

---

# 20. Permisos

Loyalty V1 añade permisos de dominio independientes del rol genérico.

| Permiso | Owner | Manager | Cashier | Waiter |
|---|:---:|:---:|:---:|:---:|
| Ver programas | Sí | Sí | No administrativo | No administrativo |
| Gestionar programas | Sí | Según política | No | No |
| Ver Rewards | Sí | Sí | Solo elegibles en checkout | Solo elegibles si cobra |
| Gestionar Rewards | Sí | Según política | No | No |
| Ver Customer/progreso | Sí | Sí | Sí, mínimo operativo | Sí, mínimo operativo |
| Ver historial completo | Sí | Sí | Opcional restringido | No por defecto |
| Ajustar unidades | Sí | Según política | No | No |
| Redimir en checkout | Sí | Sí | Sí | Solo si puede cobrar |
| Ver auditoría Loyalty | Sí | Según política | No | No |

La autorización real debe evaluarse por permiso, no confiar únicamente en el nombre del rol.

---

# 21. Casos excepcionales

## EC-01 — Customer no identificado

El ticket se cobra normalmente. No se genera earning. El POS no debe bloquear la venta ni crear un Customer implícito.

## EC-02 — Customer identificado después de pagar

No hay earning retroactivo automático. Un usuario autorizado puede usar Adjustment con razón si el negocio decide reconocer la compra.

## EC-03 — Pago falla después de seleccionar Reward

No se genera REDEEM ni EARN. La Reward vuelve a estar disponible.

## EC-04 — Doble tap en Confirmar pago

Un único ticket confirmado produce como máximo un conjunto de movimientos Loyalty por programa. Los reintentos no duplican ledger.

## EC-05 — Ticket con Reward y earning

La Reward reduce el ticket según su beneficio; luego el earning se calcula sobre la base neta elegible final. La línea entregada como Reward no genera earning.

## EC-06 — VOID de ticket que ganó y redimió

Se generan Reversals compensatorios tanto del EARN como del REDEEM. Los movimientos originales permanecen visibles.

## EC-07 — Reversal deja saldo negativo

El saldo negativo se conserva como resultado válido del historial. Se bloquean nuevas redenciones hasta recuperar saldo no negativo.

## EC-08 — Programa se desactiva con Customers con saldo

El saldo no se elimina. No se generan nuevos earnings ni redenciones mientras el programa esté `INACTIVE`. La reactivación recupera el progreso existente. Esto es distinto a alcanzar `endsAt`: finalizar la ventana de acumulación detiene earning, pero no redención.

## EC-09 — Reward expira

La Reward deja de ser elegible. Las unidades acumuladas permanecen intactas y pueden usarse en otras Rewards del programa.

## EC-10 — POS sin internet

Se usa la última configuración local. Se permite earning/redemption del alcance single-terminal y los movimientos quedan pendientes de sincronización.

## EC-11 — POS reinicia antes de sincronizar

Los movimientos pendientes permanecen y se reintentan después. No se reconstruyen mediante un balance absoluto ni se duplican.

## EC-12 — Sync reenvía el mismo movimiento

La nube reconoce el evento ya procesado y no genera un segundo movimiento.

## EC-13 — Dos programas aplican al mismo ticket

Cada programa evalúa y genera su earning de forma independiente, escribiendo movimientos separados en el mismo ledger con distinto `loyaltyProgramId`.

## EC-14 — Reward de producto sin costo/BOM disponible

La Reward puede existir si cumple la configuración comercial, pero Owner Portal debe mostrar el costo estimado como “No disponible” y no inventar una cifra.

## EC-15 — Customer inactivo

No puede acumular ni redimir. Su historial sigue accesible para roles autorizados.

## EC-16 — Regla de programa cambia durante el día

Los tickets ya confirmados conservan sus movimientos originales y deben seguir siendo interpretables con las condiciones que les aplicaron. Los nuevos tickets usan la regla vigente disponible en el POS al momento de confirmación.

## EC-17 — Partial refund

Mientras Sales no exponga una devolución parcial formal, Loyalty V1 no inventa reversos parciales. El caso se considera fuera de alcance y requiere contrato posterior.

## EC-18 — `endsAt` alcanzado con saldo disponible

El Customer deja de acumular nuevas unidades desde que termina la ventana. Si el programa continúa `ACTIVE` y existe una Reward activa/elegible, puede redimir las unidades acumuladas previamente.

## EC-19 — Múltiples programas aplican al mismo ticket

El ticket puede generar un EARN independiente por cada programa elegible. Si el Customer redime, V1 consolida como máximo una única instancia de Redemption para todo el ticket.

## EC-20 — Adjustment administrativo negativo

Un usuario autorizado corrige un saldo con un delta entero negativo y razón obligatoria. Si el resultado queda por debajo de cero, el movimiento se registra y el déficit permanece visible; nuevas redenciones quedan bloqueadas hasta disponer de saldo suficiente.

## EC-21 — QR copiado o fotografiado

Presentar un `customerCode`/QR válido identifica al Customer porque el código es bearer. Loyalty V1 no lo trata como autenticación fuerte ni solicita una credencial secreta adicional del consumidor. La operación sigue sujeta a permisos del operador, trazabilidad y reglas de elegibilidad/redención.

## EC-22 — FREE_PRODUCT no está aún en el ticket

El POS debe incorporar explícitamente el producto/variante configurado mediante el flujo normal de Sales y aplicar allí el beneficio. Loyalty no sustituye automáticamente otro producto ni escribe movimientos directos en inventario.

---

# 22. NFR

## Disponibilidad y resiliencia

- Checkout no debe depender de una llamada WAN para evaluar Loyalty.
- La pérdida de internet no debe impedir vender ni acumular Loyalty en el alcance fundador.
- Los datos pendientes deben sobrevivir reinicios inesperados.

## Rendimiento

- La evaluación de programas/recompensas debe ejecutarse localmente y no introducir latencia perceptible en el checkout.
- Como objetivo de aceptación en el hardware fundador, la evaluación de Loyalty de un ticket común debe completarse en menos de **100 ms** con la configuración local ya cargada.

## Consistencia

- Ledger es la fuente de verdad reconstruible.
- Las unidades de negocio de V1 son enteras; cualquier proyección debe preservar esa semántica.
- Cualquier proyección/cache de saldo debe poder regenerarse desde el ledger por Customer + programa.
- Sync debe ser idempotente.
- La reconstrucción histórica debe conservar la semántica comercial vigente cuando cada movimiento ocurrió.
- No se sincronizan balances absolutos como mecanismo de resolución de conflictos.

## Seguridad

- QR/customerCode no contiene PII en texto plano.
- Autorización y aislamiento multi-tenant aplican a lectura y escritura.
- Adjustments y cambios de configuración quedan auditados.
- El sistema no registra datos de pago sensibles dentro del ledger de Loyalty.

## Trazabilidad

Todo movimiento debe poder responder:

- ¿qué Customer?
- ¿qué programa?
- ¿qué tipo de movimiento?
- ¿qué ticket lo originó, si aplica?
- ¿qué Reward consumió, si aplica?
- ¿qué movimiento revierte, si aplica?
- ¿qué usuario actuó en un Adjustment?
- ¿qué tenant/sucursal/terminal lo originó?
- ¿cuándo ocurrió?

## UX

- Loyalty no debe agregar un paso obligatorio a la venta cuando no hay Customer identificado o Reward elegible.
- La UI POS conserva targets táctiles y legibilidad del design system vigente.
- El feedback post-pago debe ser breve y no impedir iniciar la siguiente venta.

## Compatibilidad

- El modelo debe admitir los tres tipos de programa sin crear tablas/balances independientes por tipo.
- La experiencia debe funcionar en 58mm y 80mm para impresión.

---

# 23. Acceptance Criteria

## AC-01 — Ledger único

Dado un Customer con un programa `PRODUCT_STAMPS`, cuando acumula 7 sellos, el sistema puede mostrar `7 / 10` para una Reward de costo 10 sin consultar ni mantener un `stamp_balance` independiente.

## AC-02 — Saldo por programa

Dado un Customer con movimientos en dos programas, cuando se consulta el progreso del programa A, los movimientos del programa B no alteran el resultado.

## AC-03 — Earning desde ticket

Dado un Customer identificado y un ticket elegible, cuando el ticket cambia a `PAID`, se genera automáticamente el earning correspondiente sin acción manual de “agregar puntos/sellos”.

## AC-04 — Sin Customer

Dado un ticket sin Customer, cuando se paga, la venta se completa y Loyalty no genera earning ni bloquea checkout.

## AC-05 — Idempotencia de earning

Dado un mismo evento de ticket pagado procesado dos veces por retry, existe un único earning por programa para ese ticket.

## AC-06 — SPEND_POINTS

Dado `1 punto / C$10` y un `Eligible Spend` de C$257, al pagar se acreditan exactamente 25 puntos enteros mediante `floor`; nunca 25.7 ni 26.

## AC-07 — PRODUCT_STAMPS

Dado un programa con un producto elegible, cuando se compran dos unidades pagadas, se acredita el progreso correspondiente a ambas unidades y no se acredita por unidades entregadas como Reward.

## AC-08 — VISIT_STAMPS

Dado un programa de visitas con monto mínimo, un ticket pagado que supera el mínimo genera como máximo una unidad de visita para ese programa.

## AC-09 — Reward elegible

Dado un Customer con saldo suficiente, el POS muestra la Reward elegible antes del pago y permite seleccionarla.

## AC-10 — Reward insuficiente

Dado un Customer sin saldo suficiente, el POS no permite confirmar esa Reward y muestra el progreso restante.

## AC-11 — Pago fallido

Dada una Reward seleccionada, si el pago no se confirma, no existe movimiento REDEEM ni EARN definitivo.

## AC-12 — Redención confirmada

Dado un ticket pagado con Reward, se genera un movimiento REDEEM negativo asociado al Customer, programa, ticket y Reward.

## AC-13 — Un reward por ticket V1

Dado un ticket con una instancia de Redemption ya seleccionada, el POS no permite seleccionar una segunda Reward ni una segunda instancia de la misma Reward en V1.

## AC-14 — VOID de earning

Dado un ticket pagado que generó EARN, cuando se anula, el ledger conserva el EARN y agrega un REVERSAL opuesto vinculado al movimiento original.

## AC-15 — VOID de redemption

Dado un ticket pagado que consumió una Reward, cuando se anula, el ledger conserva el REDEEM y agrega un REVERSAL que restaura las unidades consumidas.

## AC-16 — VOID idempotente

Procesar dos veces el mismo evento de anulación no produce reversos duplicados.

## AC-17 — Saldo negativo legítimo

Si un Reversal de EARN produce saldo negativo porque las unidades ya fueron gastadas, el historial conserva el negativo y bloquea nuevas redenciones hasta recuperar saldo.

## AC-18 — Adjustment supervisado

Un usuario con permiso puede realizar un Adjustment seleccionando programa, delta y razón. El movimiento aparece append-only con actor y auditoría.

## AC-19 — Cashier sin Adjustment

Un Cashier sin permiso no puede ejecutar ajustes aunque pueda identificar Customer y redimir durante checkout.

## AC-20 — QR/code

Dado un Customer con `customerCode`, el POS puede identificarlo mediante QR o ingreso del código y asociarlo al ticket sin exponer PII. El código se comporta como identificador bearer y no como credencial secreta o segundo factor.

## AC-21 — Fallback por teléfono

Si QR/código no está disponible, el cajero puede localizar y asociar al Customer por teléfono/búsqueda existente.

## AC-22 — Offline earning

Con WAN caída y configuración local válida, un ticket pagado genera earning local y puede mostrar progreso actualizado.

## AC-23 — Offline redemption SOHO

Con WAN caída, un solo terminal y Reward/config local válida, el Customer puede redimir y cerrar la venta; el movimiento queda pendiente de sync.

## AC-24 — Persistencia tras reinicio

Un movimiento pendiente de sync continúa disponible después de reiniciar la aplicación y se sincroniza posteriormente sin duplicación.

## AC-25 — Owner programs

Owner autorizado puede crear, editar, activar e inactivar programas de los tres tipos sin modificar movimientos históricos.

## AC-26 — Owner rewards

Owner autorizado puede crear y mantener Rewards, definir su costo y beneficio y consultar su estado.

## AC-27 — Progreso en Owner Portal

En el perfil del Customer, el portal muestra el progreso derivado por programa y el historial que explica ese resultado.

## AC-28 — Profit-aware

Para una Reward de producto con costo disponible, el Owner Portal muestra un costo estimado del incentivo; si el costo no puede resolverse, muestra “No disponible” en lugar de estimarlo arbitrariamente.

## AC-29 — Impresión

Después de una venta con Loyalty, el ticket térmico 58mm/80mm puede incluir earning/redemption y progreso actualizado sin omitir los datos fiscales obligatorios.

## AC-30 — Programa inactivo

Al pasar un programa a `INACTIVE`, no se generan nuevos earnings ni redenciones, pero su historial y saldo derivado permanecen consultables. Alcanzar `endsAt` sin inactivarlo solo detiene earning.

## AC-31 — Reward expirada

Al expirar una Reward, deja de mostrarse como elegible sin eliminar unidades del Customer.

## AC-32 — Tenant isolation

Un usuario, POS o Customer de Tenant A no puede consultar, acumular, ajustar ni redimir unidades pertenecientes al Tenant B.

## AC-33 — Trazabilidad

Para cualquier movimiento de Loyalty, un usuario autorizado puede determinar su Customer, programa, tipo, fecha y contexto de origen; ticket/Reward/reversal/actor aparecen cuando aplican.

## AC-34 — Sin escritura directa a inventario

Al redimir una Reward de producto, Loyalty modifica el ticket/beneficio; los movimientos de stock son consecuencia del procesamiento normal de Sales/Inventory y no una escritura de Loyalty al Kardex.

## AC-35 — Sin earning manual ordinario

No existe en la experiencia de Cashier una acción denominada o equivalente a “Agregar sello” / “Agregar puntos” para registrar el earning normal de una venta.

## AC-36 — `endsAt` solo detiene acumulación

Dado un Customer con saldo acumulado y un programa `ACTIVE` cuyo `endsAt` ya ocurrió, un nuevo ticket no genera EARN, pero una Reward activa/elegible sí puede redimirse con el saldo existente.

## AC-37 — Eligible Spend en NIO

Dado un ticket con productos elegibles, promociones, descuentos, beneficio Loyalty, impuestos y propina, `SPEND_POINTS` calcula su base en NIO como `productos elegibles - promociones - descuentos - beneficios Loyalty`, excluyendo impuestos, propinas, cargos de servicio, forma de pago, vuelto y conversión de moneda.

## AC-38 — Múltiples earnings / una redemption

Dado un ticket elegible para `SPEND_POINTS`, `PRODUCT_STAMPS` y `VISIT_STAMPS`, al pagarse puede generar un EARN independiente para cada programa. El mismo ticket no puede consolidar más de una instancia de Redemption.

## AC-39 — Participación automática

Dado un Customer sin registro previo en un programa activo, si un ticket cumple sus reglas, puede generar EARN sin crear previamente `ProgramMembership`, enrollment o asignación VIP.

## AC-40 — FREE_PRODUCT explícito

Dada una Reward `FREE_PRODUCT`, el beneficio se aplica a una línea explícita del producto/variante configurado. Si la línea no existe, se agrega por el flujo normal de Sales; V1 no sustituye automáticamente otro producto.

## AC-41 — Adjustment negativo

Dado un usuario autorizado, un delta entero negativo y una razón válida, el sistema puede registrar un ADJUST que deje saldo derivado negativo. El movimiento permanece auditado y nuevas redenciones se bloquean mientras no exista saldo suficiente.

## AC-42 — Semántica histórica

Dada una redención histórica cuyo costo era 10 sellos y una modificación posterior que cambia la Reward a 12 sellos, el historial continúa mostrando e interpretando la redención original con costo 10.

## AC-43 — Catálogo cerrado de Rewards V1

El sistema acepta como tipos de Reward de Loyalty V1 únicamente `DISCOUNT_AMOUNT` y `FREE_PRODUCT`; otros tipos requieren una versión posterior del contrato.

## AC-44 — Consumer Portal desacoplado

Loyalty V1 puede considerarse conforme sin un Consumer Portal. Cualquier portal futuro debe consumir la misma proyección del ledger por `Customer + loyaltyProgramId` y no crear un balance paralelo.

---

# Criterio de cierre del PRD

Este PRD queda **APPROVED / AUTHORITATIVE** para Loyalty V1. La implementación se considera conforme cuando pruebas y evidencia pueden demostrar, sin ambigüedad, el siguiente flujo completo:

```text
Customer identificado
  -> Ticket se construye normalmente
  -> Loyalty muestra progreso/recompensa elegible
  -> Reward opcional se incorpora al ticket
  -> Ticket se paga
  -> REDEEM y EARN se consolidan idempotentemente en el ledger único
  -> progreso se recalcula por loyaltyProgramId
  -> ticket imprime resultado
  -> operación sobrevive offline/restart
  -> eventos sincronizan sin duplicación
  -> Owner visualiza programa, Customer, progreso e historial
  -> VOID genera REVERSAL compensatorio sin borrar historia
```

El producto no debe considerarse conforme si alguna experiencia requiere mantener un balance paralelo de sellos, si el cajero debe registrar manualmente el earning ordinario, si `endsAt` destruye o congela saldo acumulado, si se generan unidades fraccionarias, si un ticket consolida más de una instancia de Redemption en V1 o si Loyalty escribe directamente inventario/Kardex.
