class_name MissionDirector
extends Node3D
## Orchestrates an active Tutorial, Campaign Mission, or Free Sandbox session.

signal state_updated
signal mission_finished(victory: bool, stats: Dictionary)
signal notification_pushed(text: String)

var mode: String = "campaign" # "tutorial" | "campaign" | "sandbox"
var mission_id: String = "mission_1_dock"
var location_id: String = "dock"
var is_sandbox: bool = false
var is_tutorial: bool = false

var voxel_world: VoxelWorld
var player: PlayerController
var tool_manager: ToolManager
var entity_root: Node3D
var hud: TouchHud

var objectives: Array[PhysicsProp] = []
var collected_ids: Array[String] = []
var total_objectives: int = 0
var vehicles: Array[VehicleController] = []
var evac_pos: Vector3 = Vector3.ZERO

var elapsed_time: float = 0.0
var alarm_active: bool = false
var alarm_remaining: float = 0.0
var alarm_duration: float = 0.0
var alarm_trigger_at: int = 999
var par_time: float = 120.0
var finished: bool = false

# Tutorial state (steps 1..8)
var tutorial_step: int = 1
var _tut_marker_pos: Vector3 = Vector3.ZERO
var _tut_marker_node: MeshInstance3D

var _sun_light: DirectionalLight3D
var _world_env: WorldEnvironment
var _evac_beacon: Node3D
var _evac_mat: StandardMaterial3D
var _alarm_beep_timer: float = 0.0
var _nearby_vehicle: VehicleController = null


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE
	GameState.apply_quality_to_viewport(get_viewport())
	_setup_scene_nodes()
	_launch_from_game_state()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		if not finished and not get_tree().paused:
			save_autosave()
			pause_game()
	elif what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if not finished:
			toggle_pause()
	elif what == NOTIFICATION_OS_MEMORY_WARNING:
		if voxel_world != null:
			voxel_world.max_active_debris_bodies = mini(voxel_world.max_active_debris_bodies, 8)


func _setup_scene_nodes() -> void:
	_world_env = WorldEnvironment.new()
	_world_env.environment = Environment.new()
	add_child(_world_env)

	_sun_light = DirectionalLight3D.new()
	_sun_light.rotation_degrees = Vector3(-48.0, -34.0, 0.0)
	add_child(_sun_light)

	voxel_world = VoxelWorld.new()
	add_child(voxel_world)
	voxel_world.explosion_occurred.connect(_on_explosion)

	entity_root = Node3D.new()
	entity_root.name = "EntityRoot"
	add_child(entity_root)

	player = PlayerController.new()
	player.name = "Player"
	add_child(player)

	tool_manager = ToolManager.new()
	tool_manager.name = "ToolManager"
	add_child(tool_manager)
	tool_manager.tutorial_action.connect(_on_tutorial_action)

	_evac_beacon = Node3D.new()
	_evac_beacon.name = "EvacBeacon"
	var cyl := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 1.6
	cm.bottom_radius = 1.6
	cm.height = 5.5
	cm.radial_segments = 18
	cyl.mesh = cm
	cyl.position.y = 2.75
	_evac_mat = StandardMaterial3D.new()
	_evac_mat.albedo_color = Color(0.18, 0.92, 0.45, 0.25)
	_evac_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_evac_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_evac_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	cyl.material_override = _evac_mat
	_evac_beacon.add_child(cyl)
	add_child(_evac_beacon)

	var hud_node := get_node_or_null("../TouchHud")
	if hud_node is TouchHud:
		hud = hud_node as TouchHud
		hud.bind_director(self)


func _launch_from_game_state() -> void:
	var launch: Dictionary = GameState.pending_launch
	mode = str(launch.get("mode", "campaign"))
	mission_id = str(launch.get("mission_id", "mission_1_dock"))
	location_id = str(launch.get("location_id", "dock"))
	is_sandbox = mode == "sandbox"
	is_tutorial = mode == "tutorial"

	var resume := bool(launch.get("resume_autosave", false))
	GameState.pending_launch["resume_autosave"] = false

	_start_level(resume)


