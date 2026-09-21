# Runbook & Checklist de Verificación en Hardware MIRAY Q80/iPOS

Este documento define el protocolo operativo para la instalación, prueba física en hardware real y validación de campo del **Release Candidate APK** de **OmniFood POS** en el terminal de flota **MIRAY Q80/iPOS** (Android 12, papel de 80 mm) y en dispositivos Android comerciales de prueba (ej. Samsung Galaxy S23/S24 Ultra) usados como ruta de **fallback/simulación**.

> **Nota sobre los identificadores de protocolo de impresión.** Los identificadores `woyou.aidlservice.jiu_mi`, `com.nhilos.pos/sunmi_printer`, `SUNMI_V2S` y `com.nhilos.pos/ipos_printer` son rutas de código vivas en `apps/pos_app` (reglas keep y AIDL para `woyou.aidlservice.jiu_mi`, canales `com.nhilos.pos/sunmi_printer` y `com.nhilos.pos/ipos_printer`, y el valor de configuración `SUNMI_V2S`). Se conservan tal cual porque renombrarlos rompería una integración de impresión que ya funciona; nombran **rutas de código y valores de protocolo, no una marca de dispositivo**, así que **no deben renombrarse**. Esta nota no afirma que el hardware del Q80 exponga el servicio AIDL de woyou: el handler del Q80 se vincula a `net.nyx.printerservice`, el acta de aceptación documenta la ruta de piloto vía adaptador `SUNMI_V2S` sobre `net.nyx.printerservice`, y la selección comprobada en campo es el driver `Q80 / iPos`.

---

## 1. Especificaciones del Dispositivo Objetivo

| Parámetro | MIRAY Q80/iPOS (terminal de flota) | Dispositivo Comercial (Samsung S23/S24 Ultra) — fallback/simulación |
|---|---|---|
| **Sistema Operativo** | Android 12 | One UI (Android 14 / 16) |
| **Impresora Térmica** | Integrada. Perfil de flota comprobado por el fundador: **80 mm**, que `ReceiptLayoutMetrics` traduce a **40 columnas lógicas / 576 puntos** (58 mm: 32 columnas / 384 puntos). El ancho de papel es **configuración por dispositivo en tiempo de ejecución**, no una propiedad fija del hardware | No disponible $\rightarrow$ Simulación en Logcat/Console |
| **APK Recomendado** | Verificar la ABI del terminal con `adb-wrapper shell getprop ro.product.cpu.abi` antes de instalar | `app-arm64-v8a-release.apk` (23MB) |

**Sobre el ancho de papel:** el perfil de flota comprobado del Q80/iPOS es **80 mm**, que el código traduce a 40 columnas lógicas / 576 puntos (`ReceiptLayoutMetrics.logicalTextWidth80mm` / `logicalRasterWidth80mm`). Esa es la **métrica lógica configurada**, no una medición del cabezal: la verificación física de cada valor sigue **pendiente** y se lista en la matriz de la sección E. **58 mm sigue siendo un perfil legítimo para otros terminales** (32 columnas / 384 puntos), por lo que el ancho debe tratarse siempre como configuración por dispositivo (`Ajustes` $\rightarrow$ `Hardware de Impresión`) y nunca como una propiedad fija de la flota.

---

## 2. Preparación & Procedimiento de Instalación

### Opción A: Despliegue mediante Cable USB / ADB

1. **Habilitar Depuración USB en el dispositivo**:
   - Ir a `Ajustes` $\rightarrow$ `Información del teléfono` $\rightarrow$ pulsar 7 veces en `Número de compilación`.
   - Ir a `Ajustes` $\rightarrow$ `Opciones de desarrollador` $\rightarrow$ Activar `Depuración por USB`.

2. **Verificar conexión del dispositivo**:
   ```bash
   ~/Android/Sdk/platform-tools/adb-wrapper devices
   ```

3. **Desinstalar versiones previas si existe conflicto de firma**:
   ```bash
   ~/Android/Sdk/platform-tools/adb-wrapper uninstall com.nhilos.pos_app
   ```

4. **Instalar el Release Candidate APK**:
   ```bash
   # Para ABI de 32 bits:
   ~/Android/Sdk/platform-tools/adb-wrapper install -r dist/release_candidate/app-armeabi-v7a-release.apk

   # Para ABI de 64 bits:
   ~/Android/Sdk/platform-tools/adb-wrapper install -r dist/release_candidate/app-arm64-v8a-release.apk
   ```

