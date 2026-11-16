# Architecture — КОНТУР СЛОМА / FRACTURE LINE

## 1. Design Goals
- **Mobile-first 3D voxel destruction**: smooth `>= 30–60 FPS` on mid-range Android (`Snapdragon 778G` / `Dimensity 1080`, 6 GB RAM) without per-voxel Godot Nodes or per-voxel physics bodies.
- **Zero empty-space allocation**: sparse chunk dictionary allocating memory only where solid voxels exist.
- **Thread-safe async meshing**: background greedy meshing and collision box merging via `WorkerThreadPool` without calling non-thread-safe SceneTree/RenderingServer methods off the main thread.
- **Clean profiling before native optimization**: pure GDScript + `WorkerThreadPool` measured first; C++ GDExtension kept strictly optional unless profiling proves an unresolvable CPU bottleneck.

---

## 2. Core Modules

### 2.1 Sparse Voxel World (`scripts/voxel/`)
| File | Responsibility |
|---|---|
| `voxel_materials.gd` | Material catalog (`AIR`, `BEDROCK`, `CONCRETE`, `BRICK`, `WOOD`, `STEEL`, `GLASS`, `FUEL`, `CRYO`, `BRIDGE`, `ACCENT_AMBER`), HP, blast resistance, hammer immunity, flammability, explosive radius, palette colors, impact SFX keys. |
| `voxel_chunk.gd` | `16×16×16` (`4096`-cell) chunk node (`StaticBody3D` + `MeshInstance3D` + aggregated `CollisionShape3D` children). Tracks flat `PackedByteArray` material IDs + `PackedFloat32Array` HP, solid count, and incremental triangle/collider counts. |
| `voxel_mesher.gd` | **Greedy meshing + face culling + 4-level vertex AO**: takes an `18×18×18` padded snapshot (`1`-voxel neighbor halo) and merges coplanar faces sharing identical material ID and per-corner ambient occlusion tuple (`ao0..ao3`) into minimal quads with CW winding (`0,1,2` / `0,2,3`). Also provides `build_greedy_boxes()` merging solid cells into minimal `BoxShape3D` collision volumes (a solid `16³` chunk collapses to `1` `BoxShape3D`). |
| `voxel_connectivity.gd` | **Local incremental structural stability BFS**: triggered only on cells adjacent to newly destroyed voxels (`max_scan = 1536` per island). Any finite cluster disconnected from bedrock (`y <= anchor_max_y`) or indestructible bedrock/supports is severed from the static chunk and converted into a dynamic `RigidBody3D` (`DetachedCluster`). |
| `voxel_fire.gd` | Bounded cellular fire simulation (`max_active_fires` scaled by quality profile, e.g., `24 / 48 / 72`). Spreads across flammable voxels (`WOOD`, `FUEL`), triggers fuel explosions on burn-through, and supports radius extinguishing via Cryo-Foam. |
| `voxel_serializer.gd` | Compact versioned binary format `FLSV` (v1): magic header, format version, JSON metadata block (mode, mission, elapsed time, alarm, player pose, inventory, collected IDs), chunk count, per-chunk coordinates + RLE-compressed material buffer, ZSTD-compressed payload, and length/integrity validation. |
| `voxel_world.gd` | Coordinates chunk storage (`Dictionary<Vector3i, VoxelChunk>`), boundary dirty propagation, async `WorkerThreadPool` build snapshots, epoch-guarded commit throttling (`max_commits_per_frame`), 3D DDA voxel raycasting (`raycast()`), spherical damage (`carve_sphere()`), coalesced chain blasts (`detonate_explosion()`), bridge spans, and pooled `MultiMeshInstance3D` debris & fire visuals. |

### 2.2 Profiling & Hot-Path Optimization Decision
- **Measured Baseline (`benchmark_runner.gd`, 4 phases on `dock` — 49 active chunks)**:
  - Initial level build (sync 49 chunks): `613.82 ms` (`~12.5 ms/chunk`)
  - Async per-chunk rebuild (`WorkerThreadPool`): `15.26–19.08 ms` off main thread
  - Main-thread CPU frame time: `avg 6.56–6.92 ms`, `p95 <= 7.02 ms`
  - Static memory usage: `28.60 MB`
- **Measured Bottleneck & Fix (`c39054d`)**:
  - Initial `mega_blast` phase spiked to **`109.98 ms`** because `18` adjacent fuel voxels each spawned overlapping `detonate_explosion()` waves and ran `VoxelConnectivity` BFS synchronously 18 times on the same frame.
  - **Optimization applied**: coalesced secondary blast centers within `1.2m` (`d² < 1.44`) and deferred `_handle_structural_collapse()` to run once at top-level `_explosion_depth == 1` across the combined destroyed cell batch.
  - **Result**: `mega_blast` max frame spike dropped **7.47×** from **`109.98 ms` to `14.72 ms`** (`avg 6.92 ms`).