func _start_level(resume_autosave: bool) -> void:
	finished = false
	elapsed_time = 0.0
	alarm_active = false
	alarm_remaining = 0.0
	collected_ids.clear()
	tutorial_step = 1

	for c in entity_root.get_children():
		c.queue_free()

	var mcfg := LevelDefinitions.get_mission_config(mission_id)
	if is_sandbox:
		alarm_duration = 0.0
		alarm_trigger_at = 999
		par_time = 999.0
	else:
		location_id = str(mcfg["location_id"])
		alarm_duration = float(mcfg["alarm_seconds"])
		alarm_trigger_at = int(mcfg["alarm_trigger_at"])
		par_time = float(mcfg["par_time"])

	_apply_environment(location_id)
	var built := LevelBuilder.build_level(voxel_world, entity_root, location_id, mission_id, true)

	player.set_in_vehicle(null)
	player.global_position = built["player_spawn"]
	player.set_look_angles(float(built.get("player_yaw", 0.0)), 0.0)
	evac_pos = built["evac_pos"]
	_evac_beacon.position = evac_pos
	_evac_beacon.visible = not is_sandbox

	objectives.clear()
	for o in built.get("objectives", []):
		if o is PhysicsProp:
			var prop := o as PhysicsProp
			prop.collected.connect(_on_objective_collected)
			objectives.append(prop)
	total_objectives = objectives.size()

	vehicles.clear()
	for v in built.get("vehicles", []):
		if v is VehicleController:
			vehicles.append(v as VehicleController)

	tool_manager.setup(player, voxel_world, entity_root, is_sandbox)
	if not is_sandbox:
		tool_manager.ammo[ToolManager.ToolId.CHARGE] = int(mcfg.get("charges", 8))
		tool_manager.ammo[ToolManager.ToolId.BRIDGE] = int(mcfg.get("bridges", 16))

	var markers: Dictionary = built.get("tutorial_markers", {})
	_tut_marker_pos = markers.get("step1", Vector3(7.0, 1.2, 9.0))
	_update_tutorial_marker()

	if resume_autosave and GameState.has_autosave():
		var res := VoxelSerializer.load_from_file(GameState.AUTOSAVE_PATH, voxel_world)
		if bool(res.get("ok", false)):
			voxel_world.rebuild_dirty_sync()
			_restore_meta_state(res.get("meta", {}))
			notification_pushed.emit(tr("NOTIF_RESUMED_AUTOSAVE"))
		else:
			notification_pushed.emit(tr("ERR_SAVE_LOAD_FAILED"))

	if is_tutorial and not resume_autosave:
		notification_pushed.emit(tr("TUT_STEP_1"))

	state_updated.emit()


func _apply_environment(loc_id: String) -> void:
	var lcfg := LevelDefinitions.get_location_config(loc_id)
	var env := _world_env.environment
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = lcfg["sky_top"]
	sm.sky_horizon_color = lcfg["sky_horizon"]
	sm.ground_bottom_color = Color(0.14, 0.16, 0.19)
	sm.ground_horizon_color = lcfg["sky_horizon"] * 0.65
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = lcfg["ambient_color"]
	env.ambient_light_energy = 0.65
	env.fog_enabled = bool(lcfg["fog_enabled"])
	env.fog_light_color = lcfg["fog_color"]
	env.fog_density = 0.0085

	var qcfg := GameState.get_quality_config()
	_sun_light.light_color = lcfg["sun_color"]
	_sun_light.light_energy = float(lcfg["sun_energy"])
	_sun_light.shadow_enabled = bool(qcfg.get("shadows_enabled", true))
	_sun_light.directional_shadow_max_distance = 75.0


