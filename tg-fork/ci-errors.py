#!/usr/bin/env python3
"""
ci-errors.py — вытаскивает из лога сборки строки, которые реально описывают
причину, и печатает их как GitHub ::error::-аннотации.

Зачем: логи и артефакты Actions отдаются с доменов, недоступных из песочницы,
поэтому аннотации — единственный канал диагностики. Обычный `tail` лога
бесполезен: javac пишет причину в середине вывода, а не в конце.
"""
from __future__ import annotations

import re
import sys

PATTERN = re.compile(
    r"error:|e: file://|warning: \[options\]|cannot find symbol|incompatible types|"
    r"is not a functional interface|method .* cannot be applied|Unresolved reference|"
    r"abstract.*not overridden|no suitable method|What went wrong|Caused by:|"
    r"FAILURE:|No variants exist|not found|No such file|undefined reference|missing submodule",
    re.IGNORECASE,
)
STOP = re.compile(r"^\s*(\* Try|BUILD FAILED|You can use|Get more help)")


def emit(lines, limit=22):
    out, seen = [], set()

    def push(msg):
        msg = msg.strip()[:400]
        # GitHub-экранирование для workflow-команд
        msg = msg.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        if msg and msg not in seen:
            seen.add(msg)
            out.append(msg)

    # 1) блок "What went wrong" с контекстом — там главная причина
    for i, ln in enumerate(lines):
        if "What went wrong" in ln:
            for c in lines[i + 1 : i + 16]:
                if STOP.match(c):
                    break
                push(c)
            break

    # 2) конкретные ошибки компиляции (Java / Kotlin / C++ / Gradle)
    for ln in lines:
        if PATTERN.search(ln):
            push(ln)
            push(re.sub(r"^/.*?/([A-Za-z0-9_]+\.(?:java|kt|cc|cpp)):(\d+):", r"\1:\2: ", ln))

    # 3) строки с именем наших файлов — даже warning'и полезны
    for ln in lines:
        if any(k in ln for k in ("AISettingsActivity", "messenger/ai/", "apply.py")):
            push(ln)

    if not out:
        for ln in lines[-16:]:
            push(ln)

    for msg in out[:limit]:
        print(f"::error::{msg}")
    if not out:
        print("::error::в логе нет распознанных ошибок — смотри артефакт build-log-tail")


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/build.log"
    try:
        with open(path, errors="ignore") as fh:
            lines = fh.read().splitlines()
    except OSError as e:
        print(f"::error::не могу прочитать лог {path}: {e}")
        return 0
    emit(lines)
    return 0


if __name__ == "__main__":
    sys.exit(main())
