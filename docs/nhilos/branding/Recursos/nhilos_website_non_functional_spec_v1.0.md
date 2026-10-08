# NHILOS — Website Non-Functional Acceptance Spec

**Documento:** `nhilos_website_non_functional_spec_v1.0.md`  
**Versión:** 1.0  
**Estado:** DRAFT / FOR ENGINEERING & QA REVIEW  
**Autoridad de origen:** `nhilos_website_product_marketing_brief_v1.0.md` (v1.0 — Sección 5: Arquitectura del Sitio Web y Mensajes por Página)  
**Gobernanza:** cadena de autoridad según `nhilos_branding_document_governance_v1.0.md` (§3, referencias técnicas transversales)  
**Propósito:** Definir los umbrales medibles (umbrales de lanzamiento o *release gates*) en materia de rendimiento, accesibilidad, privacidad y soporte técnico que el website público de NHILOS debe superar antes de salir a producción.

> **Principio Operativo:** El estándar de cuidado que promete el producto debe estar presente en el código y comportamiento del website. Una experiencia "Premium" se demuestra con tiempos de carga rápidos, accesibilidad sin fricciones y respeto absoluto por la privacidad del usuario.

---

# 1. Performance & Core Web Vitals (El valor del tiempo)

La experiencia técnica no debe contradecir la promesa de cuidado. El sitio debe cargar rápido, responder de inmediato y no saltar de forma inesperada.

## 1.1 Umbrales Core Web Vitals (CWV)
Las métricas se evaluarán usando Google Lighthouse (Mobile & Desktop) y deben mantenerse en el percentil 75 ("Good"):

*   **Largest Contentful Paint (LCP):** `< 2.5 segundos`. El hero (imagen o video principal) debe renderizarse inmediatamente.
*   **Interaction to Next Paint (INP):** `< 200 milisegundos`. Cero lag percibido al interactuar con menús, botones o el formulario de demostración.
*   **Cumulative Layout Shift (CLS):** `< 0.1`. Ningún elemento debe "saltar" o empujar contenido mientras carga, especialmente en dispositivos móviles.

## 1.2 Presupuestos de Medios (Page-Weight Budgets)
*   **Carga inicial máxima de la página:** `< 2.5 MB` (comprimido).
*   **Imágenes:**
    *   Servidas en formatos modernos (`WebP` o `AVIF` con fallback a JPG/PNG).
    *   Redimensionadas dinámicamente según el viewport (usar `srcset`).
    *   Todas las imágenes fuera del viewport inicial deben usar `loading="lazy"`.
*   **Videos (Demostraciones de producto):**
    *   Los videos en auto-play deben estar obligatoriamente en `muted` y sin controles.
    *   Deben pausarse automáticamente si el usuario hace scroll y los saca del viewport (`IntersectionObserver`).
    *   Carga diferida (`preload="none"` o `metadata`) si no están en la primera sección.

## 1.3 Rendimiento del Front-end
*   Sin `loaders` de marca intrusivos. El contenido debe renderizarse progresivamente lo más rápido posible.
*   Minificación y compresión (Brotli o Gzip) obligatoria para CSS, JS y HTML.
*   Fuentes web (`Inter`) auto-alojadas o pre-conectadas con `font-display: swap` para evitar texto invisible (FOIT).

---

# 2. Accessibility (a11y) Target (El valor de la inclusión)

La accesibilidad en NHILOS no es una capa opcional de *compliance*, es expresión directa del cuidado por el usuario. **El estándar base de aceptación es WCAG 2.1 Nivel AA.**

## 2.1 Contraste y Legibilidad
*   **Contraste de texto:** Relación mínima de `4.5:1` para texto normal y `3:1` para texto grande (H1, H2).
*   **Contraste de UI:** Relación mínima de `3:1` para controles interactivos (botones, inputs, estados activos).
*   Prohibido depender exclusivamente del color para indicar estados de error (ej. campos de formulario).
*   Evitar texto incrustado dentro de imágenes; el texto siempre debe ser renderizado en HTML/CSS.

## 2.2 Navegación por Teclado y Foco
*   Toda interacción debe ser alcanzable y operable exclusivamente mediante la tecla `Tab`.
*   **Focus Visible:** Es obligatorio un estado de foco visible (`:focus-visible`) que contraste claramente con el fondo. Prohibido ocultar el *outline* sin proveer una alternativa evidente.
*   No debe haber trampas de teclado (*keyboard traps*).

## 2.3 Estructura y Semántica (Screen Readers)
*   Jerarquía de encabezados (`H1` a `H6`) estrictamente secuencial. Sin saltos de niveles.
*   Texto alternativo (`alt`) útil y descriptivo para imágenes de producto y flujos. Imágenes decorativas deben usar `alt=""`.
*   Formularios semánticos: Etiquetas (`<label>`) correctamente asociadas a sus inputs.

