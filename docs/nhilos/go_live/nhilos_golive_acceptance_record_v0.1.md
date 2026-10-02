# Acta de Aceptación y Puesta en Marcha (Go-Live)
## NHILOS POS

**Document ID:** NH-GL-0001 (CD-07)  
**Versión:** 0.1  
**Estado:** CLIENT-READY TEMPLATE  
**Contrato Marco:** NH-SA-0001  
**Orden de Servicio:** NH-SO-0001  

---

> **PROPÓSITO DEL DOCUMENTO:**  
> Esta Acta constituye la constancia formal y autorizada de que el sistema **NHILOS POS** ha sido entregado, instalado, probado y capacitado en el establecimiento comercial del CLIENTE en condiciones operativas acordadas. La suscripción con resultado **ACEPTADO** o **ACEPTADO CON OBSERVACIONES** constituye el gatillo formal para el inicio del ciclo de facturación mensual del servicio conforme a la Orden de Servicio.

---

## 1. Datos Generales de la Entrega

| Parámetro | Detalle Registrado |
|---|---|
| **Cliente / Razón Social** | SOHO Café |
| **Identificador de Tenant** | `NH-T0001` |
| **Sucursal / Ubicación** | SOHO Café (Managua, Nicaragua) |
| **Fecha y Hora de la Sesión** | _____ / _____ / 2026 — ____:____ hrs |
| **Versión del Software POS** | Release Candidate v1.0.0 (Build: __________) |
| **Versión del Owner Dashboard** | v2.0 (Deploy: __________) |
| **Dispositivo Físico** | MIRAY Q80 / iPOS (Android 12 — Número de Serie / IMEI: ____________________) |
| **Representante del Proveedor** | [Nombre del Fundador] |
| **Representante del Cliente** | __________________________________________________ |

---

## 2. Matriz de Verificación y Criterios de Aceptación

Cada sección debe ser ejecutada y validada en conjunto por el PROVEEDOR y el CLIENTE durante la sesión en sitio:

### A. Hardware y Periféricos (Ref. CD-08)
- [ ] El terminal enciende correctamente y retiene carga con su adaptador y cable USB-C.
- [ ] Pantalla táctil responde con precisión y fluidez.
- [ ] Conectividad Wi-Fi conectada y estable en la red del local.
- [ ] Compartimiento térmico carga correctamente rollo de 80 mm.
- [ ] Impresión de ticket de prueba ejecutada con nitidez, contraste adecuado y sin saltos de línea (40 columnas / 576 puntos).

### B. Identidad, Accesos y Roles
- [ ] Acceso web del PROPIETARIO (Owner) verificado exitosamente en el portal.
- [ ] Acceso de cajeros/encargados verificado en el terminal mediante PIN numérico local.
- [ ] Restricción de permisos validada (un cajero no puede modificar precios ni ver reportes confidenciales).

### C. Operación Central del Punto de Venta (POS Core)
- [ ] Apertura formal de turno de caja con fondo inicial.
- [ ] Registro de venta de producto simple con impresión de comprobante.
- [ ] Registro de producto con modificadores/extras (ej. shot adicional, tipo de leche).
- [ ] Cobro en Córdobas (NIO) con cálculo automático de vuelto.
- [ ] Cobro en Dólares (USD) aplicando el tipo de cambio comercial configurado.
- [ ] Registro de cobro con tarjeta mediante datáfono externo.
- [ ] Pago dividido / mixto (ej. parte en efectivo y parte con tarjeta), si aplica.
- [ ] Retención (*hold*) y recuperación de ticket en mesa/barra.
- [ ] Autorización de anulación (*void*) mediante clave/código de supervisor.
- [ ] Cierre formal de turno de caja (*corte X / Z*) con arqueo de valores.

### D. Resiliencia Fuera de Línea y Sincronización (Offline-First)
- [ ] Desconexión forzada de Wi-Fi: el sistema continúa vendiendo sin interrupción ni bloqueo.
- [ ] Persistencia local: comprobantes emitidos fuera de línea guardados en la memoria del dispositivo.
- [ ] Reconexión de red: sincronización automática saliente de comprobantes pendientes hacia la nube.
- [ ] Verificación en la nube: las ventas realizadas fuera de línea aparecen reflejadas en el dashboard central.
- [ ] No duplicidad: verificación de que no existen transacciones duplicadas tras la sincronización.

