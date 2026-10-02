# Runbook de Aprovisionamiento Técnico de Clientes
## NHILOS POS — Aprovisionamiento de Tenant y Terminal de Flota

**Document ID:** NH-RUN-PRV-001 (OP-01)  
**Versión:** 0.1  
**Audiencia:** Equipo Técnico / Fundador (Uso Interno)  
**Aplica a:** Aprovisionamiento de nuevos clientes y sucursales (Caso SOHO Café: `NH-T0001`)  
**Referencia Técnica:** `docs/PROVISIONING.md` y `odd/tasks/soho-dia1-integral-test.md`

---

## 1. Propósito y Principios de Aprovisionamiento

Este runbook define el procedimiento técnico reproducible para dar de alta a un nuevo cliente en la infraestructura de NHILOS POS, garantizando:
- **Aislamiento Multitenant Limpio:** Creación de un tenant aislado con RUC y razón social reales (evitando mezclar entornos con tenants de prueba).
- **Consistencia Fiscal:** Configuración obligatoria del rango y serie DGI antes de la primera venta para evitar bloqueos por `FiscalSequenceUnconfiguredError`.
- **Integridad del Catálogo:** Importación controlada de productos bajo la modalidad contratada (en el Día 1 de SOHO: 58 productos **SIMPLE**, sin recetas inertes).
- **Vinculación Segura de Hardware:** Alta del terminal MIRAY Q80 mediante código de emparejamiento temporal.

---

## 2. Requisitos Previos (Checklist de Entrada)

Antes de iniciar el aprovisionamiento, se debe contar con los siguientes datos suministrados por el cliente (`CD-09`):
- [ ] Razón social y Nombre comercial (ej. *SOHO Café*).
- [ ] RUC verificado ante DGI.
- [ ] Régimen fiscal confirmado: **Cuota Fija** (no aplica IVA, Art. 244 Ley 822) o **Régimen General**.
- [ ] Datos del propietario: Nombre, correo electrónico, contraseña provisional y PIN maestro de 6 dígitos.
- [ ] Tipo de cambio comercial acordado (USD a NIO).
- [ ] Archivo de menú validado: `Menu_SOHO_import_listo.xlsx` (58 productos SIMPLE en la plantilla oficial de 5 columnas).
- [ ] Terminal físico MIRAY Q80 con batería cargada (>80%) y papel térmico de 80 mm disponible.

---

## 3. Fase 1: Creación de Tenant y Usuario Propietario (Backend)

Ejecutar en el entorno de backend (o mediante el script de aprovisionamiento automatizado):

```bash
cd apps/admin_backend

# 1. Ejecutar aprovisionamiento interactivo o script CLI
npm run provision
```

### Datos requeridos por el asistente:
1. **Tenant Name:** `SOHO Café`
2. **Tenant Slug:** `soho-cafe` (identificador alfanumérico único para subdominio/URL)
3. **Legal Tax ID (RUC):** Ingrese el RUC real del cliente (formato DGI Nicaragua).
4. **Owner Full Name:** Nombre del Propietario.
5. **Owner Email:** Correo electrónico del cliente.
6. **Owner Password:** Contraseña provisional robusta (mínimo 10 caracteres, combinando mayúsculas, números y símbolos).
7. **Owner Master PIN:** PIN numérico de 6 dígitos para autorizaciones críticas en terminal.

### Validación de Salida:
- [ ] Se crea la fila en la tabla `tenants` con `is_active = true`.
- [ ] Se crea el usuario en `users` con rol `OWNER` vinculado al `tenant_id` generado.
- [ ] Verificar aislamiento en PostgreSQL: `SELECT id, name, slug FROM tenants WHERE slug = 'soho-cafe';`.

---

## 4. Fase 2: Configuración Fiscal y Parámetros Operativos

Configurar los parámetros fiscales y monetarios mediante la API de onboarding administrativo:

```bash
POST /api/onboarding/fiscal-setup
Content-Type: application/json
Authorization: Bearer <TOKEN_ADMIN_O_OWNER>

{
  "tenantId": "<TENANT_ID_GENERADO>",
  "regime": "CUOTA_FIJA",
  "businessName": "SOHO Café",
  "ruc": "<RUC_REAL>",
  "pricesIncludeTax": true,
  "commercialFxRate": 36.60,
  "operationMode": "RETAIL_FOOD",
  "fiscalSeriesPrefix": "FAC-",
  "initialSequenceNumber": 1
}
```