func _process(dt: float) -> void:
	if finished:
		return
	elapsed_time += dt

	# Check vehicle proximity
	_nearby_vehicle = _find_nearest_vehicle(3.8)

	# Auto-collect objective cores when player or driven vehicle touches them
	if not is_sandbox:
		var pickup_pos := player.global_position
		var pickup_r := 2.8 if player.in_vehicle else 1.85
		for obj in objectives:
			if obj != null and is_instance_valid(obj) and not obj.is_collected:
				if obj.global_position.distance_to(pickup_pos) <= pickup_r:
					obj.collect()

	# Tutorial step checks
	if is_tutorial:
		_process_tutorial_checks()

	# Alarm countdown
	if alarm_active:
		alarm_remaining -= dt
		_alarm_beep_timer -= dt
		if _alarm_beep_timer <= 0.0:
			_alarm_beep_timer = 1.0 if alarm_remaining > 10.0 else 0.5
			AudioManager.play_sfx("alarm_beep", -4.0, 0.0)
		if alarm_remaining <= 0.0:
			alarm_remaining = 0.0
			finish_mission(false)
			return

	# Check Evac completion
	if not is_sandbox:
		var ready_for_evac := collected_ids.size() >= total_objectives
		if is_tutorial:
			ready_for_evac = ready_for_evac and tutorial_step >= 8
		if _evac_mat != null:
			_evac_mat.albedo_color = (
				Color(0.22, 1.0, 0.45, 0.36) if ready_for_evac else Color(0.95, 0.72, 0.16, 0.20)
			)
		if ready_for_evac and player.global_position.distance_to(evac_pos) <= 2.8:
			finish_mission(true)
			return

	# Gamepad quick bindings
	_process_gamepad_shortcuts()
	state_updated.emit()


func _process_gamepad_shortcuts() -> void:
	if Input.is_action_just_pressed("ui_cancel"):
		toggle_pause()


func _input(event: InputEvent) -> void:
	if finished:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var ke := event as InputEventKey
		match ke.keycode:
			KEY_ESCAPE:
				toggle_pause()
			KEY_1:
				tool_manager.select_tool(0)
			KEY_2:
				tool_manager.select_tool(1)
			KEY_3:
				tool_manager.select_tool(2)
			KEY_4:
				tool_manager.select_tool(3)
			KEY_5:
				tool_manager.select_tool(4)
			KEY_6:
				tool_manager.select_tool(5)
			KEY_E:
				toggle_vehicle()
			KEY_F:
				tool_manager.trigger_grab_or_release()
			KEY_G:
				tool_manager.detonate_all_charges()
			KEY_C:
				player.toggle_crouch()
	elif event is InputEventJoypadButton and event.pressed:
		var jb := event as InputEventJoypadButton
		match jb.button_index:
			JOY_BUTTON_START:
				toggle_pause()
			JOY_BUTTON_LEFT_SHOULDER:
				tool_manager.cycle_tool(-1)
			JOY_BUTTON_RIGHT_SHOULDER:
				tool_manager.cycle_tool(1)
			JOY_BUTTON_A:
				player.request_jump()
			JOY_BUTTON_B:
				player.toggle_crouch()
			JOY_BUTTON_X:
				if _nearby_vehicle != null or player.in_vehicle:
					toggle_vehicle()
				else:
					tool_manager.detonate_all_charges()
			JOY_BUTTON_Y:
				tool_manager.trigger_grab_or_release()


func toggle_vehicle() -> void:
	if player.in_vehicle and player.current_vehicle != null:
		var v := player.current_vehicle
		var exit_pos := v.get_exit_position()
		v.set_driver(false)
		player.set_in_vehicle(null)
		player.global_position = exit_pos
		AudioManager.play_sfx("ui_click", 0.0, 0.05)
	elif _nearby_vehicle != null:
		player.set_in_vehicle(_nearby_vehicle)
		_nearby_vehicle.set_driver(true)
		AudioManager.play_sfx("ui_click", 0.0, 0.05)
		if is_tutorial and tutorial_step == 7:
			_advance_tutorial(8)


