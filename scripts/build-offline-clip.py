#!/usr/bin/env python3
"""Build the offline-continuity clip from real terminal footage.

Every frame of evidence comes from the screen recording; nothing is simulated.
The composition adds three things the raw recording cannot carry on its own:

1. a caption panel that names the state the viewer is looking at,
2. magnified crops of the network indicator, so the detail is legible at the
   size the section renders it (about 300 px wide),
3. an honest interstitial that marks the time jump between the sale and the
   sync, instead of cutting silently.

Usage:
    python3 scripts/build-offline-clip.py \
        --source /path/offline_take2.mp4 \
        --poster-out design/nhilos-web-foundation/media/pos_offline_cola_sync_poster.webp \
        --out design/nhilos-web-foundation/media/pos_offline_cola_sync_loop.mp4
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

W, H = 720, 1544
NAVY = (0, 24, 41)
EMERALD = (47, 163, 107)
WHITE = (255, 255, 255)
MUTED = (159, 179, 189)
DIM = (107, 135, 148)
HAIRLINE = (27, 58, 74)

CONTENT_TOP, CONTENT_BOTTOM = 56, 1200
# Ubuntu Sans ships as a variable font on this host, so weight is an axis.
FONT_VARIABLE = "/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf"
FONT_FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(size, bold=True):
    if os.path.exists(FONT_VARIABLE):
        face = ImageFont.truetype(FONT_VARIABLE, size)
        try:
            face.set_variation_by_name("Bold" if bold else "Regular")
        except Exception:
            pass
        return face
    return ImageFont.truetype(FONT_FALLBACK, size)


def wrap(draw, text, face, max_width):
    words, lines, line = text.split(), [], ""
    for word in words:
        probe = f"{line} {word}".strip()
        if draw.textlength(probe, font=face) <= max_width or not line:
            line = probe
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def tracked(draw, xy, text, face, fill, spacing=3):
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=face, fill=fill)
        x += draw.textlength(char, font=face) + spacing


PANEL_H = H - CONTENT_BOTTOM


def panel(step, title, subline):
    """Opaque caption strip that covers the lower panel area.

    Returned as an RGB strip of PANEL_H pixels, drawn at y=CONTENT_BOTTOM.
    This host's ffmpeg cannot decode PNG, and a strip avoids alpha entirely.
    The section renders the clip at about 300 px wide (720 px composition),
    so type is sized for that: divide by 2.4 for the rendered size.
    """
    img = Image.new("RGB", (W, PANEL_H), NAVY)
    d = ImageDraw.Draw(img)
    d.line([56, 32, W - 56, 32], fill=HAIRLINE, width=2)

    tracked(d, (56, 60), step, font(28), EMERALD, spacing=4)

    face = font(54)
    y = 112
    for line in wrap(d, title, face, W - 112)[:2]:
        d.text((56, y), line, font=face, fill=WHITE)
        y += 66

    if subline:
        d.text((56, y + 8), subline, font=font(32, bold=False), fill=MUTED)
    return img


def card(title, subline):
    """Interstitial that marks the time jump honestly."""
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    face = font(56)
    lines = wrap(d, title, face, W - 160)
    total = len(lines) * 70
    y = (H // 2) - total // 2 - 40
    for line in lines:
        wpx = d.textlength(line, font=face)
        d.text(((W - wpx) / 2, y), line, font=face, fill=WHITE)
        y += 70
    d.line([W // 2 - 40, y + 26, W // 2 + 40, y + 26], fill=EMERALD, width=3)
    if subline:
        f2 = font(32, bold=False)
        wpx = d.textlength(subline, font=f2)
        d.text(((W - wpx) / 2, y + 58), subline, font=f2, fill=MUTED)
    return img


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if result.returncode != 0:
        pretty = " ".join(str(part) for part in cmd)
        raise SystemExit(
            f"ffmpeg failed ({result.returncode}):\n{' '.join(pretty.split())}\n"
            f"{result.stderr[-1200:]}")


def beat(source, start, duration, crop, caption, overlay, out, tmp):
    """One beat: real footage, contain-fitted on navy, caption layer on top."""
    cw, ch = crop[2], crop[3]
    if cw == 1080 and ch == 2316:
        # full screen: fit inside the content area, centred
        scale = min(W / cw, (CONTENT_BOTTOM - CONTENT_TOP) / ch)
    else:
        scale = min(W / cw, (CONTENT_BOTTOM - CONTENT_TOP) / ch)
    tw, th = int(cw * scale) // 2 * 2, int(ch * scale) // 2 * 2
    x = (W - tw) // 2
    y = CONTENT_TOP + ((CONTENT_BOTTOM - CONTENT_TOP) - th) // 2

    strip = os.path.join(tmp, f"{out}.bmp")
    overlay.save(strip)

    # This ffmpeg build cannot configure the auto-inserted conversion filter
    # when a BMP still feeds a filter_complex, so the caption strip is encoded
    # to yuv420p video first and overlaid from that.
    strip_v = os.path.join(tmp, f"{out}_strip.mp4")
    staged = os.path.join(tmp, f"stage_{out}")
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-threads", "1", "-filter_threads", "1", "-ss", f"{start}", "-t", f"{duration}", "-i", source,
        # format must come before pad: this ffmpeg build fails to configure the
        # auto-inserted scaler when pad is asked to convert the pixel format.
        "-vf", (f"crop={cw}:{ch}:{crop[0]}:{crop[1]},"
                f"scale={tw}:{th}:flags=lanczos,format=yuv420p,"
                f"pad={W}:{H}:{x}:{y}:color=0x001829"),
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", "30",
        "-an", "-threads", "1", "-x264-params", "threads=1", staged,
    ])

    final = os.path.join(tmp, out)
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        # The strip stays a BMP: this build cannot overlay two video streams,
        # but a still over a video works.
        "-threads", "1", "-filter_threads", "1", "-i", staged, "-i", strip,
        "-filter_complex", f"[0:v][1:v]overlay=0:{CONTENT_BOTTOM},format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-r", "30",
        "-an", "-threads", "1", "-x264-params", "threads=1", final,
    ])
    return final


def still(src, t, out_path):
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-threads", "1", "-filter_threads", "1",
        "-ss", f"{t}", "-i", src, "-frames:v", "1",
        "-c:v", "bmp", "-threads", "1", out_path,
    ])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--poster-out", default=None)
    ap.add_argument("--keep", action="store_true", help="keep intermediate beats")
    args = ap.parse_args()

    tmp = tempfile.mkdtemp(prefix="offline_clip_")
    # Crops measured on the recording, not guessed: the airplane-mode panel lives
    # at y 30..420 for roughly 1.5 s, the cart sheet at y 980..1780, the payment
    # sheet at y 150..2210, and the success banner sits at the bottom of the
    # catalog, so that beat shows catalog plus banner.
    # Crops are sized to fill the content area, not just to enlarge a detail:
    # a short wide crop leaves the frame mostly empty and reads as a stray icon.
    panel_air = (0, 40, 560, 890)     # excludes the Bluetooth tile: it names a private device
    badge = (700, 60, 320, 510)       # header row, ~2.25x, indicator still dominant
    cart = (0, 980, 1080, 800)
    pay = (0, 150, 1080, 2060)
    done = (0, 1150, 1080, 1166)

    plan = [
        # (start, seconds, crop, step, title, subline)
        (19.3, 1.7, panel_air, "01 · SIN RED", "Modo avión activado", "El equipo no tiene red"),
        (11.5, 1.8, cart, "02 · LA VENTA", "Cobra igual", "C$75 sobre el mostrador"),
        (12.9, 1.8, pay, "03 · COBRO", "En córdobas o en dólares", "C$75 o su equivalente"),
        (14.9, 2.0, done, "04 · REGISTRO", "La venta queda guardada", "En el propio equipo"),
        (21.8, 2.2, badge, "05 · EN COLA", "Una venta esperando", "Sin perder nada"),
    ]

    beats = []
    for start, dur, crop, step, title, sub in plan:
        beats.append(beat(args.source, start, dur, crop,
                          (step, title, sub), panel(step, title, sub), f"b{len(beats)}.mp4", tmp))

    jump = card("Pasan unos minutos", "Vuelve la red")
    png = os.path.join(tmp, "card.bmp")
    jump.save(png)
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-loop", "1", "-t", "1.8", "-i", png,
        "-vf", "format=yuv420p", "-filter_threads", "1",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21",
        "-r", "30", "-an", "-threads", "1", "-x264-params", "threads=1", os.path.join(tmp, "card.mp4"),
    ])
    beats.append(os.path.join(tmp, "card.mp4"))

    beats.append(beat(args.source, 55.2, 2.6, badge,
                      ("06 · SINCRONIZADO", "Se sincronizó sola", "Nadie tocó nada"),
                      panel("06 · SINCRONIZADO", "Se sincronizó sola", "Nadie tocó nada"),
                      "b6.mp4", tmp))

    listing = os.path.join(tmp, "list.txt")
    with open(listing, "w") as fh:
        for b in beats:
            fh.write(f"file '{b}'\n")
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", listing,
        "-c", "copy", "-movflags", "+faststart", args.out,
    ])

    if args.poster_out:
        poster_src = os.path.join(tmp, "poster.bmp")
        still(beats[4], 0.8, poster_src)
        Image.open(poster_src).convert("RGB").save(
            args.poster_out, "WEBP", quality=84, method=6)

    if args.keep:
        print(f"intermediates kept in {tmp}")
    else:
        shutil.rmtree(tmp, ignore_errors=True)

    size = os.path.getsize(args.out)
    print(f"built {args.out} ({size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
