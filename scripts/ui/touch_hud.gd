class_name TouchHud
extends CanvasLayer
## Safe-area responsive phone HUD, touch look zone, driving controls, tool bar, pause, and results overlays.

var _director: MissionDirector
var _safe_root: MarginContainer
var _look_zone: Control
var _joystick: TouchJoystick
var _left_controls_box: Control
var _right_controls_box: Control
var _foot_buttons_root: Control
var _drive_buttons_root: Control

var _obj_label: Label
var _alarm_label: Label
var _perf_label: Label
var _notif_label: Label
var _notif_timer: float = 0.0
var _crosshair: Control
var _hold_hint: Label

var _btn_use: Button
var _btn_grab: Button
var _btn_detonate: Button
var _btn_vehicle: Button
var _btn_reset_map: Button
var _tool_buttons: Array[Button] = []
var _tool_ammo_labels: Array[Label] = []

var _pause_overlay: PanelContainer
var _pause_settings_box: VBoxContainer
var _result_overlay: PanelContainer
var _result_title: Label
var _result_stats: Label
var _btn_next_mission: Button

var _look_finger: int = -1
var _drive_gas: bool = false
var _drive_rev: bool = false
var _drive_left: bool = false
var _drive_right: bool = false
var _ui_built: bool = false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_ui_built()


func _ensure_ui_built() -> void:
	if _ui_built:
		return
	_ui_built = true
	_build_ui()
	LocalizationManager.language_changed.connect(_on_lang_changed)
	GameState.settings_changed.connect(_apply_hud_preferences)
	_apply_safe_area()
	_apply_hud_preferences()
	_refresh_texts()


func bind_director(director: MissionDirector) -> void:
	_ensure_ui_built()
	_director = director
	_director.state_updated.connect(_on_director_updated)
	_director.mission_finished.connect(_on_mission_finished)
	_director.notification_pushed.connect(_show_notification)
	if _director.tool_manager != null:
		_director.tool_manager.tool_changed.connect(_on_tool_changed)
		_director.tool_manager.charges_changed.connect(_on_charges_changed)
	_btn_reset_map.visible = _director.is_sandbox
	_refresh_texts()
	_on_director_updated()


func show_pause_menu(visible_flag: bool) -> void:
	if _pause_overlay != null:
		_pause_overlay.visible = visible_flag
		if not visible_flag and _pause_settings_box != null:
			_pause_settings_box.visible = false


func _process(dt: float) -> void:
	if _notif_timer > 0.0:
		_notif_timer -= dt
		if _notif_timer <= 0.0 and _notif_label != null:
			_notif_label.visible = false

	if _director != null and _director.player != null and _director.player.in_vehicle:
		var v := _director.player.current_vehicle
		if v != null:
			v.throttle_input = (1.0 if _drive_gas else 0.0) - (1.0 if _drive_rev else 0.0)
			v.steer_input = (1.0 if _drive_left else 0.0) - (1.0 if _drive_right else 0.0)


