# Estrategia Financiera de OmniFood NI

## Decisiones vigentes

- La oferta pública es **US$250 de implementación + US$89/mes** por una ubicación y un terminal, con portal para propietarios incluido.
- La oferta fundadora de SOHO es **US$200 de implementación + US$79/mes** desde la puesta en marcha aceptada. El precio mensual se mantiene 24 meses mientras continúe con una ubicación/un terminal y esté al día en sus pagos.
- La mensualidad cubre producto, operación de plataforma, respaldo y soporte de plataforma definidos; no incluye hardware, reparaciones, asistencia operativa ilimitada ni trabajo personalizado.
- La entrega y sesión de aceptación de SOHO están programadas para el **sábado, 5 de septiembre de 2026**. La fecha se convierte en go-live y activa la mensualidad solo si pasan el checklist y los criterios contractuales y ambas partes registran aceptación; de existir pendientes críticos, se documentan y el go-live se aplaza hasta su cierre.
- No hay mes piloto gratuito. Durante la etapa fundadora, SOHO acepta recibos simples no fiscales sin desglose de IVA y no solicita factura fiscal. La situación de inscripción/RUC, régimen y documentación se registra como riesgo comercial/legal y debe validarse con un contador nicaragüense o la DGI; no se interpreta como exención.

## Base mensual completamente cargada

El archivo [FINANCIAL_TRACKER.csv](./FINANCIAL_TRACKER.csv) usa codificación **UTF-8**, campos separados por comas y el contrato normalizado descrito en la [guía de control financiero](./FINANCIAL_CONTROL_GUIDE.md). Los presupuestos se mantienen separados en [FINANCIAL_BUDGET.csv](./FINANCIAL_BUDGET.csv); una partida presupuestada nunca se interpreta como un pago.

| Concepto | Bajo (US$/mes) | Conservador (US$/mes) | Tratamiento |
| --- | ---: | ---: | --- |
| Gemini | 20.00 | 20.00 | Gasto compartido fijo |
| GPT | 100.00 | 100.00 | Gasto compartido fijo |
| Internet | 20.00 | 20.00 | Gasto fijo documentado |
| Dominio | 1.92 | 1.92 | US$23/año normalizado |
| Railway Pro y uso | 20.00 | 26.75 | Estimación inicial hasta medir consumo |
| Cloudflare Pages | 0.00 | 0.00 | SPA estática inicialmente |
| Cloudflare R2 | 0.00 | 1.35 | De hasta 10 GB gratis a ejemplo de 100 GB |
| **Total fijo mensual** | **161.92** | **170.02** | Antes de reservas variables e impuestos |

La infraestructura representa aproximadamente **US$21.92–30.02/mes**; IA e internet representan **US$140/mes**. Para modelar variación por cliente se reserva **US$1/cliente** en el escenario bajo y **US$5/cliente** en el conservador. Son presupuestos, no pagos ya realizados ni una garantía de factura futura.

### Costos variables y únicos

| Tipo | Partida | Criterio |
| --- | --- | --- |
| Variable | Uso de CPU, RAM, volumen y egreso de Railway | Medir por proyecto; RAM US$10/GB-mes, CPU US$20/vCPU-mes, volumen US$0.15/GB-mes y egreso US$0.05/GB |
| Variable | Almacenamiento/operaciones R2 | Primeros 10 GB-mes, 1 millón de operaciones Clase A y 10 millones Clase B sin cargo en Standard; luego según consumo |
| Variable | Reserva operativa por cliente | US$1 bajo o US$5 conservador hasta contar con telemetría real |
| Único | Implementación de cliente | Ingreso público de US$250; SOHO conserva US$200 |
| Único/histórico | Cuenta Google Play | US$25 registrado históricamente; no se presume un nuevo pago |
| Excluido | Hardware del cliente | OmniFood recomienda proveedores; no compra, garantiza ni repara equipos para SOHO |
| Por cotizar | Trabajo personalizado, migraciones extraordinarias y capacitación adicional | Alcance y precio aprobados antes de ejecutar |

