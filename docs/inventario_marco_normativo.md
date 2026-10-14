# Marco normativo de inventario — Nicaragua (base obligatoria)

**Estado: NORMATIVO.** Toda implementación que toque insumos, costos, valuación, lotes, conteos, mermas o reportes de inventario **DEBE** cumplir lo que sigue.
**Verificado:** 2026-08-27, contra las fuentes citadas en §1, con **texto literal**.
**Origen:** `odd/tasks/nucleo-inventario-paridad-contrato.md` (R17). Nace de una investigación pedida explícitamente por el owner: *"no te fíes de lo que te dije; investiguemos bien cómo se hace"* y *"hay que guardarlas y documentarlas… debe aplicarse rigurosamente en toda implementación"*.

---

## 0. Cómo leer este documento

Hay **tres capas** y confundirlas es el error más caro que se puede cometer acá:

| Capa | Qué es | Consecuencia |
|---|---|---|
| **(A) NORMA** | Texto legal o normativo verificado | **Obligatoria.** Si no está implementado, no es "una mejora pendiente": es una **brecha con base legal** |
| **(B) PRÁCTICA** | Cómo lo hace el rubro (fuentes secundarias) | Recomendada, **declarada como tal**. No se presenta como obligación |
| **(C) DECISIÓN NUESTRA** | Diseño del sistema | Nuestra, explicable, y **nunca disfrazada de norma** |

**Regla de aplicación:** ningún cambio en las áreas alcanzadas se aprueba sin declarar cómo cumple (A). Una brecha de (A) se registra como tarea; **no se ignora en silencio**.

---

## 1. Fuentes y estado de verificación

| Fuente | Qué gobierna | Verificación |
|---|---|---|
| **Ley 822 (Ley de Concertación Tributaria), Art. 44** — Nicaragua, Gaceta 241 | Valuación de inventarios y costo de ventas para el IR | **Texto literal** (ver §2.1–2.2) |
| **Reglamento de la Ley 822** (Decreto 01-2013), Art. 33 | Inventario físico, evidencia y respaldo ante la DGI | **Texto literal** (ver §2.5) |
| **NIC 2 (IAS 2), párrafos 23, 24, 25** | Fórmulas de cálculo del costo; identificación específica | **Texto literal** (ver §2.3–2.4) |
| **IAS 8** — Cambios en políticas contables | Aplicación de un cambio de política | **Texto literal parcial** (ver §2.6) |
| Práctica de rubro: FEFO/FIFO y trazabilidad por lote en farmacia y perecederos | Rotación física | **(B) SECUNDARIA — no verificada en fuente autoritativa.** Declarada, no elevada a norma |

> **Caveat de procedencia, para que quede escrito.** El texto nicaragüense se leyó en la **Gaceta 241 alojada en `atn.com.ni`** y en Justia; los sitios oficiales (`ine.gob.ni`, `asamblea.gob.ni`) **rechazaron la descarga** y la página de IFRS no publica el texto de los párrafos. Es el texto de la ley, pero **si esto va a ser base contractual, hay que confirmarlo contra la Gaceta oficial**.

---

## 2. Lo que la norma exige (A)

### 2.1 Valuación: el menor entre costo y precio de mercado
**Ley 822, Art. 44:**
> *"Cuando el inventario sea elemento determinante para establecer la renta neta o base imponible, el contribuyente deberá valuar cada bien o servicio producido a su **costo de adquisición o precio de mercado, cualquiera que sea menor**."*

**Implica:** no alcanza con calcular un costo. Hay que poder **compararlo contra el precio de mercado** y quedarse con el menor. Un sistema que solo calcula CPP **no cumple** este artículo: le falta el otro lado de la comparación.

### 2.2 Métodos de determinación del costo permitidos
**Ley 822, Art. 44:**
> *"Para la determinación del costo de los bienes y servicios producidos, el contribuyente podrá escoger cualquiera de estos métodos siguientes:
> 1. Costo promedio;
> 2. Primera entrada, primera salida; y
> 3. **Última entrada, primera salida**."*

> *"La Administración Tributaria podrá autorizar otros métodos de valuación de inventarios o sistema de costeo acorde con los principios de contabilidad generalmente aceptados o por las normas internacionales de contabilidad."*

**Implica, y es contraintuitivo:** **UEPS (LIFO) está permitida en Nicaragua** — y **prohibida por NIC 2/IFRS**, que solo admite FIFO o costo promedio ponderado para bienes intercambiables. Por lo tanto:
- un motor construido solo sobre FIFO + promedio **no cubre la ley del mercado**;
- y un estado financiero bajo NIC 2 **no puede** usar UEPS.
**El sistema debe saber a qué marco sirve cada valuación, o al menos no asumir IFRS por defecto.**