func _build_ui() -> void:
	_safe_root = MarginContainer.new()
	_safe_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_safe_root.mouse_filter = Control.MOUSE_FILTER_PASS
	add_child(_safe_root)

	var play_layer := Control.new()
	play_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	play_layer.mouse_filter = Control.MOUSE_FILTER_PASS
	_safe_root.add_child(play_layer)

	# Fullscreen swipe-look catcher behind HUD buttons
	_look_zone = Control.new()
	_look_zone.set_anchors_preset(Control.PRESET_FULL_RECT)
	_look_zone.mouse_filter = Control.MOUSE_FILTER_PASS
	_look_zone.gui_input.connect(_on_look_zone_input)
	play_layer.add_child(_look_zone)

	# Crosshair dot
	_crosshair = ColorRect.new()
	_crosshair.custom_minimum_size = Vector2(8, 8)
	_crosshair.size = Vector2(8, 8)
	_crosshair.color = Color(1.0, 1.0, 1.0, 0.85)
	_crosshair.set_anchors_preset(Control.PRESET_CENTER)
	_crosshair.offset_left = -4
	_crosshair.offset_top = -4
	_crosshair.offset_right = 4
	_crosshair.offset_bottom = 4
	_crosshair.mouse_filter = Control.MOUSE_FILTER_IGNORE
	play_layer.add_child(_crosshair)

	# Top-left status card
	var top_left := PanelContainer.new()
	top_left.position = Vector2(8, 8)
	top_left.custom_minimum_size = Vector2(360, 0)
	_style_panel(top_left, Color(0.06, 0.09, 0.13, 0.78))
	play_layer.add_child(top_left)

	var tl_box := VBoxContainer.new()
	tl_box.add_theme_constant_override("separation", 4)
	top_left.add_child(tl_box)

	_obj_label = Label.new()
	_obj_label.add_theme_font_size_override("font_size", 17)
	_obj_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	tl_box.add_child(_obj_label)

	_alarm_label = Label.new()
	_alarm_label.add_theme_font_size_override("font_size", 20)
	_alarm_label.add_theme_color_override("font_color", Color(1.0, 0.35, 0.28))
	_alarm_label.visible = false
	tl_box.add_child(_alarm_label)

	_perf_label = Label.new()
	_perf_label.add_theme_font_size_override("font_size", 13)
	_perf_label.add_theme_color_override("font_color", Color(0.75, 0.86, 0.94))
	tl_box.add_child(_perf_label)

	# Top-right buttons (Reset Sandbox + Pause)
	var top_right := HBoxContainer.new()
	top_right.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	top_right.offset_left = -260
	top_right.offset_top = 8
	top_right.offset_right = -8
	top_right.offset_bottom = 64
	top_right.alignment = BoxContainer.ALIGNMENT_END
	top_right.add_theme_constant_override("separation", 10)
	play_layer.add_child(top_right)

	_btn_reset_map = Button.new()
	_btn_reset_map.custom_minimum_size = Vector2(145, 48)
	_btn_reset_map.pressed.connect(func() -> void:
		if _director != null:
			_director.restart_level()
	)
	top_right.add_child(_btn_reset_map)

	var btn_pause := Button.new()
	btn_pause.custom_minimum_size = Vector2(54, 48)
	btn_pause.icon = load("res://assets/icons/icon_pause.png")
	btn_pause.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	btn_pause.expand_icon = true
	btn_pause.pressed.connect(func() -> void:
		if _director != null:
			_director.toggle_pause()
	)
	top_right.add_child(btn_pause)

	# Center notification banner
	_notif_label = Label.new()
	_notif_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_notif_label.offset_left = -320
	_notif_label.offset_right = 320
	_notif_label.offset_top = 74
	_notif_label.offset_bottom = 128
	_notif_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_notif_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_notif_label.add_theme_font_size_override("font_size", 19)
	_notif_label.add_theme_color_override("font_color", Color(1.0, 0.88, 0.36))
	_notif_label.visible = false
	play_layer.add_child(_notif_label)

	_hold_hint = Label.new()
	_hold_hint.set_anchors_preset(Control.PRESET_CENTER)
	_hold_hint.offset_left = -220
	_hold_hint.offset_right = 220
	_hold_hint.offset_top = 34
	_hold_hint.offset_bottom = 64
	_hold_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hold_hint.add_theme_font_size_override("font_size", 15)
	_hold_hint.add_theme_color_override("font_color", Color(0.75, 0.96, 1.0))
	_hold_hint.visible = false
	play_layer.add_child(_hold_hint)

	# Left & Right control anchors (swappable for lefty layout)
	_left_controls_box = Control.new()
	_left_controls_box.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_left_controls_box.offset_left = 14
	_left_controls_box.offset_top = -230
	_left_controls_box.offset_right = 230
	_left_controls_box.offset_bottom = -14
	_left_controls_box.mouse_filter = Control.MOUSE_FILTER_PASS
	play_layer.add_child(_left_controls_box)

	_joystick = TouchJoystick.new()
	_joystick.set_anchors_preset(Control.PRESET_FULL_RECT)
	_joystick.stick_moved.connect(func(v: Vector2) -> void:
		if _director != null and _director.player != null:
			_director.player.move_input = v
	)
	_left_controls_box.add_child(_joystick)

	_right_controls_box = Control.new()
	_right_controls_box.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_right_controls_box.offset_left = -310
	_right_controls_box.offset_top = -260
	_right_controls_box.offset_right = -14
	_right_controls_box.offset_bottom = -14
	_right_controls_box.mouse_filter = Control.MOUSE_FILTER_PASS
	play_layer.add_child(_right_controls_box)

	_build_foot_buttons()
	_build_drive_buttons(play_layer)
	_build_tool_bar(play_layer)
	_build_pause_overlay()
	_build_result_overlay()


