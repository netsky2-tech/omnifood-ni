# Contrato Marco de Suscripción de Software como Servicio (SaaS)
## NHILOS POS

**Document ID:** NH-SA-0001  
**Versión:** 0.1  
**Estado:** BORRADOR EN REVISIÓN [TARGETED VALIDATION REQUIRED]  
**Aplica a:** Clientes de suscripción NHILOS POS (Primer cliente: SOHO Café)  
**Marco de referencia:** `docs/nhilos/NHILOS_CLIENT_DELIVERY_READINESS.md`

---

> **AVISO IMPORTANTE SOBRE ETAPA FUNDADORA / FREELANCER:**  
> El presente contrato marco regula la provisión del servicio tecnológico NHILOS POS. En esta etapa de lanzamiento, el servicio es provisto directamente por su fundador y desarrollador principal en carácter de persona física independiente bajo la denominación comercial **NHILOS POS**. Las cláusulas identificadas con la etiqueta `[REVISIÓN LEGAL/CONTABLE REQUERIDA]` contienen términos estándar de la industria que deben ser validados formalmente con asesores locales en caso de controversia, formalización societaria ulterior o requerimiento fiscal sobreviniente.

---

## 1. Partes Contratantes

1. **El Proveedor:**  
   **[Nombre legal completo del Fundador]**, mayor de edad, con documento de identidad / cédula de identidad número **[Número de Cédula/Identificación]**, actuando comercialmente bajo la marca y nombre comercial **NHILOS POS** (en adelante, el "**PROVEEDOR**").

2. **El Cliente:**  
   La entidad comercial o persona individual identificada en la correspondiente Orden de Servicio (**Anexo / CD-03**) (en adelante, el "**CLIENTE**").

El PROVEEDOR y el CLIENTE podrán ser denominados conjuntamente como las "**Partes**" e individualmente como la "**Parte**".

---

## 2. Objeto del Contrato

El PROVEEDOR concede al CLIENTE, y este acepta, una suscripción no exclusiva, revocable e intransferible para el uso de la plataforma tecnológica **NHILOS POS**, compuesta por:

1. **Aplicación Móvil/Terminal POS:** Software cliente instalado en terminales compatibles autorizados para la operación de caja, ventas, emisión de tickets y contingencia fuera de línea (*offline-first*).
2. **Backoffice / Portal Web de Propietario (Dashboard):** Plataforma web para la consulta de métricas, reportes de ventas, costos, inventario sincronizado y administración de parámetros.
3. **Servicios de Sincronización en la Nube:** Infraestructura de backend encargada del respaldo, agregación y sincronización de transacciones cuando los terminales disponen de conexión a internet.

El alcance comercial específico (número de sucursales, terminales, costos y vigencia) se establecerá en cada **Orden de Servicio** formalizada entre las Partes.

---

## 3. Naturaleza del Servicio y Órdenes de Servicio

1. **Modalidad SaaS:** El servicio se presta en la modalidad de software como servicio (*Software as a Service*). El CLIENTE no adquiere la propiedad del software, sus códigos fuentes, componentes de diseño ni su arquitectura interna.
2. **Órdenes de Servicio (Service Orders):** Cada contratación se formalizará mediante una Orden de Servicio vinculada a este Contrato Marco (identificada como `NH-SO-XXXX`). En caso de discrepancia entre los términos generales de este Contrato y una Orden de Servicio, prevalecerá lo establecido en la respectiva Orden de Servicio para ese caso particular.
3. **Puesta en Marcha (Go-Live) como Condición Previa:** Salvo pacto expreso en contrario en la Orden de Servicio, la facturación del abono mensual de suscripción iniciará estrictamente a partir de la fecha en que se firme satisfactoriamente el **Acta de Aceptación de Go-Live (`CD-07`)**.
4. **Métrica de Licenciamiento y Usuarios Operativos:** El licenciamiento del servicio se calcula y asigna en función de sucursales autorizadas y terminales físicos de punto de venta activos, según conste en la Orden de Servicio. Los usuarios operativos en terminal (cajeros, meseros, supervisores de turno) no generan cargos adicionales por usuario nominal individual. Esto garantiza la trazabilidad forense, la asignación de códigos PIN individuales no compartidos y la integridad estricta de las bitácoras de auditoría y arqueos de caja. La adición de terminales físicos, puntos de cobro concurrentes o nuevas sucursales requerirá la adición de los componentes y tarifas correspondientes estipulados en la Orden de Servicio o sus anexos.

---

## 4. Condiciones Económicas, Cobro y Régimen Tributario

