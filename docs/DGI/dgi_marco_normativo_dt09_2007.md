# Marco Normativo DGI — Facturación Computarizada y Documentación Fiscal (Nicaragua)

> **Estado:** Vigente · Fuente normativa canónica del repositorio (cierra `#533` D5 y `#540` AC-1).
> **Nota metodológica:** Este documento es investigación de ingeniería con fuentes primarias, **no asesoría legal**. Separa explícitamente **NORMA** (obligatoria por ley o disposición técnica), **PRÁCTICA**, **NUESTRA DECISIÓN** (arquitectura del producto) y **PREGUNTAS ABIERTAS PARA CONTADORA (`#535`)**.

---

## 1. Fuentes Primarias Verificadas (`#533`)

1. **Disposición Técnica No. 09-2007 — *"Requisitos para uso de Sistemas de Facturación Computarizadas"***
   - Aprobada 2007-05-23, publicada en **La Gaceta No. 134 del 16 de julio de 2007**, firmada por Walter Porras (Director General de Ingresos). Base: Art. 223.3 CTr (Ley 562); Considerandos: Arts. 81 y 126.4 CTr.
   - Texto íntegro: `https://nicaragua.justia.com/nacionales/normas-tecnicas/requisitos-para-uso-de-sistemas-de-facturacion-computarizadas-jul-16-2007/gdoc/`
2. **DGI Nicaragua — *Obligaciones de los Responsables Recaudadores* (FAQ oficial)**
   - `https://www.dgi.gob.ni/FAQ/obligaciones_de_los_responsabl.htm`
   - Artículos citados: Ley de Concertación Tributaria (LCT) Arts. 124 nums. 3 y 6, 143.3, 148; Reglamento LCT Arts. 100.1 / literal g, 101; Código Tributario (CTr, Ley 562) Art. 103 num. 13; Decreto No. 1357 (pie de imprenta).
3. **DGI Nicaragua — *Infracciones, Sanciones y Delitos* (FAQ oficial)**
   - `https://www.dgi.gob.ni/FAQ/infracciones__sanciones_y_deli.htm`
   - Artículos citados: CTr Arts. 127 (multa 50% para Cuota Fija, 127.2 sanciones DT 09-2007), 129 (causa justa condicionada a prueba documental), 137 (contravención de no emitir factura: **no procede la dispensa**); Decreto Ley No. 1-92 (Ley Monetaria) Arts. 1 y 3 (moneda de curso legal: **Córdobas / NIO**).
4. **Acuerdos Interinstitucionales MHCP–INTUR–DGI de Exoneración Temporal de IVA (Ferias / Vacaciones)**
   - Ejemplo oficial: **Acuerdo Interinstitucional MHCP–INTUR–DGI No. 01-2025** (*Feria Nacional en Conmemoración de las Fiestas Patrias*, publicado en `AVISO-148-08-2025`, `https://www.dgi.gob.ni/getDoc/1050`).
   - Se emiten periódicamente para **Semana Santa**, **Fiestas Patrias** y **Vacaciones de Fin de Año / Navidad**; aplican a establecimientos de alimentos, bebidas y hospedaje en **Régimen General** previamente inscritos en la **VET** (*Ventanilla Electrónica Tributaria*), con tasa IVA 0% durante las fechas autorizadas y reporte posterior del rango de facturas exoneradas en la VET.

---

## 2. Requisitos Vinculantes (**NORMA**) y Estado en NHILOS