func _build_foot_buttons() -> void:
	_foot_buttons_root = Control.new()
	_foot_buttons_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_foot_buttons_root.mouse_filter = Control.MOUSE_FILTER_PASS
	_right_controls_box.add_child(_foot_buttons_root)

	_btn_use = _make_action_btn(
		"HUD_BTN_USE",
		"res://assets/icons/tool_hammer.png",
		Vector2(180, 140),
		Vector2(106, 106)
	)
	_btn_use.button_down.connect(func() -> void:
		if _director != null and _director.tool_manager != null:
			_director.tool_manager.set_primary_held(true)
	)
	_btn_use.button_up.connect(func() -> void:
		if _director != null and _director.tool_manager != null:
			_director.tool_manager.set_primary_held(false)
	)
	_foot_buttons_root.add_child(_btn_use)

	_btn_grab = _make_action_btn(
		"HUD_BTN_ALT",
		"res://assets/icons/tool_grab.png",
		Vector2(82, 162),
		Vector2(84, 84)
	)
	_btn_grab.pressed.connect(func() -> void:
		if _director != null and _director.tool_manager != null:
			_director.tool_manager.trigger_grab_or_release()
	)
	_foot_buttons_root.add_child(_btn_grab)

	var btn_jump := _make_action_btn(
		"HUD_BTN_JUMP",
		"res://assets/icons/icon_jump.png",
		Vector2(196, 52),
		Vector2(84, 78)
	)
	btn_jump.pressed.connect(func() -> void:
		if _director != null and _director.player != null:
			_director.player.request_jump()
	)
	_foot_buttons_root.add_child(btn_jump)

	var btn_crouch := _make_action_btn(
		"HUD_BTN_CROUCH",
		"res://assets/icons/icon_crouch.png",
		Vector2(100, 74),
		Vector2(80, 76)
	)
	btn_crouch.pressed.connect(func() -> void:
		if _director != null and _director.player != null:
			_director.player.toggle_crouch()
	)
	_foot_buttons_root.add_child(btn_crouch)

	_btn_detonate = _make_action_btn(
		"HUD_BTN_DETONATE",
		"res://assets/icons/icon_detonate.png",
		Vector2(0, 146),
		Vector2(76, 86)
	)
	_btn_detonate.modulate = Color(1.0, 0.45, 0.35)
	_btn_detonate.visible = false
	_btn_detonate.pressed.connect(func() -> void:
		if _director != null and _director.tool_manager != null:
			_director.tool_manager.detonate_all_charges()
	)
	_foot_buttons_root.add_child(_btn_detonate)

	_btn_vehicle = _make_action_btn(
		"HUD_BTN_VEHICLE",
		"res://assets/icons/icon_vehicle.png",
		Vector2(0, 44),
		Vector2(90, 82)
	)
	_btn_vehicle.visible = false
	_btn_vehicle.pressed.connect(func() -> void:
		if _director != null:
			_director.toggle_vehicle()
	)
	_foot_buttons_root.add_child(_btn_vehicle)


