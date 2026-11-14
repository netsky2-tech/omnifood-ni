# NHILOS — Website Design System (`nhilospos.com`)

**Document:** `design/system.md`
**Version:** 1.0
**Scope:** Exclusively for the NHILOS public marketing & commercial website (`nhilospos.com`).
**Boundary Rule:** Do **not** mix with operational application tokens (`apps/pos_app/lib/ui/design_system/nhilos_tokens.dart` for POS Terminal, `apps/owner_dashboard/src/index.css` for Owner Dashboard Backoffice, or `apps/showcase_video/src/tokens/brand.ts` for Remotion Video). When the website renders product proof frames (live schematics or screenshots of POS/Dashboard), those embedded frames retain their authentic product tokens inside a neutral browser/device bezel, while the website chrome, typography, layout, and marketing surfaces strictly obey this Web Design System.

---

## 1. Authoritative Sources & Provenance

| Source Path | What it Governs |
|---|---|
| `docs/nhilos/branding/identidad/Nhilos Manual.pdf` | Official Masterbrand color triad (`#003757`, `#00BF81`, `#CCCCCC`), needle-and-thread `N` isotipo geometry, and brand typography triad (`Achemost`, `Renogare`, `Poppins`). |
| `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` | Masterbrand architecture (`NHILOS` masterbrand + `NHILOS POS` product), `70% sobriedad / 20% producto / 10% gesto memorable (+1)`, verbal discipline (*"cuidado, no caro"*), and `NHILOS +1` contextual demo principle. |
| `docs/nhilos/branding/web/nhilos_website_information_architecture_content_wireframe_v1.0.md` | Navigation rules (`N-01`..`N-04`), logical sitemap, and homepage section sequence (`H00`–`H13`). |
| `docs/nhilos/branding/web/nhilos_website_non_functional_spec_v1.0.md` | Release gates `NF-01`..`NF-13`: WCAG 2.1 AA contrast (`4.5:1` text, `3:1` UI), `44×44 px` minimum touch targets, `prefers-reduced-motion`, `< 2.5s` LCP, and resilient form states. |

---

## 2. Architectural Synthesis of Inspirations

The NHILOS Web Design System synthesizes four world-class references into an original Nicaraguan enterprise identity so an entrepreneur immediately thinks: *"Esto se ve profesional, parece fácil de usar y transmite que puedo confiarle la operación de mi negocio."*

1. **Square (Commercial Clarity & Approachability):** Generous light canvas (`#FFFFFF` / `#F7F9FB`), unhurried spacing, plain-spoken commercial headers, and frictionless conversion paths.
2. **Linear (Visual Sophistication & Minimalism):** Exposed `1px` structural hairlines, crisp dark-navy executive bands (`#00253B` / `#001829`), subtle glass/surface layering without heavy drop-shadows, and high-precision technical diagrams (`El Hilo Operativo`).
3. **Lightspeed (Management Software Authority):** Multi-role operational framing (*Quien cobra · Quien supervisa · Quien dirige*), tabular financial precision (`tabular-nums`), and executive credibility without using the word "premium".
4. **Toast (Commercial Storytelling & Workflow Proof):** Narrative cards structured around **Situación → Comportamiento → Efecto**, interactive workflow tabs by restaurant/retail segment, and real operational artifacts (58mm/80mm DGI receipts, SQLite offline outbox badges, BAC/Banpro voucher reconciliation).

---

## 3. Color Tokens (`:root`)

Derived from `docs/nhilos/branding/identidad/Nhilos Manual.pdf` and extended into a WCAG 2.1 AA compliant ramp for web surfaces.

### 3.1 Masterbrand Core & Navy Ramp (Authority & Structure)

