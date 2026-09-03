# OmniCommerce Backoffice Design System

**Status:** Completo — tokens base + tipografía + spacing + componentes definidos
**Scope:** Este design system es **exclusivamente** para el backoffice web (OmniCommerce). El POS Flutter usa `docs/DESIGN.md`.
**Apply to:** `apps/owner_dashboard/` (React + Vite + Tailwind CSS v4 + shadcn/ui)
**Source:** Logo NHILOS POS — 3 colores base derivados a palette completa

---

## 1. Design Principles

1. **Clarity over decoration** — Eliminar ruido visual. Cada pixel debe tener un propósito funcional.
2. **Information density with breathing room** — Maximizar datos visibles sin sacrificar legibilidad. Espaciado generoso entre grupos funcionales.
3. **Consistent interaction patterns** — Los mismos tipos de datos se presentan y comportan de la misma forma en toda la app.
4. **Desktop-first, tablet-friendly** — Diseñado para monitores 1080p+. Tablets como caso secundario. Mobile es solo lectura.
5. **Accessible by default** — WCAG 2.1 AA como mínimo. Focus rings, keyboard nav, screen readers.
6. **Brand through structure, not decoration** — El brand se expresa en la paleta de colores y el sidebar navy, no en ornamentos.

---

## 2. Color Tokens

Palette base de NHILOS POS. Tints y shades derivados para estados hover/active/disabled.

### Primary (Navy)

| Token | Hex | Uso |
| --- | --- | --- |
| **Primary** | `#013a57` | Acciones primarias, sidebar, headers, focus rings |
| **Primary 50** | `#e6eef2` | Background sutil de secciones |
| **Primary 100** | `#b3cdd9` | Borders sutiles, divider |
| **Primary 200** | `#80acc0` | Disabled text on light bg |
| **Primary 400** | `#1a6a8f` | Hover state de primary |
| **Primary 600** | `#012d45` | Active/pressed state |
| **Primary 700** | `#011f32` | Sidebar dark |
| **Primary foreground** | `#ffffff` | Texto sobre primary |

### Secondary (Green)

| Token | Hex | Uso |
| --- | --- | --- |
| **Secondary** | `#00be84` | Success, CTAs secundarios, badges activos |
| **Secondary 50** | `#e6faf3` | Background de success sutil |
| **Secondary 100** | `#b3f0d9` | Borders de success |
| **Secondary 200** | `#80e6bf` | Light success |
| **Secondary 400** | `#00d99a` | Hover de secondary |
| **Secondary 600** | `#009968` | Active de secondary |
| **Secondary 700** | `#00734e` | Dark success |
| **Secondary foreground** | `#ffffff` | Texto sobre secondary |

### Status (Estándar de la industria)

| Token | Hex | Uso |
| --- | --- | --- |
| **Destructive** | `#dc2626` | Errores, eliminaciones |
| **Destructive foreground** | `#ffffff` | Texto sobre destructive |
| **Destructive 50** | `#fef2f2` | Background error sutil |
| **Warning** | `#f59e0b` | Advertencias |
| **Warning foreground** | `#ffffff` | Texto sobre warning |
| **Warning 50** | `#fffbeb` | Background warning sutil |
| **Info** | `#3b82f6` | Información, links |
| **Info foreground** | `#ffffff` | Texto sobre info |
| **Info 50** | `#eff6ff` | Background info sutil |

### Neutral (Derivada)

| Token | Hex | Uso |
| --- | --- | --- |
| **Background** | `#ffffff` | Page background |
| **Foreground** | `#1a1a1a` | Texto principal |
| **Muted** | `#f5f5f5` | Background de secciones alternas |
| **Muted foreground** | `#737373` | Texto secundario, labels, placeholders |
| **Card** | `#ffffff` | Background de cards |
| **Card foreground** | `#1a1a1a` | Texto en cards |
| **Popover** | `#ffffff` | Dropdowns, modals |
| **Popover foreground** | `#1a1a1a` | Texto en popovers |
| **Border** | `#e5e5e5` | Bordes generales |
| **Border strong** | `#d4d4d4` | Bordes énfasis |
| **Input** | `#e5e5e5` | Bordes de inputs |
| **Ring** | `#013a57` | Focus rings (primary) |

### CSS Custom Properties

