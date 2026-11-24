# Rendimiento percibido — 2026-11-20

Medición del fundador sobre producción (390×844, DPR 3, caché off, chromium 1243):
Fast 3G FCP 0.64–1.04 s; Slow 3G FCP 1.5–3.1 s, LCP 1.5–3.6 s, load 8.4–26.7 s.
CLS ≤ 0.02, TBT ≤ 29 ms, JS propio ~5 KB gzip: la ingeniería de render está resuelta.
El peso está en las fuentes (54–74 % de la transferencia) y en videos que arrancan y se abortan.

## Specs

S1. Cada familia se descarga **una vez**. Las jerarquías falsas (mismos binarios declarados
    con tres `font-weight`) desaparecen: un `@font-face` por familia con su rango real.
S2. Ninguna página inicia la descarga de un video que no va a reproducirse: `preload="none"`,
    respeto de `saveData`/`effectiveType` y arranque por intersección.
S3. Ningún recurso se sirve con dimensiones muy superiores a su tamaño de render.
S4. Las capturas declaran `srcset`/`sizes` y formato moderno, sin cambio de layout.
S5. El LCP no se re-atribuye tarde por una fuente que llega después del primer pintado.

## Tasks

| ID | Spec | Route | Estado |
|----|------|-------|--------|
| T1 | S1, S5 | inline | en curso — deduplicar fuentes y medir |
| T2 | S2 | worker | pendiente — gate de video en 3G |
| T3 | S3 | inline | pendiente — logo 2160×2160 a 32×32 |
| T4 | S4 | worker | pendiente — srcset/sizes + AVIF |

## Log

L1 (fundador, verbatim): *"las fuentes son 54–74% de la transferencia… Son 9 archivos que en
realidad son 3. El navegador baja 252 KB de Inter, 43 KB de Jakarta y 12 KB de Mono duplicados,
porque las URLs difieren. En Slow 3G el último inter-600 termina a los 16.4s y el texto ya
estaba esperando: eso es lo que hunde el LCP, no el CSS."*

L2: confirmado por hash — `sha256` idéntico en inter-400/500/600 (85068 B), jakarta 600/700/800
(21728 B) y mono 500/700 (11624 B). No son pesos distintos: es el mismo binario servido tres veces.
