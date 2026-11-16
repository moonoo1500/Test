#!/usr/bin/env python3
"""Verify 100% localization key parity, non-empty values, and glyph support."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ru_path = ROOT / "localization" / "ru.json"
    en_path = ROOT / "localization" / "en.json"

    ru = json.loads(ru_path.read_text(encoding="utf-8"))
    en = json.loads(en_path.read_text(encoding="utf-8"))

    ru_keys = set(ru.keys())
    en_keys = set(en.keys())

    missing_in_en = sorted(ru_keys - en_keys)
    missing_in_ru = sorted(en_keys - ru_keys)
    empty_ru = sorted(k for k, v in ru.items() if not isinstance(v, str) or not v.strip())
    empty_en = sorted(k for k, v in en.items() if not isinstance(v, str) or not v.strip())

    # Scan GDScript for tr("KEY") usages
    tr_pattern = re.compile(r'\btr\(\s*"([A-Z0-9_]+)"')
    referenced_keys: set[str] = set()
    for gd in (ROOT / "scripts").rglob("*.gd"):
        text = gd.read_text(encoding="utf-8")
        referenced_keys.update(tr_pattern.findall(text))
    missing_refs = sorted(k for k in referenced_keys if k not in ru_keys or k not in en_keys)

    # Verify bundled font covers every character in ru.json & en.json
    font_path = ROOT / "assets" / "fonts" / "FiraSans-Regular.ttf"
    cmap = TTFont(str(font_path)).getBestCmap()
    all_chars = set("".join(ru.values()) + "".join(en.values()))
    missing_glyphs = sorted(c for c in all_chars if c not in ("\n", "\r", "\t") and ord(c) not in cmap)

    errors = []
    if missing_in_en:
        errors.append(f"Keys missing in en.json: {missing_in_en}")
    if missing_in_ru:
        errors.append(f"Keys missing in ru.json: {missing_in_ru}")
    if empty_ru:
        errors.append(f"Empty values in ru.json: {empty_ru}")
    if empty_en:
        errors.append(f"Empty values in en.json: {empty_en}")
    if missing_refs:
        errors.append(f"tr() keys missing in translations: {missing_refs}")
    if missing_glyphs:
        errors.append(f"Characters missing in FiraSans font: {missing_glyphs}")

    if errors:
        for e in errors:
            print("ERROR:", e, file=sys.stderr)
        return 1

    print(
        f"Localization OK: {len(ru_keys)} keys matched (ru/en), "
        f"{len(referenced_keys)} code refs verified, 0 missing font glyphs."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
