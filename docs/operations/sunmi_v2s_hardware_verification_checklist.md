# Runbook & Checklist de Verificación en Hardware Sunmi V2s

Este documento define el protocolo operativo para la instalación, prueba física en hardware real y validación de campo del **Release Candidate APK** de **OmniFood POS** en terminales **Sunmi V2s Handheld POS** y dispositivos Android comerciales de prueba (ej. Samsung Galaxy S23/S24 Ultra).

---

## 1. Especificaciones del Dispositivo Objetivo

| Parámetro | Sunmi V2s Handheld POS | Dispositivo Comercial (Samsung S23/S24 Ultra) |
|---|---|---|
| **Sistema Operativo** | SUNMI OS (Android 11) | One UI (Android 14 / 16) |
| **Pantalla** | 5.5" HD+ IPS ($1440 \times 720\text{ px}$ / $\sim 360\times 720\text{ dp}$) | 6.8" Dynamic AMOLED ($\sim 384\text{ dp}$ ancho) |
| **Impresora Térmica** | Integrada 58mm Seiko, velocidad $80\text{ mm/s}$, 32 cols Font A | No disponible $\rightarrow$ Simulación en Logcat/Console |
| **Puerto Gaveta RJ11** | Conector en base / cable adaptador | No disponible $\rightarrow$ Simulación lógica |
| **Escáner** | Lector 2D / Cámara trasera | Cámara del dispositivo |
| **Arquitectura de CPU** | ARM Cortex-A53 (32-bit / 64-bit ARM) | ARM64-v8a |
| **APK Recomendado** | `app-armeabi-v7a-release.apk` (21MB) | `app-arm64-v8a-release.apk` (23MB) |

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
   ~/Android/Sdk/platform-tools/adb-wrapper uninstall com.omnifood.pos_app
   ```

4. **Instalar el Release Candidate APK**:
   ```bash
   # Para Sunmi V2s (32-bit ARM):
   ~/Android/Sdk/platform-tools/adb-wrapper install -r dist/release_candidate/app-armeabi-v7a-release.apk

   # Para Samsung S23/S24 Ultra (64-bit ARM):
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
- Copiar `app-universal-release.apk` o `app-armeabi-v7a-release.apk` al almacenamiento del dispositivo e instalar permitiendo "Orígenes desconocidos".

---

## 3. Matriz de Verificación Física & Criterios de Aceptación

Marcar cada ítem tras ejecutar la prueba en el dispositivo físico:

### A. Rendimiento, Pantalla y Layout ($360\times 720\text{dp}$)
- [ ] **A1. Arranque Limpio**: La app inicia en menos de 2.5 segundos, mostrando la pantalla de login sin parpadeos ni crashes.
- [ ] **A2. Cero Overflows Visuales**: Navegar por Catálogo, Carrito, Búsqueda y Ajustes; verificar que NO aparezcan franjas amarillas/negras de *RenderFlex Overflow*.
- [ ] **A3. Carrito Móvil Flotante**: En resolución handheld ($\le 600\text{dp}$), el botón flotante inferior muestra el conteo de ítems y total; al tocarlo se despliega el *BottomSheet* expandible con los productos y modificadores.
- [ ] **A4. Diálogo de Checkout Adaptativo**: El modal de cobro multimoneda permite scroll suave, selección de método de pago y teclado numérico sin tapar los botones de acción.

### B. Impresora Térmica Integrada (58mm) & Gaveta de Dinero
- [ ] **B1. Test de Hardware en Ajustes**: Ir a `Ajustes` $\rightarrow$ `Hardware de Impresión` $\rightarrow$ `Imprimir Ticket de Prueba`. La impresora emite el ticket con tipografía nítida y alineación centrada.
- [ ] **B2. Factura Fiscal DGI (DT 09-2007)**: Realizar una venta en efectivo:
  - Verificar encabezado: Nombre Comercial, RUC (`J0000000001`), Dirección, Teléfono.
  - Formato estricto de 32 columnas con numeración fiscal consecutiva (ej. `001-001-01-00000001`).
  - Desglose exacto: Cantidad, Descripción, Subtotal, IVA (15%) y Total en C$ y USD.
  - Leyenda fiscal `"Disposicion Tecnica 09-2007"` y `"GRACIAS POR SU COMPRA!"`.
- [ ] **B3. Comanda de Cocina / KDS**: Emitir una orden con buzzer (ej. `#Buzzer 42`) y notas:
  - Verificar título grande `#Buzzer XX`, fecha/hora, ítems agrupados con sus modificadores y observaciones.
- [ ] **B4. Cortes de Caja X y Z**:
  - En `Control de Turno` $\rightarrow$ `Imprimir Corte X`: Se imprime el arqueo parcial con desglose por forma de pago.
  - Al `Cerrar Turno` (Corte Z): Se imprime el cierre definitivo con No. Z consecutivo, diferencia de caja y firma de cajero/supervisor.
- [ ] **B5. Apertura de Gaveta RJ11**: Al confirmar una venta en efectivo o pulsar `Abrir Gaveta` en ajustes, se emite el pulso eléctrico y la gaveta se abre físicamente.

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

---

## 4. Guía de Solución de Problemas (Troubleshooting)

| Síntoma | Causa Probable | Solución Operativa |
|---|---|---|
| **"Error de autenticación" al hacer login contra backend local** | Android bloquea tráfico HTTP plano o IP de WSL2 cambió | 1. Verificar `usesCleartextTraffic="true"` en manifest.<br>2. Ejecutar `adb-wrapper reverse tcp:3000 tcp:3000`.<br>3. Verificar regla `netsh portproxy` en Windows. |
| **"Impresora no responde" en Sunmi V2s** | Servicio `woyou.aidlservice` detenido o sin permisos | Reiniciar la app; verificar en Ajustes de Sunmi que el servicio de impresión del sistema esté habilitado. |
| **Texto de ticket cortado en el margen derecho** | Ancho de papel configurado en 80mm en lugar de 58mm | Ir a `Ajustes` $\rightarrow$ `Hardware de Impresión` y verificar que el ancho esté en `58mm (32 columnas)`. |
| **La app crashea al abrirse en `--release`** | Regla ProGuard faltante para clase generada | Verificar que `proguard-rules.pro` incluya `-keep class com.omnifood.**` y reinstalar el APK optimizado. |

---

## 5. Plantilla de Sign-Off para Piloto Food Park

```
==============================================================================
📋 ACTA DE CONFORMIDAD Y SIGN-OFF — PILOTO FOOD PARK
==============================================================================
Fecha de Prueba:      ____ / ____ / 2026
Dispositivo Físico:   [ ] Sunmi V2s Handheld   [ ] Samsung Galaxy S23/S24 Ultra
Serial / IMEI:        ________________________________________
Versión del APK:      OmniFood POS v1.0.0+1 (Release Candidate)
Hash SHA-256:         ________________________________________

RESULTADOS DE LA VERIFICACIÓN:
[ ] 1. Interfaz y Responsividad (360x720dp)             -> [ ] APROBADO  [ ] RECHAZADO
[ ] 2. Impresión Térmica Fiscal 58mm (DGI DT 09-2007)   -> [ ] APROBADO  [ ] RECHAZADO
[ ] 3. Disparo Eléctrico de Gaveta RJ11                 -> [ ] APROBADO  [ ] RECHAZADO
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
