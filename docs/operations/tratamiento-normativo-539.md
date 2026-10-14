# Tratamiento normativo DT 09-2007 — numeración, condición fiscal y contingencia (#539)

*Fecha: 2026-10-14. Decisión del owner: basarnos en la ley y las normas de Nicaragua (investigación DGI) para tratar los tres temas que quedaban abiertos en #539. Fuente primaria citada: `#533` (recuperación verbatim de DT 09-2007, La Gaceta No. 134 del 2007-07-16, https://nicaragua.justia.com/nacionales/normas-tecnicas/requisitos-para-uso-de-sistemas-de-facturacion-computarizadas-jul-16-2007/gdoc/) y las FAQ de DGI. Este documento reemplaza el borrador de consulta round-3 anterior.*

---

## 1. Series y numeración — es un tema de multi-sucursal (decisión: listo para cuando aplique)

**La norma (F3 de #533):** *"Normalmente, cuando se apertura una sucursal, se tiene que identificar la numeración sucesiva, es ahí donde se asigna una serie o código, el cual debe ser informado a su Administración de Rentas"* (literal g, art. 100 Reglamento LCT + ordinal tercero DT 09-2007).

**Tratamiento:**

- **Piloto actual (mono-terminal):** una única serie por dispositivo con cursor correlativo inalterable — cumple. No aplica abrir series nuevas.
- **Multi-sucursal / multi-terminal (#532):** abrir una sucursal **no** es un rollout de configuración: cada serie debe **asignarse e informarse a la Administración de Rentas**. Ya está en el checklist de #532 (D4 de #533) con base regulatoria.
- **Numeración inalterable (1.7 primera cláusula):** enforced contra DELETE por trigger; el `UPDATE` de `invoice_number` sobre fila `regular` se blinda en esta ronda (hardening barato, ver implementación).

## 2. Facturas de crédito diferido — versión 2 (decisión: documentar y reservar)

**La norma (1.7):** la diferenciación contado/crédito ata al formato **preimpreso** ("en caso de usar formato preimpreso… diferenciando la factura de contado o crédito"); un sistema 100% computarizado emite la condición en el propio documento.

**Tratamiento (decisión del owner 2026-10-14):**

- **V2**, junto al módulo completo de créditos (cobranza + clientes). En foodparks la modalidad es infrecuente.
- **Lo que se documenta y reserva:** campo `fiscal_condition` (CONTADO/CRÉDITO) persistido en factura POS + cloud + DTO; legend dinámico que reemplace el literal hardcodeado `Condicion: Contado` (hoy en 4 sitios de `receipt_layout_formatter.dart`); y la dimensión de serie si la contadora define serie separada para crédito.
- **Por qué es honesto hoy:** el piloto es cash-only Cuota Fija — sin ventas a crédito, el legend hardcodeado no es falso. Se vuelve requerimiento cuando exista crédito real (#777/#778 open accounts en backlog).

## 3. Número de autorización DGI — resuelto (schema + dato)

- **Schema:** el campo existe, es client-editable, se proyecta desde el cloud y se imprime en la esquina inferior derecha (S1.1/S1.2, #539; QUINTO). **Owner: SOHO tiene el dato guardado a nivel de configuración fiscal — requisito prácticamente cumplido.**
- **Pendiente operativo del cliente:** cargar el número real en el Perfil de Negocio (el sistema ya avisa con warning visible cuando falta — S1.3, AC-3).

## 4. Contingencia (TERCERO 3.3) — la norma prescribe el procedimiento exacto

**La norma (F7 de #533, verbatim en #533):** ante falla del equipo o falta de energía: **(a)** mantener un **stop de facturas preimpresas** (1.8-compliant, imprenta autorizada) cuya **numeración correlativa sea distinta** a la del sistema y **reportar su correlativo a la Administración de Rentas con anticipación**; **(b)** superado el problema, **ingresar al sistema las facturas elaboradas manualmente indicando con una nota el número de la factura manual** que corresponde, imprimir la computarizada en original y copia, **adjuntando como soporte la copia de la facturación manual**.

**Tratamiento:**

- **Operativo del cliente (antes de necesitarlo):** obtener el stop preimpreso autorizado y **reportar su numeración a la Administración de Rentas** — tarea del cliente con su contadora, ya anotada en `docs/operations/pilot-terminal-incident-procedure.md` (su spine legal ahora es cita normativa, no inferencia).
- **Capacidad del sistema (S3):** registrar la factura manual en el sistema con la **cross-reference** (manual ↔ computarizada) y adjuntar/adjuntar-referencia la copia manual como soporte. Hoy no existe el campo "esta factura reemplaza al ticket manual N". Diseño mínimo: flag de contingencia + número manual en la factura emitida por el POS, con la copia manual archivada físicamente (la norma exige adjuntar la copia — el sistema referencia, no digitaliza).
- **Alternativas a evaluar** (pregunta abierta del owner): si el registro de tracking operativo se hace vía factura del sistema con cross-reference (lo que la norma describe) o vía módulo separado de "comprobantes de contingencia" que no pise el cursor DGI. **La norma inclina por lo primero**: las facturas manuales se INGRESAN al sistema computarizado (se emiten las computarizadas correspondientes que las referencian), no se trackean aparte.

---

## Consulta a la contadora — lo único que queda (reducida de 4 a 2)

1. **(#535 Q3, sigue)** ¿Documento correcto para Cuota Fija (Simplificada / Consumidor Final / Máquina Registradora)? ¿Comida preparada exenta o gravada? ¿El ticket imprime la razón de exención?
2. **Contingencia:** confirmar que el stop preimpreso se autoriza/reporta antes de operar (3.3.a) y que el re-ingreso con cross-reference (3.3.b) se implementa como lo describe este documento.

## Implementación en esta ronda (lo no bloqueado)

| # | Unidad | Base |
|---|--------|------|
| R1 | Trigger de inmutabilidad: `UPDATE` de `invoice_number` en fila `regular` → rechazo (1.7 "numeración inalterable"; hoy solo DELETE) | Adjacent observation #539; 1.7 |
| R2 | Cita normativa 3.3 en `docs/operations/pilot-terminal-incident-procedure.md` (D8 de #533) | F7 |
| R3 | Defer documentado: `fiscal_condition` + legend dinámico → v2 créditos (esta doc) | Decisión owner |
