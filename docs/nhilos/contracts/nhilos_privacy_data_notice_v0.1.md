# Aviso de Privacidad y Tratamiento de Información Comercial
## NHILOS POS

**Document ID:** NH-POL-DAT-001 (CD-06)  
**Versión:** 0.1  
**Estado:** CLIENT-READY  
**Aplica a:** Clientes y usuarios de NHILOS POS (Piloto: SOHO Café)  
**Referencia:** Contrato Marco `NH-SA-0001`

---

## 1. Declaración de Principios

En NHILOS POS reconocemos que los datos comerciales, recetas, costos, ventas y clientes de su negocio constituyen información confidencial y propiedad exclusiva de su empresa. Este documento explica de manera clara y transparente cómo recopilamos, procesamos, protegemos y almacenamos dicha información al utilizar nuestra plataforma tecnológica.

---

## 2. Categorías de Información Tratada

Para la correcta prestación del servicio de punto de venta y reportería, NHILOS procesa las siguientes categorías de datos:

1. **Datos de Configuración y Negocio:** Razón social, nombre comercial, dirección física, RUC, régimen tributario, sucursales y parámetros monetarios/fiscales.
2. **Catálogo y Propiedad Operativa:** Familias de productos, precios de venta, modificadores, listas de insumos, unidades de medida, fórmulas de recetas, rendimientos de preparación y mermas.
3. **Datos Transaccionales:** Comprobantes emitidos, líneas de venta, descuentos aplicados, propinas, anulaciones, fechas/horas exactas, métodos de pago utilizados y turnos de caja.
4. **Datos de Usuarios y Control de Acceso:** Nombres de usuario, identificadores de rol (cajero, administrador, propietario), correos electrónicos administrativos, registros forenses de auditoría y registros de auditoría de PIN local.
5. **Datos de Clientes Finales (si se habilita fidelización/lealtad):** Nombres, números de teléfono o correos proporcionados voluntariamente por los comensales del establecimiento para programas de puntos o promociones.

---

## 3. Finalidad del Tratamiento

La información recopilada se utiliza exclusivamente para:
- Posibilitar la operación diaria del punto de venta en el terminal físico.
- Sincronizar en tiempo real o en diferido las transacciones hacia la base de datos central.
- Generar reportes financieros, márgenes brutos, consumos de insumos y métricas operativas en el Owner Dashboard.
- Mantener copias de seguridad de resguardo ante contingencias o pérdidas físicas del hardware.
- Realizar diagnósticos técnicos autorizados ante incidencias o fallas de sincronización.

> **COMPROMISO DE NO MONETIZACIÓN:**  
> NHILOS POS **no vende, no alquila, no cede ni comercializa** los datos comerciales, recetas, precios o volúmenes de venta de sus clientes a terceros, intermediarios ni competidores bajo ninguna circunstancia.

---

## 4. Aislamiento de Datos y Seguridad Técnica (Multi-Tenant Isolation)

1. **Seguridad Lógica Multitenant:** La base de datos central de NHILOS implementa aislamiento riguroso mediante políticas de seguridad a nivel de fila (*PostgreSQL Row-Level Security - RLS*). Cada consulta o transacción está estrictamente restringida al identificador único de inquilino (`tenant_id`), impidiendo cualquier acceso cruzado entre distintos clientes.
2. **Cifrado en Tránsito y Reposo:** Todas las comunicaciones entre los terminales móviles y los servidores de nube se transmiten mediante canales cifrados utilizando protocolos estándar **TLS 1.3**. Las copias de respaldo externas se cifran del lado del cliente antes de salir a repositorios externos.
3. **Control de Acceso Interno:** El acceso administrativo a los servidores de producción y bases de datos está restringido exclusivamente al personal de ingeniería de NHILOS mediante autenticación robusta y llaves criptográficas SSH/API, limitándose a labores de mantenimiento e investigación de incidentes.

---

## 5. Proveedores de Infraestructura Tecnológica Subcontratados

Para garantizar una alta disponibilidad y resiliencia, NHILOS utiliza servicios de infraestructura tecnológica de primer nivel internacional:
- **Alojamiento de Aplicaciones y Bases de Datos:** Railway Corporation (Infraestructura de nube y gestión de base de datos relacional PostgreSQL).
- **Almacenamiento de Respaldos Externos Cifrados:** Cloudflare, Inc. (Cloudflare R2 Object Storage).

Dichos proveedores actúan exclusivamente como custodios de infraestructura y procesadores de cómputo, sin acceso lógico a las claves de descifrado ni a los datos no estructurados de su negocio.

---

## 6. Procedimiento ante Incidentes de Seguridad

En el evento fortuito de detectarse una brecha de seguridad, acceso no autorizado o incidente que comprometa la integridad o confidencialidad de los datos del CLIENTE:
1. NHILOS implementará medidas inmediatas de contención, aislamiento y revocación de credenciales.
2. Se notificará por escrito al contacto principal del CLIENTE dentro de un plazo no mayor a veinticuatro (24) horas hábiles desde la confirmación del incidente, detallando la naturaleza del evento y las acciones correctivas aplicadas.

---

## 7. Retención, Exportación y Eliminación al Cierre del Servicio

1. **Derecho a la Portabilidad:** A la terminación de la suscripción, el CLIENTE podrá solicitar la entrega de una exportación completa de sus catálogos, recetas y registro histórico de ventas en formato abierto estándar (CSV o JSON) sin costo adicional.
2. **Eliminación Definitiva:** Salvo los requerimientos de archivo tributario o retenciones legales obligatorias notificadas expresamente, los datos operativos del CLIENTE se programarán para su eliminación y purga definitiva de los entornos activos de producción dentro de los sesenta (60) días posteriores a la terminación contractual y cierre de saldos.