- **Conclusion on C++ GDExtension**: Because greedy meshing already runs asynchronously on worker threads (`<= 19 ms`) and main-thread frame averages sit under `7 ms` (`~60 FPS` CPU headroom), introducing a C++ GDExtension toolchain (`godot-cpp` cross-compiled for `arm64-v8a` + Linux) is unnecessary complexity at this stage.

---

## 3. Gameplay, Core Services & Scene Structure

### 3.1 Autoload Services (`scripts/core/`)
- `LocalizationManager` (`localization_manager.gd`): UTF-8 JSON translation loader (`ru.json`, `en.json`), system locale auto-detect (`ru` vs `en` fallback), live locale switching, and root `Theme` assignment with `FiraSans-Regular.ttf` (`SIL OFL 1.1`) for reliable Cyrillic rendering.
- `GameState` (`game_state.gd`): Settings persistence (`user://settings.cfg`), campaign progression & star/time records (`user://progress.json`), adaptive quality profile resolution (`auto` / `low` / `medium` / `high`), Android vibration gating, and viewport scaling/MSAA configuration.
- `AudioManager` (`audio_manager.gd`): Pooled `AudioStreamPlayer` polyphony (`8` SFX channels + `1` loop channel for thermal lance & vehicle engine), automatic muting/pause on `NOTIFICATION_APPLICATION_PAUSED` / `FOCUS_OUT`.
- `AppServices` (`app_services.gd`): Static runtime accessor (`Engine.get_main_loop().root.get_node_or_null(...)`) eliminating compile-time autoload identifier coupling across `class_name` scripts during headless `--import` and `--script` test runs.

### 3.2 Gameplay & Physics (`scripts/gameplay/`)
- `LevelDefinitions` & `LevelBuilder`: Declarative campaign/sandbox configs and procedural voxel + entity builders for 4 locations (`training_yard`, `dock`, `quarry`, `cryo`) and 5 playable scenarios (`tutorial`, `mission_1_dock`, `mission_2_mooring`, `mission_3_quarry`, `mission_4_cryo`).
- `PlayerController`: First-person `CharacterBody3D` with crouch height adaptation, step-up assist over half-meter voxel edges (`test_move`), head trauma decay, touch/gamepad/keyboard input unification, and camera far-plane scaling.
- `ToolManager`: 6 distinct demolition/engineering tools (`HAMMER`, `THERMAL_LANCE`, `CHARGE`, `CRYO_FOAM`, `BRIDGE`, `GRAB`) with viewmodel animation, bridge span preview, and cargo carry springs.
- `VehicleController`: Raycast-suspended `RigidBody3D` vehicles (`LOADER`, `HAULER`) with upright torque stabilization, speed-gated voxel ramming, chase camera swap, and gamepad/touch driving controls.
- `MissionDirector`: Objective tracking, timed facility alarm (`alarm_trigger_at`), extraction zone validation, tutorial progression, autosave/restore, and Android pause/back/memory lifecycle handlers.

### 3.3 Responsive Mobile UI (`scripts/ui/`)
- `MainMenu` (`main_menu.gd`): Safe-area-aware landscape UI for Continue, Tutorial, Campaign Select (stars + best time + replay), Free Sandbox, Interactive Benchmark, Settings, and Credits/Licenses.
- `TouchHud` (`touch_hud.gd`) & `TouchJoystick` (`touch_joystick.gd`): Virtual analog stick + right-side swipe look, 3 HUD layouts (`classic`, `lefty`, `compact`), HUD scale/opacity, contextual vehicle/detonate/grab buttons, pause overlay with quick RU/EN and haptics toggles, and end-of-mission summary.

---

## 4. Renderer & Android Target Configuration
- **Renderer**: Godot Mobile (`Vulkan` primary via `rendering/renderer/rendering_method.mobile="mobile"`, automatic OpenGL ES 3 fallback `rendering/rendering_device/fallback_to_opengl3=true`).
- **Textures & Materials**: Procedural `voxel_grain.png` shared triplanar/vertex-colored material (`shared_material`), single directional sun light + sky ambient (`<= 1` shadow-casting light on Medium/High, disabled shadows on Low).
- **Android Target**: `arm64-v8a` only, Sensor Landscape (`screen_orientation = 4`), `targetSdk 36`, Godot prebuilt template `minSdk 24` (compatible with Android 8.0+ / 9.0+ devices), minimal offline permissions (no internet, ads, telemetry, or account permissions).