func get_nearby_vehicle() -> VehicleController:
	return _nearby_vehicle


func _find_nearest_vehicle(max_dist: float) -> VehicleController:
	var best: VehicleController = null
	var best_d := max_dist
	for v in vehicles:
		if v == null or not is_instance_valid(v):
			continue
		var d := player.global_position.distance_to(v.global_position)
		if d < best_d:
			best_d = d
			best = v
	return best


func _on_objective_collected(prop: PhysicsProp) -> void:
	if not collected_ids.has(prop.objective_id):
		collected_ids.append(prop.objective_id)
	AudioManager.play_sfx("objective_pickup", 0.0, 0.04)
	if GameState != null:
		GameState.vibrate(35)
	if not is_sandbox and not alarm_active and alarm_duration > 0.0 and collected_ids.size() >= alarm_trigger_at:
		alarm_active = true
		alarm_remaining = alarm_duration
		AudioManager.play_sfx("alarm_beep", 0.0, 0.0)
		notification_pushed.emit(tr("NOTIF_ALARM_TRIGGERED"))
	state_updated.emit()


func _on_explosion(world_pos: Vector3, radius: float) -> void:
	if player != null and not player.in_vehicle:
		var d := player.global_position.distance_to(world_pos)
		if d < radius * 4.0:
			player.add_trauma(clampf(1.0 - d / (radius * 4.0), 0.1, 0.85))
	for c in entity_root.get_children():
		if c is PhysicsProp:
			var prop := c as PhysicsProp
			var d := prop.global_position.distance_to(world_pos)
			if d < radius * 1.4:
				var dir := (prop.global_position - world_pos).normalized()
				prop.apply_prop_damage(65.0 * (1.0 - d / (radius * 1.5)), dir * 18.0)


func _process_tutorial_checks() -> void:
	if tutorial_step == 1 and player.global_position.distance_to(_tut_marker_pos) <= 2.4:
		_advance_tutorial(2)
	elif tutorial_step == 5 and voxel_world.fire_sim != null and voxel_world.fire_sim.active_fires.is_empty():
		_advance_tutorial(6)


func _on_tutorial_action(action_tag: String) -> void:
	if not is_tutorial:
		return
	match tutorial_step:
		2:
			if action_tag == "hammer_break":
				_advance_tutorial(3)
		3:
			if action_tag == "lance_cut_steel":
				_advance_tutorial(4)
		4:
			if action_tag == "charge_detonated":
				_advance_tutorial(5)
		6:
			if action_tag == "bridge_placed":
				_advance_tutorial(7)


func _advance_tutorial(next_step: int) -> void:
	tutorial_step = next_step
	_update_tutorial_marker()
	AudioManager.play_sfx("objective_pickup", -4.0, 0.05)
	notification_pushed.emit(tr("TUT_STEP_%d" % clampi(tutorial_step, 1, 8)))


func _update_tutorial_marker() -> void:
	if _tut_marker_node != null:
		_tut_marker_node.visible = is_tutorial and tutorial_step == 1
	elif is_tutorial and tutorial_step == 1:
		_tut_marker_node = MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 1.2
		cm.bottom_radius = 1.2
		cm.height = 3.0
		_tut_marker_node.mesh = cm
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.2, 0.85, 1.0, 0.32)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_tut_marker_node.material_override = mat
		_tut_marker_node.position = _tut_marker_pos + Vector3(0.0, 1.5, 0.0)
		add_child(_tut_marker_node)