func _build_drive_buttons(parent: Control) -> void:
	_drive_buttons_root = Control.new()
	_drive_buttons_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_drive_buttons_root.mouse_filter = Control.MOUSE_FILTER_PASS
	_drive_buttons_root.visible = false
	parent.add_child(_drive_buttons_root)

	var btn_left := Button.new()
	btn_left.name = "BtnDriveLeft"
	btn_left.text = tr("HUD_BTN_LEFT")
	btn_left.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	btn_left.offset_left = 20
	btn_left.offset_top = -130
	btn_left.offset_right = 136
	btn_left.offset_bottom = -20
	btn_left.button_down.connect(func() -> void: _drive_left = true)
	btn_left.button_up.connect(func() -> void: _drive_left = false)
	_drive_buttons_root.add_child(btn_left)

	var btn_right := Button.new()
	btn_right.name = "BtnDriveRight"
	btn_right.text = tr("HUD_BTN_RIGHT")
	btn_right.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	btn_right.offset_left = 152
	btn_right.offset_top = -130
	btn_right.offset_right = 268
	btn_right.offset_bottom = -20
	btn_right.button_down.connect(func() -> void: _drive_right = true)
	btn_right.button_up.connect(func() -> void: _drive_right = false)
	_drive_buttons_root.add_child(btn_right)

	var btn_gas := Button.new()
	btn_gas.name = "BtnDriveGas"
	btn_gas.text = tr("HUD_BTN_GAS")
	btn_gas.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn_gas.offset_left = -136
	btn_gas.offset_top = -160
	btn_gas.offset_right = -20
	btn_gas.offset_bottom = -20
	btn_gas.button_down.connect(func() -> void: _drive_gas = true)
	btn_gas.button_up.connect(func() -> void: _drive_gas = false)
	_drive_buttons_root.add_child(btn_gas)

	var btn_rev := Button.new()
	btn_rev.name = "BtnDriveRev"
	btn_rev.text = tr("HUD_BTN_BRAKE")
	btn_rev.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn_rev.offset_left = -268
	btn_rev.offset_top = -130
	btn_rev.offset_right = -152
	btn_rev.offset_bottom = -20
	btn_rev.button_down.connect(func() -> void: _drive_rev = true)
	btn_rev.button_up.connect(func() -> void: _drive_rev = false)
	_drive_buttons_root.add_child(btn_rev)

	var btn_exit := Button.new()
	btn_exit.name = "BtnDriveExit"
	btn_exit.text = tr("VEHICLE_EXIT_HINT")
	btn_exit.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn_exit.offset_left = -268
	btn_exit.offset_top = -236
	btn_exit.offset_right = -20
	btn_exit.offset_bottom = -176
	btn_exit.pressed.connect(func() -> void:
		if _director != null:
			_director.toggle_vehicle()
	)
	_drive_buttons_root.add_child(btn_exit)


func _build_tool_bar(parent: Control) -> void:
	var bar_panel := PanelContainer.new()
	bar_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	bar_panel.offset_left = -265
	bar_panel.offset_right = 265
	bar_panel.offset_top = -84
	bar_panel.offset_bottom = -8
	_style_panel(bar_panel, Color(0.06, 0.09, 0.13, 0.82))
	parent.add_child(bar_panel)

	var hbox := HBoxContainer.new()
	hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	hbox.add_theme_constant_override("separation", 6)
	bar_panel.add_child(hbox)

	var icon_paths := [
		"res://assets/icons/tool_hammer.png",
		"res://assets/icons/tool_lance.png",
		"res://assets/icons/tool_charge.png",
		"res://assets/icons/tool_foam.png",
		"res://assets/icons/tool_bridge.png",
		"res://assets/icons/tool_grab.png",
	]

	for i in range(6):
		var slot := VBoxContainer.new()
		slot.custom_minimum_size = Vector2(80, 62)
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(78, 46)
		btn.icon = load(icon_paths[i])
		btn.expand_icon = true
		btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var idx := i
		btn.pressed.connect(func() -> void:
			if _director != null and _director.tool_manager != null:
				_director.tool_manager.select_tool(idx)
		)
		slot.add_child(btn)
		var lbl := Label.new()
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.add_theme_font_size_override("font_size", 11)
		slot.add_child(lbl)
		hbox.add_child(slot)
		_tool_buttons.append(btn)
		_tool_ammo_labels.append(lbl)


