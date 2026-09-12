#!/usr/bin/env python3
"""
check-imports.py — дешёвая статическая проверка кода форка без JDK/Gradle.

Зачем: компилятор здесь — это 3-50 минут CI, а половину падений дали ошибки
класса «использую класс X, не импортировав его» и «лямбда туда, где у апстрима
абстрактный класс». Это ловится за миллисекунды текстом, поэтому проверяем до сборки.

Проверяет:
  1) каждый известный класс апстрима, упомянутый в файле, либо импортирован,
     либо в том же пакете, либо указан полным именем;
  2) в методы, где апстрим объявил АБСТРАКТНЫЙ КЛАСС, не передаётся лямбда;
  3) не возвращаются API, которых в пин-версии нет (мы на них уже падали).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# Классы апстрима → пакет (пакеты подтверждены grep'ом по исходникам пина).
UPSTREAM_CLASSES = {
    "UserConfig": "org.telegram.messenger",
    "AndroidUtilities": "org.telegram.messenger",
    "ApplicationLoader": "org.telegram.messenger",
    "FileLog": "org.telegram.messenger",
    "NotificationCenter": "org.telegram.messenger",
    "MessagesController": "org.telegram.messenger",
    "SendMessagesHelper": "org.telegram.messenger",
    "UserInstance": "org.telegram.messenger",  # такого класса в пине НЕТ
    "TLRPC": "org.telegram.tgnet",
    "Theme": "org.telegram.ui.ActionBar",
    "BaseFragment": "org.telegram.ui.ActionBar",
    "ProxySettingsActivity": "org.telegram.ui",
    "LayoutHelper": "org.telegram.ui.Components",
}

# Куда нельзя лямбдой (абстрактный класс, а не @FunctionalInterface).
NOT_FUNCTIONAL = {
    "setActionBarMenuOnItemClick": "ActionBar.ActionBarMenuOnItemClick — абстрактный класс",
}

# API, которых в пин-версии нет: проверено grep'ом по BaseFragment/ApplicationLoader.
BANNED = [
    (r"\bthis\.getView\s*\(\)", "у BaseFragment нет getView()"),
    (r"(?<!this\.)\b(?<!parent\.)\bstartActivity\s*\(",
     "у BaseFragment нет startActivity(Intent) — звать через getParentActivity()"),
    (r"UserInstance\.currentAccount",
     "UserInstance в пине не существует — аккаунт это UserConfig.selectedAccount"),
]

COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.S)
COMMENT_LINE = re.compile(r"//[^\n]*")
STRING_LIT = re.compile('"(?:[^"\\\\]|\\\\.)*"')


def strip_noise(src: str) -> str:
    """Убирает комментарии и строковые литералы.

    Без этого поиск матчит собственные пояснения в // (реальный ложняк:
    фраза «нет startActivity(Intent)» в комментарии считалась вызовом).
    """
    src = COMMENT_BLOCK.sub("", src)
    src = COMMENT_LINE.sub("", src)
    src = STRING_LIT.sub('""', src)
    return src


def check_file(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8")
    code = strip_noise(src)
    pkg_m = re.search(r"package\s+([\w.]+)\s*;", src)
    pkg = pkg_m.group(1) if pkg_m else ""
    imports = set(re.findall(r"import\s+(?:static\s+)?([\w.]+)\s*;", src))
    simple = {i.rsplit(".", 1)[-1] for i in imports}
    problems: list[str] = []

    def line_of(idx: int) -> int:
        return src[:idx].count("\n") + 1

    for cls, p in UPSTREAM_CLASSES.items():
        m = re.search(r"(?<![\w.])" + cls + r"\b", code)
        if not m:
            continue
        if path.stem == cls or p == pkg or cls in simple or f"{p}.{cls}" in src:
            continue
        problems.append(f"строка {line_of(m.start())}: {cls} без импорта (нужен import {p}.{cls})")

    for method, why in NOT_FUNCTIONAL.items():
        for m in re.finditer(re.escape(method) + r"\s*\(\s*\w+\s*->", code):
            problems.append(f"строка {line_of(m.start())}: лямбда в {method} — {why}")

    for pattern, why in BANNED:
        for m in re.finditer(pattern, code):
            problems.append(f"строка {line_of(m.start())}: {why}")

    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path(__file__).resolve().parent / "overlay"
    if not root.exists():
        print(f"нет каталога {root}", file=sys.stderr)
        return 2
    files = sorted(root.rglob("*.java"))
    if not files:
        print(f"в {root} нет .java — не тот путь?", file=sys.stderr)
        return 2

    bad = 0
    for f in files:
        problems = check_file(f)
        rel = f.relative_to(root)
        if problems:
            bad += len(problems)
            for p in problems:
                print(f"✗ {rel}: {p}")
        else:
            print(f"✓ {rel}")

    print(f"\nпроверено файлов: {len(files)}, проблем: {bad}")
    if bad:
        print("::error::check-imports нашёл проблемы — компилятор бы на них встал", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