```css
:root {
  /* Primary */
  --color-primary: #013a57;
  --color-primary-50: #e6eef2;
  --color-primary-100: #b3cdd9;
  --color-primary-200: #80acc0;
  --color-primary-400: #1a6a8f;
  --color-primary-600: #012d45;
  --color-primary-700: #011f32;
  --color-primary-foreground: #ffffff;

  /* Secondary */
  --color-secondary: #00be84;
  --color-secondary-50: #e6faf3;
  --color-secondary-100: #b3f0d9;
  --color-secondary-200: #80e6bf;
  --color-secondary-400: #00d99a;
  --color-secondary-600: #009968;
  --color-secondary-700: #00734e;
  --color-secondary-foreground: #ffffff;

  /* Status */
  --color-destructive: #dc2626;
  --color-destructive-foreground: #ffffff;
  --color-destructive-50: #fef2f2;
  --color-warning: #f59e0b;
  --color-warning-foreground: #ffffff;
  --color-warning-50: #fffbeb;
  --color-info: #3b82f6;
  --color-info-foreground: #ffffff;
  --color-info-50: #eff6ff;

  /* Neutral */
  --color-background: #ffffff;
  --color-foreground: #1a1a1a;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #737373;
  --color-card: #ffffff;
  --color-card-foreground: #1a1a1a;
  --color-popover: #ffffff;
  --color-popover-foreground: #1a1a1a;
  --color-border: #e5e5e5;
  --color-border-strong: #d4d4d4;
  --color-input: #e5e5e5;
  --color-ring: #013a57;
}
```

### Color Accessibility Verification

| Par | Contraste | WCAG AA (4.5:1) | WCAG AAA (7:1) |
| --- | --- | --- | --- |
| Primary `#013a57` on White | ~12.5:1 | ✅ | ✅ |
| White on Primary `#013a57` | ~12.5:1 | ✅ | ✅ |
| Secondary `#00be84` on White | ~2.1:1 | ❌ (solo large text/icons) | ❌ |
| White on Secondary `#00be84` | ~2.1:1 | ❌ (solo large text/icons) | ❌ |
| Secondary `#00be84` on Primary `#013a57` | ~5.8:1 | ✅ | ❌ |
| Muted fg `#737373` on White | ~4.9:1 | ✅ | ❌ |
| Foreground `#1a1a1a` on White | ~16.1:1 | ✅ | ✅ |

**Regla:** `#00be84` NO se usa para texto pequeño sobre fondo blanco. Solo para:
- Badges/chips con texto blanco sobre fondo `#00be84`
- Iconos grandes (>24px)
- Bordes y decorative elements
- Texto sobre `#013a57` (secondary on primary)

Los colores de estado no deben ser la única señal visual — siempre acompañar con ícono o texto.

Dark mode: No implementado en v1. Si se necesita en el futuro, usar la escala primary-700 como background y derivar neutrals desde ahí.

---

## 3. Typography

**Font family:** Inter — el estándar de la industria para dashboards (Vercel, Linear, Figma). Ya se usa en el POS; consistencia cross-platform.

### Font Scale (Modular 1.25x)

| Token | Size | Line Height | Weight | Uso |
| --- | --- | --- | --- | --- |
| **text-xs** | 12px | 16px | 400 | Labels pequeños, timestamps, metadata |
| **text-sm** | 14px | 20px | 400 | Secondary text, descriptions |
| **text-base** | 16px | 24px | 400 | Body text, table cells, form values |
| **text-lg** | 20px | 28px | 500 | Section headers, card titles |
| **text-xl** | 24px | 32px | 600 | Page titles, KPI numbers grandes |
| **text-2xl** | 32px | 40px | 700 | Dashboard hero KPIs |
| **text-3xl** | 40px | 48px | 700 | Marketing/landing (raramente usado) |

### Font Weights

| Token | Weight | Uso |
| --- | --- | --- |
| **Regular** | 400 | Body text, labels, values |
| **Medium** | 500 | Buttons, nav items, emphasis leve |
| **Semibold** | 600 | Section headers, table headers |
| **Bold** | 700 | Page titles, KPI numbers |

### Tabular Figures

Todos los datos numéricos (precios, cantidades, KPIs, porcentajes) deben usar **tabular figures**:

```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

Esto garantiza alineación perfecta en columnas de tablas y dashboards.

### Mono Font (para datos técnicos)

**JetBrains Mono** o **Fira Code** — para códigos, IDs de transacción, secuencias fiscales, JSON views.

```css
font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