| ID | Norma / Cita | Mandato (resumen fiel a fuente primaria) | Cumplimiento en NHILOS |
|---|---|---|---|
| **DGI-01** | **DT 09-2007, Ordinal SEGUNDO 1.7** · LCT Art. 143.3 | Numeración **consecutiva, continua e inalterable**; sin eliminación de facturas. | ✅ `invoices.number` protegido por trigger inmutable en PostgreSQL (`1810000000000`), secuencia local sin sobrescritura en arranque (`#520`, `dgi_numbering_service_impl.dart`). |
| **DGI-02** | **DT 09-2007, Ordinal SEGUNDO 1.8 & 1.7** | Datos obligatorios del comprobante: razón/nombre comercial, RUC, dirección, teléfono, condición de venta (`Contado`/`Crédito`), fecha, detalle, impuestos/exención. | ✅ Persistencia de `payment_condition` (`CONTADO`/`CREDITO`, `#539` S4), impresión explícita de `Condicion: Contado/Credito`, sin literales fiscales hardcodeados (`#540`). |
| **DGI-03** | **DT 09-2007, Ordinal QUINTO** (y CUARTO) | Registrar el **número de autorización otorgado por la DGI en la parte inferior derecha** de cada factura. | ✅ `dgi_authorization_code` proyectado desde nube (`FiscalInboxHandler`), editable en perfil, impreso alineado a la derecha al pie en 58mm y 80mm (`#539` S1). |
| **DGI-04** | **DT 09-2007, Ordinal SEGUNDO 1.10** · DGI FAQ Preg. #3 | Toda factura anulada debe conservar original y duplicados con la leyenda **`ANULADO`**; nunca eliminarse. | ✅ Anulación lógica (`is_canceled = true`), banner `*** DOCUMENTO ANULADO ***` / `ANULADO` en ticket y reimpresión (`#525`, `receipt_layout_formatter.dart`). |
| **DGI-05** | **DT 09-2007, Ordinal TERCERO 3.4 (a y b)** | Anulaciones en días posteriores a la emisión **prohibidas** en factura (`3.4.b`); deben ejecutarse mediante **Nota de Crédito** consecutiva que **revierta el descargo de inventario** (`3.4.a`). | ✅ Rechazo duro `CROSS_DAY_VOID_PROHIBITED` (calendario `America/Managua`) en backoffice y sync; `createAdminCreditNote` revierte inventario en la misma transacción `SERIALIZABLE` (`CREDIT_NOTE_RESTOCK`, `R-03`/`R-04`); `SyncCreditNoteAuthGuard` exige autorización de supervisor verificada en BD (`#539` S2). |
| **DGI-06** | **DT 09-2007, Ordinal TERCERO 3.3 (a y b)** | Plan de contingencia ante falla o corte eléctrico: talonario preimpreso con numeración **distinta** e informada previamente a la Administración de Rentas (`3.3.a`); reingreso posterior con referencia cruzada, impresión original + copia y adjunto de copia manual (`3.3.b`). | ✅ Campos `contingency_manual_series`, `contingency_manual_number`, `contingency_manual_issued_at` en POS + Backend + Dashboard, anti-colisión con serie del sistema, impresión automática 2 copias (`ORIGINAL` + `COPIA - ADJUNTAR COPIA MANUAL`) y procedimiento en `docs/operations/pilot-terminal-incident-procedure.md` (`#539` S3). |
| **DGI-07** | **DT 09-2007, Ordinal SEGUNDO 1.4** · CTr Art. 137 | **Respaldo de información en medios magnéticos** para operaciones diarias. No emitir o perder comprobantes sin prueba es contravención **sin dispensa**. | ⏳ **En Etapa 0 (`#526`)** — respaldo/restauración de terminal y preservación de contador DGI. |
| **DGI-08** | **DT 09-2007, Ordinal SEGUNDO 1.6** | Cualquier variante, modificación o cancelación del sistema debe notificarse previamente a la Administración de Rentas. | 📋 Procedimiento operativo y puerta de cambio en `#532` / `docs/operations/pilot-terminal-incident-procedure.md`. |
| **DGI-09** | **Reglamento LCT Art. 100 lit. g** · **DT 09-2007 Ordinal TERCERO** | Cada sucursal o terminal adicional requiere serie/código distinto **informado a la Administración de Rentas**. | 📋 Documentado en `docs/DGI/Topología_Multi-Terminal_ante_DGI.md` y gated en `#532` / `#994`. |
| **DGI-10** | **LCT Arts. 124 (3, 6), 148** · **Regl. Art. 101** · **CTr Art. 103.13** | **Faltante de inventario no registrado se presume vendido** salvo prueba en contrario. Destrucción de mercadería exige **aviso con 10 días de anticipación** a la Administración de Rentas. | ✅ Kardex en ventas (`#519`, `#524`) y registro de mermas (`MovementType.shrinkage`). Pendiente formalizar razón `DESTRUCCION` y autoría en `#517` (Etapa 3). |
| **DGI-11** | **Ley Monetaria (Decreto Ley 1-92) Arts. 1 y 3** | Registro y expresión fiscal primaria en **Córdobas (NIO)** (USD permitido solo como referencia comercial). | ✅ Totales fiscales, IVA y Kardex en `NIO`; USD mostrado como referencia con tasa comercial/BCN. |

---

