# Orden de Servicio — SOHO Café
## NHILOS POS

**Orden de Servicio ID:** NH-SO-0001  
**Contrato Marco de Referencia:** NH-SA-0001 (`docs/nhilos/contracts/nhilos_subscription_agreement_v0.1.md`)  
**Versión:** 0.1  
**Estado:** CLIENT-READY DRAFT  
**Fecha de Emisión:** [dd/mm/2026]  
**Fecha Estimada de Entrega y Puesta en Marcha:** [dd/mm/2026]

---

## 1. Identificación de las Partes

| Rol | Razón Social / Nombre Comercial | Representante / Titular | Identificación / RUC | Contacto Principal |
|---|---|---|---|---|
| **PROVEEDOR** | NHILOS POS (Operado por persona física) | [Nombre legal completo del Fundador] | [Cédula Fundador] | [Email / Teléfono Fundador] |
| **CLIENTE** | SOHO Café | [Nombre del Propietario / Representante] | [RUC / Cédula Cliente] | [Email / Teléfono SOHO] |

---

## 2. Alcance Comercial y Estructura de Tarifas

| Concepto | Detalle de Cobertura | Tarifa Acordada | Frecuencia de Cobro |
|---|---|---:|---|
| **Implementación Inicial (Setup)** | Configuración de catálogo, recetas, terminal de flota, alta en nube y capacitación inicial | **US$ 200.00** | Pago único previo a la puesta en marcha |
| **NHILOS Operación — Plan Fundador** | Licencia de uso SaaS, 1 sucursal, 1 terminal, Portal de Propietario en la nube, sincronización y parches de plataforma | **US$ 79.00** | Mensual recurrente |

### Condiciones Comerciales Especiales:
1. **Protección de Tarifa Fundadora:** La tarifa preferencial de **US$ 79.00 / mes** se mantendrá congelada durante un período de **veinticuatro (24) meses** contados a partir de la fecha de puesta en marcha aceptada, siempre que el CLIENTE mantenga una (1) sucursal, un (1) terminal y sus pagos al día. Al término de dicho plazo, aplicará la tarifa pública vigente, con notificación previa de 60 días.
2. **Gatillo de Inicio de Facturación Recurrente:** **No existe mes de prueba gratuito.** La facturación mensual comenzará a computarse estrictamente a partir de la firma satisfactoria del **Acta de Aceptación de Go-Live (`CD-07`)**.
3. **Modalidad de Pago en Etapa Fundadora:** Los pagos se realizarán mediante transferencia bancaria o efectivo en dólares estadounidenses (USD) o su equivalente en córdobas (NIO) al tipo de cambio oficial del día, respaldados mediante recibo simple comercial no fiscal emitido por el PROVEEDOR, conforme a la cláusula fiscal del Contrato Marco (`NH-SA-0001`).
4. **Política de Usuarios y Límites Operativos:**
   - **Usuarios Operativos de Caja/Turno (POS):** Ilimitados incluidos sin costo adicional para el terminal contratado. Para garantizar la trazabilidad forense, arqueos independientes y control de auditoría RBAC, cada cajero, supervisor o empleado operativo debe contar con su propio usuario y PIN personal intransferible.
   - **Cuentas de Acceso al Portal de Propietario (Owner Dashboard):** Hasta dos (2) cuentas administrativas simultáneas incluidas.
5. **Régimen de Adicionales y Expansión (Add-ons):**
   - **Terminales Físicos Adicionales (Misma Sucursal):** La incorporación de un segundo terminal de cobro o comandera física tiene un costo mensual preferencial de **US$ 35.00 / mes** por terminal adicional, más un cargo único de configuración e inducción física de **US$ 50.00**.
   - **Sucursales Adicionales:** Cada nueva ubicación física constituye una contratación independiente sujeta a implementación inicial y abono base de suscripción.

---

## 3. Especificaciones del Despliegue Técnico

