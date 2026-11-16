extends Node
## Visual interactive 4-phase benchmark scene accessible from the Main Menu.

var _world: VoxelWorld
var _entity_root: Node3D
var _cam: Camera3D
var _status_lbl: Label
var _stats_lbl: Label
var _start_btn: Button
var _running: bool = false


func _ready() -> void:
	GameState.apply_quality_to_viewport(get_viewport())
	_setup_scene()


func _setup_scene() -> void:
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.environment.background_mode = Environment.BG_SKY
	env.environment.sky = sky
	add_child(env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45.0, -35.0, 0.0)
	sun.shadow_enabled = bool(GameState.get_quality_config().get("shadows_enabled", true))
	add_child(sun)

	_world = VoxelWorld.new()
	add_child(_world)
	_entity_root = Node3D.new()
	add_child(_entity_root)

	_cam = Camera3D.new()
	_cam.position = Vector3(26.0, 14.0, 42.0)
	_cam.look_at(Vector3(26.0, 3.0, 16.0), Vector3.UP)
	add_child(_cam)

	LevelBuilder.build_level(_world, _entity_root, "dock", "mission_1_dock", false)

	var ui := CanvasLayer.new()
	add_child(ui)

	var panel := PanelContainer.new()
	panel.position = Vector2(20, 20)
	panel.custom_minimum_size = Vector2(520, 0)
	ui.add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 8)
	panel.add_child(vbox)

	var title := Label.new()
	title.text = tr("BENCH_TITLE")
	title.add_theme_font_size_override("font_size", 24)
	vbox.add_child(title)

	var desc := Label.new()
	desc.text = tr("BENCH_DESC")
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	vbox.add_child(desc)

	_status_lbl = Label.new()
	_status_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3))
	vbox.add_child(_status_lbl)

	_stats_lbl = Label.new()
	vbox.add_child(_stats_lbl)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 10)
	vbox.add_child(hbox)

	_start_btn = Button.new()
	_start_btn.text = tr("BENCH_START")
	_start_btn.custom_minimum_size = Vector2(180, 44)
	_start_btn.pressed.connect(_on_start_pressed)
	hbox.add_child(_start_btn)

	var back_btn := Button.new()
	back_btn.text = tr("MENU_BACK")
	back_btn.custom_minimum_size = Vector2(120, 44)
	back_btn.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
	)
	hbox.add_child(back_btn)


func _on_start_pressed() -> void:
	if _running:
		return
	_running = true
	_start_btn.disabled = true
	LevelBuilder.build_level(_world, _entity_root, "dock", "mission_1_dock", false)

	var frame_times: Array[float] = []
	await _run_visual_phase("BENCH_PHASE_FLY", 60, frame_times, func(i: int) -> void:
		var ang := float(i) * 0.03
		_cam.position = Vector3(26.0 + sin(ang) * 18.0, 13.0, 26.0 + cos(ang) * 18.0)
		_cam.look_at(Vector3(26.0, 3.0, 18.0), Vector3.UP)
	)
	await _run_visual_phase("BENCH_PHASE_BREACH", 45, frame_times, func(i: int) -> void:
		if i % 4 == 0:
			_world.carve_sphere(Vector3(9.0 + float(i) * 0.35, 2.0, 6.2), 0.75, 40.0, false, true)
	)
	await _run_visual_phase("BENCH_PHASE_BLAST", 45, frame_times, func(i: int) -> void:
		if i == 3:
			_world.detonate_explosion(Vector3(36.5, 2.0, 11.5), 3.0, 120.0, true)
	)
	await _run_visual_phase("BENCH_PHASE_COLLAPSE", 60, frame_times, func(i: int) -> void:
		if i == 3:
			_world.carve_sphere(Vector3(40.25, 2.0, 23.25), 1.0, 200.0, true, true)
		elif i == 10:
			_world.carve_sphere(Vector3(43.75, 2.0, 23.25), 1.0, 200.0, true, true)
	)

	frame_times.sort()
	var sum := 0.0
	for ft in frame_times:
		sum += ft
	var avg := sum / maxf(float(frame_times.size()), 1.0)
	var p95 := frame_times[mini(frame_times.size() - 1, int(float(frame_times.size()) * 0.95))]
	var fps := 1000.0 / maxf(avg, 0.01)
	var mem_mb := float(OS.get_static_memory_usage()) / (1024.0 * 1024.0)

	_status_lbl.text = tr("BENCH_DONE")
	_stats_lbl.text = tr("BENCH_REPORT_FMT") % [
		avg,
		fps,
		p95,
		_world.get_active_chunk_count(),
		_world.total_triangles,
		_world.get_active_debris_body_count(),
		mem_mb,
	]
	_running = false
	_start_btn.disabled = false


func _run_visual_phase(key: String, frames: int, out_times: Array[float], cb: Callable) -> void:
	_status_lbl.text = tr("BENCH_RUNNING") % tr(key)
	for i in range(frames):
		var t0 := Time.get_ticks_usec()
		cb.call(i)
		await get_tree().process_frame
		var ms := float(Time.get_ticks_usec() - t0) / 1000.0
		out_times.append(ms)