func _build_pause_overlay() -> void:
	_pause_overlay = PanelContainer.new()
	_pause_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_style_panel(_pause_overlay, Color(0.04, 0.06, 0.09, 0.84))
	_pause_overlay.visible = false
	add_child(_pause_overlay)

	var center := CenterContainer.new()
	_pause_overlay.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(440, 0)
	_style_panel(card, Color(0.10, 0.14, 0.20, 0.96))
	center.add_child(card)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	card.add_child(vbox)

	var title := Label.new()
	title.name = "PauseTitle"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	vbox.add_child(title)

	var b_resume := Button.new()
	b_resume.name = "BtnResume"
	b_resume.custom_minimum_size = Vector2(0, 48)
	b_resume.pressed.connect(func() -> void:
		if _director != null:
			_director.resume_game()
	)
	vbox.add_child(b_resume)

	var b_save_quit := Button.new()
	b_save_quit.name = "BtnSaveQuit"
	b_save_quit.custom_minimum_size = Vector2(0, 46)
	b_save_quit.pressed.connect(func() -> void:
		if _director != null:
			_director.save_autosave()
		get_tree().paused = false
		get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
	)
	vbox.add_child(b_save_quit)

	var b_restart := Button.new()
	b_restart.name = "BtnRestart"
	b_restart.custom_minimum_size = Vector2(0, 46)
	b_restart.pressed.connect(func() -> void:
		show_pause_menu(false)
		if _director != null:
			_director.restart_level()
	)
	vbox.add_child(b_restart)

	var b_settings := Button.new()
	b_settings.name = "BtnQuickSettings"
	b_settings.custom_minimum_size = Vector2(0, 44)
	b_settings.pressed.connect(func() -> void:
		_pause_settings_box.visible = not _pause_settings_box.visible
	)
	vbox.add_child(b_settings)

	_pause_settings_box = VBoxContainer.new()
	_pause_settings_box.visible = false
	_pause_settings_box.add_theme_constant_override("separation", 6)
	vbox.add_child(_pause_settings_box)

	var b_lang := Button.new()
	b_lang.name = "BtnSwitchLang"
	b_lang.pressed.connect(func() -> void:
		var cur := LocalizationManager.get_active_locale()
		GameState.set_setting("language", "en" if cur == "ru" else "ru")
	)
	_pause_settings_box.add_child(b_lang)

	var b_haptics := Button.new()
	b_haptics.name = "BtnToggleHaptics"
	b_haptics.pressed.connect(func() -> void:
		GameState.set_setting("haptics_enabled", not bool(GameState.settings.get("haptics_enabled", true)))
		_refresh_texts()
	)
	_pause_settings_box.add_child(b_haptics)

	var b_exit := Button.new()
	b_exit.name = "BtnExitMenu"
	b_exit.custom_minimum_size = Vector2(0, 44)
	b_exit.pressed.connect(func() -> void:
		get_tree().paused = false
		get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
	)
	vbox.add_child(b_exit)


func _build_result_overlay() -> void:
	_result_overlay = PanelContainer.new()
	_result_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_style_panel(_result_overlay, Color(0.04, 0.06, 0.09, 0.88))
	_result_overlay.visible = false
	add_child(_result_overlay)

	var center := CenterContainer.new()
	_result_overlay.add_child(center)

	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(460, 0)
	_style_panel(card, Color(0.10, 0.14, 0.20, 0.96))
	center.add_child(card)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	card.add_child(vbox)

	_result_title = Label.new()
	_result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_title.add_theme_font_size_override("font_size", 28)
	vbox.add_child(_result_title)

	_result_stats = Label.new()
	_result_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_stats.add_theme_font_size_override("font_size", 18)
	vbox.add_child(_result_stats)

	_btn_next_mission = Button.new()
	_btn_next_mission.custom_minimum_size = Vector2(0, 48)
	_btn_next_mission.pressed.connect(func() -> void:
		var next_id := LevelDefinitions.get_next_mission_id(_director.mission_id) if _director != null else ""
		if not next_id.is_empty():
			GameState.pending_launch = {"mode": "campaign", "mission_id": next_id, "resume_autosave": false}
			get_tree().paused = false
			get_tree().reload_current_scene()
	)
	vbox.add_child(_btn_next_mission)

	var b_retry := Button.new()
	b_retry.name = "BtnRetry"
	b_retry.custom_minimum_size = Vector2(0, 46)
	b_retry.pressed.connect(func() -> void:
		_result_overlay.visible = false
		if _director != null:
			_director.restart_level()
	)
	vbox.add_child(b_retry)

	var b_menu := Button.new()
	b_menu.name = "BtnMenu"
	b_menu.custom_minimum_size = Vector2(0, 46)
	b_menu.pressed.connect(func() -> void:
		get_tree().paused = false
		get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")
	)
	vbox.add_child(b_menu)