### Validación Crítica:
- [ ] Comprobar que el servicio fiscal ejecute `initializeRange()`. Sin este paso, el motor transaccional arroja `FiscalSequenceUnconfiguredError` y **bloquea cualquier cobro**.
- [ ] Verificar que `tax_rate` se mantenga en 0.00% al tratarse de Cuota Fija.

---

## 5. Fase 3: Importación y Validación del Catálogo (Menú Base)

Utilizar el archivo de menú validado `Menu_SOHO_import_listo.xlsx` (plantilla oficial de 5 columnas: `producto, precio, insumo, cantidad, unidad`).

### Paso 1: Ejecutar Preview de Importación
```bash
POST /api/onboarding/menu-import/preview
# Adjuntando archivo multipart/form-data: Menu_SOHO_import_listo.xlsx
```

**Criterio de Control Inflexible (Gate de Validación):**
El resultado del preview en el tenant limpio **debe dar exactamente**:
- `categories`: 7
- `productsToCreate`: 58
- `productsToUpdate`: 0
- `recipesToCreate`: 0
- `insumosToCreate`: []
- `errors`: []
- `warnings`: []

> **ALERTA:** Si el preview arroja cualquier error, advertencia o recetas > 0, **DETENER EL PROCESO DE INMEDIATO**. No comitear un menú contaminado con recetas ficticias o duplicados.

### Paso 2: Ejecutar Commit de Catálogo
```bash
POST /api/onboarding/menu-import/commit
# Confirmando la importación verificada
```

- [ ] Comprobar en base de datos: `SELECT count(*) FROM products WHERE tenant_id = '<ID>' AND is_active = true;` -> Total: **58 productos**. Todos con `product_type = 'SIMPLE'`.

---

## 6. Fase 4: Despliegue en Hardware (MIRAY Q80 / iPOS)

### Paso 1: Instalación del Release Candidate APK
1. Conectar el terminal MIRAY Q80 por cable USB a la estación de trabajo.
2. Habilitar *Depuración por USB* en Android 12 (`Ajustes > Opciones de desarrollador`).
3. Verificar conexión con adb:
   ```bash
   adb devices
   ```
4. Instalar el APK oficial de producción:
   ```bash
   adb install -r dist/release_candidate/app-arm64-v8a-release.apk
   ```

### Paso 2: Generar Código de Emparejamiento (Linking Code)
Desde el backend o panel administrativo, generar un código temporal de vinculación para el nuevo terminal:
```bash
POST /api/devices/pairing-codes
{
  "tenantId": "<TENANT_ID>",
  "branchId": "BR-01",
  "deviceLogicalId": "POS-SOHO-01",
  "label": "Caja Principal Barra"
}
# Retorna: { "pairingCode": "123-456", "expiresAt": "..." }
```

### Paso 3: Vinculación y Activación en Terminal
1. Abrir la aplicación **NHILOS POS** en la MIRAY Q80.
2. En la pantalla inicial de bienvenida, ingresar el código de vinculación (`123-456`).
3. El terminal descargará sus llaves criptográficas locales, el catálogo de 58 productos y la configuración fiscal.
4. El terminal ejecutará automáticamente el runner de venta controlada de activación (`activation_controlled_sale_runner.dart`), emitiendo el comprobante de prueba inicial.

---

## 7. Fase 5: Pruebas de Humo en Sitio (Smoke Tests)

Antes de entregar el equipo al cliente, ejecutar la siguiente matriz de verificación rápida:

| Prueba | Acción | Resultado Esperado | ¿Pasa? |
|---|---|---|:---:|
| **1. Login PIN** | Ingresar con PIN de cajero | Pantalla principal de catálogo abierta | [ ] |
| **2. Venta Normal** | Vender 1 Cappuccino 12oz en NIO | Ticket impreso con datos de SOHO y precio exacto | [ ] |
| **3. Cobro USD** | Vender 1 Bebida cobrando en USD | Conversión a C$ 36.60 y cálculo de vuelto correcto | [ ] |
| **4. Modo Offline** | Desconectar Wi-Fi y vender 1 producto | Venta completada; ícono de nube muestra 1 pendiente | [ ] |
| **5. Sincronización** | Reconectar Wi-Fi | La nube se pone verde; la venta aparece en Dashboard web | [ ] |
| **6. Cierre Z** | Ejecutar cierre de turno | Impresión de reporte de corte con total de ventas | [ ] |

---

## 8. Cierre de Aprovisionamiento y Entrega

1. Imprimir y anexar el **Checklist de Hardware (`CD-08`)** firmado.
2. Congelar el **Registro de Configuración (`CD-09`)**.
3. Dejar el equipo empaquetado y listo para la sesión de capacitación y firma de Go-Live (`CD-07`).
