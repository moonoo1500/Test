extends Control
## Responsive safe-area Main Menu with Continue, Tutorial, Campaign, Sandbox, Settings, Benchmark, and Credits.

var _safe_margin: MarginContainer
var _main_page: Control
var _campaign_page: Control
var _sandbox_page: Control
var _settings_page: Control
var _credits_page: Control

var _title_lbl: Label
var _sub_lbl: Label
var _ver_lbl: Label
var _btn_continue: Button
var _btn_tutorial: Button
var _btn_campaign: Button
var _btn_sandbox: Button
var _btn_benchmark: Button
var _btn_settings: Button
var _btn_credits: Button

var _campaign_list: VBoxContainer
var _sandbox_list: VBoxContainer
var _settings_box: VBoxContainer
var _credits_title: Label
var _credits_body: Label


func _ready() -> void:
	AppServices.apply_quality(get_viewport())
	var loc := AppServices.loc()
	if loc != null:
		loc.language_changed.connect(_on_lang_changed)
	_build_menu_ui()
	_apply_safe_area()
	_refresh_all()
	_show_page(_main_page)


func _build_menu_ui() -> void:
	var bg := ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = Color(0.075, 0.098, 0.133)
	add_child(bg)

	_safe_margin = MarginContainer.new()
	_safe_margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_safe_margin)

	var root_box := VBoxContainer.new()
	root_box.add_theme_constant_override("separation", 12)
	_safe_margin.add_child(root_box)

	# Header
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	root_box.add_child(header)

	var icon_rect := TextureRect.new()
	icon_rect.custom_minimum_size = Vector2(68, 68)
	icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon_rect.texture = load("res://assets/icons/app_icon.png")
	header.add_child(icon_rect)

	var title_col := VBoxContainer.new()
	title_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_col)

	_title_lbl = Label.new()
	_title_lbl.add_theme_font_size_override("font_size", 32)
	_title_lbl.add_theme_color_override("font_color", Color(0.98, 0.72, 0.24))
	title_col.add_child(_title_lbl)

	_sub_lbl = Label.new()
	_sub_lbl.add_theme_font_size_override("font_size", 15)
	_sub_lbl.add_theme_color_override("font_color", Color(0.76, 0.84, 0.92))
	title_col.add_child(_sub_lbl)

	_ver_lbl = Label.new()
	_ver_lbl.add_theme_font_size_override("font_size", 14)
	_ver_lbl.add_theme_color_override("font_color", Color(0.56, 0.66, 0.76))
	header.add_child(_ver_lbl)

	# Content stack
	var stack := PanelContainer.new()
	stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_style_card(stack)
	root_box.add_child(stack)

	_main_page = _build_main_page()
	_campaign_page = _build_list_page("MISSION_SELECT_TITLE", true)
	_sandbox_page = _build_list_page("SANDBOX_SELECT_TITLE", false)
	_settings_page = _build_settings_page()
	_credits_page = _build_credits_page()

	for p in [_main_page, _campaign_page, _sandbox_page, _settings_page, _credits_page]:
		stack.add_child(p)


func _build_main_page() -> Control:
	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 20)

	var col_left := VBoxContainer.new()
	col_left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col_left.add_theme_constant_override("separation", 10)
	hbox.add_child(col_left)

	_btn_continue = _menu_btn(func() -> void:
		var gs := AppServices.game_state()
		if gs != null:
			gs.pending_launch = {"mode": "campaign", "mission_id": "mission_1_dock", "resume_autosave": true}
		get_tree().change_scene_to_file("res://scenes/GamePlay.tscn")
	)
	_btn_tutorial = _menu_btn(func() -> void:
		var gs := AppServices.game_state()
		if gs != null:
			gs.pending_launch = {
				"mode": "tutorial",
				"mission_id": "tutorial",
				"location_id": "training_yard",
				"resume_autosave": false,
			}
		get_tree().change_scene_to_file("res://scenes/GamePlay.tscn")
	)
	_btn_campaign = _menu_btn(func() -> void:
		_populate_campaign()
		_show_page(_campaign_page)
	)
	_btn_sandbox = _menu_btn(func() -> void:
		_populate_sandbox()
		_show_page(_sandbox_page)
	)
	col_left.add_child(_btn_continue)
	col_left.add_child(_btn_tutorial)
	col_left.add_child(_btn_campaign)
	col_left.add_child(_btn_sandbox)

	var col_right := VBoxContainer.new()
	col_right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	col_right.add_theme_constant_override("separation", 10)
	hbox.add_child(col_right)

	_btn_benchmark = _menu_btn(func() -> void:
		get_tree().change_scene_to_file("res://scenes/Benchmark.tscn")
	)
	_btn_settings = _menu_btn(func() -> void:
		_populate_settings()
		_show_page(_settings_page)
	)
	_btn_credits = _menu_btn(func() -> void:
		_show_page(_credits_page)
	)
	col_right.add_child(_btn_benchmark)
	col_right.add_child(_btn_settings)
	col_right.add_child(_btn_credits)

	return hbox