## 3. Inventario Verificado de Campos DGI (`#540` — AC-1 a AC-5)

Cada dato exigido por DT 09-2007 se verifica contra cuatro pruebas:
- **T1 EXISTS:** campo real en el modelo de datos (no literal hardcodeado).
- **T2 EDITABLE:** configurable por el cliente en UI sin intervención de ingeniería.
- **T3 SURVIVES:** persiste tras reinicio de la app **y** ciclo de sincronización sin sobrescribirse.
- **T4 PRINTED:** llega al documento impreso en la posición normativa.

| # | Dato DGI | T1 EXISTS | T2 EDITABLE | T3 SURVIVES | T4 PRINTED | Estado |
|---|---|---|---|---|---|---|
| **a** | Número de autorización DGI *(QUINTO)* | ✅ `local_configs['dgi_authorization_code']` + `tenants.dgi_authorization_code` | ✅ `business_profile_view.dart` + Owner Dashboard | ✅ Reboot + `FiscalInboxHandler` (`dgiAuthorizationCode`) | ✅ Parte inferior derecha 58mm/80mm (`ReceiptLayoutFormatter.fiscalAuthorizationLines`) | **PASS (0 fallos)** |
| **b** | Prefijo / Serie | ✅ `dgi_prefix` (`dgi_numbering_service_impl.dart`) | ✅ `business_profile_view.dart` | ✅ Sin sobrescritura en arranque (`main.dart:442-447`, `#520`) | ✅ Integrado en `No. <serie><consecutivo>` | **PASS (0 fallos)** |
| **c** | Inicio de rango | ✅ `dgi_range_start` (`dgi_numbering_service_impl.dart`) | ✅ `business_profile_view.dart` | ✅ Sin sobrescritura en arranque (`#520`) | N/A (metadato de control) | **PASS (0 fallos)** |
| **d** | Fin de rango (`dgi_range_end`) | **RETIRADO (`#554` / D-21)** — los sistemas computarizados usan numeración consecutiva continua sin tope de talonario; `business_profile_view_model.dart:56` descarta la clave al guardar | N/A (retirado) | ✅ Nunca se inventa ni sobrescribe | N/A | **RETIRADO (conforme D-21)** |
| **e** | Cursor de secuencia | ✅ `dgi_current_number` (`dgi_numbering_service_impl.dart`) | ✅ `business_profile_view.dart` | ✅ Falla cerrado (`FiscalSequenceUnconfiguredError`) si falta; nunca reinicia en `1` silenciosamente (`#520`). *(Recuperación tras pérdida de tablet en `#526`)* | ✅ Dentro del número fiscal | **PASS (0 fallos en vivo)** |
| **f** | Régimen fiscal | ✅ `tax_regime.dart` (`REGIMEN_GENERAL` / `CUOTA_FIJA`) | ✅ `business_profile_view.dart` | ✅ `local_configs` + `FiscalInboxHandler` | ✅ Encabezado de régimen + IVA derivado (`0%` en Cuota Fija) | **PASS (0 fallos)** |
| **g** | Nombre del negocio | ✅ `business_name` (`business_profile_view_model.dart`) | ✅ `business_profile_view.dart` | ✅ `local_configs` + `FiscalInboxHandler` | ✅ Encabezado centrado; **sin fallback `'OMNIFOOD NI'`** (`#540` AC-3) | **PASS (0 fallos)** |
| **h** | RUC del emisor | ✅ `ruc` (`business_profile_view_model.dart`) | ✅ `business_profile_view.dart` (validado) | ✅ `local_configs` + `FiscalInboxHandler` | ✅ `RUC: ...` en encabezado | **PASS (0 fallos)** |
| **i** | Dirección | ✅ `address` (`business_profile_view_model.dart`) | ✅ `business_profile_view.dart` | ✅ `local_configs` + `FiscalInboxHandler` (`FiscalProjectionKeys.businessAddress`) | ✅ Impreso en encabezado | **PASS (0 fallos)** |
| **j** | Teléfono | ✅ `phone` (`business_profile_view_model.dart`) | ✅ `business_profile_view.dart` | ✅ `local_configs` + `FiscalInboxHandler` (`FiscalProjectionKeys.businessPhone`) | ✅ `Tel: ...` en encabezado | **PASS (0 fallos)** |
| **k** | RUC / Cédula del cliente | ✅ `Customer.taxId` + `Invoice.customerTaxId` + `ReceiptDocument.customerRuc` | ✅ Checkout (`multi_currency_checkout_dialog.dart`) + ficha de cliente | ✅ Persistido en SQLite y sincronizado | ✅ Pasado explícitamente por `SaleViewModel` → `PrinterPort` → adaptadores → `RUC/Cedula:` | **PASS (0 fallos)** |
| **l** | Razón de exención / exoneración temporal IVA | ✅ `local_configs['tax_exemption_reason']` + `TaxRegime.fiscalNotice` | ✅ `business_profile_view.dart` (`tax_exemption_reason_input`) | ✅ `local_configs` → `PrinterConfig.taxExemptionReason` | ✅ Imprime el motivo/Acuerdo Ministerial configurado en ventas exentas de Régimen General (58/80mm texto y ESC/POS); si está vacío, omite la línea — **nunca** imprime `'POLITICA TEMPORAL'` (`#540` AC-4). | **PASS (0 fallos)** |
| **m** | Pie legal / cortesía (`legal_footer`) | ✅ `local_configs['legal_footer']` → `PrinterConfig.legalFooter` | ✅ `business_profile_view.dart` | ✅ Persistido en `local_configs` | ✅ Conectado de punta a punta a `ReceiptDocument.footerMessage` (`#540` AC-2/AC-5) | **PASS (0 fallos)** |