1. **Precios y Facturación:** Los montos de instalación (*setup*) y de suscripción mensual recurrente se detallan en la correspondiente Orden de Servicio.
2. **Ciclo de Facturación:** El abono mensual se facturará por períodos anticipados de 30 días, calculados a partir de la fecha de go-live aceptado o en la fecha de corte mensual establecida en la Orden de Servicio.
3. **Plazo de Pago y Mora:** El CLIENTE contará con un plazo de cinco (5) días hábiles para efectuar el pago correspondiente. Vencido dicho plazo, el PROVEEDOR emitirá un aviso formal de cobro.
4. **Suspensión por Falta de Pago:** Si el CLIENTE incurriera en una mora superior a diez (10) días hábiles contados a partir del vencimiento del ciclo, el PROVEEDOR se reserva el derecho de suspender temporalmente el acceso a la sincronización en la nube y al portal de propietario, sin perjuicio de la funcionalidad local mínima del terminal de venta para mitigar daños operativos.

> `[REVISIÓN LEGAL/CONTABLE REQUERIDA - CLÁUSULA FISCAL EN ETAPA FUNDADORA]`  
> **5. Régimen de Comprobantes:** En esta etapa preliminar de lanzamiento, las Partes acuerdan que los pagos se acreditarán mediante recibos simples de pago comerciales emitidos por el PROVEEDOR, sin desglose tributario específico. El CLIENTE reconoce y acepta que no está solicitando facturas fiscales formales con IVA durante esta etapa. Cada Parte es responsable de sus propias obligaciones tributarias ante las autoridades correspondientes. Si por disposiciones regulatorias sobrevinientes o requerimiento fiscal aplicable resultara mandatorio practicar retenciones en la fuente o emitir comprobantes fiscales sujetos a gravámenes, los valores facturados se ajustarán de manera que el valor neto percibido por el PROVEEDOR permanezca inalterado conforme a lo acordado en la Orden de Servicio, debiendo el CLIENTE entregar constancia formal de toda retención practicada.

---

## 5. Propiedad Intelectual y Protección de Datos

1. **Propiedad Intelectual del Software:** El PROVEEDOR conserva la titularidad exclusiva de todos los derechos de propiedad intelectual, derechos de autor, marcas, patentes, secretos comerciales y metodologías asociados a NHILOS POS, incluyendo código fuente, bases de datos base, interfaces y documentación.
2. **Propiedad de los Datos del Negocio:** El CLIENTE es el único titular de todos los datos transaccionales, listas de productos, precios, recetas, inventarios, registros de ventas y datos de clientes finales introducidos en el sistema (en adelante, los "**Datos del Cliente**").
3. **Aislamiento Multitenant:** El PROVEEDOR garantiza la separación lógica y estricta de los datos del CLIENTE respecto de cualquier otro cliente de la plataforma a nivel de base de datos e infraestructura en la nube.
4. **Respaldo y Exportación de Datos:** En caso de terminación del servicio, el CLIENTE tendrá derecho a solicitar la exportación completa de sus datos transaccionales e inventario en formatos abiertos estándar (CSV o JSON) conforme a la Política de Soporte y Respaldos.

---

## 6. Operación Local vs. Nube y Objetivos de Recuperación

1. **Principio Offline-First:** El CLIENTE reconoce que la aplicación de punto de venta (POS) está diseñada para funcionar sin conexión a internet permanente. Las transacciones registradas localmente se almacenan en la base de datos interna del terminal y se transmiten a la nube únicamente cuando se dispone de conectividad de red adecuada.
2. **Límites del Respaldo en la Nube:** Las políticas de respaldo del PROVEEDOR protegen exclusivamente la información que haya sido sincronizada efectivamente con los servidores de nube. La información que permanezca retenida en el dispositivo físico por falta de conectividad o falla local antes de sincronizarse no forma parte del Objetivo de Punto de Recuperación (RPO) en la nube.
3. **Objetivos de Recuperación (RPO / RTO):** Los objetivos de respaldo y tiempos estimados de restauración son de naturaleza operativa y no constituyen un acuerdo de nivel de servicio (SLA) sancionable pecuniariamente, rigiéndose en su totalidad por la **Política de Soporte y Respaldos (`CD-04 / CD-05`)**.

---

## 7. Responsabilidades y Exclusiones

### 7.1 Responsabilidades del CLIENTE
- Aportar, custodiar y mantener el hardware del punto de venta (terminal de flota, impresoras, adaptadores de corriente y cableado).
- Suministrar una conexión a internet estable para la sincronización periódica del sistema.
- Custodiar los accesos, contraseñas y PINs del personal autorizado, evitando el uso compartido de credenciales.
- Garantizar la veracidad de los datos fiscales, catálogos y recetas cargados en el sistema.