| Token | Value | RGB / CMYK | Usage & Provenance | Contrast Check |
|---|---|---|---|---|
| `--web-navy-950` | `#001829` | `0, 24, 41` | Deepest executive canvas (Hero/Continuity dark bands, Footer base) | `17.6:1` with `#FFFFFF` (AAA) |
| `--web-navy-900` | `#00253B` | `0, 37, 59` | Elevated dark card surface on `--web-navy-950` (`apps/showcase_video/src/tokens/brand.ts`) | `15.4:1` with `#FFFFFF` (AAA) |
| `--web-navy-800` | `#003757` | `0, 55, 87` / `C100 M75 Y40 K35` | **Official Brand Manual Primary Navy** (`Nhilos Manual.pdf`). Primary CTA background, wordmark on light, active states | `12.6:1` with `#FFFFFF` (AAA) |
| `--web-navy-700` | `#0A4D73` | `10, 77, 115` | Primary CTA `:hover` state, interactive border focus on dark | `8.9:1` with `#FFFFFF` (AAA) |
| `--web-navy-100` | `#D9E6EE` | `217, 230, 238` | Subtle navy tint border, active pill border on light | — |
| `--web-navy-50` | `#F0F5F9` | `240, 245, 249` | Soft tint background for callouts, `works_when` scope boxes | `11.4:1` with `--web-navy-800` |

### 3.2 Brand Emerald Ramp ("El Hilo" — Connection & Operational Pulse)

| Token | Value | RGB / CMYK | Usage & Provenance | Contrast Check |
|---|---|---|---|---|
| `--web-emerald-500` | `#00BF81` | `0, 191, 129` / `C72 M0 Y63 K0` | **Official Brand Manual Emerald** (`Nhilos Manual.pdf`). Used **only** for the thread connector line, status dots, badges/text on `--web-navy-950`/`800`, and large graphical accents. **Never** for small text on white (`2.28:1` fails AA). | `7.9:1` on `#001829` (AAA) / `6.1:1` on `#003757` (AA) |
| `--web-emerald-400` | `#2FE0A4` | `47, 224, 164` | Hover glow / active node highlight on dark navy sections | `10.5:1` on `#001829` (AAA) |
| `--web-emerald-700` | `#007A52` | `0, 122, 82` | **WCAG AA Emerald for Light Surfaces** (`docs/nhilos/branding/web/nhilos_website_non_functional_spec_v1.0.md` §2.1). Used for eyebrow labels, inline links, and positive indicators on `#FFFFFF` / `#F7F9FB`. | `5.38:1` on `#FFFFFF` (AA) |
| `--web-emerald-50` | `#E6F9F2` | `230, 249, 242` | Light emerald surface for verified claim pills & active step backgrounds | `4.92:1` with `--web-emerald-700` (AA) |

### 3.3 Neutral & Surface Ramp (70% Sobriety Budget)

| Token | Value | Usage & Provenance | Contrast Check |
|---|---|---|---|
| `--web-bg-canvas` | `#FFFFFF` | Primary page background (70% sobriety baseline) | — |
| `--web-bg-subtle` | `#F7F9FB` | Alternating section background, bento card resting surface | — |
| `--web-bg-elevated` | `#EEF2F6` | Secondary control surface, code/folio pill background | — |
| `--web-border-manual` | `#CCCCCC` | **Official Brand Manual Structural Gray** (`Nhilos Manual.pdf`). High-visibility form input borders & card dividers | — |
| `--web-border-hairline` | `#E2E8F0` | Linear-inspired `1px` architectural grid & bento hairlines | — |
| `--web-border-dark` | `#163A54` | `1px` structural hairline inside dark navy (`#001829` / `#00253B`) sections | — |
| `--web-text-primary` | `#0B1924` | Primary editorial ink on light surfaces | `17.5:1` on `#FFFFFF` (AAA) |
| `--web-text-secondary` | `#334155` | Supporting copy, Situation/Behavior/Effect descriptions | `10.3:1` on `#FFFFFF` (AAA) |
| `--web-text-muted` | `#5B6B7C` | Metadata, claim IDs (`PC-OFF-01`), footnotes, `does_not_work_when` captions | `5.42:1` on `#FFFFFF` (AA) |
| `--web-text-on-dark` | `#F8FAFC` | Primary headline & body text on dark navy bands | `17.1:1` on `#001829` (AAA) |
| `--web-text-on-dark-muted` | `#94B4C7` | Supporting copy & captions on dark navy bands | `6.8:1` on `#001829` (AA) |

### 3.4 Semantic Status Tokens (Condition & Form States — `NF-13`)