func finish_mission(victory: bool) -> void:
	if finished:
		return
	finished = true
	AudioManager.stop_loop()
	get_tree().paused = true

	var stars := 0
	if victory:
		AudioManager.play_sfx("mission_clear", 0.0, 0.0)
		if GameState != null:
			GameState.clear_autosave()
		if is_tutorial:
			GameState.mark_tutorial_completed()
			stars = 3
		elif not is_sandbox:
			stars = 3 if elapsed_time <= par_time else (2 if elapsed_time <= par_time * 1.45 else 1)
			GameState.record_mission_completion(mission_id, elapsed_time, stars)

	var fires_out := voxel_world.fire_sim.extinguished_total if voxel_world.fire_sim != null else 0
	mission_finished.emit(victory, {
		"elapsed": elapsed_time,
		"voxels_destroyed": voxel_world.voxels_destroyed_total,
		"fires_extinguished": fires_out,
		"stars": stars,
		"next_mission_id": LevelDefinitions.get_next_mission_id(mission_id),
	})


func pause_game() -> void:
	get_tree().paused = true
	AudioManager.stop_loop()
	if hud != null:
		hud.show_pause_menu(true)


func resume_game() -> void:
	get_tree().paused = false
	if hud != null:
		hud.show_pause_menu(false)


func toggle_pause() -> void:
	if get_tree().paused:
		resume_game()
	else:
		pause_game()


func restart_level() -> void:
	get_tree().paused = false
	_start_level(false)


func save_autosave() -> bool:
	if is_sandbox or finished:
		return false
	var pos := player.global_position
	if player.in_vehicle and player.current_vehicle != null:
		pos = player.current_vehicle.global_position + Vector3(0.0, 1.5, 0.0)
	var meta := {
		"mode": mode,
		"mission_id": mission_id,
		"location_id": location_id,
		"elapsed": elapsed_time,
		"alarm_active": alarm_active,
		"alarm_remaining": alarm_remaining,
		"collected_ids": collected_ids,
		"player_pos": [pos.x, pos.y, pos.z],
		"player_yaw": player.camera_yaw,
		"tutorial_step": tutorial_step,
		"ammo_charge": int(tool_manager.ammo.get(ToolManager.ToolId.CHARGE, 8)),
		"ammo_bridge": int(tool_manager.ammo.get(ToolManager.ToolId.BRIDGE, 16)),
	}
	return VoxelSerializer.save_to_file(GameState.AUTOSAVE_PATH, voxel_world, meta)


func _restore_meta_state(meta: Dictionary) -> void:
	elapsed_time = float(meta.get("elapsed", 0.0))
	alarm_active = bool(meta.get("alarm_active", false))
	alarm_remaining = float(meta.get("alarm_remaining", 0.0))
	tutorial_step = int(meta.get("tutorial_step", 1))
	_update_tutorial_marker()

	var p_arr: Array = meta.get("player_pos", [])
	if p_arr.size() == 3:
		player.global_position = Vector3(float(p_arr[0]), float(p_arr[1]), float(p_arr[2]))
	player.set_look_angles(float(meta.get("player_yaw", 0.0)), 0.0)

	var cids: Array = meta.get("collected_ids", [])
	for id_val in cids:
		var sid := str(id_val)
		if not collected_ids.has(sid):
			collected_ids.append(sid)
		for obj in objectives:
			if obj != null and is_instance_valid(obj) and obj.objective_id == sid:
				obj.is_collected = true
				obj.queue_free()

	tool_manager.ammo[ToolManager.ToolId.CHARGE] = int(meta.get("ammo_charge", 8))
	tool_manager.ammo[ToolManager.ToolId.BRIDGE] = int(meta.get("ammo_bridge", 16))


func get_objective_status_text() -> String:
	if is_sandbox:
		return tr("HUD_SANDBOX_MODE")
	if is_tutorial:
		return tr("TUT_STEP_%d" % clampi(tutorial_step, 1, 8))
	if collected_ids.size() >= total_objectives:
		return tr("HUD_OBJ_EVAC")
	return tr("HUD_OBJ_COLLECTED") % [collected_ids.size(), total_objectives]