### 2.3 Identificación específica: obligatoria para bienes no intercambiables
**NIC 2, §23:**
> *"El costo de los inventarios de productos que **no son habitualmente intercambiables entre sí**, así como de los bienes y servicios producidos y segregados para proyectos específicos, **se determinará a través de la identificación específica de sus costos individuales**."*

**NIC 2, §24:**
> *"la identificación específica de costos **resultará inadecuada** cuando, en los inventarios, haya un gran número de productos que sean habitualmente intercambiables."*

**Implica:** la restricción que el owner recordaba de su experiencia en cerámicas —*"si es por lote no se puede promediar"*— **es la regla de la norma, no una costumbre del rubro**. Y su recíproca también: para muchos bienes intercambiables, identificar específicamente **es improcedente**.

### 2.4 Consistencia
**NIC 2, §25:**
> *"Una entidad **utilizará la misma fórmula de costo para todos los inventarios que tengan una naturaleza y uso similares**. Para los inventarios con una naturaleza o uso diferente, puede estar justificada la utilización de fórmulas de costo también diferentes."*

**Ley 822, Art. 44:**
> *"**El método así escogido no podrá ser variado por el contribuyente, a menos que obtenga autorización por escrito de la Administración Tributaria.**"*

**Implica:** la protección contra el cambio de método **no es una preferencia de diseño: es un requisito legal**. El sistema no solo debe **restringir** el cambio; debe poder **registrar la autorización escrita como evidencia**, porque sin ese documento el cambio es ilegal, no meramente indebido.

### 2.5 Conteo físico y evidencia ante la DGI
**Reglamento de la Ley 822 (Decreto 01-2013), Art. 33:**
> *"Para efectos del art. 44 de la LCT, los contribuyentes que determinen sus costos de ventas por medio del sistema contable de inventarios pormenorizados **deberán levantar un inventario físico de mercancías** de las cuales normalmente mantengan existencia **al fin del año**. De este inventario **se conservarán las listas originales firmadas y fechadas en cada hoja por las personas que hicieron el recuento físico**. En los casos en que el contribuyente, por razones de control interno o de su volumen de operaciones, adopte otro sistema de inventarios diferente del recuento físico total anual, tendrá la obligación de **poner a la orden de la Administración Tributaria, tanto los registros equivalentes como las listas de las tomas periódicas de los inventarios físicos** que sustenten la veracidad de los registros equivalentes."*

**Implica tres artefactos obligatorios:** (1) inventario físico **anual**; (2) **listas firmadas y fechadas por hoja** por quienes contaron; (3) **registros y conteos periódicos disponibles** para la Administración Tributaria si se usa un sistema distinto al recuento total anual.

### 2.6 Cambio de política contable (marco NIC)
**IAS 8:** la aplicación de un cambio de política contable es **retrospectiva** — re-expresar los comparativos como si la política se hubiera aplicado siempre — **salvo que sea impracticable**.

**Implica, y corrige una formulación previa nuestra:** un cambio de método **no** es "hacia adelante" por defecto. La posición correcta es de **dos capas**:
- el **ledger operativo no reescribe historia** — y además los comprobantes fiscales ya emitidos son inmutables por ley (DGI);
- la **re-expresión contable pertenece a la capa de reporte**, y el trabajo del sistema es **preservar los datos que la hacen posible**.

---

## 3. Requisitos derivados (aplicables a toda implementación)

| # | Requisito | Base | Cumplimiento esperado |
|---|---|---|---|
| **R-01** | Nunca valuar por encima del **menor entre costo y precio de mercado** | Ley 822 art. 44 (§2.1) | **Aproximación declarada**: la referencia es el **último costo de compra** leído del kardex (`ENTRADA_COMPRA` más reciente), no un precio de mercado. Ver §5 |
| **R-02** | El método de valuación **no cambia sin autorización escrita de la DGI** | Ley 822 art. 44 (§2.4) | Bloqueo del cambio + **registro de la autorización como evidencia** |
| **R-03** | **Misma fórmula** para inventarios de naturaleza y uso similares | NIC 2 §25 (§2.4) | La configuración no permite fórmulas contradictorias dentro de un mismo conjunto comparable |
| **R-04** | Bienes **no intercambiables** → **identificación específica obligatoria**; y no promediarlos | NIC 2 §23–24 (§2.3) | El tipo de artículo restringe los métodos admitidos (matriz de compatibilidad) |
| **R-05** | **Inventario físico anual** con **listas firmadas y fechadas por hoja** | Reglamento art. 33 (§2.5) | El conteo debe poder emitir ese artefacto |
| **R-06** | **Registros y conteos periódicos disponibles** para la DGI | Reglamento art. 33 (§2.5) | Exportación/reporte de registros y tomas periódicas |
| **R-07** | Si el cliente reporta bajo NIC 2, **UEPS no es admisible** | NIC 2 §25 (§2.2) | El marco aplicable es explícito, no asumido |