| Token | Value | Tint Surface | Usage | Contrast Check |
|---|---|---|---|---|
| `--web-status-ok` | `#007A52` | `#E6F9F2` | Online sync, DGI correlative verified, form valid | `4.92:1` on tint (AA) |
| `--web-status-warn` | `#B45309` | `#FFFBEB` | Offline local mode active (`SQLite local`), pending outbox queue, `works_when` condition | `4.84:1` on tint (AA) |
| `--web-status-error` | `#B91C1C` | `#FEF2F2` | Form validation error (`NF-13`), blocked anti-claim warning | `5.91:1` on tint (AA) |
| `--web-status-info` | `#003757` | `#F0F5F9` | Operational note, DGI DT 09-2007 reference | `11.4:1` on tint (AAA) |

---

## 4. Typography System

### 4.1 Brand Manual Triad & Self-Contained Web Stack Mapping

`docs/nhilos/branding/identidad/Nhilos Manual.pdf` defines three typographic voices. For self-contained artboards (zero external URLs) and high-performance web rendering (`NF-01`), each voice maps to a deterministic CSS font stack:

| Role | Manual Font (`Nhilos Manual.pdf`) | Self-Contained CSS Variable & Stack | Character & Usage |
|---|---|---|---|
| **Display / Hero** | `Achemost` | `--font-display: 'Achemost', 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Architectural, authoritative, tight tracking (`-0.03em`) for `H1` and section statements. |
| **Subheading / Wordmark / Eyebrow** | `Renogare` | `--font-subheading: 'Renogare', 'Poppins', 'Inter', system-ui, sans-serif` | Geometric precision, uppercase eyebrows (`0.08em` tracking), navigation, and structural labels. |
| **Body & UI Copy** | `Poppins` (Web reading paired with `Inter` per `NF-01`) | `--font-sans: 'Poppins', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | Clean, approachable commercial prose (`max-width: 65ch`). |
| **Tabular & Fiscal Data** | Monospace / Tabular | `--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Folios (`FAC-000482`), NIO/USD amounts (`C$ 1,450.00`), claim IDs (`PC-OFF-01`), sync counters. Always with `font-variant-numeric: tabular-nums`. |

### 4.2 Type Scale (Desktop / Mobile Fluid)

| Token | Size (`clamp`) | Line Height | Weight | Tracking | Usage |
|---|---|---|---|---|---|
| `--text-display-xl` | `clamp(2.5rem, 4.2vw, 3.75rem)` (`40px–60px`) | `1.08` | `700` | `-0.03em` | Hero Headline (`H02`) |
| `--text-display-lg` | `clamp(2rem, 3.2vw, 2.75rem)` (`32px–44px`) | `1.12` | `700` | `-0.025em` | Major Section Headlines (`H03`–`H12`) |
| `--text-heading-md` | `clamp(1.35rem, 2vw, 1.75rem)` (`22px–28px`) | `1.22` | `600` | `-0.015em` | Workflow titles, Bento card headers |
| `--text-heading-sm` | `1.125rem` (`18px`) | `1.35` | `600` | `-0.01em` | Role titles, FAQ questions, Sub-cards |
| `--text-body-lg` | `1.125rem` (`18px`) | `1.6` | `400` | `0` | Hero supporting copy, section lead paragraphs |
| `--text-body-md` | `1rem` (`16px`) | `1.6` | `400` | `0` | Standard body copy, form inputs (prevents iOS zoom) |
| `--text-body-sm` | `0.875rem` (`14px`) | `1.5` | `400` | `0` | Captions, `works_when` / `does_not_work_when` conditions |
| `--text-eyebrow` | `0.75rem` (`12px`) | `1.4` | `700` | `0.09em` | Uppercase section eyebrows & Claim ID badges |

---

## 5. Layout, Spacing, Radius & Elevation

### 5.1 The `70 / 20 / 10` Visual Discipline (`nhilos_brand_experience_principles_v1.0.md` §23)
- **70% Sobriedad:** Structured whitespace (`#FFFFFF`, `#F7F9FB`) or calm deep navy (`#001829`), `1px` architectural hairlines (`#E2E8F0` / `#163A54`), and clear typographic hierarchy.
- **20% Producto Real:** Authentic interactive schematics and verified UI states from NHILOS POS (Terminal checkout, Bimoneda NIO/USD modal, 58mm/80mm DGI receipt, Owner Dashboard KPIs & Sync Freshness Badge).
- **10% Gesto Memorable (`+1`):** "El Hilo Operativo" (`#00BF81` 1.5px vector thread with live status nodes connecting `VENTA → OPERACIÓN → CONTROL → VISIBILIDAD`) and the interactive "Con Internet / Sin Internet" continuity simulator.

