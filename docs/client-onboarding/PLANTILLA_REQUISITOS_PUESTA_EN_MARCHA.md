<!--
PLANTILLA INTERNA DE ONBOARDING

Antes de entregar este documento al cliente:
1. Reemplazar todos los campos entre {{LLAVES}}.
2. Eliminar las secciones que no correspondan al negocio.
3. Definir junto con el cliente si iniciará en modalidad rápida o completa.
4. Confirmar que la información fiscal coincida con los documentos oficiales.
5. Exportar una copia final a PDF y conservar la versión aprobada.
-->

# Requisitos para la puesta en marcha de {{NOMBRE_DEL_NEGOCIO}}

**Tipo de negocio:** {{TIPO_DE_NEGOCIO}}  
**Responsable principal:** {{NOMBRE_DEL_RESPONSABLE}}  
**Fecha de preparación:** {{FECHA}}  
**Fecha tentativa de inicio:** {{FECHA_TENTATIVA}}  
**Preparado por:** {{NOMBRE_DEL_IMPLEMENTADOR}}

---

## Objetivo de este documento

Esta guía explica la información que necesitamos para configurar el punto de venta de **{{NOMBRE_DEL_NEGOCIO}}**, realizar las pruebas de funcionamiento y comenzar operaciones de manera ordenada.

La información está dividida en dos grupos:

1. **Información necesaria para preparar y activar el punto de venta.**
2. **Información necesaria para controlar correctamente el inventario, los costos y la rentabilidad.**

> **Información importante:** es posible preparar el sistema y registrar ventas utilizando el menú y los datos básicos del negocio. Sin embargo, mientras no estén configurados los insumos, las recetas, el inventario inicial y los costos, el sistema no podrá presentar existencias, costos ni márgenes confiables.

## 1. Datos generales y fiscales

Por favor, completar la siguiente información según los documentos oficiales del negocio.

| Información | Respuesta del cliente |
|---|---|
| Nombre comercial | {{NOMBRE_COMERCIAL}} |
| Razón social | {{RAZON_SOCIAL}} |
| RUC | {{RUC}} |
| Régimen fiscal | {{REGIMEN_FISCAL}} |
| ¿Los precios incluyen IVA? | {{PRECIOS_INCLUYEN_IVA}} |
| Dirección del establecimiento | {{DIRECCION}} |
| Teléfono del negocio | {{TELEFONO}} |
| Tipo de cambio comercial, si aplica | {{TIPO_DE_CAMBIO}} |
| Horario de operación | {{HORARIO}} |

La información fiscal debe ser validada antes de emitir comprobantes reales. Una factura emitida no debe eliminarse; cualquier reversión deberá realizarse mediante el procedimiento de anulación correspondiente.

## 2. Propietario y personas autorizadas

### Responsable principal

| Información | Respuesta del cliente |
|---|---|
| Nombre completo | {{NOMBRE_DEL_RESPONSABLE}} |
| Cargo o relación con el negocio | {{CARGO}} |
| Correo electrónico | {{CORREO}} |
| Teléfono | {{TELEFONO_DEL_RESPONSABLE}} |

### Personal adicional

No es necesario registrar a todo el personal para preparar el sistema. El propietario puede comenzar como usuario principal y posteriormente agregar cajeros, encargados u otros colaboradores.

Cuando corresponda, compartir por cada persona:

- [ ] Nombre completo.
- [ ] Cargo o función.
- [ ] Correo o teléfono de contacto.
- [ ] Nivel de acceso requerido.

## 3. Menú o catálogo de productos

Para preparar el catálogo inicial necesitamos que cada producto incluya, como mínimo:

| Información | Ejemplo |
|---|---|
| Nombre del producto | Cappuccino |
| Precio de venta | C$ 85.00 |
| Categoría | Bebidas calientes |
| Tamaño o presentación | 12 oz / 16 oz |
| Variantes | Vainilla / Caramelo |
| Extras disponibles | Shot adicional / Leche vegetal |
| Precio de cada extra | C$ 20.00 |
| Estado | Disponible / Temporalmente fuera de venta |

