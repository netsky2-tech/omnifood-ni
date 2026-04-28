# Sistema POS "OmniFood NI" – Plataforma de Gestión Gastronómica y Retail

## **Visión del producto**

Desarrollar un sistema de punto de venta modular, **offline-first** y **multi-tenant**, diseñado para operar en entornos de alta rotación (Food Parks) y escalable a cualquier nicho de retail. La solución debe garantizar el cumplimiento fiscal ante la **DGI** y ofrecer integración nativa con la banca local (BAC/Banpro).

## **Objetivos Estratégicos**

* **Piloto Exitoso:** Digitalizar el 100% de la operación del café actual.
* **Escalabilidad Horizontal:** Permitir que otros negocios del Food Park se sumen con una configuración de < 15 minutos.
* **Resiliencia Operativa:** Funcionamiento ininterrumpido a pesar de fallas en el internet de Managua.
* **Cumplimiento Legal:** Cumplir con la Disposición Técnica 09-2007 de la DGI desde el día 1.

## **Arquitectura del Sistema**

Para lograr una solución robusta y distribuible, utilizaremos un enfoque de **Arquitectura Limpia (Clean Architecture)**:

* **Frontend (App POS):** **Flutter**. Permite desplegar en tablets Android (movilidad para meseros) y terminales All-in-One Windows/Linux con un solo código.
* **Persistencia Local:** **SQLite**. Esencial para el modelo *offline-first*. Los datos se guardan localmente y se sincronizan mediante un worker en segundo plano al detectar conexión.
* **Backend (Cloud Central):** **Node.js (NestJS)** bajo una arquitectura multi-tenant (un solo backend sirviendo a múltiples negocios con aislamiento de datos mediante ID de Tenant o schema-per-tenant).
* **Base de Datos Cloud:** **PostgreSQL** con Seguridad a Nivel de Fila (RLS) para garantizar que el café "A" nunca vea los datos del restaurante "B".
* **Arquitectura y patrones de diseños:**
  * **Núcleo**: Clean Architecture con entidades y use cases bien definidos. Aquí vive lo critico como reglas fiscales, cálculos, consistencias.  
  * **Integraciones**: Hexagonal obligatorio ya que se depende de actores externos como: DGI, Bancos, Impresoras térmicas, POS / Hardware. Definir Ports y Adaptarlas.  
  * **Modelo de negocio:** Bounded Context claros (Ventas, inventario, facturación, sincronización) y Agregados bien definidos (Ventas con sus items, Caja (estado transaccional) ).  
  * **Offline-first:** Event sourcing ligero + sincronización eventual.  
* **Lineamientos del proyecto:**
  * **Regla #1:** Backend simple, dominio fuerte
    * Usa Clean Architecture  
    * No complicar los casos de uso.  
  * **Regla #2:** DDD táctico
    * Aplica solo a Entidades, Value Objects y agregados claves  
    * No es necesario todo el libro  
  * **Regla #3:** Hexagonal SOLO en integraciones
    * No usarlo para todo  
  * **Regla #4:** Offline-first desde el día 1
    * No es un feature, es la base del sistema.

## **Módulos Core y Funcionalidades**

### **Módulo de Ventas (FOH - Front of House)**

* **Interfaz Táctica:** Selección de productos por categorías e imágenes.
* **Modificadores Dinámicos:** Crucial para el café (tipo de leche, endulzantes, extra shots).
* **Cuentas Abiertas y Divisiones:** Capacidad de "retener" pedidos y dividir cuentas entre comensales.
* **KDS (Kitchen Display System):** Envío automático de comandas a la barra o cocina sin necesidad de papel.

### **Módulo de Inventario y Producción (BOH - Back of House)**

* **Gestión de Recetas (Bill of Materials):** Al vender un "Latte", el sistema debe descontar proporcionalmente onzas de café, mililitros de leche y gramos de azúcar.
* **Alertas de Stock Crítico:** Notificaciones automáticas cuando insumos clave lleguen al mínimo.
* **Gestión de Proveedores:** Registro de compras y actualización automática de costos promedio.

### **Módulo Fiscal (DGI Compliance)**

* **Numeración Consecutiva Autorizada:** Bloqueo de edición/borrado de facturas; solo se permiten anulaciones registradas.
* **Formatos Configurables:** Impresión de tickets (80mm) que incluyan RUC, desglose de IVA (15%), y datos del emisor conforme ley.
* **Reportes de Cierre (Arqueo):** Generación automática de reportes X y Z para auditorías.

## **Integraciones de pago**

El sistema debe estar preparado para consumir las APIs locales:

* **BAC Credomatic:** Integración mediante el **API Center** para procesamiento de tarjetas y conciliación en tiempo real.
* **Banpro:** Soporte para cobros mediante **QR de Billetera Móvil** y **ProPay** (Tap to Phone) para reducir costos de hardware.

## **Especificaciones de Hardware Recomendado**

Para garantizar la durabilidad en el entorno:

| Componente              | Opción Recomendada                                           | Costo Estimado (Local) |
| ----------------------- | ------------------------------------------------------------ | ---------------------- |
| **Terminal Principal**  | Terminal Touch All-in-One 3NStar (Intel J1900, 4GB RAM, SSD) | $945 - $1,100          |
| **Impresora Recibos**   | Epson TM-T20III (Térmica, Ethernet/USB)                      | $290                   |
| **Cajón de Dinero**     | 3NStar CD350 (Metálico, conexión RJ11)                       | $80                    |
| **Movilidad (Meseros)** | Handheld POS Android (Impresora 58mm integrada)              | $250                   |

## **Roadmap de Desarrollo y Lanzamiento**

## **Fase 1: MVP Pilot (Semanas 1-4)**

* Desarrollo del core de ventas offline y gestión de recetas para el café.
* Implementación de facturación computarizada básica (cumplimiento DGI).
* Sincronización manual/automática básica con la nube.

## **Fase 2: Consolidación (Semanas 5-8)**

* Integración con pasarela de pagos BAC/Banpro.
* Módulo de reportería avanzada en la nube (Dashboard para el dueño).
* Certificación oficial del sistema ante la DGI como proveedor.

## **Fase 3: Expansión Multi-Tenant (Semanas 9+)**

* Habilitación de "Auto-onboarding" para otros tramos del Food Park.
* Lanzamiento de módulos específicos para otros nichos (ej. Manejo de lotes/vencimientos para farmacias o tallas/colores para tiendas de ropa).

## **Estrategia de Monetización**

**Fee de Implementación:** Cobro único por configuración de hardware y carga de menú/inventario inicial.
Suscripción Mensual:
**Plan Básico:** $25 - $30/mes (1 usuario, inventario básico).
**Plan Pro:** $50/mes (Multi-usuario, Recetas, KDS).
**Soporte Técnico:** Contrato de asistencia técnica (requerido por DGI para autorizar el sistema al cliente).