5. **Configurar puente de red para backend local en WSL2** (si se prueba contra backend de desarrollo):
   ```bash
   # 1. Enviar tráfico del puerto 3000 del teléfono a Windows:
   ~/Android/Sdk/platform-tools/adb-wrapper reverse tcp:3000 tcp:3000

   # 2. Verificar que portproxy en Windows redirija el puerto 3000 a la IP de WSL2:
   # En PowerShell Admin: netsh interface portproxy show v4tov4
   ```

### Opción B: Sideload Directo vía SD Card / Navegador
- Copiar `app-universal-release.apk` o el APK de la ABI correspondiente al almacenamiento del dispositivo e instalar permitiendo "Orígenes desconocidos".

---

## 3. Matriz de Verificación Física & Criterios de Aceptación

Marcar cada ítem tras ejecutar la prueba en el dispositivo físico:

### A. Rendimiento, Pantalla y Layout
- [ ] **A1. Arranque Limpio**: La app inicia en menos de 2.5 segundos, mostrando la pantalla de login sin parpadeos ni crashes.
- [ ] **A2. Cero Overflows Visuales**: Navegar por Catálogo, Carrito, Búsqueda y Ajustes; verificar que NO aparezcan franjas amarillas/negras de *RenderFlex Overflow*.
- [ ] **A3. Carrito Móvil Flotante**: En resolución handheld ($\le 600\text{dp}$), el botón flotante inferior muestra el conteo de ítems y total; al tocarlo se despliega el *BottomSheet* expandible con los productos y modificadores.
- [ ] **A4. Diálogo de Checkout Adaptativo**: El modal de cobro multimoneda permite scroll suave, selección de método de pago y teclado numérico sin tapar los botones de acción.

### B. Impresora Térmica Integrada & Gaveta de Dinero (ancho según configuración del dispositivo)
- [ ] **B1. Test de Hardware en Ajustes**: Ir a `Ajustes` $\rightarrow$ `Hardware de Impresión` $\rightarrow$ `Imprimir Ticket de Prueba`. La impresora emite el ticket con tipografía nítida y alineación centrada.
- [ ] **B2. Factura Fiscal DGI (DT 09-2007)**: Realizar una venta en efectivo:
  - Verificar encabezado: Nombre Comercial, RUC (`J0000000001`), Dirección, Teléfono.
  - Formato estricto de columnas según el ancho configurado (32 columnas en 58 mm / 40 columnas en 80 mm) con numeración fiscal consecutiva (ej. `001-001-01-00000001`).
  - Desglose exacto: Cantidad, Descripción, Subtotal, IVA (15%) y Total en C$ y USD.
  - Leyenda fiscal `"Disposicion Tecnica 09-2007"` y `"GRACIAS POR SU COMPRA!"`.
- [ ] **B3. Comanda de Cocina / KDS**: Emitir una orden con buzzer (ej. `#Buzzer 42`) y notas:
  - Verificar título grande `#Buzzer XX`, fecha/hora, ítems agrupados con sus modificadores y observaciones.
- [ ] **B4. Cortes de Caja X y Z**:
  - En `Control de Turno` $\rightarrow$ `Imprimir Corte X`: Se imprime el arqueo parcial con desglose por forma de pago.
  - Al `Cerrar Turno` (Corte Z): Se imprime el cierre definitivo con No. Z consecutivo, diferencia de caja y firma de cajero/supervisor.
- [ ] **B5. Apertura de Gaveta**: Al confirmar una venta en efectivo o pulsar `Abrir Gaveta` en ajustes, se emite el pulso eléctrico y la gaveta se abre físicamente.

### C. Resiliencia Offline-First
- [ ] **C1. Venta en Modo Avión**: Activar Modo Avión en el dispositivo. Realizar 3 ventas consecutivas.
  - Las ventas se procesan instantáneamente en SQLite local sin bloqueo.
  - La numeración fiscal DGI avanza de forma secuencial sin saltos.
  - Los tickets se imprimen sin depender de conexión a internet.
- [ ] **C2. Tolerancia a Fallas de Impresora**: Abrir la tapa de la impresora o retirar el papel y realizar una venta:
  - La app muestra alerta de advertencia ("Impresora sin papel").
  - La venta **NO se aborta ni se pierde** en SQLite.
  - Al colocar papel y pulsar `Reimprimir Última Factura`, el ticket se imprime correctamente.

### D. Sincronización Cloud Bidireccional
- [ ] **D1. Vaciado Automático de Outbox**: Desactivar Modo Avión y reconectar a la red:
  - El worker de sincronización en segundo plano detecta la red.
  - Las ventas guardadas offline se transmiten al backend central y su estado cambia a `SYNCED`.