func _build_list_page(title_key: String, is_campaign: bool) -> Control:
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)

	var top := HBoxContainer.new()
	var back := Button.new()
	back.name = "BackBtn"
	back.custom_minimum_size = Vector2(120, 44)
	back.pressed.connect(func() -> void: _show_page(_main_page))
	top.add_child(back)

	var title := Label.new()
	title.name = title_key
	title.add_theme_font_size_override("font_size", 24)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	vbox.add_child(top)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(scroll)

	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 10)
	scroll.add_child(list)

	if is_campaign:
		_campaign_list = list
	else:
		_sandbox_list = list

	return vbox


func _build_settings_page() -> Control:
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)

	var top := HBoxContainer.new()
	var back := Button.new()
	back.name = "BackBtn"
	back.custom_minimum_size = Vector2(120, 44)
	back.pressed.connect(func() -> void: _show_page(_main_page))
	top.add_child(back)

	var title := Label.new()
	title.name = "SETTINGS_TITLE"
	title.add_theme_font_size_override("font_size", 24)
	top.add_child(title)
	vbox.add_child(top)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(scroll)

	_settings_box = VBoxContainer.new()
	_settings_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_settings_box.add_theme_constant_override("separation", 10)
	scroll.add_child(_settings_box)
	return vbox


func _build_credits_page() -> Control:
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)

	var top := HBoxContainer.new()
	var back := Button.new()
	back.name = "BackBtn"
	back.custom_minimum_size = Vector2(120, 44)
	back.pressed.connect(func() -> void: _show_page(_main_page))
	top.add_child(back)

	_credits_title = Label.new()
	_credits_title.add_theme_font_size_override("font_size", 24)
	top.add_child(_credits_title)
	vbox.add_child(top)

	_credits_body = Label.new()
	_credits_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_credits_body.add_theme_font_size_override("font_size", 17)
	vbox.add_child(_credits_body)
	return vbox


func _populate_campaign() -> void:
	for c in _campaign_list.get_children():
		c.queue_free()

	var gs := AppServices.game_state()
	for m in LevelDefinitions.CAMPAIGN_MISSIONS:
		var mid: String = m["id"]
		var loc := LevelDefinitions.get_location_config(m["location_id"])
		var rec: Dictionary = gs.get_mission_record(mid) if gs != null else {}
		var completed := bool(rec.get("completed", false))

		var card := PanelContainer.new()
		_style_card(card, Color(0.11, 0.16, 0.22, 0.95))
		_campaign_list.add_child(card)

		var hbox := HBoxContainer.new()
		hbox.add_theme_constant_override("separation", 14)
		card.add_child(hbox)

		var info := VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hbox.add_child(info)

		var t := Label.new()
		t.text = "%s  [%s]" % [tr(m["title_key"]), tr(loc["name_key"])]
		t.add_theme_font_size_override("font_size", 20)
		info.add_child(t)

		var d := Label.new()
		d.text = tr(m["brief_key"])
		d.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d.add_theme_font_size_override("font_size", 14)
		d.add_theme_color_override("font_color", Color(0.78, 0.84, 0.90))
		info.add_child(d)

		var meta := Label.new()
		if completed:
			var bt: String = gs.format_time(float(rec.get("best_time", 0.0))) if gs != null else "00:00"
			meta.text = "%s | %s | %s" % [
				tr("STATUS_COMPLETED"),
				tr("BEST_TIME_FMT") % bt,
				tr("STARS_FMT") % int(rec.get("stars", 1)),
			]
			meta.add_theme_color_override("font_color", Color(0.40, 0.92, 0.56))
		else:
			meta.text = "%s | %s" % [tr("STATUS_NOT_COMPLETED"), tr("NO_RECORD")]
			meta.add_theme_color_override("font_color", Color(0.90, 0.72, 0.36))
		info.add_child(meta)

		var play_btn := Button.new()
		play_btn.text = tr("MENU_REPLAY") if completed else tr("MENU_PLAY")
		play_btn.custom_minimum_size = Vector2(140, 54)
		play_btn.pressed.connect(func() -> void:
			AppServices.play_sfx("ui_click")
			var g := AppServices.game_state()
			if g != null:
				g.pending_launch = {
					"mode": "campaign",
					"mission_id": mid,
					"location_id": m["location_id"],
					"resume_autosave": false,
				}
			get_tree().change_scene_to_file("res://scenes/GamePlay.tscn")
		)
		hbox.add_child(play_btn)


