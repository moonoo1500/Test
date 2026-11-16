#!/usr/bin/env python3
"""
Deterministic procedural asset generator for «Контур Слома» (Fracture Line).
Generates 100% original app icons, HUD/tool icons, tileable grain texture,
and synthesized PCM WAV sound effects with zero external asset dependencies.
"""

from __future__ import annotations

import math
import os
import random
import struct
import wave
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "assets" / "icons"
TEXTURES_DIR = ROOT / "assets" / "textures"
AUDIO_DIR = ROOT / "assets" / "audio"


def ensure_dirs() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    TEXTURES_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def draw_app_icons() -> None:
    # 1. Background (432x432) & Full Icon (512x512)
    def make_bg(size: int) -> Image.Image:
        img = Image.new("RGBA", (size, size), (19, 25, 34, 255))
        draw = ImageDraw.Draw(img)
        step = size // 8
        for gx in range(0, size, step):
            draw.line([(gx, 0), (gx, size)], fill=(28, 37, 49, 255), width=max(1, size // 180))
        for gy in range(0, size, step):
            draw.line([(0, gy), (size, gy)], fill=(28, 37, 49, 255), width=max(1, size // 180))
        # Diagonal hazard corner stripes
        stripe = size // 16
        for i in range(-4, 6):
            x0 = i * stripe * 2
            pts = [
                (x0, size),
                (x0 + stripe, size),
                (x0 + stripe + size // 5, size - size // 5),
                (x0 + size // 5, size - size // 5),
            ]
            draw.polygon(pts, fill=(45, 53, 66, 255))
        return img

    def draw_emblem(img: Image.Image, scale: float = 1.0) -> None:
        w, h = img.size
        cx, cy = w // 2, h // 2
        draw = ImageDraw.Draw(img)
        u = int(min(w, h) * 0.24 * scale)

        # Isometric-like fractured voxel cube (left intact amber-steel, right cracked orange)
        # Left top/front faces
        left_face = [
            (cx - int(u * 1.05), cy - int(u * 0.45)),
            (cx - int(u * 0.12), cy - int(u * 0.05)),
            (cx - int(u * 0.12), cy + int(u * 1.05)),
            (cx - int(u * 1.05), cy + int(u * 0.62)),
        ]
        top_left = [
            (cx - int(u * 1.05), cy - int(u * 0.45)),
            (cx - int(u * 0.08), cy - int(u * 0.92)),
            (cx + int(u * 0.15), cy - int(u * 0.80)),
            (cx - int(u * 0.12), cy - int(u * 0.05)),
        ]
        # Shifted right fractured half
        dx, dy = int(u * 0.18), int(u * 0.08)
        right_face = [
            (cx + int(u * 0.08) + dx, cy - int(u * 0.05) + dy),
            (cx + int(u * 1.05) + dx, cy - int(u * 0.48) + dy),
            (cx + int(u * 1.05) + dx, cy + int(u * 0.58) + dy),
            (cx + int(u * 0.08) + dx, cy + int(u * 1.05) + dy),
        ]
        top_right = [
            (cx + int(u * 0.08) + dx, cy - int(u * 0.05) + dy),
            (cx + int(u * 0.30) + dx, cy - int(u * 0.72) + dy),
            (cx + int(u * 1.05) + dx, cy - int(u * 0.48) + dy),
        ]

        draw.polygon(left_face, fill=(58, 86, 118, 255), outline=(220, 232, 245, 255))
        draw.polygon(top_left, fill=(92, 134, 178, 255), outline=(220, 232, 245, 255))
        draw.polygon(right_face, fill=(235, 112, 38, 255), outline=(255, 235, 200, 255))
        draw.polygon(top_right, fill=(255, 158, 68, 255), outline=(255, 235, 200, 255))

        # Floating fracture voxel shards
        for sx, sy, sz in [
            (cx + int(u * 0.10), cy - int(u * 1.12), int(u * 0.22)),
            (cx + int(u * 1.18), cy - int(u * 0.82), int(u * 0.16)),
            (cx - int(u * 0.02), cy + int(u * 1.18), int(u * 0.15)),
        ]:
            draw.rectangle(
                [sx - sz // 2, sy - sz // 2, sx + sz // 2, sy + sz // 2],
                fill=(255, 196, 82, 255),
                outline=(255, 248, 230, 255),
                width=max(2, int(u * 0.04)),
            )

        # Glowing fracture lightning seam
        seam = [
            (cx + int(u * 0.12), cy - int(u * 0.96)),
            (cx - int(u * 0.06), cy - int(u * 0.12)),
            (cx + int(u * 0.18), cy + int(u * 0.28)),
            (cx - int(u * 0.02), cy + int(u * 1.15)),
        ]
        draw.line(seam, fill=(255, 224, 110, 255), width=max(4, int(u * 0.09)), joint="curve")

    app_icon = make_bg(512)
    draw_emblem(app_icon, 1.0)
    # Outer tactical border
    d = ImageDraw.Draw(app_icon)
    d.rounded_rectangle([12, 12, 499, 499], radius=84, outline=(245, 130, 48, 255), width=10)
    app_icon.save(ICONS_DIR / "app_icon.png")

    adaptive_bg = make_bg(432)
    adaptive_bg.save(ICONS_DIR / "adaptive_bg.png")

    adaptive_fg = Image.new("RGBA", (432, 432), (0, 0, 0, 0))
    draw_emblem(adaptive_fg, 0.72)
    adaptive_fg.save(ICONS_DIR / "adaptive_fg.png")


def make_icon_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def draw_tool_and_hud_icons() -> None:
    white = (242, 247, 252, 255)
    amber = (255, 166, 56, 255)
    cyan = (78, 212, 245, 255)
    red = (245, 86, 66, 255)
    green = (108, 225, 132, 255)

    # 1. Hammer / Breacher
    img, d = make_icon_canvas()
    d.line([(28, 100), (80, 48)], fill=amber, width=12)
    d.polygon([(56, 24), (104, 72), (88, 88), (40, 40)], fill=white)
    d.polygon([(86, 22), (106, 42), (96, 52), (76, 32)], fill=cyan)
    img.save(ICONS_DIR / "tool_hammer.png")

    # 2. Thermal Lance
    img, d = make_icon_canvas()
    d.line([(20, 102), (72, 50)], fill=(150, 175, 200, 255), width=14)
    d.line([(68, 54), (108, 14)], fill=amber, width=10)
    d.line([(72, 50), (112, 10)], fill=(255, 248, 200, 255), width=4)
    for px, py in [(98, 42), (112, 34), (86, 18)]:
        d.ellipse([px - 5, py - 5, px + 5, py + 5], fill=red)
    img.save(ICONS_DIR / "tool_lance.png")

    # 3. Seismic Charge
    img, d = make_icon_canvas()
    d.rounded_rectangle([26, 44, 102, 106], radius=14, fill=(72, 86, 102, 255), outline=white, width=4)
    d.rectangle([42, 24, 86, 46], fill=amber, outline=white, width=3)
    d.ellipse([54, 62, 74, 82], fill=red)
    d.arc([38, 10, 90, 42], 200, 340, fill=cyan, width=4)
    img.save(ICONS_DIR / "tool_charge.png")

    # 4. Cryo-Foam Extinguisher
    img, d = make_icon_canvas()
    d.rounded_rectangle([30, 40, 68, 108], radius=14, fill=cyan, outline=white, width=4)
    d.line([(49, 40), (49, 24), (76, 24)], fill=white, width=7)
    for bx, by, br in [(88, 30, 10), (102, 46, 12), (92, 66, 9), (108, 24, 7)]:
        d.ellipse([bx - br, by - br, bx + br, by + br], fill=(210, 246, 255, 230))
    img.save(ICONS_DIR / "tool_foam.png")

    # 5. Structural Bridge Gun
    img, d = make_icon_canvas()
    d.polygon([(14, 86), (114, 34), (118, 48), (18, 100)], fill=green, outline=white)
    for x in range(28, 104, 18):
        y = int(88 - (x - 14) * 0.5)
        d.line([(x, y), (x + 8, y + 12)], fill=white, width=3)
    d.rectangle([16, 86, 36, 108], fill=amber)
    d.rectangle([94, 34, 114, 58], fill=amber)
    img.save(ICONS_DIR / "tool_bridge.png")

    # 6. Kinetic Grab
    img, d = make_icon_canvas()
    d.rounded_rectangle([42, 44, 86, 88], radius=8, fill=amber, outline=white, width=4)
    d.arc([16, 22, 60, 106], 110, 250, fill=cyan, width=7)
    d.arc([68, 22, 112, 106], 290, 70, fill=cyan, width=7)
    img.save(ICONS_DIR / "tool_grab.png")

    # HUD action icons
    # Jump
    img, d = make_icon_canvas()
    d.polygon([(64, 20), (104, 64), (80, 64), (80, 106), (48, 106), (48, 64), (24, 64)], fill=white)
    img.save(ICONS_DIR / "icon_jump.png")

    # Crouch
    img, d = make_icon_canvas()
    d.polygon([(64, 104), (100, 64), (78, 64), (78, 34), (50, 34), (50, 64), (28, 64)], fill=white)
    d.line([(26, 112), (102, 112)], fill=amber, width=6)
    img.save(ICONS_DIR / "icon_crouch.png")

    # Vehicle
    img, d = make_icon_canvas()
    d.rounded_rectangle([20, 52, 108, 86], radius=10, fill=white)
    d.polygon([(34, 52), (48, 30), (86, 30), (98, 52)], fill=cyan)
    d.ellipse([26, 74, 52, 100], fill=amber, outline=white, width=4)
    d.ellipse([76, 74, 102, 100], fill=amber, outline=white, width=4)
    img.save(ICONS_DIR / "icon_vehicle.png")

    # Detonate
    img, d = make_icon_canvas()
    pts = []
    for i in range(16):
        ang = i * math.pi / 8.0
        r = 50 if i % 2 == 0 else 24
        pts.append((64 + int(math.cos(ang) * r), 64 + int(math.sin(ang) * r)))
    d.polygon(pts, fill=red, outline=amber)
    d.ellipse([48, 48, 80, 80], fill=(255, 236, 140, 255))
    img.save(ICONS_DIR / "icon_detonate.png")

    # Pause
    img, d = make_icon_canvas()
    d.rounded_rectangle([32, 24, 54, 104], radius=6, fill=white)
    d.rounded_rectangle([74, 24, 96, 104], radius=6, fill=white)
    img.save(ICONS_DIR / "icon_pause.png")


def draw_voxel_grain() -> None:
    rng = random.Random(472026)
    size = 256
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = rng.randint(-14, 14)
            # Subtle tileable brick/grain detail
            v = max(0, min(255, 128 + n))
            edge = 0
            if (x % 64) < 2 or (y % 64) < 2:
                edge = -18
            c = max(0, min(255, v + edge))
            px[x, y] = (c, c, c, 255)
    img.save(TEXTURES_DIR / "voxel_grain.png")


def write_wav(path: Path, samples: list[float], sample_rate: int = 22050) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for s in samples:
            clamped = max(-0.98, min(0.98, s))
            frames.extend(struct.pack("<h", int(clamped * 32767.0)))
        wf.writeframes(bytes(frames))


def generate_audio() -> None:
    sr = 22050
    rng = random.Random(1337)

    # 1. Impact stone
    samples = []
    for i in range(int(sr * 0.24)):
        t = i / sr
        env = math.exp(-t * 22.0)
        body = math.sin(2.0 * math.pi * (145.0 - 70.0 * t) * t) * 0.65
        grit = (rng.random() * 2.0 - 1.0) * 0.45 * math.exp(-t * 32.0)
        samples.append((body + grit) * env)
    write_wav(AUDIO_DIR / "impact_stone.wav", samples, sr)

    # 2. Impact wood
    samples = []
    for i in range(int(sr * 0.20)):
        t = i / sr
        env = math.exp(-t * 26.0)
        tone = (math.sin(2.0 * math.pi * 240.0 * t) + 0.5 * math.sin(2.0 * math.pi * 410.0 * t)) * 0.5
        snap = (rng.random() * 2.0 - 1.0) * 0.35 * math.exp(-t * 40.0)
        samples.append((tone + snap) * env)
    write_wav(AUDIO_DIR / "impact_wood.wav", samples, sr)

    # 3. Impact glass
    samples = []
    for i in range(int(sr * 0.32)):
        t = i / sr
        env = math.exp(-t * 14.0)
        shimmer = (
            math.sin(2.0 * math.pi * 2100.0 * t) * 0.3
            + math.sin(2.0 * math.pi * 3450.0 * t) * 0.25
            + (rng.random() * 2.0 - 1.0) * 0.55
        )
        samples.append(shimmer * env * 0.7)
    write_wav(AUDIO_DIR / "impact_glass.wav", samples, sr)

    # 4. Impact metal
    samples = []
    for i in range(int(sr * 0.35)):
        t = i / sr
        env = math.exp(-t * 10.0)
        ring = (
            math.sin(2.0 * math.pi * 520.0 * t) * 0.45
            + math.sin(2.0 * math.pi * 885.0 * t) * 0.35
            + math.sin(2.0 * math.pi * 1390.0 * t) * 0.2
        )
        samples.append(ring * env * 0.75)
    write_wav(AUDIO_DIR / "impact_metal.wav", samples, sr)

    # 5. Thermal lance hum (loopable 0.5s)
    samples = []
    dur = 0.5
    for i in range(int(sr * dur)):
        t = i / sr
        buzz = math.sin(2.0 * math.pi * 120.0 * t) * 0.35 + math.sin(2.0 * math.pi * 240.0 * t) * 0.25
        hiss = (rng.random() * 2.0 - 1.0) * 0.25
        samples.append((buzz + hiss) * 0.6)
    write_wav(AUDIO_DIR / "lance_beam.wav", samples, sr)

    # 6. Charge place beep
    samples = []
    for i in range(int(sr * 0.14)):
        t = i / sr
        env = math.exp(-t * 18.0)
        samples.append(math.sin(2.0 * math.pi * 1320.0 * t) * env * 0.65)
    write_wav(AUDIO_DIR / "charge_beep.wav", samples, sr)

    # 7. Explosion boom
    samples = []
    lp = 0.0
    for i in range(int(sr * 0.95)):
        t = i / sr
        env = math.exp(-t * 4.2)
        sub = math.sin(2.0 * math.pi * (88.0 * math.exp(-t * 2.5) + 28.0) * t) * 0.65
        noise = rng.random() * 2.0 - 1.0
        lp = lp * 0.85 + noise * 0.15
        crack = noise * 0.4 * math.exp(-t * 18.0)
        samples.append((sub + lp * 0.75 + crack) * env * 0.85)
    write_wav(AUDIO_DIR / "explosion.wav", samples, sr)

    # 8. Cryo-foam spray (0.4s)
    samples = []
    for i in range(int(sr * 0.4)):
        t = i / sr
        fade = min(1.0, t * 20.0) * min(1.0, (0.4 - t) * 10.0)
        hiss = (rng.random() * 2.0 - 1.0) * 0.45
        samples.append(hiss * fade)
    write_wav(AUDIO_DIR / "foam_spray.wav", samples, sr)

    # 9. Bridge deploy click
    samples = []
    for i in range(int(sr * 0.18)):
        t = i / sr
        env = math.exp(-t * 16.0)
        freq = 440.0 if t < 0.07 else 660.0
        samples.append(math.sin(2.0 * math.pi * freq * t) * env * 0.6)
    write_wav(AUDIO_DIR / "bridge_place.wav", samples, sr)

    # 10. Alarm klaxon beep
    samples = []
    for i in range(int(sr * 0.28)):
        t = i / sr
        env = min(1.0, t * 40.0) * math.exp(-max(0.0, t - 0.14) * 18.0)
        tone = math.sin(2.0 * math.pi * 880.0 * t) * 0.45 + math.sin(2.0 * math.pi * 660.0 * t) * 0.3
        samples.append(tone * env * 0.7)
    write_wav(AUDIO_DIR / "alarm_beep.wav", samples, sr)

    # 11. Objective pickup chime
    samples = []
    for i in range(int(sr * 0.36)):
        t = i / sr
        env = math.exp(-t * 7.5)
        f = 587.33 if t < 0.11 else 880.0
        samples.append((math.sin(2.0 * math.pi * f * t) + 0.3 * math.sin(2.0 * math.pi * f * 2.0 * t)) * env * 0.55)
    write_wav(AUDIO_DIR / "objective_pickup.wav", samples, sr)

    # 12. Mission clear fanfare
    notes = [(523.25, 0.0, 0.18), (659.25, 0.14, 0.18), (783.99, 0.28, 0.24), (1046.5, 0.44, 0.45)]
    total = int(sr * 0.95)
    samples = [0.0] * total
    for freq, start, dur_n in notes:
        i0 = int(start * sr)
        i1 = min(total, int((start + dur_n) * sr))
        for i in range(i0, i1):
            lt = (i - i0) / sr
            env = min(1.0, lt * 35.0) * math.exp(-lt * 4.5)
            samples[i] += math.sin(2.0 * math.pi * freq * lt) * env * 0.42
    write_wav(AUDIO_DIR / "mission_clear.wav", samples, sr)

    # 13. UI click
    samples = []
    for i in range(int(sr * 0.06)):
        t = i / sr
        samples.append(math.sin(2.0 * math.pi * 920.0 * t) * math.exp(-t * 60.0) * 0.45)
    write_wav(AUDIO_DIR / "ui_click.wav", samples, sr)

    # 14. Engine hum (loopable 0.5s)
    samples = []
    for i in range(int(sr * 0.5)):
        t = i / sr
        eng = (
            math.sin(2.0 * math.pi * 64.0 * t) * 0.45
            + math.sin(2.0 * math.pi * 128.0 * t) * 0.25
            + math.sin(2.0 * math.pi * 192.0 * t) * 0.12
        )
        samples.append(eng * 0.5)
    write_wav(AUDIO_DIR / "engine_hum.wav", samples, sr)


def main() -> None:
    ensure_dirs()
    draw_app_icons()
    draw_tool_and_hud_icons()
    draw_voxel_grain()
    generate_audio()
    print("Generated icons, textures, and WAV audio cleanly.")


if __name__ == "__main__":
    main()
