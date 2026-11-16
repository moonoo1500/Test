# КОНТУР СЛОМА / FRACTURE LINE

An original Android 3D destructible voxel physics sandbox and tactical demolition puzzle game built in **Godot 4.7.2-stable**.

> **Russian documentation (основная документация на русском языке):** [`README_RU.md`](README_RU.md)

## Concept & Core Loop
You are a structural demolition specialist clearing industrial zones by breaching walls, severing load-bearing steel struts, triggering controlled structural collapses, extinguishing fires, bridging chasms, and driving heavy machinery to extract target cores before the facility alarm expires.

- **100% Original IP**: Original title, levels, mechanics, procedural audio, vector-raster icons, voxel shading, and code. Built strictly without third-party game assets or borrowed geometry.
- **Bilingual RU / EN**: Complete Russian and English localization (`localization/ru.json`, `localization/en.json`, 152 verified keys) with system auto-detection, live in-game switching, and bundled **Mozilla Fira** Cyrillic fonts (`SIL OFL 1.1`).

## Features
- **Interactive Tutorial** (`Training Yard`): 8 guided stations covering movement, breaching, thermal steel cutting, remote seismic charges, Cryo-Foam firefighting, bridge placement, heavy machinery driving, and extraction.
- **4-Mission Campaign Across 3 Distinct Locations** + Mission Select with star ratings, best times, replay, and binary autosave/resume:
  1. **Pier No. 7** (`dock` — Rusty Cargo Dock)
  2. **Mooring Sector B** (`dock` — Drydock Sabotage)
  3. **Basalt Cut** (`quarry` — Basalt Quarry)
  4. **Cryo-Terminal North** (`cryo` — Northern Cryo-Terminal)
- **Timer-Free Free Sandbox**: Unlimited ammo and map reset across all 4 locations (`dock`, `quarry`, `cryo`, `training_yard`).
- **6 Distinct Tools**:
  - **Breaching Hammer**: Smash brick, wood, glass, and concrete; push physics props.
  - **Thermal Lance**: High-temperature precision cutter that severs steel girders and ignites flammables.
  - **Seismic Charge**: Sticky throwable explosive with remote manual detonation (`DETONATE` / `G` / `X`).
  - **Cryo-Foam**: Pressurized extinguisher clearing active voxel fires and smoke.
  - **Bridge Layer**: Builds temporary structural spans (`BRIDGE` voxels) across trenches and canals.
  - **Cargo Grab**: Pick up, carry, and throw crates, weights, fuel barrels, or detached chunks.
- **2 Drivable Vehicles**:
  - **Port Loader**: Agile yard rig capable of smashing wood, brick, and glass barriers.
  - **Quarry Hauler**: Heavy armored mining rig capable of ramming through reinforced concrete.
- **Mobile-First UX & Controls**:
  - Dynamic virtual joystick + swipe-look zone + contextual action buttons.
  - 3 HUD layouts (`Classic`, `Lefty`, `Compact`), adjustable scale/opacity, look sensitivity, Y-axis inversion, toggleable haptics, notch/cutout safe-area padding, and optional Bluetooth gamepad / desktop keyboard-mouse support.
  - Adaptive quality profiles (`Auto`, `Low`, `Medium`, `High`) and Android lifecycle handling (`NOTIFICATION_APPLICATION_PAUSED`, `FOCUS_OUT`, `OS_MEMORY_WARNING`, `WM_GO_BACK_REQUEST`).

## Technical Architecture & Documentation
- [`README_RU.md`](README_RU.md) — Full Russian player & developer guide
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Sparse chunk engine, greedy meshing, WorkerThreadPool pipeline, stability BFS, and `FLSV` format
- [`docs/IMPLEMENTATION_PLAN_RU.md`](docs/IMPLEMENTATION_PLAN_RU.md) — Engineering blueprint & budgets
- [`docs/BUILD_ANDROID_RU.md`](docs/BUILD_ANDROID_RU.md) — Android SDK/JDK/Godot 4.7.2 build & signing guide
- [`docs/QA_REPORT_RU.md`](docs/QA_REPORT_RU.md) — Measured test, benchmark, Vulkan, and APK verification report
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) — Verified third-party software & font licenses
- [`LICENSE`](LICENSE) — MIT License

## Quick Start (CI / Local Verification)
```bash
# 1. Regenerate procedural icons, textures & WAV SFX (optional)
python tools/generate_assets.py

# 2. Verify localization key parity & Cyrillic glyph coverage in Fira fonts
python tools/check_localization.py

# 3. Lint all GDScript files
gdlint scripts tests

# 4. Run headless Godot 4.7.2-stable unit & integration test suite (69 assertions)
godot --headless --path . --import
godot --headless --path . --script res://tests/test_runner.gd

# 5. Run reproducible 4-phase benchmark
godot --headless --path . --script res://scripts/benchmark/benchmark_runner.gd

# 6. Export Android arm64-v8a APK
godot --headless --path . --export-debug "Android" build/fracture-line-v0.1.0-alpha-debug-arm64.apk
```

## Verified Build Snapshot
- **Engine**: Godot `4.7.2-stable` (Mobile Vulkan renderer with OpenGL ES 3 fallback)
- **Android Package**: `com.fractureline.demolition`, `arm64-v8a`, `targetSdk 36`, `minSdk 24` (Godot prebuilt template baseline, Android 8/9+ compatible)
- **Automated Tests**: `69 passed, 0 failed` (`tests/test_runner.gd`)
- **Headless 4-Phase Benchmark (`dock`)**: `avg 6.56–6.92 ms/frame`, `p95 <= 7.02 ms`, `max 14.72 ms`, `28.60 MB` static memory, `49` active chunks, `2,660` greedy-meshed triangles, live `1,265`-voxel detached collapse body verified.
- **Note**: Real physical Android smartphone tests (`Snapdragon 778G` / `Dimensity 1080`) have not been run in this cloud environment; all measured figures come from Linux CI, Godot headless runners, and Mesa `lavapipe` software Vulkan rendering.
