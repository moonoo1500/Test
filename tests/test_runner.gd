extends SceneTree
## Headless automated test suite for «Контур Слома» (Fracture Line).

var _passed: int = 0
var _failed: int = 0


func _initialize() -> void:
	print("=== Fracture Line Headless Test Suite ===")
	call_deferred("_run_all_tests")


func _assert_true(cond: bool, msg: String) -> void:
	if cond:
		_passed += 1
		print("[PASS] ", msg)
	else:
		_failed += 1
		push_error("[FAIL] " + msg)
		print("[FAIL] ", msg)


func _run_all_tests() -> void:
	_test_localization()
	_test_settings_and_progress_persistence()
	_test_greedy_mesher_winding_and_colliders()
	await _test_chunk_boundary_operations()
	await _test_structural_collapse_and_detachment()
	await _test_fire_and_cryo_extinguish()
	await _test_serializer_round_trip()
	await _test_all_levels_and_missions()
	await _test_gameplay_integration_and_autosave()
	await _test_gameplay_and_benchmark_smoke()

	print("=== Test Summary: %d passed, %d failed ===" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


func _test_localization() -> void:
	var loc := root.get_node_or_null("LocalizationManager")
	_assert_true(loc != null, "LocalizationManager autoload present")
	if loc == null:
		return
	var parity: Dictionary = loc.verify_parity()
	_assert_true(bool(parity.get("ok", false)), "RU/EN localization keys match 100%")
	_assert_true(int(parity.get("ru_count", 0)) >= 120, "Localization has full key catalog")

	loc.apply_language_preference("ru")
	_assert_true(TranslationServer.translate("GAME_TITLE") == "КОНТУР СЛОМА", "RU translation works")
	loc.apply_language_preference("en")
	_assert_true(TranslationServer.translate("GAME_TITLE") == "FRACTURE LINE", "EN fallback works")
	loc.apply_language_preference("ru")


func _test_settings_and_progress_persistence() -> void:
	var gs := root.get_node_or_null("GameState")
	_assert_true(gs != null, "GameState autoload present")
	if gs == null:
		return
	gs.custom_settings_path = "user://test_settings.cfg"
	gs.custom_progress_path = "user://test_progress.json"
	gs.set_setting("camera_sensitivity", 1.75)
	gs.set_setting("invert_y", true)
	gs.set_setting("haptics_enabled", false)
	gs.set_setting("quality_profile", "low")

	gs.settings["camera_sensitivity"] = 0.5
	gs.settings["invert_y"] = false
	gs.load_settings()
	_assert_true(is_equal_approx(float(gs.settings["camera_sensitivity"]), 1.75), "Settings camera_sensitivity persisted")
	_assert_true(bool(gs.settings["invert_y"]) == true, "Settings invert_y persisted")
	_assert_true(gs.resolved_quality == "low", "Quality profile resolved cleanly")

	gs.reset_progress()
	gs.mark_tutorial_completed()
	gs.record_mission_completion("mission_1_dock", 42.5, 3)
	gs.progress = {}
	gs.load_progress()
	_assert_true(bool(gs.progress.get("tutorial_completed", false)), "Tutorial completion persisted")
	var m1: Dictionary = gs.get_mission_record("mission_1_dock")
	_assert_true(int(m1.get("stars", 0)) == 3, "Mission stars persisted")
	_assert_true(is_equal_approx(float(m1.get("best_time", 0.0)), 42.5), "Mission best time persisted")

	gs.custom_settings_path = ""
	gs.custom_progress_path = ""


func _test_greedy_mesher_winding_and_colliders() -> void:
	var padded := PackedByteArray()
	padded.resize(VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE)
	padded[VoxelMesher.padded_index(4, 4, 4)] = VoxelMaterials.Id.BRICK
	var geom := VoxelMesher.build_chunk_geometry(padded)
	var verts: PackedVector3Array = geom["verts"]
	var norms: PackedVector3Array = geom["norms"]
	var indices: PackedInt32Array = geom["indices"]
	_assert_true(indices.size() == 36, "Single voxel produces exactly 12 triangles (36 indices)")

	var all_winding_ok := true
	for ti in range(0, indices.size(), 3):
		var v0 := verts[indices[ti]]
		var v1 := verts[indices[ti + 1]]
		var v2 := verts[indices[ti + 2]]
		var n := norms[indices[ti]]
		var computed_n := (v2 - v0).cross(v1 - v0).normalized()
		if computed_n.dot(n) < 0.99:
			all_winding_ok = false
			break
	_assert_true(all_winding_ok, "All 6 voxel faces obey Godot CW front-face winding")

	var solid_padded := PackedByteArray()
	solid_padded.resize(VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE)
	var solid_core := PackedByteArray()
	solid_core.resize(VoxelChunk.VOLUME)
	solid_core.fill(VoxelMaterials.Id.CONCRETE)
	for y in range(1, 17):
		for z in range(1, 17):
			for x in range(1, 17):
				solid_padded[VoxelMesher.padded_index(x, y, z)] = VoxelMaterials.Id.CONCRETE
	var solid_geom := VoxelMesher.build_chunk_geometry(solid_padded)
	var solid_boxes := VoxelMesher.build_greedy_boxes(solid_core)
	_assert_true(solid_geom["indices"].size() == 36, "Solid 16x16x16 chunk greedy-meshes to 12 triangles")
	_assert_true(solid_boxes.size() == 1, "Solid 16x16x16 chunk merges into exactly 1 BoxShape3D")


func _test_chunk_boundary_operations() -> void:
	var world := VoxelWorld.new()
	root.add_child(world)
	await process_frame

	world.fill_box(Vector3i(12, 0, 4), Vector3i(20, 4, 4), VoxelMaterials.Id.BRICK)
	world.rebuild_dirty_sync()
	_assert_true(world.get_active_chunk_count() == 2, "Cross-boundary wall creates exactly 2 chunks")
	var tris_before := world.total_triangles

	world.damage_voxel(Vector3i(15, 2, 4), 100.0, false, false)
	world.rebuild_dirty_sync()
	_assert_true(world.get_voxel(Vector3i(15, 2, 4)) == 0, "Boundary voxel x=15 destroyed")
	_assert_true(world.get_voxel(Vector3i(16, 2, 4)) == VoxelMaterials.Id.BRICK, "Adjacent chunk voxel x=16 intact")
	_assert_true(world.total_triangles > tris_before, "Neighbor chunk exposed internal face cleanly across boundary")

	var rc := world.raycast(Vector3(8.25, 1.25, 0.0), Vector3(0.0, 0.0, 1.0), 10.0)
	_assert_true(bool(rc.get("hit", false)), "DDA raycast hits voxel wall across chunk boundary")
	_assert_true(rc.get("cell", Vector3i.ZERO) == Vector3i(16, 2, 4), "DDA raycast returns exact cell (16,2,4)")

	world.queue_free()
	await process_frame


func _test_structural_collapse_and_detachment() -> void:
	var world := VoxelWorld.new()
	root.add_child(world)
	await process_frame

	world.fill_box(Vector3i(0, 0, 0), Vector3i(12, 1, 8), VoxelMaterials.Id.BEDROCK)
	world.fill_box(Vector3i(2, 2, 4), Vector3i(2, 5, 4), VoxelMaterials.Id.BRICK)
	world.fill_box(Vector3i(8, 2, 4), Vector3i(8, 5, 4), VoxelMaterials.Id.BRICK)
	world.fill_box(Vector3i(2, 6, 3), Vector3i(8, 7, 5), VoxelMaterials.Id.CONCRETE)
	world.rebuild_dirty_sync()

	world.damage_voxel(Vector3i(2, 2, 4), 100.0, false, true)
	world.rebuild_dirty_sync()
	_assert_true(
		world.get_voxel(Vector3i(5, 6, 4)) == VoxelMaterials.Id.CONCRETE,
		"Bridge stays anchored while 1 pillar remains"
	)

	world.damage_voxel(Vector3i(8, 2, 4), 100.0, false, true)
	world.rebuild_dirty_sync()
	_assert_true(
		world.get_voxel(Vector3i(5, 6, 4)) == 0,
		"Severed bridge slab removed from static voxel world"
	)
	_assert_true(
		world.get_active_debris_body_count() >= 1,
		"Detached RigidBody3D spawned for severed structure"
	)

	world.queue_free()
	await process_frame


func _test_fire_and_cryo_extinguish() -> void:
	var world := VoxelWorld.new()
	root.add_child(world)
	await process_frame

	world.fill_box(Vector3i(2, 2, 2), Vector3i(6, 3, 4), VoxelMaterials.Id.WOOD)
	world.rebuild_dirty_sync()

	var ignited := world.fire_sim.ignite_sphere(world.cell_to_world_center(Vector3i(4, 2, 3)), 1.2, world)
	_assert_true(ignited >= 1, "Wood voxels ignite cleanly")
	_assert_true(world.fire_sim.active_fires.size() >= 1, "Fire simulation tracks active burning cells")

	var ext := world.fire_sim.extinguish_sphere(world.cell_to_world_center(Vector3i(4, 2, 3)), 3.0)
	_assert_true(ext == ignited, "Cryo-Foam extinguishes all fires in radius")
	_assert_true(world.fire_sim.active_fires.is_empty(), "Active fires cleared after extinguishing")

	world.queue_free()
	await process_frame


func _test_serializer_round_trip() -> void:
	var world := VoxelWorld.new()
	root.add_child(world)
	await process_frame

	world.fill_box(Vector3i(0, 0, 0), Vector3i(15, 1, 15), VoxelMaterials.Id.BEDROCK)
	world.fill_box(Vector3i(3, 2, 3), Vector3i(6, 5, 6), VoxelMaterials.Id.BRICK)
	world.set_voxel(Vector3i(4, 3, 4), VoxelMaterials.Id.WOOD)
	world.fire_sim.ignite_cell(Vector3i(4, 3, 4), world)
	world.rebuild_dirty_sync()

	var save_path := "user://test_world_roundtrip.flsv"
	var meta_in := {"mission_id": "mission_1_dock", "elapsed": 18.25, "alarm": true}
	var saved_ok := VoxelSerializer.save_to_file(save_path, world, meta_in)
	_assert_true(saved_ok, "FLSV save_to_file succeeded")

	world.clear_world()
	_assert_true(world.get_voxel(Vector3i(4, 3, 4)) == 0, "World cleared before deserialize")

	var res := VoxelSerializer.load_from_file(save_path, world)
	world.rebuild_dirty_sync()
	_assert_true(bool(res.get("ok", false)), "FLSV load_from_file succeeded")
	_assert_true(world.get_voxel(Vector3i(3, 2, 3)) == VoxelMaterials.Id.BRICK, "Brick voxel restored from FLSV")
	_assert_true(world.get_voxel(Vector3i(4, 3, 4)) == VoxelMaterials.Id.WOOD, "Wood voxel restored from FLSV")
	_assert_true(world.fire_sim.active_fires.has(Vector3i(4, 3, 4)), "Active fire cell restored from FLSV")
	_assert_true(str(res.get("meta", {}).get("mission_id", "")) == "mission_1_dock", "Meta state restored from FLSV")

	world.queue_free()
	await process_frame


func _test_all_levels_and_missions() -> void:
	var world := VoxelWorld.new()
	var eroot := Node3D.new()
	root.add_child(world)
	root.add_child(eroot)
	await process_frame

	var cases := [
		["training_yard", "tutorial", 1, 1],
		["dock", "mission_1_dock", 3, 1],
		["dock", "mission_2_mooring", 4, 1],
		["quarry", "mission_3_quarry", 4, 1],
		["cryo", "mission_4_cryo", 5, 2],
	]
	for c in cases:
		for child in eroot.get_children():
			child.queue_free()
		var built := LevelBuilder.build_level(world, eroot, c[0], c[1], true)
		_assert_true(built["objectives"].size() == int(c[2]), "Level %s spawns %d objectives" % [c[1], int(c[2])])
		_assert_true(built["vehicles"].size() == int(c[3]), "Level %s spawns %d vehicle(s)" % [c[1], int(c[3])])
		_assert_true(world.get_active_chunk_count() >= 4, "Level %s built chunks cleanly" % c[1])

	# Bridge placement test
	var placed := world.place_bridge_span(Vector3(10.0, 3.0, 10.0), Vector3(14.0, 3.0, 10.0), 2)
	_assert_true(placed >= 8, "Span-X places bridge voxels cleanly")

	eroot.queue_free()
	world.queue_free()
	await process_frame


func _test_gameplay_integration_and_autosave() -> void:
	var gs := root.get_node_or_null("GameState")
	_assert_true(gs != null, "GameState available for integration test")
	if gs == null:
		return
	gs.clear_autosave()
	gs.pending_launch = {
		"mode": "campaign",
		"mission_id": "mission_1_dock",
		"location_id": "dock",
		"resume_autosave": false,
	}
	var packed: PackedScene = load("res://scenes/GamePlay.tscn")
	var gp := packed.instantiate()
	root.add_child(gp)
	await process_frame
	await process_frame

	var director := gp.get_node_or_null("MissionDirector") as MissionDirector
	_assert_true(director != null, "MissionDirector instantiated inside GamePlay.tscn")
	if director != null:
		_assert_true(director.objectives.size() == 3, "Mission 1 loaded 3 objectives")
		_assert_true(director.vehicles.size() == 1, "Mission 1 loaded Burlak-2 vehicle")

		# Test tool cycling 0..5 & seismic charge detonation
		director.tool_manager.select_tool(ToolManager.ToolId.CHARGE)
		var pre_charges := int(director.tool_manager.ammo[ToolManager.ToolId.CHARGE])
		director.tool_manager.set_primary_held(true)
		director.tool_manager.set_primary_held(false)
		await process_frame
		_assert_true(
			int(director.tool_manager.ammo[ToolManager.ToolId.CHARGE]) == pre_charges - 1,
			"Seismic charge consumed ammo on throw"
		)
		var det_count := director.tool_manager.detonate_all_charges()
		_assert_true(det_count == 1, "Seismic charge detonated remotely")

		# Test autosave + restore flow
		director.elapsed_time = 27.5
		var saved := director.save_autosave()
		_assert_true(saved and gs.has_autosave(), "Gameplay autosave written cleanly")

	gp.queue_free()
	await process_frame

	# Re-launch with resume_autosave = true
	gs.pending_launch = {
		"mode": "campaign",
		"mission_id": "mission_1_dock",
		"location_id": "dock",
		"resume_autosave": true,
	}
	var gp2 := packed.instantiate()
	root.add_child(gp2)
	await process_frame
	await process_frame
	var director2 := gp2.get_node_or_null("MissionDirector") as MissionDirector
	_assert_true(
		director2 != null and director2.elapsed_time >= 27.5 and director2.elapsed_time < 29.0,
		"MissionDirector restored elapsed_time from autosave"
	)
	gs.clear_autosave()
	gp2.queue_free()
	await process_frame


func _test_gameplay_and_benchmark_smoke() -> void:
	for path in ["res://scenes/MainMenu.tscn", "res://scenes/GamePlay.tscn", "res://scenes/Benchmark.tscn"]:
		var packed: PackedScene = load(path)
		_assert_true(packed != null, "Scene loads: " + path)
		if packed != null:
			var inst := packed.instantiate()
			_assert_true(inst != null, "Scene instantiates: " + path)
			root.add_child(inst)
			await process_frame
			_assert_true(inst.is_inside_tree(), "Scene runs inside SceneTree: " + path)
			inst.queue_free()
			await process_frame