func _make_action_btn(label_key: String, icon_path: String, pos: Vector2, sz: Vector2) -> Button:
	var btn := Button.new()
	btn.position = pos
	btn.custom_minimum_size = sz
	btn.size = sz
	btn.text = tr(label_key)
	btn.icon = load(icon_path)
	btn.expand_icon = true
	btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
	btn.add_theme_font_size_override("font_size", 11)
	return btn


func _style_panel(panel: PanelContainer, col: Color) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(10)
	sb.set_content_margin_all(12)
	sb.border_color = Color(0.28, 0.36, 0.46, 0.65)
	sb.set_border_width_all(1)
	panel.add_theme_stylebox_override("panel", sb)


func _on_look_zone_input(event: InputEvent) -> void:
	if _director == null or _director.player == null:
		return
	if event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed and _look_finger == -1:
			_look_finger = st.index
		elif not st.pressed and st.index == _look_finger:
			_look_finger = -1
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		if sd.index == _look_finger:
			_director.player.add_look_delta(sd.relative.x * 0.0045, sd.relative.y * 0.0040)
	elif event is InputEventMouseMotion and (
		Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
		or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	):
		var mm := event as InputEventMouseMotion
		_director.player.add_look_delta(mm.relative.x * 0.0045, mm.relative.y * 0.0040)


func _apply_safe_area() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var safe := DisplayServer.get_display_safe_area()
	var win_size := DisplayServer.window_get_size()
	if win_size.x <= 0 or win_size.y <= 0:
		return
	var left_px := maxi(0, safe.position.x)
	var top_px := maxi(0, safe.position.y)
	var right_px := maxi(0, win_size.x - (safe.position.x + safe.size.x))
	var bottom_px := maxi(0, win_size.y - (safe.position.y + safe.size.y))
	_safe_root.add_theme_constant_override("margin_left", left_px + 6)
	_safe_root.add_theme_constant_override("margin_top", top_px + 6)
	_safe_root.add_theme_constant_override("margin_right", right_px + 6)
	_safe_root.add_theme_constant_override("margin_bottom", bottom_px + 6)


func _apply_hud_preferences() -> void:
	if GameState == null:
		return
	var sc := float(GameState.settings.get("hud_scale", 1.0))
	var op := float(GameState.settings.get("hud_opacity", 0.88))
	var layout := str(GameState.settings.get("touch_layout", "classic"))
	_left_controls_box.scale = Vector2.ONE * sc
	_right_controls_box.scale = Vector2.ONE * sc
	_left_controls_box.modulate.a = op
	_right_controls_box.modulate.a = op

	if layout == "lefty":
		_left_controls_box.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
		_left_controls_box.offset_left = -220
		_left_controls_box.offset_right = -14
		_right_controls_box.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		_right_controls_box.offset_left = 14
		_right_controls_box.offset_right = 310
	else:
		_left_controls_box.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		_left_controls_box.offset_left = 14
		_left_controls_box.offset_right = 230
		_right_controls_box.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
		_right_controls_box.offset_left = -310
		_right_controls_box.offset_right = -14

	_perf_label.visible = bool(GameState.settings.get("show_fps", true))


func _on_director_updated() -> void:
	if _director == null:
		return
	_obj_label.text = _director.get_objective_status_text()

	if _director.alarm_active:
		_alarm_label.visible = true
		_alarm_label.text = tr("HUD_ALARM_TIMER") % _director.alarm_remaining
	else:
		_alarm_label.visible = false

	if _perf_label.visible and _director.voxel_world != null:
		var fps := Engine.get_frames_per_second()
		var ms := 1000.0 / maxf(float(fps), 1.0)
		_perf_label.text = tr("HUD_FPS_FMT") % [
			fps,
			ms,
			_director.voxel_world.get_active_chunk_count(),
			_director.voxel_world.get_active_debris_body_count(),
		]

	var driving := _director.player != null and _director.player.in_vehicle
	_foot_buttons_root.visible = not driving
	_left_controls_box.visible = not driving
	_drive_buttons_root.visible = driving
	_crosshair.visible = not driving

	if not driving:
		var near_v := _director.get_nearby_vehicle()
		_btn_vehicle.visible = near_v != null
		if near_v != null:
			_btn_vehicle.text = near_v.get_display_name()

	if _director.tool_manager != null:
		_hold_hint.visible = _director.tool_manager.is_holding_object()
		_hold_hint.text = tr("HUD_HOLDING_PROP")
		_btn_detonate.visible = _director.tool_manager.get_active_charge_count() > 0
		for i in range(_tool_ammo_labels.size()):
			var short_name := tr(ToolManager.TOOL_KEYS[i])
			var ammo_s := _director.tool_manager.get_ammo_label(i)
			_tool_ammo_labels[i].text = "%s (%s)" % [short_name, ammo_s]