---

## 4. Spacing & Layout

### Spacing Scale (4px baseline grid)

| Token | Value | Uso |
| --- | --- | --- |
| **0** | 0px | — |
| **px** | 1px | Bordes |
| **0.5** | 2px | Gap mínimo entre elementos adyacentes |
| **1** | 4px | Padding interno mínimo, gap entre tags |
| **1.5** | 6px | Gap entre elementos pequeños |
| **2** | 8px | Padding de inputs, gap en forms compactos |
| **3** | 12px | Padding de cards pequeños, gap en lists |
| **4** | 16px | Padding de cards, gutters móviles |
| **5** | 20px | Spacing entre secciones |
| **6** | 24px | Margin entre grupos funcionales |
| **8** | 32px | Spacing entre secciones principales |
| **10** | 40px | Section dividers |
| **12** | 48px | Page-level padding |
| **16** | 64px | Hero spacing |

### Layout Grid

- **Columns:** 12 (desktop), 8 (tablet)
- **Gutters:** 24px (desktop), 16px (tablet)
- **Page margin:** 32px (desktop), 24px (tablet)
- **Max content width:** 1440px (centrado en pantallas >1440px)

```css
/* Layout structure */
.app-layout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}

.content-area {
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
}
```

### Border Radius

| Token | Value | Uso |
| --- | --- | --- |
| **none** | 0px | Tablas de datos estrictas |
| **sm** | 4px | Tags, badges pequeños |
| **DEFAULT** | 6px | Buttons, inputs, selects |
| **md** | 8px | Cards, modals, dropdowns |
| **lg** | 12px | Large containers, dialog overlays |
| **xl** | 16px | Feature cards, hero sections |
| **full** | 9999px | Avatars, circular badges |

---

## 5. Elevation & Depth

El backoffice usa **sombras sutiles con tonalidad primary** en lugar de sombras negras genéricas. Esto integra el brand en la UI sin ser invasivo.

| Level | Shadow | Uso |
| --- | --- | --- |
| **0** | `none` | Background, elementos planos |
| **1** | `0 1px 3px rgba(1,58,87,0.08), 0 1px 2px rgba(1,58,87,0.06)` | Cards, paneles, sidebar |
| **2** | `0 4px 12px rgba(1,58,87,0.12), 0 2px 4px rgba(1,58,87,0.08)` | Dropdowns, modals, popovers |
| **3** | `0 8px 24px rgba(1,58,87,0.16), 0 4px 8px rgba(1,58,87,0.12)` | Floating elements, date pickers |

### Layering System

| Z-Index | Uso |
| --- | --- |
| **0** | Base content |
| **10** | Sticky table headers |
| **20** | Sidebar (en mobile overlay) |
| **30** | Dropdowns, popovers |
| **40** | Modals, dialogs |
| **50** | Toasts, notifications |
| **60** | Tooltip overlays |

---

## 6. Component Mapping (shadcn/ui → NHILOS POS)

### Button

| Variant | Background | Text | Border | Hover |
| --- | --- | --- | --- | --- |
| **Primary** | `#013a57` | `#ffffff` | none | `#1a6a8f` |
| **Secondary** | `#ffffff` | `#013a57` | `1px solid #013a57` | `#e6eef2` bg |
| **Ghost** | transparent | `#013a57` | none | `#f5f5f5` bg |
| **Destructive** | `#dc2626` | `#ffffff` | none | `#b91c1c` |
| **Outline** | `#ffffff` | `#1a1a1a` | `1px solid #e5e5e5` | `#f5f5f5` bg |
| **Link** | transparent | `#013a57` | none | underline |

- **Height:** 40px (default), 36px (sm), 48px (lg)
- **Border radius:** 6px
- **Padding:** 12px 20px (default), 8px 16px (sm), 16px 24px (lg)
- **Font weight:** 500 (medium)
- **Disabled:** opacity 0.5, pointer-events none
- **Loading:** Spinner replaces text, width preserved

### Input / Select / Textarea

- **Height:** 40px (default), 36px (sm), 48px (lg)
- **Border:** 1px solid `#e5e5e5`
- **Border radius:** 6px
- **Focus:** 2px solid `#013a57` (ring), border `#013a57`
- **Error:** 2px solid `#dc2626` (ring), border `#dc2626`
- **Background:** `#ffffff`
- **Text:** `#1a1a1a`, size 14px
- **Placeholder:** `#737373`
- **Label:** 14px, weight 500, color `#1a1a1a`, marginBottom 6px
- **Helper text:** 12px, color `#737373`
- **Error text:** 12px, color `#dc2626`

