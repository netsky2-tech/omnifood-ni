# Batch 7: Adaptabilidad Sunmi V2s, Responsividad Handheld & Hardware ESC/POS (58mm)

## 1. Contexto & Especificaciones de Hardware
- **Dispositivo Objetivo**: **Sunmi V2s Handheld POS** (Android 11 / SUNMI OS).
- **Pantalla**: 5.5" HD+ IPS Touchscreen ($1440 \times 720$ px / ~360dp ancho).
- **Impresora Térmica Integrada**: 58mm (384 dots/line, ~32 caracteres por columna en Font A), velocidad $80\text{ mm/s}$.
- **Problema Base**: Desbordamientos visuales (*RenderFlex Overflow*) en dispositivos móviles/handhelds ($\le 412\text{dp}$) por layouts no responsivos.

---

## 2. Decisiones Arquitectónicas & Invariantes
1. **D1 (Offline-First Hardware Spooling)**: Falla de impresora o falta de papel nunca bloquea ni revierte la transacción en SQLite local.
2. **D2 (Formato 58mm / 32 Columnas)**: Formateo estricto a 32 caracteres para tickets fiscales DGI (DT 09-2007) y comandas KDS.
3. **D3 (Hexagonal Architecture)**:
   - **Puerto**: `PrinterPort` en dominio (`printInvoice`, `printKitchenOrder`, `printCorteX`, `printCorteZ`, `checkStatus`).
   - **Adaptadores**: `SunmiPrinterAdapter` (AIDL/Service), `EscPosNetworkAdapter` (TCP/IP), `MockPrinterAdapter` (testing).
4. **D4 (Diseño Responsivo)**: Layout adaptativo para $\le 600\text{dp}$ (acordeón/bottom sheet) vs $>600\text{dp}$ (doble panel).

---

## 3. Slices de Ejecución

### Slice 7.1: Responsividad Handheld & Corrección de Overflows [COMPLETADO ✅]
- Helper `ResponsiveLayout` y detector de breakpoints (`ResponsiveBreakpoints`).
- Refactor de `SaleView`: Panel inferior flotante/colapsable (`MobileFloatingCartBar` y bottom sheet) para pantallas móviles ($\le 600\text{dp}$).
- Refactor de `MultiCurrencyCheckoutDialog`: Layout scrollable con padding adaptativo y textos flexibles (`Flexible`/`Expanded`) para evitar desbordamientos en $360\text{dp}$.
- Test de widgets en resolución Sunmi V2s ($360 \times 720\text{ dp}$):
  - `sunmi_v2s_responsive_sale_view_test.dart`
  - `sunmi_v2s_checkout_dialog_test.dart`
  - `responsive_layout_test.dart`

### Slice 7.2: Puerto Hexagonal & Formateador 58mm (ESC/POS & Templates) [COMPLETADO ✅]
- Interfaz `PrinterPort` y `PrinterResult` (`lib/domain/ports/printer_port.dart`).
- Builder de comandos térmicos `EscPosBuilder` (`lib/domain/services/printer/esc_pos_builder.dart`).
- Formateador estricto de 32 columnas `Receipt58mmFormatter` (`lib/domain/services/printer/receipt_58mm_formatter.dart`): Factura fiscal DGI (DT 09-2007), Comanda KDS (`#Buzzer XX` / `Mesa XX`), Cortes X y Z.
- Adaptador en memoria `MockPrinterAdapter` (`lib/data/adapters/printer/mock_printer_adapter.dart`).
- Suite de tests unitarios:
  - `test/domain/services/printer/receipt_58mm_formatter_test.dart`
  - `test/data/adapters/printer/mock_printer_adapter_test.dart`

### Slice 7.3: Driver Sunmi V2s & Configuración de Hardware [COMPLETADO ✅]
- Adaptador `SunmiPrinterAdapter` implementando `PrinterPort` (MethodChannel `com.omnifood.pos/sunmi_printer`).
- Detección de hardware y fallback seguro en dispositivos no-Sunmi (desktop/emulador/test) para garantizar que las ventas nunca fallen.
- Entidad `PrinterConfig` (Freezed) y servicio `PrinterConfigService` persistido en SQLite (`local_configs`).
- Factory `PrinterResolver` para resolver la instancia adecuada de `PrinterPort`.
- Pantalla y ViewModel de Ajustes de Hardware (`HardwareSettingsView` & `HardwareSettingsViewModel`) con pruebas de impresión y apertura de gaveta.
- Rutas y acceso desde `AppDrawer`.
- Suite de tests unitarios y de widgets:
  - `sunmi_printer_adapter_test.dart`
  - `printer_config_service_test.dart`
  - `hardware_settings_view_test.dart`

### Slice 7.4: Integración E2E Checkout $\rightarrow$ Auto-Print & Verificación
- Disparo automático de impresión de factura en `SaleViewModel.processSale`.
- Impresión opcional de comanda física al despachar a KDS.
- Suite E2E `sunmi_v2s_checkout_print_flow_e2e_test.dart`.