### Recomendaciones para preparar el catálogo

- Registrar por separado cada tamaño o presentación que tenga un precio diferente.
- Incluir productos empacados o de reventa.
- Indicar claramente qué opciones modifican el precio.
- Informar cuáles productos no estarán disponibles al inicio.
- Si el catálogo es extenso, comenzar con los productos de mayor rotación y agregar el resto posteriormente.

## 4. Insumos e inventario inicial

Los **insumos** son los materiales o productos que el negocio compra, almacena o consume durante su operación.

Ejemplos para un negocio de alimentos y bebidas:

- café, leche, azúcar y jarabes;
- carnes, vegetales, panes y salsas;
- vasos, tapas, empaques y servilletas;
- bebidas o alimentos empacados para reventa.

Para cada insumo necesitamos:

| Información | Ejemplo |
|---|---|
| Nombre | Leche entera |
| Unidad de control | Mililitros |
| Cantidad disponible al iniciar | 20,000 ml |
| Presentación de compra | Envase de 1 litro |
| Costo de compra | C$ 45.00 por litro |
| Nivel mínimo deseado | 5,000 ml |
| Proveedor, si se conoce | {{PROVEEDOR}} |

> El inventario inicial debe provenir de un conteo físico realizado cerca de la fecha de inicio. Una estimación incorrecta producirá existencias incorrectas desde el primer día.

## 5. Recetas y preparaciones internas

La receta indica cuánto consume una venta de cada insumo.

**Ejemplo:**

> Cappuccino de 12 oz = 18 g de café + 120 ml de leche + 1 vaso + 1 tapa.

Para cada producto preparado necesitamos:

- [ ] Ingredientes utilizados.
- [ ] Cantidad de cada ingrediente.
- [ ] Unidad de medida: gramos, mililitros o unidades.
- [ ] Tamaño, porción o rendimiento.
- [ ] Pérdida o merma habitual, cuando corresponda.
- [ ] Materiales de empaque que se desean controlar.

Si el negocio prepara productos intermedios —por ejemplo, jarabes, salsas, aderezos, mezclas o masas— también necesitamos:

- nombre de la preparación;
- ingredientes y cantidades;
- rendimiento total del lote;
- unidad del rendimiento;
- duración o vida útil estimada.

## 6. Costos de los insumos

Para calcular el costo y margen de cada producto necesitamos el costo de compra actual de sus ingredientes o componentes.

Siempre que sea posible, compartir:

- [ ] Precio pagado.
- [ ] Cantidad o presentación comprada.
- [ ] Fecha de la compra.
- [ ] Proveedor.
- [ ] Impuestos o cargos incluidos, cuando corresponda.

**Ejemplo:** si un litro de leche cuesta C$ 45.00 y una bebida utiliza 120 ml, el sistema necesita ambos datos para calcular cuánto representa la leche dentro del costo de esa bebida.

## 7. ¿Qué ocurre si comenzamos solamente con el menú?

El negocio podrá registrar ventas después de completar la instalación y las pruebas, pero cada venta quedará registrada sin información completa sobre lo que se utilizó para producirla.

### No tendremos existencias confiables

Sin recetas publicadas, el sistema no sabrá cuánto café, leche, empaque u otros ingredientes debe descontar por cada venta. Por lo tanto, no podrá indicar con precisión cuánto queda disponible ni cuándo es necesario volver a comprar.

### No tendremos costos confiables

El precio de venta no representa el costo de preparar el producto. Sin cantidades y costos de los ingredientes, el costo real quedará pendiente.

### No tendremos márgenes confiables

El margen compara el precio de venta contra el costo real. Si el costo todavía no está configurado, cualquier reporte de rentabilidad será incompleto y podría llevar a decisiones equivocadas.

### No podremos medir correctamente las mermas

Sin una receta teórica y un inventario inicial, no podremos comparar lo que debió consumirse con lo que realmente queda. Esto dificulta detectar desperdicios, errores de preparación o diferencias de inventario.

