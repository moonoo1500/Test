# Changelog / Журнал изменений

## [0.1.0-alpha] - 2026-11-16

### Added (Русский)
- Создана оригинальная 3D воксельная игра **«КОНТУР СЛОМА» / FRACTURE LINE** на Godot `4.7.2-stable` для Android (`arm64-v8a`).
- Реализован разреженный чанковый движок (`16×16×16` с 1-воксельным полем соседства):
  - Greedy meshing с отсечением скрытых граней, 4-уровневым vertex AO и корректной CW-ориентацией треугольников.
  - Агрегированная физика коллизий через жадное слияние `BoxShape3D` (без создания по телу на воксель).
  - Фоновый расчёт мешей и коллайдеров в `WorkerThreadPool` с покадровым лимитом коммита на главном потоке.
  - Локальный инкрементальный BFS-граф структурной устойчивости и отрыв несвязанных кластеров в `RigidBody3D`.
  - Ограниченная симуляция огня, коалесцируемые цепные взрывы (снижение пика кадра с `109.98 ms` до `14.72 ms`) и пулированный `MultiMesh` для осколков и огня.
  - Компактный версионированный бинарный формат сохранений `FLSV` (RLE + ZSTD + целостность).
- Реализованы 6 инструментов (Дробильный молот, Термокопьё, Сейсмический заряд, Крио-пена, Укладчик мостов, Захват грузов) и 2 управляемые машины (Портовый погрузчик, Карьерный тягач).
- Добавлены интерактивное обучение (8 шагов), кампания из 4 миссий в 3 визуально различных локациях (`dock`, `quarry`, `cryo`), режим свободной песочницы без таймера и интерактивный бенчмарк.
- Реализованы мобильный HUD с учётом safe-area и 3 раскладками (`classic`, `lefty`, `compact`), поддержка Bluetooth-геймпада, профили качества (`Auto`/`Low`/`Medium`/`High`), обработка Android lifecycle и 100% локализация RU/EN со шрифтами Mozilla Fira (`SIL OFL 1.1`).
- Настроен полный CI-пайплайн GitHub Actions с проверкой локализации/шрифтов, `gdlint`, `69` автотестами, 4-фазным бенчмарком, Vulkan-дымовым тестом (`lavapipe`) и сборкой подписанного debug-APK (`v0.1.0-alpha` prerelease).

### Added (English)
- Built original 3D destructible voxel physics puzzle game **FRACTURE LINE** in Godot `4.7.2-stable` targeting Android (`arm64-v8a`).
- Implemented sparse `16³` chunk engine with greedy meshing, 4-level vertex AO, greedy `BoxShape3D` physics aggregation, `WorkerThreadPool` async builds, local BFS structural detachment, bounded fire/particles, coalesced chain explosions (`109.98 ms` -> `14.72 ms` max spike), and `FLSV` binary RLE+ZSTD saves.
- Implemented 6 distinct tools, 2 drivable vehicles, 8-step interactive tutorial, 4 campaign missions across 3 distinct environments, timer-free sandbox, and reproducible visual + headless 4-phase benchmarks.
- Added safe-area responsive touch HUD (`classic`/`lefty`/`compact`), Bluetooth gamepad bindings, adaptive quality profiles, Android lifecycle autosave, and complete RU/EN localization (152 verified keys).
- Added GitHub Actions CI pipeline running localization/glyph checks, `gdlint`, 69 automated tests, headless 4-phase benchmark, Mesa `lavapipe` Vulkan scene smoke check, and signed `arm64-v8a` APK packaging.
