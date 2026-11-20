# Flujo de precios de mercado

## 1. ¿Quién debe cargar los precios de mercado y ejecutar el castigo?

### Responsable operativo

El Contador del cliente (o el Administrador/Dueño con validación contable), nunca tú como desarrollador.

### Por qué tú no debes hacerlo

Como proveedor de software, asumir la carga o actualización de precios de mercado te expone a responsabilidad fiscal y financiera sobre la valuación del inventario y el cálculo del Impuesto sobre la Renta (IR) del cliente. Además, los precios de reposición dependen de cotizaciones reales de los proveedores locales del negocio.

### Diseño de permisos (RBAC)

El operador de barra o caja (barista/cajero) no debe ver ni tener acceso a `setMarketPrice` ni a `applyLowerOfCostWritedown`.

Estas rutas deben exponerse únicamente en el Backoffice Web bajo el rol de Contador o Dueño, y cada ejecución debe quedar registrada en la bitácora de auditoría (*Audit Trail*) con el usuario y la referencia de respaldo.

## 2. ¿Con qué ritmo debe hacerse? (Semanal vs. mensual vs. anual)

En una cafetería de *food park*, los insumos principales (café, leche, desechables y jarabes) tienen alta rotación, por lo que su último costo de compra suele reflejar de cerca el precio de reposición actual.

La cadencia recomendada según el marco normativo nicaragüense es la siguiente:

| Frecuencia | Viabilidad para un café | Sustento normativo y contable (Nicaragua) |
|---|---|---|
| Semanal | No recomendada | Genera fricción operativa innecesaria; las variaciones semanales de insumos perecederos rara vez justifican asientos de castigo de inventario. |
| Mensual | Óptima para control interno (NIIF) | Permite revisar al cierre de mes el *Food Cost* y ajustar por valor neto realizable si el negocio prepara estados financieros mensuales bajo NIIF para PYMES [cite: 163, 202]. |
| Anual (al 31 de diciembre) | Obligatoria para cumplimiento DGI | El Art. 50 de la Ley 822 fija el período fiscal ordinario del 1 de enero al 31 de diciembre [cite: 261]; el Art. 33 del Reglamento (Decreto 01-2013) exige levantar inventario físico al fin del año (o sustentar tomas periódicas) para efectos del Art. 44 [cite: 224]; y la DAG 01-2014 obliga a reportar el informe de inventario en la VET dentro de los 30 días posteriores al cierre fiscal [cite: 246, 248]. |

> **Regla práctica para R-01:** Define por defecto un flujo de revisión mensual (opcional para control contable) y cierre anual obligatorio antes de generar el Informe de Inventario de la DAG 01-2014 [cite: 224, 246].

## 3. Alerta fiscal crítica sobre `applyLowerOfCostWritedown` en Nicaragua

Antes de activar el castigo automático en producción, el contador del cliente debe validar dos matices clave de la Ley 822 para evitar reparos de la DGI.

### Valuación vs. reservas no deducibles

El Art. 44 de la Ley 822 ordena valuar cada bien a su costo de adquisición o precio de mercado, el que sea menor (permitiendo costo promedio, PEPS/FIFO o UEPS/LIFO, aunque NIIF para PYMES prohíbe UEPS/LIFO y exige costo promedio ponderado o FIFO) [cite: 163].

Sin embargo, el Art. 43 de la Ley 822 declara no deducibles las reservas que se acumulen para cualquier propósito, salvo las indemnizaciones laborales taxativas y reservas técnicas específicas [cite: 250, 251, 254].

Por ello, el asiento compensatorio que genera `applyLowerOfCostWritedown` no debe contabilizarse como una «reserva o provisión genérica», sino quedar claramente documentado como ajuste de valuación de cierre conforme al Art. 44 y al inventario físico del Art. 33 del Reglamento [cite: 163, 224].

### No confundir caída de precio de mercado con deterioro físico o caducidad

Si el valor del insumo cayó porque se venció o se dañó (algo común en leche o repostería), la deducibilidad del gasto se rige por el Art. 39 numeral 18 de la Ley 822. Este exige documentar la causa, la preexistencia y, en caso de destrucción de mercadería, notificar previamente a la Administración de Rentas con al menos 10 días de anticipación para obtener la autorización de destrucción [cite: 246].

El sistema debe distinguir entre:

- Un castigo por precio de mercado: `applyLowerOfCostWritedown`.
- Una baja física por merma o caducidad [cite: 246].

## 4. Qué ajustar en el producto para «revivir» las rutas sin fricción

Para que R-01 pase de «parcial con mecanismo» a cumplimiento operativo real sin sobrecargar al usuario:

### Sacar la función de la caja

Crear una vista específica **Valuación y Cierre (Art. 44 LCT)** en el panel Web del Contador/Dueño.

### Asistente de prellenado inteligente

En esa pantalla, mostrar únicamente los insumos con existencia al cierre, comparando su costo actual en sistema contra la última factura de compra registrada o el último `market_price` vigente.

Si el último precio de compra bajó respecto al costo promedio, el sistema puede resaltarlo para que el contador solo confirme el valor y ejecute `setMarketPrice`.

### Bloqueo o recordatorio en el cierre anual (VET)

Al momento de exportar el reporte de inventario anual para la VET (DAG 01-2014) [cite: 246, 248], mostrar una advertencia si existen ítems sin revisión de precio de mercado reciente, dando al contador la opción explícita de confirmar que el costo es menor al mercado o ejecutar `applyLowerOfCostWritedown` antes de cerrar el período fiscal.

### Cláusula de responsabilidad en el acuerdo comercial

Dejar por escrito que el software provee las herramientas de valuación exigidas por el Art. 44 de la Ley 822 [cite: 163], pero que la carga de precios de mercado (`setMarketPrice`) y la aprobación de castigos (`applyLowerOfCostWritedown`) son responsabilidad exclusiva del contribuyente y su contador.