> **Conclusión:** comenzar solamente con el menú permite abrir la caja, pero no permite administrar el inventario ni conocer con precisión la rentabilidad del negocio.

## 8. Modalidad de puesta en marcha

El cliente y el implementador deberán acordar una de las siguientes modalidades.

### Modalidad A — Inicio rápido

El cliente entrega los datos fiscales y el catálogo con precios. Se configura el punto de venta y se realiza una venta de prueba.

Esta modalidad permite comenzar antes, pero temporalmente:

- no habrá existencias automáticas confiables;
- los costos aparecerán como pendientes;
- los márgenes no serán confiables;
- las alertas de reposición serán limitadas;
- no será posible medir correctamente las mermas.

### Modalidad B — Inicio con control completo — recomendada

Además de los datos básicos y el catálogo, el cliente entrega:

- lista de insumos;
- inventario inicial contado;
- costos de compra;
- recetas por producto;
- preparaciones internas o subrecetas;
- unidades de medida consistentes.

Esta modalidad requiere más preparación, pero permite comenzar con mejor control de existencias, costos, márgenes y mermas desde el primer día.

**Modalidad seleccionada:** {{MODALIDAD_SELECCIONADA}}

## 9. Pruebas antes de iniciar ventas reales

Una vez recibida la información acordada, se realizarán las siguientes actividades:

- [ ] Creación del negocio y del usuario principal.
- [ ] Carga y revisión del catálogo.
- [ ] Configuración del dispositivo de venta.
- [ ] Prueba de la impresora.
- [ ] Verificación del acceso sin internet.
- [ ] Confirmación de que el catálogo esté disponible localmente.
- [ ] Venta de prueba utilizando el flujo real.
- [ ] Revisión del comprobante y su numeración.
- [ ] Explicación del proceso de anulación.
- [ ] Confirmación conjunta de la fecha de inicio.

La fecha definitiva de operación se confirma después de completar correctamente las pruebas aplicables.

## 10. Checklist de entrega

### Obligatorio para preparar el punto de venta

- [ ] Datos generales y fiscales.
- [ ] Datos del propietario o responsable.
- [ ] Menú o catálogo con nombres y precios.
- [ ] Tamaños, variantes y extras.
- [ ] Confirmación de si los precios incluyen IVA.

### Necesario para inventario, costos y márgenes confiables

- [ ] Lista de insumos.
- [ ] Unidad de medida de cada insumo.
- [ ] Conteo del inventario inicial.
- [ ] Costo actual de cada insumo.
- [ ] Receta de cada producto preparado.
- [ ] Preparaciones internas o subrecetas.
- [ ] Mermas conocidas.
- [ ] Proveedores principales, si están disponibles.

## 11. Información pendiente y acuerdos

| Pendiente o acuerdo | Responsable | Fecha acordada | Estado |
|---|---|---|---|
| {{PENDIENTE_1}} | {{RESPONSABLE_1}} | {{FECHA_1}} | Pendiente |
| {{PENDIENTE_2}} | {{RESPONSABLE_2}} | {{FECHA_2}} | Pendiente |
| {{PENDIENTE_3}} | {{RESPONSABLE_3}} | {{FECHA_3}} | Pendiente |

## 12. Confirmación

Al confirmar este documento, ambas partes reconocen qué información será entregada antes del inicio y qué información quedará pendiente para una etapa posterior.

La selección de la modalidad de inicio rápido implica aceptar temporalmente que los reportes de inventario, costos, márgenes y mermas no serán confiables hasta completar y validar la configuración correspondiente.

| Parte | Nombre | Fecha | Confirmación |
|---|---|---|---|
| Cliente | {{NOMBRE_DEL_CLIENTE}} | {{FECHA}} | ____________________ |
| Implementador | {{NOMBRE_DEL_IMPLEMENTADOR}} | {{FECHA}} | ____________________ |

## Próximo paso

Enviar el menú o catálogo y los datos generales del negocio para comenzar la preparación. En paralelo, completar los insumos, el inventario inicial, los costos y las recetas antes de iniciar ventas reales, siempre que se haya seleccionado la modalidad recomendada de control completo.