### 7.2 Exclusiones del Servicio
Quedan expresamente excluidos del servicio incluido:
- Garantía física, reparación o reposición de terminales, impresoras o accesorios por desgaste, caída, daño eléctrico o robo.
- Soporte a redes locales (routers, módems, cableado o señal Wi-Fi).
- Asistencia en la operación diaria del negocio (atención en caja, digitación manual de comprobantes, toma física de inventario).
- Integración no contratada con sistemas bancarios externos, pasarelas de pago o datáfonos no homologados.
- Desarrollo a medida no estipulado en la Orden de Servicio.

---

> `[REVISIÓN LEGAL/CONTABLE REQUERIDA - LIMITACIÓN DE RESPONSABILIDAD]`  
## 8. Limitación de Responsabilidad

1. En la máxima medida permitida por la legislación aplicable, la responsabilidad total acumulada del PROVEEDOR por cualquier reclamo derivado o relacionado con el presente Contrato, ya sea por incumplimiento contractual, responsabilidad extracontractual o de cualquier otra índole, estará limitada al monto total efectivamente abonado por el CLIENTE por concepto de suscripción mensual durante los últimos tres (3) meses anteriores al hecho causante.
2. En ningún caso el PROVEEDOR será responsable por daños indirectos, lucro cesante, pérdida de ingresos comerciales, pérdida de oportunidades de negocio o daños emergentes derivados de fallas de telecomunicaciones de terceros, cortes de energía eléctrica o manipulación inadecuada del hardware por parte del personal del CLIENTE.

---

## 9. Duración, Renovación y Terminación

1. **Vigencia:** El presente Contrato entrará en vigor a partir de la firma de la primera Orden de Servicio y permanecerá vigente mientras exista al menos una Orden de Servicio activa.
2. **Terminación por Conveniencia:** Cualquiera de las Partes podrá rescindir la suscripción notificando a la otra Parte por escrito con al menos treinta (30) días de anticipación a la fecha de renovación del ciclo de facturación.
3. **Terminación por Incumplimiento:** Cualquiera de las Partes podrá dar por terminado el presente Contrato de forma inmediata si la otra Parte incurre en un incumplimiento grave de sus obligaciones y no lo subsana en un plazo de diez (10) días hábiles tras recibir notificación escrita.
4. **Efectos de la Terminación:** A la terminación, se suspenderá el acceso a la plataforma, se generará la exportación de cierre de los datos del CLIENTE y el CLIENTE abonará cualquier saldo pendiente devengado hasta la fecha efectiva de corte.

---

> `[REVISIÓN LEGAL/CONTABLE REQUERIDA - LEY APLICABLE Y JURISDICCIÓN]`  
## 10. Ley Aplicable y Solución de Controversias

1. El presente Contrato se regirá e interpretará conforme a las leyes vigentes de la República de Nicaragua.
2. Las Partes acuerdan que cualquier controversia, diferencia o reclamación que surja del presente Contrato se intentará resolver en primera instancia mediante negociaciones de buena fe entre los representantes autorizados de ambas Partes durante un período no inferior a quince (15) días hábiles.
3. De no alcanzarse un acuerdo directo, las Partes podrán someter la controversia a la jurisdicción de los juzgados y tribunales competentes de la ciudad de Managua, renunciando a cualquier otro fuero o domicilio que pudiera corresponderles.

---

## 11. Disposiciones Generales

1. **Acuerdo Íntegro:** Este Contrato Marco, en conjunto con las Órdenes de Servicio aplicables y las Políticas de Soporte y Respaldos, constituye el acuerdo integral entre las Partes y reemplaza cualquier negociación o propuesta previa, escrita o verbal.
2. **Modificaciones:** Cualquier modificación al presente Contrato requerirá instrumento escrito suscrito por ambas Partes.
3. **Cesión de Derechos (Transición Societaria):** El CLIENTE acepta expresamente que el PROVEEDOR podrá ceder o transferir la totalidad de los derechos y obligaciones de este Contrato a una entidad societaria constituida a futuro por el fundador para la operación formal de la marca NHILOS POS, bastando para ello una comunicación informativa escrita al CLIENTE sin alterar las condiciones comerciales pactadas.

---

## Firmas de Conformidad

Leído el presente instrumento y conformes con su contenido y alcance, las Partes lo suscriben en dos ejemplares de un mismo tenor y valor.

<br>

| Por el PROVEEDOR | Por el CLIENTE |
|---|---|
| **Firma:** __________________________________ | **Firma:** __________________________________ |
| **Nombre:** [Nombre del Fundador] | **Nombre:** __________________________________ |
| **Identificación:** [Cédula Fundador] | **Identificación / RUC:** ___________________ |
| **Calidad:** Fundador / Proveedor NHILOS POS | **Cargo:** ___________________________________ |
| **Fecha:** _____ / _____ / 2026 | **Fecha:** _____ / _____ / 2026 |