1. ¿Quién debe cargar los precios de mercado y ejecutar el castigo?Responsable operativo: El Contador del cliente (o el Administrador/Dueño con validación contable), nunca tú como desarrollador.Por qué tú no debes hacerlo: Como proveedor de software, asumir la carga o actualización de precios de mercado te expone a responsabilidad fiscal y financiera sobre la valuación del inventario y el cálculo del Impuesto sobre la Renta (IR) del cliente. Además, los precios de reposición dependen de cotizaciones reales de los proveedores locales del negocio.Diseño de permisos (RBAC): El operador de barra o caja (barista/cajero) no debe ver ni tener acceso a setMarketPrice ni a applyLowerOfCostWritedown. Estas rutas deben exponerse únicamente en el Backoffice Web bajo el rol de Contador o Dueño, y cada ejecución debe quedar registrada en la bitácora de auditoría (Audit Trail) con el usuario y la referencia de respaldo.2. ¿Con qué ritmo debe hacerse? (Semanal vs. Mensual vs. Anual)En una cafetería de food park, los insumos principales (café, leche, desechables, jarabes) tienen alta rotación, por lo que su último costo de compra suele reflejar de cerca el precio de reposición actual. La cadencia recomendada según el marco normativo nicaragüense es la siguiente:FrecuenciaViabilidad para un caféSustento normativo y contable (Nicaragua)SemanalNo recomendadaGenera fricción operativa innecesaria; variaciones semanales de insumos perecederos rara vez justifican asientos de castigo de inventario.MensualÓptima para control interno (NIIF)Permite revisar al cierre de mes el Food Cost y ajustar por valor neto realizable si el negocio prepara estados financieros mensuales bajo NIIF para PYMES [cite: 163, 202].Anual (al 31 de diciembre)Obligatoria para cumplimiento DGIEl Art. 50 de la Ley 822 fija el período fiscal ordinario del 1 de enero al 31 de diciembre [cite: 261]; el Art. 33 del Reglamento (Decreto 01-2013) exige levantar inventario físico al fin del año (o sustentar tomas periódicas) para efectos del Art. 44 [cite: 224]; y la DAG 01-2014 obliga a reportar el informe de inventario en la VET dentro de los 30 días posteriores al cierre fiscal [cite: 246, 248].Regla práctica para R-01: Define por defecto un flujo de revisión mensual (opcional para control contable) y cierre anual obligatorio antes de generar el Informe de Inventario de la DAG 01-2014 [cite: 224, 246].3. Alerta fiscal crítica sobre applyLowerOfCostWritedown en NicaraguaAntes de activar el castigo automático en producción, el contador del cliente debe validar dos matices clave de la Ley 822 para evitar reparos de la DGI:Valuación vs. Reservas no deducibles: El Art. 44 de la Ley 822 ordena valuar cada bien a su costo de adquisición o precio de mercado, el que sea menor (permitiendo costo promedio, PEPS/FIFO o UEPS/LIFO, aunque NIIF para PYMES prohíbe UEPS/LIFO y exige costo promedio ponderado o FIFO) [cite: 163]. Sin embargo, el Art. 43 de la Ley 822 declara no deducibles las reservas que se acumulen para cualquier propósito, salvo las indemnizaciones laborales taxativas y reservas técnicas específicas [cite: 250, 251, 254]. Por ello, el asiento compensatorio que genera applyLowerOfCostWritedown no debe contabilizarse como una "reserva o provisión genérica", sino quedar claramente documentado como ajuste de valuación de cierre conforme al Art. 44 y al inventario físico del Art. 33 del Reglamento [cite: 163, 224].No confundir caída de precio de mercado con deterioro físico o caducidad: Si el valor del insumo cayó porque se venció o se dañó (algo común en leche o repostería), la deducibilidad del gasto se rige por el Art. 39 numeral 18 de la Ley 822, el cual exige documentar la causa, la preexistencia y —en caso de destrucción de mercadería— notificar previamente a la Administración de Rentas con al menos 10 días de anticipación para obtener la autorización de destrucción [cite: 246]. Tu sistema debe distinguir entre un castigo por precio de mercado (applyLowerOfCostWritedown) y una baja física por merma/caducidad [cite: 246].4. Qué ajustar en el producto para "revivir" las rutas sin fricciónPara que R-01 pase de "parcial con mecanismo" a cumplimiento operativo real sin sobrecargar al usuario:Sacar la función de la caja: Crear una vista específica "Valuación y Cierre (Art. 44 LCT)" en el panel Web del Contador/Dueño.Asistente de pre-llenado inteligente: En esa pantalla, mostrar únicamente los insumos con existencia al cierre, comparando su costo actual en sistema contra la última factura de compra registrada o el último market_price vigente. Si el último precio de compra bajó respecto al costo promedio, el sistema puede resaltarlo para que el contador solo confirme el valor y ejecute setMarketPrice.Bloqueo / Recordatorio en el Cierre Anual (VET): Al momento de exportar el reporte de inventario anual para la VET (DAG 01-2014) [cite: 246, 248], mostrar una advertencia si existen ítems sin revisión de precio de mercado reciente, dando al contador la opción explícita de confirmar que el costo es menor al mercado o ejecutar applyLowerOfCostWritedown antes de cerrar el período fiscal.Cláusula de responsabilidad en tu acuerdo comercial: Dejar por escrito que el software provee las herramientas de valuación exigidas por el Art. 44 de la Ley 822 [cite: 163], pero que la carga de precios de mercado (setMarketPrice) y la aprobación de castigos (applyLowerOfCostWritedown) son responsabilidad exclusiva del contribuyente y su contador.