---

## 4. Brechas conocidas contra estos requisitos

Cada una con **base legal**, no como opinión. Ninguna se cierra sin prueba.

| Requisito | Estado hoy | Evidencia |
|---|---|---|
| R-01 | **Brecha.** Solo existe CPP; **no hay entrada de precio de mercado ni comparación** | `cost-calculator.service.ts`; reportes de valorización |
| R-02 | **Brecha.** No hay forma de registrar la autorización de la DGI | no existe superficie ni entidad |
| R-03 | **Brecha.** No hay restricción por naturaleza/uso | no existe configuración de método |
| R-04 | **Brecha.** El sistema no impide promediar un artículo identificado por lote | `recipe_details`/lotes sin matriz de compatibilidad |
| R-05 | **Parcial.** Existen sesiones de conteo, pero **no** emiten listas firmadas y fechadas por hoja | `count-session.service.ts`; UI de conteo |
| R-06 | **Brecha.** No hay exportación de registros/conteos para la Administración | reportes actuales: valorización, COGS, kardex, alertas |
| R-07 | **Brecha.** UEPS no existe en el modelo | `cost-calculator.service.ts` solo CPP |

**Tareas asociadas:** R16 (modelo de valuación configurable, donde viven R-01/R-03/R-04/R-07), R18 (R-01 y R-02), R19 (R-05 y R-06).

---

## 5. Lo que NO es norma

Para que nadie lo cite como obligación:

- **Rotación física (FEFO/FIFO/lote explícito):** es **práctica de rubro**, no norma. NIC 2 y la Ley 822 regulan **fórmulas de costo** (a qué costo sale) y son **silenciosas sobre qué lote sale**. Nuestra elección de FEFO se apoya en fuentes secundarias de práctica y en que el POS ya la usa; **no** en un mandato legal.
- **Método como propiedad de (tenant, período), política en el servidor viajando a la terminal, matriz de compatibilidad, permiso restringido:** son **decisiones de diseño nuestras**, discutidas y elegidas (ver R16).
- **El período como unidad del método:** es nuestra forma de mantener el ledger inmutable y auditable; la norma habla de consistencia y de autorización, no de períodos.
- **Referencia de mercado = último costo de compra (APROXIMACIÓN DECLARADA).** Decisión del owner, 2026-08-27. La Ley 822 art. 44 pide el menor entre el costo y el **precio de mercado**; el sistema usa como referencia el **último costo de compra** del insumo, leído del kardex (el asiento `ENTRADA_COMPRA` más reciente, cuyo `unit_cost_nio` está congelado).
  **Un costo NO es un precio de mercado.** Por lo tanto `R-01` queda satisfecho **por aproximación declarada**, no en su sentido estricto, y **esta declaración más el registro de cada castigo aplicado son el artefacto que sostiene el cumplimiento**. Si el negocio quiere cumplimiento estricto, la referencia tiene que pasar a ser un **precio de mercado declarado por insumo con fecha de vigencia**.
  Se elige así porque **funciona sin intervención** (no depende de que alguien mantenga un dato a mano) y porque **la referencia no necesita almacenamiento nuevo**: el kardex ya guarda el costo congelado de cada entrada, así que la referencia es **auditable por construcción**. La contrapartida, declarada: la ley pide mercado, y esto es costo.

---

## 6. Aplicación

1. **`AGENTS.md`** referencia este documento en la sección de cumplimiento: es lectura obligatoria antes de tocar inventario, costos, valuación, conteos o reportes.
2. **El PRD de inventario y el plan de remediación** lo referencian como base.
3. **En cada cambio del área**, la descripción del cambio (PR, tarea o commit) declara **qué requisito `R-nn` toca y cómo lo cumple**. Si no lo cumple, **abre una tarea**; no se silencia.
4. **Este documento se versiona con la ley.** Si cambia la norma o aparece una fuente autoritativa mejor, se actualiza con la cita nueva y la fecha de verificación.