### E. Portal Web de Propietario (Dashboard)
- [ ] Inicio de sesión con credenciales maestras del propietario.
- [ ] Visualización correcta del total de ventas del día por turno y método de pago.
- [ ] Visualización del estado del inventario y consumo de insumos por receta.
- [ ] Indicador de frescura de sincronización (*sync freshness*) comprensible y visible.

### F. Configuración y Catálogo Base
- [ ] Catálogo completo cargado: categorías, nombres, presentaciones y precios de venta acordados.
- [ ] Recetas iniciales configuradas para el descuento automático de ingredientes.
- [ ] Datos de encabezado y pie de ticket correctos (nombre del negocio, dirección, teléfono, leyenda de cortesía).
- [ ] Moneda y parámetros fiscales de Cuota Fija / Régimen General configurados.

### G. Respaldos y Documentación Operativa
- [ ] Política de Respaldos y Recuperación (`CD-05`) entregada y comprendida.
- [ ] Límites de cobertura explicados (exclusión de datos locales no sincronizados en caso de pérdida física).
- [ ] Guía de Inicio Rápido (`CD-13`) y Guía de Contingencias (`CD-14`) entregadas en sitio.
- [ ] Canales de soporte y procedimiento de escalamiento SEV-1 comunicados al cliente.

### H. Capacitación del Personal
- [ ] Personal designado por SOHO capacitado en apertura, venta, cobro, cierre y contingencias básicas.
- [ ] Constancia de Capacitación (`CD-10`) firmada por los participantes.

---

## 3. Registro de Observaciones y Pendientes No Bloqueantes

Si existen ajustes menores o tareas pendientes que no impiden la operación comercial de venta en caja, se documentan a continuación:

| ID | Descripción de la Observación | Severidad (SEV-3 / SEV-4) | Responsable | Fecha Límite de Atención | ¿Bloquea Go-Live? |
|---|---|---|---|---|:---:|
| OBS-01 | | | | | **NO** |
| OBS-02 | | | | | **NO** |
| OBS-03 | | | | | **NO** |

---

## 4. Dictamen Final de Puesta en Marcha

Las Partes, tras haber presenciado y comprobado las pruebas operativas descritas en esta Acta, resuelven emitir el siguiente dictamen (marcar una y solo una opción):

- [ ] **ACEPTADO (GO-LIVE FORMAL ALCANZADO):** Todos los criterios críticos han sido cumplidos satisfactoriamente. Se habilita formalmente la operación en producción comercial y se da inicio al cobro de la suscripción mensual acordada en la Orden de Servicio `NH-SO-0001`.
- [ ] **ACEPTADO CON OBSERVACIONES:** Los criterios críticos de venta, persistencia e impresión fueron validados satisfactoriamente. Se habilita la operación comercial en producción. Las observaciones registradas en la Sección 3 deberán ser subsanadas por el responsable en las fechas convenidas sin diferir la facturación recurrente.
- [ ] **NO ACEPTADO (GO-LIVE APLAZADO):** Se detectaron incidencias críticas bloqueantes (SEV-1 o SEV-2 sin mitigación) que impiden la venta segura en el local. Se suspende la puesta en marcha y la facturación mensual hasta su completa resolución y repetición de pruebas.

---

## Firmas de Conformidad

<br>

| Por el PROVEEDOR (NHILOS POS) | Por el CLIENTE (SOHO Café) |
|---|---|
| **Firma:** __________________________________ | **Firma:** __________________________________ |
| **Nombre:** [Nombre del Fundador] | **Nombre:** __________________________________ |
| **Cargo:** Fundador / Proveedor Técnico | **Cargo:** Propietario / Representante Legal |
| **Fecha:** _____ / _____ / 2026 | **Fecha:** _____ / _____ / 2026 |
