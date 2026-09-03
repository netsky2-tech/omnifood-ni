# Anexo de soporte, respaldos y recuperación

**Propuesta de referencia:** OE-001OM<br>
**Cliente:** SOHO<br>
**Versión:** 1.0<br>
**Fecha:** [dd/mm/aaaa]

## 1. Mantenimiento del producto incluido

La suscripción OmniFood Operación incluye parches correctivos y de seguridad, además de actualizaciones generales de la plataforma. Este mantenimiento no comprende desarrollo personalizado, consultoría ni adaptación de procesos del negocio.

## 2. Soporte de plataforma incluido

El soporte incluido se limita al diagnóstico, contención y corrección de:

- defectos reproducibles del producto;
- incidentes de sincronización o infraestructura bajo control de OmniFood;
- incidentes de integridad o seguridad relacionados con la plataforma; y
- orientación de recuperación específica para el incidente atendido.

No incluye orientación general ilimitada, consultoría, capacitación, digitación, operación del negocio ni administración de equipos del cliente.

## 3. Asistencia facturable

| Modalidad | Precio | Condiciones |
| --- | ---: | --- |
| Remota | US$40/hora | Sin mínimo de horas |
| Presencial | US$50/hora | Mínimo de dos horas, más transporte previamente informado |
| OmniFood Care | US$99/mes | Dos horas remotas por mes, no acumulables, y agenda prioritaria |
| Horas adicionales con Care | US$40/hora | Requieren autorización del cliente |

OmniFood Care es opcional y adicional a OmniFood Operación; no sustituye la suscripción. Su tratamiento tributario y cualquier retención legal se regirán por la cláusula fiscal de la propuesta y deberán confirmarse antes de la firma.

## 4. Capas de respaldo incluidas al go-live

1. **Railway nativo:** programación diaria, semanal y mensual sobre el volumen de PostgreSQL.
2. **Copia externa:** dump lógico diario de PostgreSQL, cifrado del lado del cliente antes de salir, almacenado en un bucket privado de Cloudflare R2.
3. **Verificación:** SHA-256 y manifiesto para comprobar la copia y sus metadatos.
4. **Restauración:** prueba mensual en un entorno aislado, sin reemplazar automáticamente producción.

Retención nativa de Railway: diaria por 6 días, semanal por 1 mes y mensual por 3 meses. La base recomendada para R2 es conservar 35 copias diarias y 12 cierres mensuales. Esta recomendación queda sujeta a confirmación legal y contable de la retención fiscal obligatoria.

Estas copias no se ofrecen como inmutables ni como certificadas para cumplimiento regulatorio.

## 5. Archivo fiscal de largo plazo

Además de los respaldos operativos, OmniFood proporcionará el mecanismo técnico contratado para generar un paquete anual de cierre y exportación que contenga:

- facturas, anulaciones y notas de crédito;
- evidencia de secuencia y auditoría; y
- manifiestos requeridos para identificar y verificar el paquete.

El paquete anual se conservará durante **10 años** como línea base técnica conservadora, sujeta a validación legal y contable del cliente. Este plazo se aplica al archivo anual, no a cada copia operativa diaria: las copias diarias de Railway y R2 mantienen las ventanas definidas en la sección anterior y no se conservan todas durante 10 años.

**Retención por procedimiento abierto:** ante una auditoría, reclamación, recurso, apelación u otro procedimiento abierto, se suspenderá la eliminación programada de los archivos relacionados hasta recibir autorización documentada para reanudarla.

SOHO conserva la responsabilidad legal de determinar y cumplir los plazos, formatos y documentos que le correspondan. OmniFood proporciona los mecanismos técnicos contratados, pero no sustituye la validación legal, fiscal o contable del cliente. El archivo no se presenta como inmutable ni certificado para cumplimiento regulatorio.

## 6. Objetivos seguros de recuperación

- **RPO objetivo:** hasta 24 horas para información que ya fue sincronizada a la nube.
- **Exclusión del RPO de nube:** ventas u otros datos que permanezcan únicamente en el POS local y todavía no se hayan sincronizado.
- **RTO objetivo durante el piloto:** un día hábil desde que existe acceso, información y condiciones técnicas suficientes para iniciar la recuperación.

Son objetivos operativos, no un SLA ni una garantía. Solo podrán revisarse como compromiso formal después de al menos tres simulacros consecutivos de restauración satisfactorios y documentados.

## 7. Comunicación de incidentes

SOHO reportará el incidente por el canal acordado con hora, usuario afectado, pasos observados, mensajes de error y evidencia disponible, evitando compartir contraseñas o códigos de acceso.

OmniFood comunicará:

1. acuse de recibo y alcance inicial cuando sea posible;
2. estado de investigación y medidas temporales relevantes;
3. confirmación de recuperación o siguiente acción; y
4. cierre resumido cuando el incidente afecte integridad, sincronización, seguridad o disponibilidad de plataforma.

La agenda prioritaria de OmniFood Care ordena la atención, pero no constituye un tiempo de respuesta garantizado.

## 8. Exclusiones y responsabilidades del cliente

Quedan fuera del soporte incluido:

- fallas, garantía, reparación o sustitución del Sunmi V2s y otros equipos;
- cortes eléctricos, baterías agotadas, daño físico o condiciones ambientales;
- servicio de internet, router, cableado o red administrada por SOHO;
- errores de terceros, bancos, proveedores o servicios fuera del control de OmniFood;
- recuperación de información local que nunca se sincronizó ni estuvo disponible en una copia;
- cambios de catálogo, digitación, capacitación adicional, personalizaciones o integraciones no contratadas;
- uso indebido, credenciales compartidas o incumplimiento del procedimiento de seguridad; y
- obligaciones legales, fiscales o contables propias del cliente.

SOHO debe conservar acceso físico y administrativo al equipo, proteger sus credenciales, reportar incidentes oportunamente y permitir las ventanas acordadas de diagnóstico o restauración.
