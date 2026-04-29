---
name: High-Efficiency Retail Interface
colors:
  surface: '#faf9f9'
  surface-dim: '#dadada'
  surface-bright: '#faf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f3'
  surface-container: '#eeeeed'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#414849'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f0'
  outline: '#71787a'
  outline-variant: '#c1c8c9'
  surface-tint: '#41646a'
  primary: '#3f6167'
  on-primary: '#ffffff'
  primary-container: '#577a80'
  on-primary-container: '#f7feff'
  inverse-primary: '#a8cdd3'
  secondary: '#546163'
  on-secondary: '#ffffff'
  secondary-container: '#d7e5e8'
  on-secondary-container: '#5a6769'
  tertiary: '#79573f'
  on-tertiary: '#ffffff'
  tertiary-container: '#956f55'
  on-tertiary-container: '#0d0300'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c4e9f0'
  primary-fixed-dim: '#a8cdd3'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#294c52'
  secondary-fixed: '#d7e5e8'
  secondary-fixed-dim: '#bbc9cc'
  on-secondary-fixed: '#111d20'
  on-secondary-fixed-variant: '#3c494c'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ebbd9f'
  on-tertiary-fixed: '#2d1604'
  on-tertiary-fixed-variant: '#5f4029'
  background: '#faf9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e3e2e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-bold:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  tabular-nums:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base-unit: 4px
  hit-area-min: 48px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

The design system is engineered for maximum utility and operational speed in a high-volume retail environment. It prioritizes clarity over decoration, ensuring that users can execute tasks with zero friction. The brand personality is professional and reliable, evoking the feeling of a precision-engineered tool.

The visual style is **Minimalist / Brutalist-lite**, utilizing a strictly flat design language. By removing shadows and gradients, the interface reduces cognitive load and improves rendering performance. High-contrast borders are used to define structural boundaries, ensuring the UI remains legible under various lighting conditions, such as bright warehouse floors or dimly lit storefronts.

## Colors

The palette is strictly functional. Neutral grays and muted industrial tones form the structural backbone, ensuring a professional atmosphere that minimizes eye fatigue.

- **Muted Teal (#5a7d83):** Dedicated exclusively to primary actions and navigation wayfinding.
- **Cool Gray (#6c797c):** Used for secondary supporting elements and structural balance.
- **Warm Brown (#866249):** Reserved for specialized "Action Required" or tertiary status states.
- **Structural Neutral (#767777):** Used for 1px or 2px borders to define hit areas without the use of depth or shadows.

Avoid any use of high-saturation tints; colors must be applied with intention to ensure accessibility and rapid recognition across different device displays.

## Typography

This design system utilizes **Inter** for its exceptional legibility and neutral tone. To support high-speed data entry and scanning, the system prioritizes "Tabular Figures" for all numerical data, ensuring price lists and stock counts align perfectly.

Headings are bold and compact. Body text uses a generous 16px minimum to ensure readability on mobile handheld devices. Labels utilize bold styling with consistent height to differentiate metadata from primary content.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a strict 4px baseline rhythm. While the design is "compact" to maximize information density, the system enforces a strict **48px minimum hit target** rule for all interactive elements to prevent input errors.

- **Grid:** 12-column grid for desktop; 4-column for mobile.
- **Gutters:** Fixed 16px gutters to maintain vertical alignment.
- **Padding:** Internal component padding should be tight (8px-12px) to keep data visible without scrolling, but external margins between distinct functional groups should be 24px+ to aid visual grouping.

## Elevation & Depth

This system avoids all ambient shadows and 3D effects. Depth is communicated exclusively through **High-Contrast Outlines** and **Tonal Layering**.

- **Level 0 (Base):** Background surface color.
- **Level 1 (Cards/Sections):** Defined by a 1px solid border (#767777). 
- **Level 2 (Modals/Overlays):** Defined by a 2px solid border with a high-contrast backdrop dimming (60% opacity).

Active states are indicated by a color fill (Muted Teal) rather than an elevation change. This "Flat-Stack" approach ensures the UI feels instantaneous and structurally solid.

## Shapes

The design system utilizes **Soft (4px)** rounding for standard components. This subtle rounding provides just enough visual distinction to separate the UI from the browser or hardware edges without appearing "friendly" or soft.

- **Primary Elements (Buttons, Inputs):** 4px radius.
- **Large Containers (Cards, Modals):** 4px radius.
- **Strict Data Grids:** 0px radius (sharp corners) to maximize screen real estate.

## Components

### Buttons
- **Primary:** Muted Teal background, White text, 4px radius. No shadow.
- **Secondary:** Surface background, 2px Neutral border, themed text.
- **Active State:** On click, buttons shift to a darker tonal variant of their primary hue to provide immediate tactile feedback.

### Inputs & Selects
- 48px height minimum.
- 1px solid Neutral border that thickens to 2px Muted Teal on focus.
- Labels must remain visible above the input at all times (no floating labels that disappear).

### Lists & Data Tables
- Row height: 56px to ensure easy tapping.
- 1px horizontal dividers only; no vertical lines except in complex tabular data.
- Alternate row striping is permitted for long data sets to assist eye tracking.

### Status Chips
- Rectangular with 4px radius.
- Muted industrial background (Teal/Gray/Brown) with high-contrast text.
- No icons required unless space permits, as color and text carry the weight.

### Critical Action Modals
- High-contrast 2px border using Neutral or Primary tones.
- All action buttons placed at the bottom, occupying the full width of the container for "thumb-friendly" access.