### Eliminación de literales fiscales hardcodeados (`#540` AC-3 / AC-4 / AC-5)
- `'001-001-01-'`, `start:1, end:1000`, `start:1, end:1000000`: **eliminados** (`#520`).
- `'OMNIFOOD NI'` como fallback de nombre comercial en tickets y reportes X/Z: **eliminado** (`#540` — `PrinterConfig`, `PrinterConfigService`, `ReceiptDocument`, `InvoiceFiscalCalculator`, `DgiReportViewModel`).
- `'** VENTA EXENTA DE IVA - POLITICA TEMPORAL **'`: **eliminado** (`#540` AC-4 — `ReceiptLayoutFormatter` texto y ESC/POS).
- `legal_footer` huérfano: **conectado** de extremo a extremo (`#540` AC-5).

---

## 4. Práctica Operativa vs. Nuestra Decisión de Arquitectura

### PRÁCTICA (recomendación operativa, no exigencia literal de norma)
- **Pie de cortesía no fiscal:** imprimir `*** GRACIAS POR SU COMPRA ***` únicamente cuando el cliente no configuró `legal_footer` en su perfil.
- **Referencia en USD:** mostrar tipo de cambio comercial/BCN y equivalente en USD como ayuda comercial al cliente, manteniendo siempre Córdobas (`NIO`) como denominación fiscal primaria (`DGI-11`).
- **Verificación de autorización previa a ferias Sin IVA:** confirmar la inscripción vigente en la VET antes de activar `global_tax_override` y capturar el número de Acuerdo Ministerial en `tax_exemption_reason`.

### NUESTRA DECISIÓN (reglas de ingeniería del producto)
- **Cero literales fiscales hardcodeados (`#540` AC-3/AC-4):** ningún formato de impresión ni servicio de numeración inventa prefijos, rangos, marcas (`'OMNIFOOD NI'`) ni caracterizaciones legales no verificadas (`'POLITICA TEMPORAL'`).
- **Offline-first y fallo cerrado:** si falta `dgi_current_number`, el POS falla cerrado (`FiscalSequenceUnconfiguredError`) antes de inventar el consecutivo `1`.
- **Automatización por ventanas y reporte VET:** delegados al issue `#1042` (Etapa 1) para separar la programación por fechas de la base normativa.

---

## 5. Preguntas Abiertas para Contadora (**NUESTRA DECISIÓN**: no inventar ley)

Mantener trazabilidad en `docs/operations/tratamiento-normativo-539.md` y `#535`:
1. **`#535` Q3c:** Confirmación escrita de si un contribuyente Cuota Fija o venta exenta en Régimen General requiere texto legal específico adicional en el ticket.
2. **`#535` Q4c / Q7:** Confirmación de si el negocio piloto cuenta con carta de autorización DGI para facturación computarizada (Ordinal CUARTO/QUINTO).
3. **`#533` D6 (`#526` / `#531`):** Validación por contadora del procedimiento de baja/falta y plazos ante pérdida de terminal (`docs/operations/pilot-terminal-incident-procedure.md`).