No se tratará la tarifa de implementación como ganancia automática: primero deben imputarse las horas y costos directos realmente incurridos.

## Infraestructura y aislamiento

### Railway

Railway Hobby cuesta US$5/mes con US$5 de uso incluido; Pro cuesta US$20/mes con US$20 incluido. Para producción comercial se presupuesta **Pro en US$20–26.75/mes** hasta medir la carga.

Puede utilizarse la misma cuenta/workspace que otro sistema, pero OmniFood debe operar con:

1. proyecto Railway separado;
2. servicio/base PostgreSQL separado;
3. secretos y entornos separados; y
4. credenciales de respaldo separadas.

No se alojarán ambas aplicaciones en un mismo proyecto, red o base de datos. El crédito y consumo se agregan a nivel del plan/workspace, por lo que deben monitorearse en conjunto. La selección o actualización a Pro se evalúa antes de la salida comercial según carga medida y necesidades de producción.

### Portal y enrutamiento de tenants

- **Etapa 1:** una SPA estática en Cloudflare Pages, inicialmente US$0, con hasta 500 builds/mes y 100 dominios personalizados por proyecto. Registrar explícitamente cada `{tenant}.brand-domain`; Pages no acepta dominios personalizados wildcard.
- **Etapa 2:** migrar a Workers Static Assets con DNS/ruta wildcard cuando el aprovisionamiento automatizado o la escala lo exijan. Los activos estáticos pueden seguir sin costo; la línea base dinámica de Workers Paid es US$5/mes y se incorpora solo al activarse.

## Respaldo y recuperación incluidos al go-live

1. Programaciones nativas de Railway: diaria (6 días), semanal (1 mes) y mensual (3 meses).
2. Dump lógico diario de PostgreSQL, cifrado del lado del cliente, enviado a un bucket privado de Cloudflare R2 con SHA-256 y manifiesto.
3. Prueba mensual de restauración en un entorno aislado.
4. Retención base recomendada: 35 respaldos diarios y 12 cierres mensuales, sujeta a confirmación legal/contable de la retención fiscal requerida.

Los respaldos no se describen como inmutables ni certificados. Objetivos iniciales, no SLA: RPO de hasta 24 horas para datos ya sincronizados a la nube y RTO de un día hábil durante el piloto. Los datos locales del POS todavía no sincronizados quedan fuera del RPO de nube. Estos objetivos no se convierten en garantía hasta completar al menos tres simulacros consecutivos de restauración.

## Evidencia fiscal, archivo y límites de interpretación

Esta sección resume fuentes oficiales como información general para diseño operativo; no constituye asesoría legal o tributaria individualizada.

### Registro, régimen y facturación

- La Ley 562, Código Tributario (arts. 18, 20–21, 43–47 y 102), exige la inscripción del contribuyente y obtención del RUC antes de iniciar actividad económica. No estar constituido o registrado actualmente no demuestra que no existan obligaciones tributarias.
- Para la etapa fundadora, los pagos de SOHO se documentarán con recibos simples no fiscales sin desglose de IVA; SOHO no solicita factura fiscal. Es una decisión comercial con riesgo registrado, no una conclusión sobre exención ni ausencia de obligaciones.
- Cada parte responde por sus obligaciones. Cuando resulten legalmente aplicables impuestos, retenciones o documentación fiscal, el flujo y monto bruto de cobro se ajustarán para cumplirlos y preservar el precio neto del servicio de US$79 mensuales para OmniFood; el cliente debe emitir el comprobante de toda retención.
- La clasificación exacta de una eventual retención —incluida la determinación entre referencias del 2% o 10%— permanece abierta. La confirmación con un contador nicaragüense o la DGI es un disparador de formalización, al igual que una solicitud de factura fiscal por SOHO, un cambio de régimen o un requerimiento de autoridad.
- La Disposición Técnica 09-2007 exige autorización para facturación computarizada y contempla respaldo de operaciones diarias, numeración secuencial inalterable, conservación de facturas anuladas, notas de crédito, manuales y contingencia. Como remite a legislación anterior y no aparece claramente en el catálogo vigente de disposiciones DGI, el procedimiento administrativo y estado aplicable deben reconfirmarse antes de emitir facturas fiscales o habilitar ese flujo.