### Table (Data Grid)

- **Header bg:** `#f5f5f5`
- **Header text:** `#737373`, weight 600, size 12px, uppercase
- **Row height:** 48px
- **Row border:** 1px solid `#e5e5e5` (bottom only)
- **Row hover:** `#e6eef2` (primary 50)
- **Row selected:** `#e6faf3` (secondary 50)
- **Zebra striping:** Alternar `#ffffff` / `#fafafa`
- **Sortable header:** Cursor pointer, arrow icon (↑↓), active color `#013a57`
- **Empty state:** Centered icon + text, muted foreground

### Card

- **Background:** `#ffffff`
- **Border:** 1px solid `#e5e5e5`
- **Border radius:** 8px
- **Shadow:** Level 1
- **Padding:** 24px
- **Header:** 20px, weight 600, color `#1a1a1a`
- **Description:** 14px, color `#737373`

### Dialog / Modal

- **Backdrop:** `rgba(1,58,87,0.6)` (primary con opacidad)
- **Background:** `#ffffff`
- **Border radius:** 12px
- **Shadow:** Level 3
- **Max width:** 480px (default), 640px (wide), 800px (fullscreen)
- **Padding:** 32px
- **Header:** 24px, weight 700
- **Footer:** Flex end, gap 12px, buttons alineados a la derecha

### Badge / Chip

| Variant | Background | Text | Border |
| --- | --- | --- | --- |
| **Default** | `#f5f5f5` | `#1a1a1a` | none |
| **Primary** | `#013a57` | `#ffffff` | none |
| **Secondary** | `#00be84` | `#ffffff` | none |
| **Destructive** | `#dc2626` | `#ffffff` | none |
| **Outline** | transparent | `#1a1a1a` | `1px solid #e5e5e5` |

- **Height:** 24px
- **Padding:** 4px 10px
- **Border radius:** 4px
- **Font size:** 12px, weight 500

### Tabs

- **Tab list border:** 1px solid `#e5e5e5` (bottom)
- **Tab padding:** 12px 16px
- **Tab active:** Color `#013a57`, border-bottom 2px solid `#013a57`, weight 500
- **Tab inactive:** Color `#737373`, weight 400
- **Tab hover:** Color `#1a1a1a`
- **Content padding:** 24px 0

### Dropdown Menu

- **Background:** `#ffffff`
- **Border:** 1px solid `#e5e5e5`
- **Border radius:** 8px
- **Shadow:** Level 2
- **Item padding:** 8px 12px
- **Item hover bg:** `#f5f5f5`
- **Item active bg:** `#e6eef2` (primary 50)
- **Item text:** 14px, color `#1a1a1a`
- **Separator:** 1px solid `#e5e5e5`, margin 4px 0
- **Min width:** 180px

### Toast / Notification

| Type | Left border | Icon color | Background |
| --- | --- | --- | --- |
| **Success** | 4px `#00be84` | `#00be84` | `#ffffff` |
| **Error** | 4px `#dc2626` | `#dc2626` | `#ffffff` |
| **Warning** | 4px `#f59e0b` | `#f59e0b` | `#ffffff` |
| **Info** | 4px `#3b82f6` | `#3b82f6` | `#ffffff` |

- **Border radius:** 8px
- **Shadow:** Level 2
- **Padding:** 16px
- **Position:** Bottom-right
- **Auto-dismiss:** 5s (success/info), 8s (warning), manual (error)

---

## 7. Custom Components (no incluidos en shadcn/ui)

### KPI Card

```
┌─────────────────────────────────┐
│  Label (12px, muted, uppercase) │
│  ┌───────────────────────────┐  │
│  │  Value (32px, bold)       │  │
│  │  Unit (14px, muted)       │  │
│  └───────────────────────────┘  │
│  Trend: +12.5% (14px, green)   │
│  Period: "vs last month"        │
└─────────────────────────────────┘
```

- **Border:** 1px solid `#e5e5e5`
- **Border radius:** 8px
- **Padding:** 24px
- **Layout:** Flex column
- **Trend up:** `#00be84` + arrow up icon
- **Trend down:** `#dc2626` + arrow down icon
- **No change:** `#737373` + dash icon