### 5.2 Grid & Spacing Tokens
- **Container Max-Width:** `--container-max: 1280px` (`padding-inline: clamp(1.25rem, 4vw, 3rem)`).
- **Reading Measure:** `65ch` maximum for body paragraphs (`NF-01` §5.2).
- **Grid:** 12 columns on Desktop (`gap: 24px`), 6 columns on Tablet (`gap: 20px`), 4 columns on Mobile (`gap: 16px`).
- **Spacing Scale (8px rhythm):**
  - `--space-1`: `4px`
  - `--space-2`: `8px`
  - `--space-3`: `12px`
  - `--space-4`: `16px`
  - `--space-5`: `24px`
  - `--space-6`: `32px`
  - `--space-8`: `48px`
  - `--space-10`: `64px`
  - `--space-12`: `96px` (Standard vertical section padding)

### 5.3 Corner Radii & Surface Elevation
- `--radius-xs`: `4px` (Claim ID pills, tabular badges)
- `--radius-sm`: `8px` (Buttons, form inputs, navigation pills)
- `--radius-md`: `12px` (Storytelling cards, FAQ items, scope callouts)
- `--radius-lg`: `16px` (Bento containers, Product Proof device bezels)
- `--radius-full`: `9999px` (Status dots, toggle switches)
- **Elevation (Linear-style structural depth):** Avoid blurry marketing drop-shadows. Use `1px solid var(--web-border-hairline)` + subtle surface contrast (`--shadow-card: 0 1px 2px rgba(0, 24, 41, 0.04), 0 8px 24px -4px rgba(0, 55, 87, 0.06)`).

---

## 6. Component Rules & Interactive Contracts

1. **Header (`H01`, rules `N-01`..`N-04`):**
   - Left: Masterbrand lockup (`NHILOS` mark + wordmark; never `NHILOS POS by NHILOS`).
   - Center: Exactly 4 top-level destinations: `Producto · Implementación · Recursos · Nosotros`. No mega-menus, no capability links at top level.
   - Right: Single conversion CTA `Solicitar una demo` (`min-height: 44px`, `--web-navy-800` fill, `#FFFFFF` text, `:focus-visible` `2px` offset ring in `--web-emerald-500`).
2. **Product Proof Bezel (`Gate D`):**
   - Frames POS Terminal (dark/slate operational surface) or Owner Dashboard (light executive surface) inside a clean `1px` architectural frame with a provenance caption (`Build verificado · SQLite Floor v78 / PostgreSQL RLS`) and explicit claim badges (`PC-OFF-01`, `PC-FISC-01`, `PC-DASH-05`).
3. **Situation → Behavior → Effect Card (`Toast + NHILOS narrative rule`):**
   - Every capability block renders three explicit micro-layers:
     - **Situación:** The real Nicaraguan merchant pain point (e.g., internet drop at peak hour, DGI audit, mixed NIO/USD payment).
     - **Comportamiento:** What NHILOS POS actually executes in code + operator action.
     - **Efecto:** Verifiable operational outcome + explicit `Alcance y condición` (`works_when` / `does_not_work_when` per `G-06`).
4. **Contextual Demo Form (`H12` + `NHILOS +1` + `NF-13`):**
   - Starts with the prospect's operation (Segment selector: *Cafetería / Panadería*, *Food Park / QSR*, *Restaurante / Bar*, *Retail*; Number of terminals; Primary operational challenge).
   - Preserves input values on validation error, shows inline field-level error messages in `--web-status-error` with icon+text (never `alert()`), disables submit button with `"Preparando solicitud..."` during submission, and provides a graceful fallback email/WhatsApp channel if offline.
5. **Motion & Accessibility (`NF-01`..`NF-13`):**
   - All transitions use `180ms cubic-bezier(0.22, 1, 0.36, 1)`.
   - `@media (prefers-reduced-motion: reduce)` collapses all animation/transition durations to `0.01ms`.
