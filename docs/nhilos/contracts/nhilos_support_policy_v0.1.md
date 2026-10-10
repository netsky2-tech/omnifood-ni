# Política de Soporte y Mantenimiento
## NHILOS POS

**Document ID:** NH-POL-SUP-001 (CD-04)  
**Versión:** 0.1  
**Estado:** CLIENT-READY  
**Aplica a:** Clientes de suscripción activa de NHILOS POS (Piloto: SOHO Café)  
**Referencia:** Contrato Marco `NH-SA-0001` y Orden de Servicio `NH-SO-0001`

---

## 1. Alcance del Mantenimiento de Plataforma Incluido

La suscripción activa a NHILOS POS comprende el mantenimiento evolutivo y correctivo del software central:

1. **Parches Correctivos:** Subsanación de errores de código identificados en la aplicación móvil POS y el portal de propietario.
2. **Actualizaciones de Seguridad:** Distribución de parches para proteger la integridad de los datos y el aislamiento de inquilinos (*tenants*).
3. **Mantenimiento de Infraestructura de Nube:** Operación, disponibilidad y monitoreo de los servidores centrales de sincronización y bases de datos en la nube.

> **Aclaración:** El mantenimiento de plataforma no incluye desarrollo de funciones personalizadas (*custom features*), rediseños de catálogo ni adaptación particular a procesos internos del cliente.

---

## 2. Alcance del Soporte de Plataforma Incluido

El soporte técnico estándar sin costo adicional cubre exclusivamente la contención y resolución de:

- Defectos de software directamente reproducibles en condiciones normales de uso.
- Incidencias en los procesos de sincronización entre el terminal y la nube que dependan de la infraestructura de NHILOS.
- Inconsistencias de integridad transaccional generadas por la plataforma.
- Orientación técnica puntual para la recuperación de una incidencia atendida.

---

## 3. Modelo de Severidad y Tiempos de Respuesta Operativos

Los siguientes tiempos constituyen **objetivos de respuesta operativa** para guiar la atención del equipo de NHILOS y no representan un acuerdo de nivel de servicio (SLA) con penalidad económica.

| Severidad | Clasificación | Definición | Objetivo de Respuesta Inicial | Objetivo de Mitigación / Contención |
|---|---|---|---|---|
| **SEV-1** | **Crítica** | El terminal POS no puede registrar cobros o emitir ventas y **no existe mecanismo de contingencia** operativo razonable. | Menor a 2 horas (en horario de atención) | Mismo día hábil |
| **SEV-2** | **Alta** | Una función operativa principal está degradada (ej. falla temporal de sincronización hacia la nube, reporte de cierre), pero **la venta en caja continúa funcionando**. | Menor a 4 horas | 24 a 48 horas |
| **SEV-3** | **Normal** | Defectos menores en pantallas, textos o comportamientos secundarios que no impiden la operación diaria ni la venta. | Siguiente día hábil | Siguiente ciclo de parche o release planificado |
| **SEV-4** | **Consulta / Solicitud** | Dudas sobre uso, solicitudes de nuevas funciones o asistencia en configuración. | 1 a 2 días hábiles | Conforme a agenda y alcance |

---

## 4. Servicios de Asistencia y Consultoría Facturable

Toda asistencia que exceda el soporte de defectos de la plataforma podrá solicitarse de forma adicional conforme a la siguiente tabla de tarifas:

| Modalidad | Tarifa Horaria | Condiciones y Alcance |
|---|---:|---|
| **Asistencia Remota** | **US$ 40.00 / hora** | Diagnóstico avanzado guiado, recarga masiva de recetas, cambios de estructura de catálogo no contemplados. Facturación fraccionable por media hora (mínimo 30 min). |
| **Asistencia Presencial** | **US$ 50.00 / hora** | Soporte técnico en sitio. Requiere coordinación previa con mínimo de dos (2) horas facturables más viáticos de transporte previamente acordados. |
| **Membresía NHILOS Care (Opcional)** | **US$ 99.00 / mes** | Paquete preferencial que incluye dos (2) horas remotas mensuales no acumulables, cola prioritaria de atención técnica y agenda preferencial de mantenimiento. |

*Nota:* Los servicios facturables requieren autorización previa por escrito del representante autorizado del CLIENTE.

---

## 5. Canales Oficiales y Procedimiento de Reporte de Incidentes

Para garantizar la trazabilidad de los casos, los incidentes deben canalizarse a través de los medios autorizados:

- **Canal Directo de Mensajería:** WhatsApp Business oficial de Soporte NHILOS: [+505 8194 8526](https://wa.me/50581948526).
- **Canal Escrito:** `soporte@nhilospos.com` (o correo designado del fundador).
- **Horario de Atención Estándar:** Lunes a Sábado de 8:00 AM a 8:00 PM (Hora de Managua). Atención de SEV-1 extendida según disponibilidad.

### Información Requerida al Reportar:
1. Nombre del negocio y sucursal (`SOHO Café - NH-T0001`).
2. Usuario / cajero que experimenta la incidencia.
3. Descripción precisa del evento y pasos previos para reproducirlo.
4. Fotografía o captura legible del error en pantalla (si aplica).
5. **Regla de Seguridad:** **NUNCA** compartir contraseñas, PINs de autorización ni secretos de acceso en las comunicaciones de soporte.

---

## 6. Exclusiones y Responsabilidades del Cliente

Quedan fuera del soporte cubierto por la suscripción:
1. **Hardware:** Fallas mecánicas, caídas, daño por derrame de líquidos, baterías agotadas, cabezales térmicos quemados o cargadores dañados del terminal MIRAY Q80.
2. **Conectividad:** Cortes de energía comercial, falta de saldo o caída del proveedor de internet (ISP) local.
3. **Operación Comercial:** Capacitaciones adicionales a personal nuevo que ingrese con posterioridad a la puesta en marcha (pueden contratarse como asistencia remota/presencial).
4. **Manipulación de Datos:** Errores derivados de la carga de precios incorrectos, recetas erróneas o autorizaciones de anulación concedidas por el personal del CLIENTE.
5. **Integraciones Externas:** Fallas en datáfonos bancarios externos o sistemas ajenos a NHILOS POS.