### Date Range Picker

- Componente: `react-day-picker` (ya incluido en shadcn/ui)
- Presets rápidos: Hoy, Ayer, Últimos 7 días, Últimos 30 días, Este mes, Mes anterior, Este año, Personalizado
- Calendar style: Inline, border 1px `#e5e5e5`, selected bg `#013a57`

### Data Table (TanStack Table)

- Sorting visual: Arrow icon en header, color `#013a57`
- Filtering: Input debajo del header, full-width
- Pagination: Bottom, "Mostrando X-Y de Z", Previous/Next buttons
- Bulk actions: Checkbox column, action bar appears when selected
- Empty state: Icono + "No hay datos para mostrar" + CTA si aplica

### Charts (Recharts)

| Data type | Color | Nota |
| --- | --- | --- |
| Primary metric | `#013a57` | Línea o barra principal |
| Secondary metric | `#00be84` | Comparación |
| Negative/error | `#dc2626` | Caídas, alertas |
| Neutral | `#737373` | Referencia, promedio |

- **Grid:** `#e5e5e5`, strokeDasharray 3 3
- **Axis text:** 12px, `#737373`
- **Tooltip bg:** `#ffffff`, border 1px `#e5e5e5`, shadow level 1
- **Line thickness:** 2px
- **Dot radius:** 4px
- **Area fill opacity:** 0.1

### File Upload

- Drag & drop zone: Border 2px dashed `#e5e5e5`, border-radius 8px
- Drag active: Border color `#013a57`, bg `#e6eef2`
- File list: Icon + name + size + remove button
- Accepted formats: `.xlsx`, `.xls`, `.csv`
- Max size: 10MB

---

## 8. Sidebar Navigation

```
┌─────────────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │  LOGO / BRAND                       │ │
│ │  NHILOS POS                         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│  ● Dashboard          ← active: green  │
│  ○ Sales                              │
│  ○ Inventory                          │
│  ○ Fiscal                             │
│  ─────────────────                    │
│  ○ Catalog            [W5]            │
│  ○ Promotions         [W6]            │
│  ○ Recipes            [W7]            │
│  ─────────────────                    │
│  ○ Users              [W8]            │
│  ○ Settings           [W9]            │
│  ○ Customers          [W10]           │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  User avatar + name             │   │
│  │  Role: Owner                    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Specs

| Property | Value |
| --- | --- |
| **Background** | `#013a57` (primary) |
| **Width expanded** | 260px |
| **Width collapsed** | 72px (solo iconos) |
| **Border right** | none (el sidebar es el borde) |
| **Item height** | 40px |
| **Item padding** | 8px 16px |
| **Item text color** | `#ffffff` with 70% opacity |
| **Item text active** | `#ffffff` with 100% opacity |
| **Item hover bg** | `rgba(255,255,255,0.1)` |
| **Item active indicator** | 3px left border `#00be84` (secondary) |
| **Item icon** | 20px, left of text |
| **Section divider** | 1px solid `rgba(255,255,255,0.15)` |
| **Section label** | 11px, uppercase, `rgba(255,255,255,0.5)` |
| **Collapse toggle** | Bottom of sidebar, icon only |

### Behavior

- **Desktop (>1024px):** Expanded by default, colapsable con toggle
- **Tablet (768-1024px):** Colapsado por defecto, expandible con hover/click
- **Mobile (<768px):** Overlay drawer con backdrop oscuro
- **Active route:** Highlight automático basado en URL
- **Badge counters:** En Inventory (alertas stock bajo), si aplica

---

## 9. Form Patterns

### Layout

- **Single column** para forms con <5 campos
- **Two columns** para forms con 5-10 campos (desktop)
- **Sections** con header para forms largos (>10 campos)
- **Sticky footer** con Save/Cancel para forms滚动

### Field Rules

- Labels siempre visibles arriba del input (NO floating labels)
- Labels: 14px, weight 500, marginBottom 6px
- Inputs: height 40px, border 1px `#e5e5e5`, radius 6px
- Helper text: 12px, muted, debajo del input
- Error: border `#dc2626`, ring `#dc2626`, message 12px red debajo
- Required fields: Asterisco `*` rojo después del label

### Validation

