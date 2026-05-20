# Estrategia y Control Financiero: OmniCore Platform

## 1. Filosofía de Inversión
Este proyecto se maneja bajo un modelo de **Bootstrap Eficiente**. Los ingresos generados deben reinvertirse siguiendo esta prioridad:
1. **Sostenibilidad**: Cubrir costos fijos ($65/mes operacionales + ~$10/mes prorrateado de infraestructura).
2. **Crecimiento**: Fondo para adquisición de hardware de prueba o alianzas.
3. **Escalabilidad**: Contratación de servicios de nube de mayor capacidad (AWS/Azure) cuando superemos los 10 clientes.

## 2. Infraestructura y Publicación (Decisiones Técnicas)

### Servidor y Dominio (Hostinger)
- **Plan Elegido**: VPS KVM 2 (8GB RAM, 2 Cores). 
  - *Justificación*: NestJS + PostgreSQL (con RLS) requieren mínimo 4GB para operar sin lag en sincronización. Los 8GB permiten escalabilidad para los primeros 5-10 clientes simultáneos.
- **Ubicación**: Data Center USA East (Baja latencia con Nicaragua).
- **Dominio**: `omnicoreplatform.com` (Costo aprox. $15/año).

### Despliegue Móvil (Android/iOS)
- **Android (Prioridad 1)**: Pago único de **$25.00** por Google Play Console. Es vital para la distribución profesional en los terminales AIO del Food Park.
- **iOS (Dormido)**: No se recomienda el pago de **$99/año** inicial. Si un cliente requiere iOS, se generará el instalable (.ipa) firmado localmente o se cobrará la cuenta al cliente.
- **Backups DGI**: Es OBLIGATORIO configurar un backup externo (S3 o Google Drive) del dump de Postgres semanalmente para cumplir con la normativa de resguardo de datos fiscales.

## 3. Dashboard de Control (Resumen)
*Archivo de datos: [FINANCIAL_TRACKER.csv](./FINANCIAL_TRACKER.csv) (Abrir con Excel)*

### KPIs Clave
- **Costo Operativo Mensual (Burn Rate)**: $75.00 (incluyendo hosting y dominio prorrateados)
- **Ingreso Mínimo para Punto de Equilibrio (LTV)**: $60.00 (1 cliente) -> -$15/mes de pérdida operativa.
- **Punto de Equilibrio Real**: 2 Clientes SaaS ($120.00).
- **Margen por Setup**: $200.00 (Ganancia directa si la carga de datos toma < 8 horas).

## 3. Plan de Reinversión a Futuro
Cuando el saldo acumulado supere los **$1,000.00**, se activarán las siguientes fases:

### Fase A: Alianzas de Hardware ($500 - $1,000)
- Compra de 2 terminales AIO de muestra para demostraciones en vivo (Demo kits).
- Impresoras de repuesto para ofrecer "Soporte Express" (sustitución inmediata).

### Fase B: Marketing y Formalización ($1,000 - $2,500)
- Registro oficial de marca en MIFIC.
- Pauta digital enfocada en dueños de Food Parks en Managua y San Juan del Sur.
- Certificación oficial DGI como proveedor de software.

## 4. Notas de Gestión
- Cada anulación de factura debe ser auditada para evitar fugas de dinero (robos hormiga).
- El costo de tu hora ($25) no se extrae como gasto del proyecto inicialmente, sino que se considera **Equity** (inversión de tiempo) hasta que el SaaS genere un excedente de >$500/mes.