| Parámetro | Detalle Autorizado |
|---|---|
| **Tenant ID en Plataforma** | `NH-T0001` (SOHO) |
| **Ubicación / Sucursal** | Sucursal principal SOHO Café (Managua, Nicaragua) |
| **Cantidad de Terminales** | Un (1) terminal de punto de venta activo |
| **Hardware de Flota Aportado por Cliente** | **MIRAY Q80 / iPOS** (Android 12, cabezal térmico de 80 mm, driver Nyx/iPOS) |
| **Moneda Base del Sistema** | Córdobas (NIO) con recepción de Dólares (USD) según tipo de cambio comercial configurado |
| **Régimen Fiscal Configurado** | Cuota Fija / Régimen General (conforme a declaración en `CD-09`) |
| **Plataformas Incluidas** | 1x Aplicación móvil POS (Android) + 1x Acceso web Owner Dashboard |

---

## 4. Entregables Incluidos en la Puesta en Marcha

1. **Inspección Física y QA de Terminal:** Ejecución del Checklist de Hardware (`CD-08`) sobre el terminal MIRAY Q80/iPOS, validando carga, display, conectividad y cabezal de impresión térmica de 80 mm.
2. **Instalación y Configuración del POS:** Despliegue del Release Candidate oficial de NHILOS POS con persistencia local garantizada (*offline-first*).
3. **Carga Inicial de Menú y Recetas:** Incorporación del catálogo base entregado por el CLIENTE (`CD-09`), con estructura de categorías, modificadores/extras, costos de insumos y deducción automática de stock por receta.
4. **Habilitación del Portal de Propietario (Dashboard):** Acceso administrativo web para consulta de ventas, márgenes brutos, reporte de mermas e inventario sincronizado.
5. **Sesión de Capacitación Inicial:** Entrenamiento práctico presencial para el propietario y los cajeros designados (apertura/cierre de turno, cobros, contingencias fuera de línea).
6. **Entrega de Materiales Rápidos de Campo:** Entrega física o digital de la *Guía de Inicio Rápido* (`CD-13`) y la *Guía de Contingencias ante Caídas de Red o Falla de Impresión* (`CD-14`).
7. **Configuración de Políticas de Respaldo:** Integración a la capa de snapshots nativos y copias lógicas cifradas hacia Cloudflare R2 conforme al Anexo de Soporte y Respaldos (`CD-04 / CD-05`).

---

## 5. Exclusiones Específicas de esta Orden

- Suministro, garantía física, reparación o reposición del terminal MIRAY Q80, cargador o router Wi-Fi.
- Cableado estructurado, repetidores o servicio de proveedor de internet (ISP).
- Facturación electrónica DGI estructurada con firma digital o enlaces fiscales centralizados no homologados.
- Integración bancaria directa con datáfonos (las transacciones con tarjeta se registran en el POS seleccionando el método de pago tras operar el datáfono físico independiente).
- Operación simultánea de múltiples terminales sincronizados en red local (*multiterminal FoH/BoH*), reservada para planes posteriores.

---

## 6. Procedimiento de Aceptación (Sesión de Go-Live)

Las Partes acuerdan realizar la sesión formal de entrega, capacitación y verificación en la sede del CLIENTE.

El go-live se considerará formalmente alcanzado cuando ambas Partes suscriban el **Acta de Aceptación de Go-Live (`CD-07`)**, certificando:
1. El correcto funcionamiento del terminal físico MIRAY Q80;
2. La ejecución exitosa de ventas de prueba (efectivo, tarjeta, con/sin internet, impresión de ticket de 80 mm);
3. La correcta recepción de credenciales del Owner Dashboard;
4. La impartición de la capacitación al personal designado.

Si existieren observaciones no críticas, se documentarán en el Acta con responsable y fecha de atención, sin diferir la puesta en marcha salvo que impidan la venta en caja.

---

## Firmas de Aceptación de la Orden de Servicio

Al suscribir esta Orden de Servicio, las Partes ratifican su sujeción a los términos y condiciones generales del Contrato Marco de Suscripción (`NH-SA-0001`).

<br>

| Por el PROVEEDOR (NHILOS POS) | Por el CLIENTE (SOHO Café) |
|---|---|
| **Firma:** __________________________________ | **Firma:** __________________________________ |
| **Nombre:** [Nombre del Fundador] | **Nombre:** __________________________________ |
| **Fecha:** _____ / _____ / 2026 | **Fecha:** _____ / _____ / 2026 |