- **Inline validation:** On blur (no on every keystroke)
- **Error messages:** Claros, accionables, en español
- **Success feedback:** Check verde junto al label cuando el campo es válido
- **Form-level errors:** Toast de error arriba + scroll al primer campo con error

### Confirmation Patterns

| Action | Confirmation |
| --- | --- |
| Save draft | No confirmation |
| Publish / Activate | Dialog de confirmación |
| Delete | Dialog destructivo (botón rojo, typed confirmation) |
| Bulk operations | Dialog con count ("¿Eliminar 15 productos?") |
| Fiscal changes | Dialog + warning sobre impacto |

---

## 10. Data Table Patterns

| Property | Value |
| --- | --- |
| **Row height** | 48px |
| **Header height** | 40px |
| **Header bg** | `#f5f5f5` |
| **Header text** | 12px, uppercase, weight 600, `#737373` |
| **Cell padding** | 0 16px |
| **Cell text** | 14px, `#1a1a1a` |
| **Cell border** | 1px solid `#e5e5e5` (bottom) |
| **Row hover** | `#e6eef2` (primary 50) |
| **Row selected** | `#e6faf3` (secondary 50) |
| **Zebra striping** | Alternar `#ffffff` / `#fafafa` |
| **Sortable header** | Pointer cursor, arrow icon, active `#013a57` |
| **Pagination** | Bottom, "Mostrando X-Y de Z", Previous/Next |
| **Empty state** | Icono + "No hay datos" + CTA si aplica |
| **Loading state** | Skeleton rows (3-5 rows animados) |

---

## 11. Dashboard / KPI Patterns

### KPI Grid

```
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  KPI 1   │ │  KPI 2   │ │  KPI 3   │ │  KPI 4   │
│  $12,450 │ │  142      │ │  98.2%   │ │  8        │
│  +12% ▲  │ │  +5 ▲    │ │  -0.3% ▼ │ │  0 ▬     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- **Grid:** 4 columnas (desktop), 2 columnas (tablet), 1 columna (mobile)
- **Gap:** 24px
- **KPI card:** Ver sección 7 (Custom Components)
- **Charts debajo:** 2 columnas (main chart full-width, secondary chart half)

### Date Range

- Dropdown con presets + custom range picker
- Ubicación: Top-right del dashboard
- Default: "Últimos 30 días"

### Auto-refresh

- Frecuencia: Cada 5 minutos (configurable)
- Indicador: Timestamp de última actualización + icono de refresh
- No auto-refresh en forms o modales abiertos

---

## 12. Responsive Breakpoints

| Breakpoint | Width | Layout |
| --- | --- | --- |
| **Desktop** | ≥1024px | Sidebar + content, 12-col grid |
| **Tablet** | 768px - 1023px | Collapsed sidebar (iconos) + content, 8-col grid |
| **Mobile** | <768px | No sidebar (drawer overlay), content full-width, 4-col grid |

**Mobile:** El backoffice NO se optimiza para mobile. En pantallas <768px, el layout se adapta para lectura básica (KPIs, tablas con scroll horizontal) pero las operaciones de escritura (CRUD, forms) requieren desktop/tablet.

---

## 13. Accessibility

- **WCAG 2.1 AA** como mínimo en todo el backoffice
- **Focus rings:** 2px solid `#013a57` con 2px offset en todos los interactive elements
- **Keyboard navigation:** Tab order lógico, Escape cierra modals/dropdowns, Arrow keys en tabs y dropdowns
- **Screen readers:** `aria-label` en botones de icono, `aria-describedby` para errores de form, `aria-current="page"` en nav activa
- **Color:** Nunca la única señal visual — siempre acompañar con ícono o texto
- **Motion:** Respctar `prefers-reduced-motion` — deshabilitar animaciones
- **Text scaling:** Layouts no deben romper hasta 200% zoom

---

## 14. Next Steps

1. ✅ Color tokens definidos (NHILOS POS)
2. ✅ Typography scale definida (Inter)
3. ✅ Spacing & layout grid definidos
4. ✅ Elevation system definido
5. ✅ Component mapping completo
6. ✅ Sidebar design definido
7. ✅ Form, table, dashboard patterns definidos
8. Pendiente: Crear `tailwind.config.ts` con todos los tokens
9. Pendiente: Crear `components.json` de shadcn/ui
10. Pendiente: Instalar shadcn/ui y customizar componentes base
11. Pendiente: Validar accesibilidad con Lighthouse
