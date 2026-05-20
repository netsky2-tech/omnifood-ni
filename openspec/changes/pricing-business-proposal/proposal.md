# Proposal: OmniFood NI - Pricing & Business Strategy

## Intent
Definir la estructura técnico-económica para comercializar OmniFood NI, enfocándose en el primer cliente (Piloto en Food Park) y estableciendo las bases para escalabilidad futura. El objetivo es ofrecer una solución competitiva frente a Neox POS, destacando la resiliencia Offline-First y el cumplimiento estricto con la DGI.

## Scope

### In Scope
- **Modelo de Negocio**: SaaS (Suscripción mensual) que cubre uso de software, sincronización en la nube y soporte.
- **Onboarding/Setup**: Tarifa única de implementación (carga de menú inicial y capacitación).
- **Infraestructura**: Despliegue en VPS Hostinger (KVM 2) y publicación en Google Play Console.
- **Estrategia de Hardware**: El cliente adquiere el hardware directamente.
- **Propuesta Económica (Sugerida)**:
  - Setup Fee (Implementación): $200 (Cubre carga inicial de datos, configuración del dispositivo All-in-One y capacitación).
  - Suscripción SaaS: $60/mes (Punto de equilibrio con 2 clientes, margen saludable).

### Out of Scope
- Publicación inicial en Apple App Store (iOS) debido a altos costos anuales ($99).
- Reventa de hardware o gestión de garantías físicas.

## Capabilities

### New Capabilities
- `business-proposal-template`: Estructura base para generar cotizaciones PDF.
- `saas-tier-management`: Definición de niveles de servicio y soporte.
- `financial-control-system`: Tracker CSV y estrategia financiera para el desarrollador.

## Approach
Adoptaremos un enfoque de **SaaS de Nicho con Onboarding Asistido**.
1. **El gancho (Food Park Pilot)**: Al cliente piloto se le cobra un *Setup Fee* de **$200** que cubre el tiempo técnico de configurar su terminal All-in-One, cargar su menú de café/comida y capacitar a su personal.
2. **Infraestructura Centralizada**: Usaremos Hostinger (USA East) para el backend NestJS y Postgres, asegurando que el costo inicial de la infraestructura sea cubierto por el primer Setup Fee.
3. **Distribución Profesional**: Se usará una cuenta de Google Play Console ($25) para distribuir actualizaciones a los terminales Android de forma centralizada.
4. **El recurrente (SaaS)**: Se establece un contrato de $60 mensuales. Este fee garantiza soporte técnico, respaldos en la nube y actualizaciones DGI.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `docs/estrategia_comercializacion.md` | Modified | Actualizar con el modelo SaaS definido de $60/mo y Setup de $200. |
| `docs/pricing_sheet.pdf` (Futuro) | New | Entregable final para el cliente. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Costos de Infraestructura (Hostinger/Net/IA) suben | Medium | El precio de $60 permite absorber variaciones leves. |
| Cliente percibe $60/mes como alto | Medium | El "Piso de Negociación" es $50. Demostrar ahorros por control de inventario y recetas. |
| Falla de hardware comprado por el cliente | Low | Dejar por escrito que el soporte de hardware es responsabilidad del proveedor externo, no de OmniFood NI. |

## Rollback Plan
Si el modelo SaaS encuentra demasiada resistencia en el mercado nicaragüense tras 3 pitches fallidos, pivotar hacia una opción "Híbrida" (Licencia de uso anual pagada por adelantado con un ligero descuento).

## Dependencies
- Contacto y catálogo del proveedor de hardware para pasárselo al cliente.
- Redacción del Contrato de Nivel de Servicio (SLA) para el soporte mensual.

## Success Criteria
- [ ] Cierre exitoso de la venta con el cliente piloto aceptando el modelo SaaS mensual.
- [ ] Definición de un documento PDF de cotización estándar y profesional.
- [ ] El pago del setup ($350) se cobra antes de la instalación física.