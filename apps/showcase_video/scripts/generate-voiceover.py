#!/usr/bin/env python3
"""
Genera la locución automatizada para el showcase de NHILOS POS usando Edge TTS.
Voz oficial seleccionada: es-NI-FedericoNeural (Nicaragua).
"""

import asyncio
import os
import edge_tts

VOICE = "es-NI-FedericoNeural"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "audio")

SCENES = [
    {
        "filename": "scene_1_intro.mp3",
        "text": "NHILOS POS. Directorio de clientes y convenios comerciales.",
    },
    {
        "filename": "scene_2_client.mp3",
        "text": "Desde el panel de control, registra a tus clientes corporativos con su información fiscal en segundos.",
    },
    {
        "filename": "scene_3_promotion.mp3",
        "text": "Crea convenios comerciales personalizados con descuentos automáticos, horarios y empresas específicas.",
    },
    {
        "filename": "scene_4_pos.mp3",
        "text": "En el punto de venta, selecciona a la empresa aliada y el descuento se aplica al instante, incluso sin internet.",
    },
    {
        "filename": "scene_5_outro.mp3",
        "text": "NHILOS POS. Conectamos los hilos de tu negocio.",
    },
]

async def generate_all():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"🎙️ Generando locución con la voz: {VOICE}")
    for idx, scene in enumerate(SCENES, 1):
        target_path = os.path.join(OUTPUT_DIR, scene["filename"])
        print(f"  -> [{idx}/{len(SCENES)}] Generando {scene['filename']}...")
        communicate = edge_tts.Communicate(scene["text"], VOICE, rate="+0%", pitch="+0Hz")
        await communicate.save(target_path)
        size_kb = os.path.getsize(target_path) / 1024
        print(f"     Listo ({size_kb:.1f} KB) -> {target_path}")

    print("\n✅ Todos los audios generados con éxito en public/audio/")

if __name__ == "__main__":
    asyncio.run(generate_all())
