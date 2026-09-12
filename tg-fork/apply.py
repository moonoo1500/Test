#!/usr/bin/env python3
"""
apply.py — накладывает ИИ-форк на рабочее дерево Telegram-Android.

Принцип: правки чужих файлов делаются только «по якорю» с проверкой, что якорь
встретился ровно один раз. Если апстрим уехал — скрипт падает с внятным
сообщением, а не молча портит исходники.

Использование:
    python3 apply.py <путь-к-клону-Telegram> [--app-name "Telegram AI"] [--abi arm64-v8a]
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVERLAY = HERE / "overlay"

SETTINGS = Path("TMessagesProj/src/main/java/org/telegram/ui/SettingsActivity.java")
LAUNCH = Path("TMessagesProj/src/main/java/org/telegram/ui/LaunchActivity.java")
STANDALONE_GRADLE = Path("TMessagesProj_AppStandalone/build.gradle")
STANDALONE_STRINGS = Path("TMessagesProj_AppStandalone/src/main/res/values/strings.xml")

# Строка-якорь: последний пункт основного списка настроек (ряд «Язык»).
SETTINGS_ROW_ANCHOR = (
    "items.add(SettingCell.Factory.of(10, IconBackgroundColors.PURPLE.top, "
    "IconBackgroundColors.PURPLE.bottom, R.drawable.settings_language, "
    "getString(R.string.SettingsLanguage), LocaleController.getCurrentLanguageName()));"
)
SETTINGS_ROW_NEW = (
    "\n        items.add(SettingCell.Factory.of(70, IconBackgroundColors.PURPLE.top, "
    "IconBackgroundColors.PURPLE.bottom, R.drawable.settings_ai, "
    "\"\\u0418\\u0418-\\u0444\\u0443\\u043d\\u043a\\u0446\\u0438\\u0438\", "
    "\"\\u0410\\u0432\\u0442\\u043e\\u043e\\u0442\\u0432\\u0435\\u0442\\u0447\\u0438\\u043a \\u00b7 "
    "\\u043f\\u0435\\u0440\\u0435\\u0432\\u043e\\u0434 \\u00b7 \\u0440\\u0435\\u0434\\u0430\\u043a\\u0442\\u043e\\u0440\"));"
)
# id=70 — свободный слот в switch(item.id).
SETTINGS_CLICK_ANCHOR = "switch (item.id) {\n            case 1:"
SETTINGS_CLICK_NEW = (
    "switch (item.id) {\n"
    "            case 70:\n"
    "                presentSettingFragment(new AISettingsActivity());\n"
    "                break;\n"
    "            case 1:"
)
LAUNCH_ANCHOR = "isResumed = true;\n        pipActivityHandler.onResume();"
LAUNCH_NEW = (
    "isResumed = true;\n"
    "        org.telegram.messenger.ai.AIController.getInstance("
    "org.telegram.messenger.UserConfig.selectedAccount).onBecomeActive();\n"
    "        pipActivityHandler.onResume();"
)
ABI_ANCHOR = 'abiFilters "armeabi-v7a", "arm64-v8a", "x86", "x86_64"'


class PatchError(RuntimeError):
    pass


def sub(text: str, anchor: str, replacement: str, what: str, expected: int = 1) -> str:
    """Замена с гарантией числа вхождений якоря."""
    found = text.count(anchor)
    if found != expected:
        raise PatchError(
            f"якорь «{what}» найден {found} раз(а), ожидалось {expected}.\n"
            f"Апстрим изменился — обнови якорь в apply.py."
        )
    return text.replace(anchor, replacement, 1)


def edit(root: Path, rel: Path, fn) -> None:
    path = root / rel
    if not path.exists():
        raise PatchError(f"нет файла {rel} — не тот репозиторий/тег?")
    original = path.read_text(encoding="utf-8")
    updated = fn(original)
    if updated == original:
        raise PatchError(f"{rel}: правка не применилась (патч уже наложен?)")
    path.write_text(updated, encoding="utf-8")
    print(f"  • patch → {rel}")


def copy_overlay(root: Path) -> int:
    if not OVERLAY.exists():
        raise PatchError(f"нет каталога {OVERLAY}")
    count = 0
    for src in sorted(OVERLAY.rglob("*")):
        if src.is_dir() or src.name.startswith("."):
            continue
        dst = root / src.relative_to(OVERLAY)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        count += 1
    print(f"  • overlay: {count} новых файлов")
    return count


def set_app_name(root: Path, name: str) -> None:
    """AppName переопределяется в res приложения: модуль приложения всегда выигрывает у библиотеки."""
    path = root / STANDALONE_STRINGS
    if name in path.read_text(encoding="utf-8"):
        print("  • имя приложения уже задано")
        return

    def fn(text: str) -> str:
        row = f'    <string name="AppName">{name}</string>\n</resources>'
        return sub(text, "</resources>", row, "конец strings.xml standalone")

    edit(root, STANDALONE_STRINGS, fn)


def limit_abi(root: Path, abi: str) -> None:
    """Один ABI = примерно втрое быстрее нативная сборка и APK на ~35% легче."""
    if not abi or abi == "all":
        print("  • ABI не сужаем (все четыре)")
        return

    def fn(text: str) -> str:
        return sub(text, ABI_ANCHOR, f'abiFilters "{abi}"', "список ABI в standalone")

    edit(root, STANDALONE_GRADLE, fn)


def check_imports() -> None:
    """Статическая проверка до сборки: ловит то, на что компилятор потратил бы 3-50 минут."""
    script = HERE / "check-imports.py"
    if not script.exists():
        raise PatchError(f"нет {script} — проверка импортов обязательна")
    proc = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    tail = "\n".join(proc.stdout.strip().splitlines()[-6:])
    if proc.returncode != 0:
        raise PatchError("статическая проверка кода не пройдена:\n" + tail + "\n" + proc.stderr.strip())
    print("  • check-imports: " + (tail.splitlines()[-1] if tail else "ok"))


def verify(root: Path) -> None:
    checks = {
        SETTINGS: ["R.drawable.settings_ai", "case 70:", "new AISettingsActivity()"],
        LAUNCH: ["org.telegram.messenger.ai.AIController"],
        Path("TMessagesProj/src/main/java/org/telegram/ui/AISettingsActivity.java"): ["class AISettingsActivity extends BaseFragment"],
        Path("TMessagesProj/src/main/java/org/telegram/messenger/ai/AIController.java"): ["didReceiveNewMessages"],
        Path("TMessagesProj/src/main/res/drawable/settings_ai.xml"): ["<vector"],
        Path("TMessagesProj/src/main/res/mipmap-xxxhdpi/icon_foreground_sa.png"): [],
    }
    for rel, needles in checks.items():
        path = root / rel
        if not path.exists():
            raise PatchError(f"проверка не пройдена: отсутствует {rel}")
        body = path.read_text(encoding="utf-8", errors="ignore") if path.suffix != ".png" else ""
        for needle in needles:
            if needle not in body:
                raise PatchError(f"проверка не пройдена: в {rel} нет «{needle}»")
    print(f"  ✓ все {len(checks)} контрольных точек на месте")
    check_imports()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="путь к клону DrKLO/Telegram")
    ap.add_argument("--app-name", default="Telegram AI")
    ap.add_argument("--abi", default="arm64-v8a", help="arm64-v8a | all | …")
    args = ap.parse_args()

    root = Path(args.target).resolve()
    if not (root / "settings.gradle").exists():
        raise PatchError(f"{root} не похоже на корень Telegram-Android (нет settings.gradle)")

    print(f"Налаживаю форк на {root}")
    copy_overlay(root)
    edit(root, SETTINGS, lambda t: sub(t, SETTINGS_ROW_ANCHOR, SETTINGS_ROW_ANCHOR + SETTINGS_ROW_NEW, "список пунктов настроек"))
    edit(root, SETTINGS, lambda t: sub(t, SETTINGS_CLICK_ANCHOR, SETTINGS_CLICK_NEW, "обработка кликов настроек"))
    edit(root, LAUNCH, lambda t: sub(t, LAUNCH_ANCHOR, LAUNCH_NEW, "LaunchActivity.onResume"))
    set_app_name(root, args.app_name)
    limit_abi(root, args.abi)
    verify(root)
    print("Форк наложен.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PatchError as e:
        print(f"\n✗ {e}", file=sys.stderr)
        sys.exit(2)
