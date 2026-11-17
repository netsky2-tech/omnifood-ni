# Estrategia de precios NHILOS POS v1.0

**Decisión:** NHILOS POS se comercializa con tres planes (`Esencial`, `Operación`, `Pro`), dos packs de capacidad (`Retail`, `Cocina`) y add-ons. El hardware se cobra aparte como kit o aprovisionamiento, nunca dentro de la mensualidad. BYOD queda habilitado como camino de entrada para negocios pequeños, condicionado al adaptador ESC/POS genérico del issue [#983](https://github.com/netsky2-tech/omnifood-ni/issues/983). La aplicación de los planes depende de los entitlements del issue [#984](https://github.com/netsky2-tech/omnifood-ni/issues/984).

**Estado:** propuesta congelada para implementación. No cambia todavía la oferta publicada ni los precios de clientes existentes.

**Moneda:** USD. Referencia de conversión: C$ 36.6243 por USD (BCN); actualizar al momento de cotizar. Los precios en córdobas son informativos. **Impuestos:** precios netos; IVA, retenciones y cualquier tributo aplicable se agregan o retienen según la ley y el comprobante correspondiente.

## 1. Continuidad con la oferta vigente

| Oferta vigente | Implementación | Mensual | Condición |
| --- | ---: | ---: | --- |
| SOHO fundador | US$200 | US$79 | 24 meses, 1 sucursal / 1 terminal, pagos al día |
| Pública “OmniFood Operación” | US$250 | US$89 | 1 sucursal / 1 terminal, portal incluido |

Reglas de continuidad:

- SOHO conserva **US$79/mes durante 24 meses**. No se reprecifica.
- La oferta pública de **US$89/mes pasa a ser el plan `Operación`**. El precio publicado no cambia.
- Si el uso real de SOHO incluye capacidades de ambos packs, se le otorga un override temporal `legacy.full` auditado hasta cerrar el mapeo contractual.
- SOHO conserva sus add-ons vigentes: terminal adicional a **US$35/mes** con **US$50** de enrolamiento, y **2 cuentas owner**.
- SOHO conserva la condición de recibos simples no fiscales descrita en `estrategia_comercializacion.md`; no se le impone factura fiscal retroactiva.
- SOHO no es comparable con `Esencial`: su mapeo es `Operación` con override `legacy.full`, no el plan de entrada.
- No hay mes piloto gratuito. La mensualidad inicia con la puesta en marcha aceptada.

## 2. Mercado de referencia

| Proveedor | Modelo | Precio | Lectura |
| --- | --- | ---: | --- |
| **Neox POS (NI)** | POS 3 / 5 / 10 / 25 | ~US$30 / 40 / 50 / 90 al mes | Cloud, inventario, multisucursal opcional; sin facturación electrónica |
| **Nuxo (NI)** | Lite / Pro / Max | US$7 / 11 / 17 | Cloud puro, límites por productos y empleados; no compite en offline ni DGI |
| **Fudo (LatAm)** | Avanzado / Pro | US$35 / 45 + módulos US$2–15 | Valida el modelo plan base + módulos; KDS US$10, mesas US$5 |
| **Loyverse** | Gratis + add-ons | US$5 / 25 / 25 por tienda | Freemium; el add-on de inventario avanzado es su negocio |
| **Smart POS (NI)** | Licencia vitalicia | US$96 | Pago único, soporte limitado |
| **POS-MASTER (NI)** | Por local | US$350+ | Escritorio, soporte presencial |

Lectura comercial:

- **US$7–17** es el piso cloud sin DGI ni offline.
- **US$30–50** es el rango de un POS local con inventario.
- **US$89–149** se justifica solo si se vende continuidad offline, cumplimiento DGI, kardex/costos y soporte local.
- NHILOS no compite por precio contra Nuxo. Compite por riesgo fiscal, continuidad y control de costos.

## 3. Restricciones técnicas que condicionan la oferta

| Restricción | Estado | Consecuencia comercial |
| --- | --- | --- |
| Impresión externa Bluetooth/USB/red | Solo Sunmi/iPOS integrados; `ESCPOS_NETWORK` sin transporte real | BYOD y kit de estación quedan bloqueados hasta cerrar #983 |
| Windows/Linux | No soportado | No vender “All-in-One con desktop”; usar AIO Android |
| Multi-caja LAN y KDS general | No es capacidad vigente | Terminales adicionales sincronizan por nube; no prometer concurrencia LAN |
| Consolidación multi-sucursal | No existe | Cada sucursal es una suscripción base; no vender dashboard consolidado |
| Exportación contable | No existe | No incluirla en ningún plan |
| Facturación electrónica XML/firma | No existe | No venderla; la factura impresa DGI sí está implementada |
| Entitlements por plan | No existe | Hasta cerrar #984, el gating es contractual y manual |
| Ropa con talla/color | Roadmap | No vender tiendas de ropa como vertical soportada |
| Farmacia | Lotes/vencimiento existen; controlados no validado | Solo piloto, sin promesa de cumplimiento farmacéutico |
| Ventas en ruta | POS móvil offline | No vender gestión de rutas ni inventario de camión |

## 4. Planes, packs y add-ons

### Principio

No se vende “retail vs cafetería” como escalera. Se vende una **plataforma común** y el cliente elige el pack que corresponde a su operación. Un minimarket necesita inventario profundo sin recetas; una cafetería necesita recetas sin lotes/vencimiento. Una escalera por rubro obliga a prometer funciones que el cliente no usa.

### Planes

| Plan | Mensual | Setup | Dirigido a | Incluye |
| --- | ---: | ---: | --- | --- |
| **Esencial** | **US$49** | **US$149** | Pulperías, kioscos, food trucks, cafeterías pequeñas, BYOD | 1 terminal incluida, facturación impresa DGI, catálogo, caja/turnos, doble tipo de cambio, inventario simple, reportes esenciales, portal del propietario, usuarios POS ilimitados, 2 cuentas owner |
| **Operación** | **US$89** | **US$250** | Food parks, bares, cafeterías con mesa, tiendas medianas | Esencial + 1 pack a elección, clientes, promociones, lealtad, reportes operativos |
| **Pro** | **US$149** | **US$450** | Restaurantes, minimarkets, farmacias piloto, alto flujo | Operación + ambos packs, 2 terminales incluidas, 4 cuentas owner, reportes de margen/kardex valorizado, soporte prioritario, terminales 3+ a US$29 |
| **Enterprise** | Cotización | Cotización | Cadenas y requerimientos a medida | Solo con alcance validado; no es un plan de catálogo |

Todos los planes incluyen **2 cuentas owner**, como la política vigente. `Pro` incluye 4. Cuentas adicionales: US$10/mes. Ningún cliente existente pierde una cuenta por el cambio de plan. El portal del propietario se incluye según el estado de entrega comprometido en el go-live; no se vende como módulo separado.

### Packs

| Pack | Mensual | Capacidades |
| --- | ---: | --- |
| **Retail** | **US$39** | Kardex, costo promedio ponderado, proveedores, compras, conteos, mermas, alertas de stock, código de barras, lotes/vencimiento |
| **Cocina** | **US$39** | Recetas/BOM, subrecetas, modificadores, producción/preelaboración, combos, márgenes por plato, menú QR |

Reglas:

- En `Operación` va **un pack incluido**; el segundo cuesta **+US$29/mes**.
- En `Esencial` un pack cuesta **+US$39/mes** (total US$88). La regla de venta es subir a `Operación` por US$89, que además incluye promociones y lealtad. El add-on existe como válvula de escape para contratos que no pueden cambiar de plan; no es la ruta recomendada.
- En `Pro` van **ambos packs incluidos**.
- El pack se elige por operación, no por rubro. Un minimarket puede comprar `Retail`; una cafetería, `Cocina`; un híbrido, ambos.

### Matriz de capacidades

| Capacidad | Esencial | Operación | Pro |
| --- | :---: | :---: | :---: |
| Venta, factura DGI, anulación, reimpresión, caja/turnos | Sí | Sí | Sí |
| Catálogo, clientes, doble tipo de cambio | Sí | Sí | Sí |
| Inventario simple (stock y conteo) | Sí | Sí | Sí |
| Portal del propietario | Sí | Sí | Sí |
| Pack Retail | Add-on | 1 incluido | Ambos |
| Pack Cocina | Add-on | 1 incluido | Ambos |
| Promociones y lealtad | No | Sí | Sí |
| Reportes de margen y kardex valorizado | No | No | Sí |
| Terminales incluidas | 1 | 1 | 2 |
| Cuentas owner incluidas | 2 | 2 | 4 |
| Soporte prioritario | No | No | Sí |

### Add-ons

| Add-on | Precio | Condición |
| --- | ---: | --- |
| Terminal adicional | US$40/mes; US$29 en Pro | Misma sucursal; sincronización por nube, sin LAN en tiempo real. Setup de enrolamiento US$75 (SOHO US$50). SOHO conserva US$35/mes. No hay tope duro por plan |
| Cuenta owner adicional | US$10/mes | Sobre las incluidas (2; 4 en Pro) |
| Sucursal adicional | Setup + mensualidad base | Nueva ubicación; sin consolidación automática |
| OmniFood Care | US$99/mes | Dos horas remotas no acumulables y agenda prioritaria |
| Capacitación remota | US$40/hora | Sin mínimo |
| Capacitación presencial | US$50/hora | Mínimo dos horas más transporte |
| Migración extra de datos | US$75 por lote | Fuera del alcance del setup |
| Aprovisionamiento de hardware | US$49–79 por terminal; BYOD US$25 | Configuración, pruebas y capacitación breve |

No se venden todavía: KDS, facturación electrónica XML/firma, exportación contable, consolidación multi-sucursal, integración bancaria automática ni gestión de rutas.

## 5. Hardware y BYOD

### Decisión

Se construye el adaptador ESC/POS genérico y se habilita BYOD. La prioridad es Bluetooth SPP porque es el transporte de las impresoras de demostración y de los kits de entrada. Red TCP se implementa sobre el enum existente. USB queda para una segunda fase si la validación física lo exige.

Se compran **dos impresoras Bluetooth de 58 mm** para demostración y venta directa. Presupuesto estimado: US$120–220, más rollos y accesorios.

### Kits

| Kit | Composición | Costo estimado | Precio sugerido | Margen bruto |
| --- | --- | ---: | ---: | ---: |
| **BYOD 58 mm** | Equipo Android del cliente + impresora Bluetooth 58 mm + 5 rollos | US$60–110 | **US$99–149** + US$25 configuración | 25–35% |
| **Emprendedor** | Sunmi V2s con impresora integrada 58 mm + 5 rollos | US$230–270 | **US$299** | 18–25% |
| **Mostrador** | Q80/iPOS 58 mm + 5 rollos | US$200–240 | **US$289** | 18–25% |
| **Estación** | AIO Android 15” con impresora 80 mm integrada + gaveta + lector | US$550–700 | **US$749–899** | 18–25% |

Los precios de hardware son estimados y deben validarse con al menos dos proveedores locales antes de publicarse. El PRD v2 trae estimaciones para un AIO Windows/Linux (US$945–1,100) y una Epson de 80 mm (US$290); ese escenario no corresponde al POS actual, que solo corre en Android. Validar AIO Android, impresoras Bluetooth y modelos de red con proveedores locales.

### Modelo de propiedad

- **Modelo A (ahora): kit recomendado.** El cliente compra al proveedor aliado; NHILOS cobra aprovisionamiento. Cero inventario, cero garantía, cero IVA por bienes.
- **Modelo B (después de formalizar): reventa.** Margen 18–25%, garantía del proveedor traspasada, factura con IVA 15% y stock mínimo de 2–3 unidades.

No ofrecer financiamiento 0%. Si se financia, 12 meses con 10–15% de recargo o vía aliado.

### Compatibilidad

La lista de impresoras compatibles se publica solo después del checklist físico. Candidatas para validar: Xprinter XP-58IIH, GOOJPRT PT-210 y modelos de 80 mm con puerto de gaveta. Cada modelo debe probar factura, comanda, corte X/Z, logo, acentos y gaveta.

## 6. Economía unitaria y reglas

Costo fijo modelado en la calculadora: **US$161.92–170.02/mes**, que incluye trabajo del propietario. La infraestructura sola es **US$109.62–110.97/mes** antes de ese trabajo y de impuestos. Reserva variable: US$1–5 por cliente.

| Plan | Contribución aproximada | Clientes para equilibrio |
| --- | ---: | ---: |
| Esencial US$49 | ~US$44 | 4 |
| Operación US$89 | ~US$84 | 2–3 |
| Pro US$149 | ~US$144 | 2 |

Primer año típico:

| Oferta | Software | Hardware | Total año 1 |
| --- | ---: | ---: | ---: |
| Esencial BYOD | US$149 + 12 × US$49 = US$737 | US$99–149 + US$25 | **US$861–911** |
| Esencial integrado | US$737 | US$299 | **US$1,036** |
| Operación | US$250 + 12 × US$89 = US$1,318 | US$289 | **US$1,607** |
| Pro | US$450 + 12 × US$149 = US$2,238 | US$588–1,038 | **US$2,826–3,276** |

Reglas de defensa:

1. **No bajar de US$49/mes en Esencial ni de US$39/mes en un pack.** El soporte de microclientes destruye el margen.
2. **Descuento anual máximo: 10%.** No regalar dos meses; se necesita caja.
3. **Setup no reembolsable.** US$149 solo si el onboarding es plantilla + Setup Center + una sesión; migración pesada se cotiza aparte.
4. **SOHO se queda en US$79.** La oferta pública de US$89 pasa a `Operación` sin reprecio.
5. **Si dos add-ons superan US$30/mes, ofrecer el upgrade.** La escalera debe empujar hacia arriba.
6. **Precios en USD**, referencia C$ al BCN, con cláusula de ajuste anual.
7. **El hardware no se incluye en la mensualidad.** Se cobra una vez o se financia aparte.

## 7. Secuencia de lanzamiento

| Fase | Alcance | Gate |
| --- | --- | --- |
| **0. Documentación y habilitadores** | Este documento, issue #983 (adaptador) e issue #984 (entitlements) | Issues aprobados y criterios congelados |
| **1. Esencial + BYOD** | 3–5 clientes pequeños con impresoras Bluetooth; venta con terminal integrado mientras #983 no cierre | Checklist físico aprobado; venta offline con impresora caída no se bloquea; soporte < 20% de la mensualidad |
| **2. Operación + packs** | Clientes con un pack; migración de SOHO al mapeo contractual | Entitlements probados; SOHO sin pérdida de funciones; packs facturables |
| **3. Pro + estación** | Clientes con dos terminales y ambos packs | Concurrencia validada; kit de estación con 80 mm y gaveta aprobado |

No se publica el plan `Esencial` con BYOD hasta que #983 esté aceptado físicamente. Mientras tanto, se puede vender `Esencial` con terminal integrado Sunmi/iPOS.

## 8. Riesgos

| Riesgo | Probabilidad | Mitigación |
| --- | --- | --- |
| Fragmentación de impresoras Bluetooth | Alta | Lista de compatibilidad validada, mensajes accionables y dos modelos de demo |
| Code page incorrecta corrompe acentos | Media | Prueba explícita de CP850/CP437/Latin-1 por modelo |
| Bloqueo de ventas por plan vencido | Media | Núcleo fiscal siempre activo; entitlements solo para configuración premium |
| Snapshot de entitlements viejo | Media | TTL, versión y refresco al sincronizar |
| Reventa de hardware con IVA 15% | Media | Empezar con modelo A; pasar a modelo B solo formalizado |
| Canibalización de `Operación` por el pack de Esencial | Media | Cotizar primero `Operación`; el pack en Esencial es válvula de escape, no ruta de venta |
| Canibalización de `Operación` por add-ons | Media | Regla de upgrade cuando dos add-ons superan US$30/mes |
| Presión de descuento en Nicaragua | Alta | Anclar en offline + DGI + soporte; no competir contra Nuxo por precio |
| Prometer funciones no implementadas | Alta | Lista de “no vender todavía” en la sección 3 |

## 9. Tareas técnicas abiertas

| Issue | Tarea | Documento de ejecución |
| --- | --- | --- |
| [#983](https://github.com/netsky2-tech/omnifood-ni/issues/983) | Adaptador ESC/POS genérico (Bluetooth, red, USB) y BYOD | [`odd/tasks/esc-pos-generic-adapter-byod.md`](../../odd/tasks/esc-pos-generic-adapter-byod.md) |
| [#984](https://github.com/netsky2-tech/omnifood-ni/issues/984) | Entitlements por plan y capacidades por tenant | [`odd/tasks/plan-entitlements-tenant-capabilities.md`](../../odd/tasks/plan-entitlements-tenant-capabilities.md) |

## 10. Fuentes

- [Neox POS Nicaragua](https://www.neoxsistemas.com/ni/neox-pos)
- [Nuxo POS Nicaragua](https://nuxopos.com/ni/precios)
- [Fudo precios](https://fu.do/es/precios)
- [Loyverse pricing](https://loyverse.com/pricing)
- `docs/finance/estrategia_comercializacion.md`
- `docs/finance/FINANCIAL_STRATEGY.md`
- `docs/PRDs/Product_Requirement_Document_v2.md`
- `docs/plans/multivertical/adaptabilidad_por_rubro_roadmap.md`