## 2.4 Movimiento e Interacción
*   **Prefers-Reduced-Motion:** Si el usuario tiene desactivadas las animaciones a nivel de sistema operativo, el CSS/JS debe cancelar todos los *reveals*, paralajes o transiciones suaves.
*   **Touch Targets:** En móviles, cualquier elemento interactivo (botones, enlaces) debe tener un área táctil mínima de `44x44 CSS pixels`.

---

# 3. Privacy & Analytics Gate (El valor del respeto)

Gobernanza sobre qué medimos y cómo tratamos la información, enlazado a `docs/nhilos/contracts/nhilos_privacy_data_notice_v0.1.md` y a la cadena de autoridad de `nhilos_branding_document_governance_v1.0.md`.

## 3.1 Recolección de Datos
*   **Cero tracking invasivo por defecto:** Las herramientas de grabación de sesiones (*session replay*, *rage clicks*) están **bloqueadas en este release**. Requieren evaluación legal/seguridad para futuras versiones.
*   **Minimización:** Solo recolectar eventos justificados (click en CTA, envíos de form, navegación a páginas críticas).

## 3.2 Comportamiento de Cookies
*   Ninguna cookie no esencial o script de seguimiento de terceros (ej. Píxeles de Meta, Google Analytics, LinkedIn) puede ejecutarse sin el consentimiento explícito del usuario (Banner de Cookies), si aplica según la regulación local (OD-11).
*   La opción para "Rechazar todo" en el banner de consentimiento debe ser tan accesible y visible como la de "Aceptar todo" (Cero Dark Patterns).

---

# 4. Form Reliability & Error Handling (El valor de la confianza)

La conversión principal (Solicitar Demo) debe ser robusta. No podemos fallar en el momento en que el prospecto decide hablar con NHILOS.

*   **Sin pérdida de datos:** Si la validación de un formulario falla, toda la información previamente introducida debe conservarse intacta en los inputs.
*   **Estados de error útiles:** 
    *   No usar alertas nativas (`alert()`).
    *   Mostrar el error justo debajo del campo afectado de manera inmediata (ej. "El correo electrónico necesita un formato válido como nombre@empresa.com").
*   **Bloqueo de envíos múltiples:** Deshabilitar el botón de envío y cambiar su estado (ej. "Enviando...") inmediatamente después del clic para prevenir duplicados.
*   **Fallo seguro (Graceful Degradation):** Si el script de envío al CRM / Base de datos falla por red o caída del servicio de terceros, el usuario debe recibir un mensaje de disculpa elegante con un correo electrónico alternativo para contactar.

---

# 5. Supported Environments

El sitio debe renderizarse sin roturas estructurales y mantener funcionalidad completa en:

## 5.1 Navegadores Modernos (Desktop & Mobile)
*   **Google Chrome:** Últimas 2 versiones principales.
*   **Safari / iOS Safari:** Últimas 2 versiones principales.
*   **Mozilla Firefox:** Últimas 2 versiones principales.
*   **Microsoft Edge:** Últimas 2 versiones principales.

## 5.2 Responsive Design
*   Mobile (320px - 767px): UI recompuesta para interacción táctil. Apilamiento vertical claro.
*   Tablet (768px - 1024px).
*   Desktop (1025px y superior): Uso máximo del espacio controlado sin que el texto cruce anchos de lectura extenuantes (max ~75 caracteres por línea).

---

# 6. Quality Assurance (QA) Checklist pre-lanzamiento

El equipo de QA o Frontend Lead debe firmar las siguientes validaciones automatizadas y manuales antes del Go-Live:

* [ ] **Cero Enlaces Rotos:** El crawler no detecta respuestas 404 en enlaces internos, botones o documentos.
* [ ] **Consola Limpia:** `0` errores de JavaScript en consola al cargar la página y navegar entre vistas.
* [ ] **Página 404 Útil:** La ruta a una página inexistente debe renderizar una vista personalizada, sobria, con enlaces directos al Home, Producto y Soporte (Cumplimiento de "+1: No dead ends").
* [ ] **SEO Técnico Básico:** Atributos `title`, meta-descriptions presentes, canonicals configurados, y archivo `robots.txt` permitiendo indexación. Favicon funcional.
* [ ] **SSL / HTTPS:** Certificados SSL válidos y redirección automática de tráfico HTTP a HTTPS sin cadenas de redirección.

---
**Nota de Aprobación:** Este documento debe ser aceptado por el Frontend Lead y QA antes de comenzar el desarrollo (Build Phase). El cumplimiento parcial no califica para lanzamiento.