- [ ] **D2. Inbound Master Data**: Crear un producto o modificar un precio en el backend web:
  - Al ejecutar `Sincronizar Catálogo` en el POS, el nuevo producto aparece inmediatamente en la pantalla de ventas.

### E. Matriz de Verificación del Ancho de Ticket Térmico (Q80/iPOS)

Los valores de columna de esta matriz (30 a 50) y los de 384/576 puntos son sondas de verificación lógica: sólo las métricas configuradas (32 columnas / 384 puntos en 58 mm y 40 columnas / 576 puntos en 80 mm) están definidas en `ReceiptLayoutMetrics`, y **ninguna de estas filas ha sido medida en hardware**. No son límites de hardware comprobados.

| Check | Status |
|---|---|
| Divider | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 30 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 31 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 32 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 33 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 34 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 46 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 47 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 48 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 49 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 50 columns | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Spanish accents | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Long description | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Large money | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Multiple modifiers | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Logo | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Bold | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Alignment | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Footer | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| Physical margins | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| paperOut(140) | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 58→80 | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |
| 80→58 | NOT EXECUTED — REQUIRES PHYSICAL DEVICE |

---

## 4. Guía de Solución de Problemas (Troubleshooting)

| Síntoma | Causa Probable | Solución Operativa |
|---|---|---|
| **"Error de autenticación" al hacer login contra backend local** | Android bloquea tráfico HTTP plano o IP de WSL2 cambió | 1. Verificar `usesCleartextTraffic="true"` en manifest.<br>2. Ejecutar `adb-wrapper reverse tcp:3000 tcp:3000`.<br>3. Verificar regla `netsh portproxy` en Windows. |
| **"Impresora no responde" en el terminal** | Servicio de impresión del sistema detenido o sin permisos (`net.nyx.printerservice` en el Q80/iPOS vía driver iPos) | Reiniciar la app; verificar en los ajustes del terminal que el servicio de impresión del sistema esté habilitado. |
| **Texto de ticket cortado en el margen derecho** | El ancho de papel configurado no coincide con el papel cargado | Ir a `Ajustes` $\rightarrow$ `Hardware de Impresión` y verificar que el ancho configurado coincida con el papel real del terminal (perfil de flota comprobado del Q80: `80 mm`; el conteo de columnas está pendiente de calibración física; 58 mm es un perfil legítimo para otros terminales). |
| **La app crashea al abrirse en `--release`** | Regla ProGuard faltante para clase generada | Verificar que `proguard-rules.pro` incluya `-keep class com.nhilos.pos_app.printer.**` y reinstalar el APK optimizado. |

---

## 5. Plantilla de Sign-Off para Piloto Food Park

```
==============================================================================
📋 ACTA DE CONFORMIDAD Y SIGN-OFF — PILOTO FOOD PARK
==============================================================================
Fecha de Prueba:      ____ / ____ / 2026
Dispositivo Físico:   [ ] MIRAY Q80/iPOS (flota)   [ ] Samsung Galaxy S23/S24 Ultra (fallback/simulación)
Serial / IMEI:        ________________________________________
Versión del APK:      OmniFood POS v1.0.0+1 (Release Candidate)
Hash SHA-256:         ________________________________________

RESULTADOS DE LA VERIFICACIÓN:
[ ] 1. Interfaz y Responsividad                         -> [ ] APROBADO  [ ] RECHAZADO
[ ] 2. Impresión Térmica Fiscal (DGI DT 09-2007)        -> [ ] APROBADO  [ ] RECHAZADO
[ ] 3. Disparo Eléctrico de Gaveta                      -> [ ] APROBADO  [ ] RECHAZADO
[ ] 4. Resiliencia Offline-First (Modo Avión)           -> [ ] APROBADO  [ ] RECHAZADO
[ ] 5. Sincronización Bidireccional de Ventas           -> [ ] APROBADO  [ ] RECHAZADO

DICTAMEN FINAL:
[ ] APTO PARA DESPLIEGUE EN VIVO (PILOTO CAFETERÍA / FOOD PARK)
[ ] REQUIERE AJUSTES (Ver observaciones)

Observaciones:
______________________________________________________________________________
______________________________________________________________________________

Firma Responsable Técnico: _____________________   Fecha: ____/____/2026
Firma Administrador Local: _____________________   Fecha: ____/____/2026
==============================================================================
```