func _populate_sandbox() -> void:
	for c in _sandbox_list.get_children():
		c.queue_free()

	var banner := Label.new()
	banner.text = tr("SANDBOX_DESC_BANNER")
	banner.add_theme_color_override("font_color", Color(0.45, 0.88, 0.98))
	_sandbox_list.add_child(banner)

	for loc_id in LevelDefinitions.SANDBOX_LOCATIONS:
		var loc := LevelDefinitions.get_location_config(loc_id)
		var card := PanelContainer.new()
		_style_card(card, Color(0.11, 0.16, 0.22, 0.95))
		_sandbox_list.add_child(card)

		var hbox := HBoxContainer.new()
		card.add_child(hbox)

		var info := VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hbox.add_child(info)

		var t := Label.new()
		t.text = tr(loc["name_key"])
		t.add_theme_font_size_override("font_size", 20)
		info.add_child(t)

		var d := Label.new()
		d.text = tr(loc["desc_key"])
		d.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		d.add_theme_font_size_override("font_size", 14)
		info.add_child(d)

		var btn := Button.new()
		btn.text = tr("MENU_PLAY")
		btn.custom_minimum_size = Vector2(140, 50)
		var lid: String = loc_id
		btn.pressed.connect(func() -> void:
			AppServices.play_sfx("ui_click")
			var g := AppServices.game_state()
			if g != null:
				g.pending_launch = {
					"mode": "sandbox",
					"mission_id": "sandbox_" + lid,
					"location_id": lid,
					"resume_autosave": false,
				}
			get_tree().change_scene_to_file("res://scenes/GamePlay.tscn")
		)
		hbox.add_child(btn)


func _populate_settings() -> void:
	for c in _settings_box.get_children():
		c.queue_free()

	var gs := AppServices.game_state()
	var loc := AppServices.loc()
	var active_loc: String = loc.get_active_locale() if loc != null else "ru"

	# Language switcher
	_add_option_row(tr("SETTINGS_LANGUAGE"), [
		{"label": tr("SETTINGS_LANG_RU"), "val": "ru"},
		{"label": tr("SETTINGS_LANG_EN"), "val": "en"},
	], active_loc, func(v: String) -> void:
		var g := AppServices.game_state()
		if g != null:
			g.set_setting("language", v)
		_populate_settings()
	)

	# Quality profile
	var cur_q := str(gs.settings.get("quality_profile", "auto")) if gs != null else "auto"
	var res_q: String = str(gs.resolved_quality) if gs != null else "medium"
	_add_option_row(tr("SETTINGS_QUALITY"), [
		{"label": tr("SETTINGS_QUALITY_AUTO") % res_q.to_upper(), "val": "auto"},
		{"label": tr("SETTINGS_QUALITY_LOW"), "val": "low"},
		{"label": tr("SETTINGS_QUALITY_MEDIUM"), "val": "medium"},
		{"label": tr("SETTINGS_QUALITY_HIGH"), "val": "high"},
	], cur_q, func(v: String) -> void:
		var g := AppServices.game_state()
		if g != null:
			g.set_setting("quality_profile", v)
			g.apply_quality_to_viewport(get_viewport())
		_populate_settings()
	)

	# Touch layout
	var cur_l := str(gs.settings.get("touch_layout", "classic")) if gs != null else "classic"
	_add_option_row(tr("SETTINGS_LAYOUT"), [
		{"label": tr("SETTINGS_LAYOUT_CLASSIC"), "val": "classic"},
		{"label": tr("SETTINGS_LAYOUT_LEFTY"), "val": "lefty"},
		{"label": tr("SETTINGS_LAYOUT_COMPACT"), "val": "compact"},
	], cur_l, func(v: String) -> void:
		var g := AppServices.game_state()
		if g != null:
			g.set_setting("touch_layout", v)
		_populate_settings()
	)

	# Sliders
	_add_slider_row(tr("SETTINGS_SENSITIVITY"), "camera_sensitivity", 0.4, 2.4, 0.1)
	_add_slider_row(tr("SETTINGS_HUD_SCALE"), "hud_scale", 0.75, 1.35, 0.05)
	_add_slider_row(tr("SETTINGS_HUD_OPACITY"), "hud_opacity", 0.4, 1.0, 0.05)
	_add_slider_row(tr("SETTINGS_SFX_VOL"), "sfx_volume", 0.0, 1.0, 0.05)

	# Toggles
	_add_toggle_row(tr("SETTINGS_INVERT_Y"), "invert_y")
	_add_toggle_row(tr("SETTINGS_HAPTICS"), "haptics_enabled")
	_add_toggle_row(tr("SETTINGS_SHOW_PERF"), "show_fps")

	# Reset progress
	var rst := Button.new()
	rst.text = tr("SETTINGS_RESET_PROGRESS")
	rst.custom_minimum_size = Vector2(260, 44)
	rst.pressed.connect(func() -> void:
		var g := AppServices.game_state()
		if g != null:
			g.reset_progress()
		_refresh_all()
	)
	_settings_box.add_child(rst)