func _on_tool_changed(tid: int) -> void:
	for i in range(_tool_buttons.size()):
		_tool_buttons[i].modulate = Color(1.0, 0.85, 0.35) if i == tid else Color(0.82, 0.86, 0.92)


func _on_charges_changed(count: int) -> void:
	if _btn_detonate != null:
		_btn_detonate.visible = count > 0


func _on_mission_finished(victory: bool, stats: Dictionary) -> void:
	_result_overlay.visible = true
	_result_title.text = tr("RESULT_VICTORY") if victory else tr("RESULT_FAILED")
	_result_title.add_theme_color_override(
		"font_color",
		Color(0.32, 0.96, 0.56) if victory else Color(1.0, 0.36, 0.32)
	)
	var time_str := GameState.format_time(float(stats.get("elapsed", 0.0)))
	var lines := [
		tr("RESULT_TIME_FMT") % time_str,
		tr("RESULT_VOXELS_FMT") % int(stats.get("voxels_destroyed", 0)),
		tr("RESULT_FIRES_FMT") % int(stats.get("fires_extinguished", 0)),
		tr("STARS_FMT") % int(stats.get("stars", 0)),
	]
	_result_stats.text = "\n".join(lines)
	var next_id := str(stats.get("next_mission_id", ""))
	_btn_next_mission.visible = victory and not next_id.is_empty()


func _show_notification(msg: String) -> void:
	if _notif_label == null:
		return
	_notif_label.text = msg
	_notif_label.visible = true
	_notif_timer = 5.0


func _on_lang_changed(_loc: String) -> void:
	_refresh_texts()


func _refresh_texts() -> void:
	_btn_use.text = tr("HUD_BTN_USE")
	_btn_grab.text = tr("HUD_BTN_ALT")
	_btn_detonate.text = tr("HUD_BTN_DETONATE")
	_btn_reset_map.text = tr("HUD_BTN_RESET_MAP")

	var pause_title := _pause_overlay.find_child("PauseTitle", true, false) as Label
	if pause_title != null:
		pause_title.text = tr("PAUSE_TITLE")
	var map := {
		"BtnResume": "PAUSE_RESUME",
		"BtnSaveQuit": "PAUSE_SAVE_QUIT",
		"BtnRestart": "PAUSE_RESTART",
		"BtnQuickSettings": "PAUSE_SETTINGS",
		"BtnExitMenu": "PAUSE_EXIT_MENU",
		"BtnSwitchLang": "SETTINGS_LANGUAGE",
		"BtnRetry": "RESULT_RETRY",
		"BtnMenu": "RESULT_TO_MENU",
		"BtnDriveLeft": "HUD_BTN_LEFT",
		"BtnDriveRight": "HUD_BTN_RIGHT",
		"BtnDriveGas": "HUD_BTN_GAS",
		"BtnDriveRev": "HUD_BTN_BRAKE",
		"BtnDriveExit": "VEHICLE_EXIT_HINT",
	}
	for n_name in map.keys():
		var b := find_child(n_name, true, false) as Button
		if b != null:
			b.text = tr(map[n_name])
	var b_hap := find_child("BtnToggleHaptics", true, false) as Button
	if b_hap != null:
		var on_off := "ON" if bool(GameState.settings.get("haptics_enabled", true)) else "OFF"
		b_hap.text = "%s: %s" % [tr("SETTINGS_HAPTICS"), on_off]
	_btn_next_mission.text = tr("RESULT_NEXT_MISSION")
