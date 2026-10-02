# Política de Respaldos y Recuperación ante Desastres
## NHILOS POS

**Document ID:** NH-POL-BAK-001 (CD-05)  
**Versión:** 0.1  
**Estado:** CLIENT-READY  
**Aplica a:** Clientes de suscripción activa de NHILOS POS (Piloto: SOHO Café)  
**Referencia:** Contrato Marco `NH-SA-0001` y Orden de Servicio `NH-SO-0001`

---

## 1. Alcance y Distinción Fundamental de Datos

Para una adecuada comprensión técnica y operativa, el sistema distingue dos estados de la información:

1. **Datos Locales en Terminal (SQLite):** Información transaccional que reside en la memoria interna del terminal MIRAY Q80. Permite la venta continua sin conexión a internet.
2. **Datos Sincronizados en Nube (PostgreSQL):** Información que ya ha sido transmitida exitosamente a través de internet hacia los servidores centrales de NHILOS.

> **REGLA TÉCNICA CLAVE:**  
> Las capas de respaldo y los Objetivos de Recuperación de NHILOS aplican **estricta y exclusivamente a los datos que hayan sido sincronizados con la nube**. Aquellas ventas registradas en un terminal que permanezca fuera de línea y que sufra una destrucción física irreparable o pérdida antes de conectarse a internet no podrán ser recuperadas desde los servidores de respaldo centrales.

---

## 2. Capas de Respaldo Incluidas en la Plataforma

NHILOS implementa una arquitectura de respaldo redundante en múltiples niveles geográficos y de proveedor:

### 2.1 Capa 1: Instantáneas Nativas de Infraestructura (Railway PostgreSQL)
- **Frecuencia:** Copias automáticas diarias sobre el volumen de almacenamiento persistente de la base de datos PostgreSQL.
- **Ventana de Retención Operativa:**
  - Copias diarias: conservadas durante seis (6) días continuos.
  - Copias semanales: conservadas durante un (1) mes.
  - Copias mensuales: conservadas durante tres (3) meses.

### 2.2 Capa 2: Copia Externa Cifrada Fuera de Sitio (Cloudflare R2)
- **Frecuencia:** Extracción lógica diaria (*logical dump*) programada fuera de las horas pico de operación.
- **Cifrado en Origen:** Los archivos son comprimidos y cifrados en el entorno de backend antes de su transmisión hacia el almacenamiento de objetos externo.
- **Destino:** Bucket privado con acceso restringido en Cloudflare R2, ubicado en una región independiente del servidor principal de aplicaciones.
- **Política de Retención Base:**
  - Treinta y cinco (35) respaldos diarios rotativos.
  - Doce (12) cierres mensuales consolidados.

### 2.3 Capa 3: Verificación de Integridad y Pruebas de Restauración
- **Checksums Criptográficos:** Cada archivo de respaldo generado genera un hash **SHA-256** y un manifiesto de metadatos para validar que el archivo no sufra corrupción durante el almacenamiento o transferencia.
- **Simulacro de Restauración Aislado:** Ejecución periódica mensual de restauración en un ambiente de pruebas (*staging/sandbox* aislado) para comprobar la viabilidad real de reconstrucción de esquemas y transacciones sin tocar la base de datos de producción.

---

## 3. Objetivos Operativos de Recuperación (RPO y RTO)

Los siguientes parámetros representan los objetivos de ingeniería técnica de NHILOS POS y no constituyen un SLA sancionable financieramente:

* **Objetivo de Punto de Recuperación (RPO) en la Nube:**  
  **Hasta 24 horas** para toda información que haya completado su ciclo de sincronización saliente hacia la nube.
* **Exclusión Explícita del RPO:**  
  Transacciones acumuladas en el dispositivo POS que no se hayan sincronizado por falta de conectividad Wi-Fi/celular en el establecimiento.
* **Objetivo de Tiempo de Recuperación (RTO) durante Etapa Piloto:**  
  **Un (1) día hábil** a partir del momento en que se cuente con acceso a la información, credenciales y condiciones técnicas estables para iniciar las maniobras de reconstrucción en un servidor alterno o nuevo terminal.

---

## 4. Archivo Fiscal y Cierre Histórico Anual

Adicionalmente a los respaldos operativos diarios de alta rotación, NHILOS proporciona el mecanismo técnico para generar el paquete consolidado de cierre anual:

1. **Contenido del Paquete Anual:**
   - Registro secuencial inalterado de comprobantes, ventas, anulaciones y notas de crédito.
   - Pista forense de auditoría (*audit trail*) con marcas de tiempo e identificación de usuarios.
   - Manifiesto criptográfico de cierre anual.
2. **Plazo de Conservación Estándar:**  
   Se establece una política de retención técnica conservadora de **diez (10) años** para los paquetes consolidados de cierre anual, sujeta a las disposiciones tributarias vigentes aplicables al CLIENTE en la República de Nicaragua.
3. **Suspensión de Eliminación por Proceso Abierto (*Legal Hold*):**  
   Ante una inspección fiscal, litigio o requerimiento formal notificado por el CLIENTE, se suspenderá cualquier purga programada de datos vinculados hasta la conclusión formal del procedimiento.

> **Aclaración Regulatoria:** El CLIENTE es el único titular y responsable legal de custodiar su información fiscal. NHILOS provee la herramienta técnica y las copias de seguridad pactadas, pero no actúa como auditor tributario ni certificador fiscal independiente.

---

## 5. Procedimiento del Cliente ante Pérdida de Terminal

Si un terminal MIRAY Q80 sufre robo, daño por impacto o falla electrónica irreversible:
1. El CLIENTE debe notificar de inmediato al canal de soporte oficial para revocar los tokens de autenticación del dispositivo extraviado.
2. Al disponer de un terminal de reemplazo compatible, NHILOS aprovisionará el nuevo dispositivo vinculándolo al mismo Tenant (`NH-T0001`).
3. El sistema descargará automáticamente del portal en la nube el catálogo vigente, usuarios, recetas y la secuencia transaccional acumulada en su última sincronización exitosa.
