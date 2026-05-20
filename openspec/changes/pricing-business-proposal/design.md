# Design: Business Proposal Document Structure

## 1. Goal
Diseñar la estructura visual y de contenido para el documento de cotización profesional de OmniFood NI, asegurando que comunique el valor técnico (Offline-First, DGI) y la viabilidad económica.

## 2. Document Layout (Pricing Sheet)

### Header
- Logo de OmniFood NI.
- Datos de contacto (Desarrollador).
- Fecha y validez de la oferta (15 días).

### Section A: La Solución Técnica
- **Resumen**: "Sistema POS Modular e Inteligente".
- **Key Selling Points (Puntos de Dolor)**:
  - ¿Sin Internet? No hay problema (Continuidad operativa).
  - Cumplimiento DGI automático.
  - Control total de costos (Inventario/Recetas).

### Section B: Desglose Económico
- **Tabla de Inversión Inicial**:
  - Implementación de Software ($200).
  - *Nota*: Hardware referenciado (Costo externo).
- **Tabla de Suscripción Mensual**:
  - Plan Business ($55/mes).
  - Incluye: Soporte, Nube, Actualizaciones.

### Section C: Cronograma de Implementación
1. **Día 1**: Entrega de hardware por parte del cliente.
2. **Día 2**: Carga masiva de Menú e Insumos.
3. **Día 3**: Capacitación presencial y puesta en marcha.

## 3. Updates to Project Docs

### Strategy Update (`docs/estrategia_comercializacion.md`)
- Incluir la sección de "Pricing Pilot" con los valores de $200 Setup y $55 SaaS.
- Añadir el argumento de venta "Costo de Inactividad" para rebatir objeciones de precio.

### Task Manager Alignment (`docs/task-manager.md`)
- Asegurar que la Fase 4 incluya explícitamente la creación de este template de cotización.

## 4. Technical Requirements for Implementation
- El "Sync Worker" debe estar listo antes de cobrar la primera mensualidad de SaaS.
- El módulo de "Exportación de Catálogo" debe facilitar la carga inicial de $200.