### Horizontes de conservación

- El Código Tributario establece un horizonte ordinario de cuatro años para información y determinación; puede extenderse a seis años ante declaraciones inexactas u omitidas, sujeto a reglas de interrupción y suspensión.
- Los artículos 40 y 46 del Código de Comercio sustentan conservar libros y documentación mercantil durante la vida del negocio y hasta 10 años después de la liquidación. Para operación técnica se adopta un **archivo fiscal anual de 10 años** como línea base conservadora, sujeto a validación legal y contable del cliente.
- El archivo anual reúne facturas, anulaciones, notas de crédito, evidencia de secuencia/auditoría y manifiestos. No significa conservar cada respaldo diario durante 10 años: los respaldos operativos mantienen 35 copias diarias, 12 cierres mensuales y las ventanas nativas de Railway.
- Ante auditoría, reclamación, recurso, apelación o procedimiento abierto, se suspende la eliminación de archivos relacionados. El cliente conserva la responsabilidad legal de validar y cumplir la retención requerida; OmniFood aporta los mecanismos técnicos contratados.

## Equilibrio, reinversión y escalamiento

Con la fórmula `clientes mínimos = techo(costo fijo / (precio - costo variable por cliente))`:

- a US$89, escenario bajo: **2 clientes**;
- a US$89, escenario conservador: **3 clientes**.

Orden de reinversión:

1. cubrir costos fijos, impuestos/retenciones confirmados y reserva variable;
2. financiar respaldo, restauración, seguridad y continuidad de plataforma;
3. reservar capacidad para soporte e incidentes;
4. invertir en adquisición comercial y equipos propios de prueba, no en hardware del cliente.

| Disparador | Acción |
| --- | --- |
| Antes del go-live comercial | Medir el consumo agregado de Railway y confirmar Pro, respaldos, restauración y aislamiento |
| Factura o tendencia supera el presupuesto conservador | Revisar consumo por servicio, límites y arquitectura antes de añadir capacidad |
| Pages exige alta manual repetitiva o se acerca al límite de dominios | Ejecutar Etapa 2 con Workers Static Assets y wildcard |
| R2 supera 10 GB-mes | Incorporar el costo medido; referencias: 20 GB ≈ US$0.15/mes y 100 GB ≈ US$1.35/mes |
| Tres restauraciones consecutivas exitosas | Revisar si existe evidencia suficiente para formalizar compromisos de recuperación; no hacerlo antes |
| Ingresos recurrentes cubren escenario conservador y reservas | Autorizar gasto comercial adicional con presupuesto, no por saldo bruto aislado |

## Fuentes oficiales

Consultadas el **2026-08-27**:

- Railway pricing: https://railway.com/pricing
- Railway plans and resource pricing: https://docs.railway.com/reference/pricing/plans
- Railway backups: https://docs.railway.com/reference/backups
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages known issues: https://developers.cloudflare.com/pages/platform/known-issues/
- Cloudflare Workers Static Assets: https://developers.cloudflare.com/workers/static-assets/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- DGI — Ley 562, Código Tributario: https://www.dgi.gob.ni/pdfLegislacion/1077
- Asamblea Nacional — Disposición Técnica 09-2007: http://legislacion.asamblea.gob.ni/Normaweb.nsf/(All)/F0AF7D609FD2B37706257570007C7DE6?OpenDocument=
- Asamblea Nacional — Código de Comercio, artículos 40 y 46: http://legislacion.asamblea.gob.ni/normaweb.nsf/($All)/D0B698C7B047DB6306257863007BB996