func _add_option_row(label_text: String, items: Array, current: String, cb: Callable) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var lbl := Label.new()
	lbl.text = label_text
	lbl.custom_minimum_size = Vector2(230, 0)
	row.add_child(lbl)
	for it in items:
		var b := Button.new()
		b.text = it["label"]
		b.toggle_mode = true
		b.button_pressed = (it["val"] == current)
		var val: String = it["val"]
		b.pressed.connect(func() -> void: cb.call(val))
		row.add_child(b)
	_settings_box.add_child(row)


func _add_slider_row(label_text: String, key: String, min_v: float, max_v: float, step_v: float) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var lbl := Label.new()
	lbl.text = label_text
	lbl.custom_minimum_size = Vector2(230, 0)
	row.add_child(lbl)
	var slider := HSlider.new()
	slider.min_value = min_v
	slider.max_value = max_v
	slider.step = step_v
	slider.value = float(AppServices.settings().get(key, 1.0))
	slider.custom_minimum_size = Vector2(260, 32)
	var val_lbl := Label.new()
	val_lbl.text = "%.2f" % slider.value
	slider.value_changed.connect(func(v: float) -> void:
		val_lbl.text = "%.2f" % v
		var g := AppServices.game_state()
		if g != null:
			g.set_setting(key, v)
	)
	row.add_child(slider)
	row.add_child(val_lbl)
	_settings_box.add_child(row)


func _add_toggle_row(label_text: String, key: String) -> void:
	var cb := CheckButton.new()
	cb.text = label_text
	cb.button_pressed = bool(AppServices.settings().get(key, false))
	cb.toggled.connect(func(on: bool) -> void:
		var g := AppServices.game_state()
		if g != null:
			g.set_setting(key, on)
	)
	_settings_box.add_child(cb)


func _menu_btn(cb: Callable) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 56)
	b.add_theme_font_size_override("font_size", 20)
	b.pressed.connect(func() -> void:
		AppServices.play_sfx("ui_click")
		cb.call()
	)
	return b


func _style_card(panel: PanelContainer, col: Color = Color(0.09, 0.13, 0.18, 0.92)) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = col
	sb.set_corner_radius_all(12)
	sb.set_content_margin_all(16)
	sb.border_color = Color(0.24, 0.32, 0.42, 0.7)
	sb.set_border_width_all(1)
	panel.add_theme_stylebox_override("panel", sb)


func _show_page(page: Control) -> void:
	for p in [_main_page, _campaign_page, _sandbox_page, _settings_page, _credits_page]:
		p.visible = (p == page)


func _apply_safe_area() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var safe := DisplayServer.get_display_safe_area()
	var win := DisplayServer.window_get_size()
	var ml := maxi(16, safe.position.x + 16)
	var mt := maxi(14, safe.position.y + 14)
	var mr := maxi(16, (win.x - (safe.position.x + safe.size.x)) + 16 if win.x > 0 else 16)
	var mb := maxi(14, (win.y - (safe.position.y + safe.size.y)) + 14 if win.y > 0 else 14)
	_safe_margin.add_theme_constant_override("margin_left", ml)
	_safe_margin.add_theme_constant_override("margin_top", mt)
	_safe_margin.add_theme_constant_override("margin_right", mr)
	_safe_margin.add_theme_constant_override("margin_bottom", mb)


func _refresh_all() -> void:
	var gs := AppServices.game_state()
	_title_lbl.text = tr("GAME_TITLE")
	_sub_lbl.text = tr("GAME_SUBTITLE")
	_ver_lbl.text = tr("GAME_VERSION_LABEL") % (gs.APP_VERSION if gs != null else "0.1.0-alpha")
	_btn_continue.text = tr("MENU_CONTINUE")
	_btn_continue.visible = gs != null and gs.has_autosave()
	_btn_tutorial.text = tr("MENU_TUTORIAL")
	_btn_campaign.text = tr("MENU_CAMPAIGN")
	_btn_sandbox.text = tr("MENU_SANDBOX")
	_btn_benchmark.text = tr("MENU_BENCHMARK")
	_btn_settings.text = tr("MENU_SETTINGS")
	_btn_credits.text = tr("MENU_CREDITS")

	for b in find_children("BackBtn", "Button", true, false):
		(b as Button).text = tr("MENU_BACK")
	for key in ["MISSION_SELECT_TITLE", "SANDBOX_SELECT_TITLE", "SETTINGS_TITLE"]:
		var lbl := find_child(key, true, false) as Label
		if lbl != null:
			lbl.text = tr(key)
	_credits_title.text = tr("CREDITS_TITLE")
	_credits_body.text = tr("CREDITS_BODY")


func _on_lang_changed(_loc: String) -> void:
	_refresh_all()
