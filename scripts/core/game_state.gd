extends Node
## Persistent game state, settings, quality profile auto-detection, and campaign progression.

signal settings_changed
signal progress_changed

const APP_VERSION := "0.1.0-alpha"
const SETTINGS_PATH := "user://settings.cfg"
const PROGRESS_PATH := "user://progress.json"
const AUTOSAVE_PATH := "user://autosave.flsv"

var settings: Dictionary = {
	"language": "auto",
	"quality_profile": "auto",
	"camera_sensitivity": 1.0,
	"invert_y": false,
	"haptics_enabled": true,
	"hud_scale": 1.0,
	"hud_opacity": 0.88,
	"touch_layout": "classic",
	"show_fps": true,
	"sfx_volume": 0.85,
}

var progress: Dictionary = {
	"tutorial_completed": false,
	"missions": {},
}

var resolved_quality: String = "medium"

var pending_launch: Dictionary = {
	"mode": "tutorial",
	"mission_id": "tutorial",
	"location_id": "training_yard",
	"resume_autosave": false,
}

var custom_settings_path: String = ""
var custom_progress_path: String = ""


func _ready() -> void:
	load_settings()
	load_progress()
	resolve_quality_profile()
	var loc := AppServices.loc()
	if loc != null:
		loc.apply_language_preference(str(settings.get("language", "auto")))


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_CLOSE_REQUEST:
		save_settings()
		save_progress()


func get_settings_file_path() -> String:
	return custom_settings_path if not custom_settings_path.is_empty() else SETTINGS_PATH


func get_progress_file_path() -> String:
	return custom_progress_path if not custom_progress_path.is_empty() else PROGRESS_PATH


func load_settings() -> void:
	var cfg := ConfigFile.new()
	var err := cfg.load(get_settings_file_path())
	if err != OK:
		return
	for key in settings.keys():
		if cfg.has_section_key("prefs", key):
			settings[key] = cfg.get_value("prefs", key, settings[key])


func save_settings() -> void:
	var cfg := ConfigFile.new()
	for key in settings.keys():
		cfg.set_value("prefs", key, settings[key])
	cfg.save(get_settings_file_path())


func set_setting(key: String, value: Variant) -> void:
	settings[key] = value
	if key == "language":
		var loc := AppServices.loc()
		if loc != null:
			loc.apply_language_preference(str(value))
	elif key == "quality_profile":
		resolve_quality_profile()
	elif key == "sfx_volume":
		var aud := AppServices.audio()
		if aud != null:
			aud.set_master_volume(float(value))
	save_settings()
	settings_changed.emit()


func load_progress() -> void:
	var path := get_progress_file_path()
	if not FileAccess.file_exists(path):
		return
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return
	var parsed: Variant = JSON.parse_string(f.get_as_text())
	if typeof(parsed) == TYPE_DICTIONARY:
		var d: Dictionary = parsed
		progress["tutorial_completed"] = bool(d.get("tutorial_completed", false))
		var m: Variant = d.get("missions", {})
		if typeof(m) == TYPE_DICTIONARY:
			progress["missions"] = m


func save_progress() -> void:
	var f := FileAccess.open(get_progress_file_path(), FileAccess.WRITE)
	if f == null:
		return
	f.store_string(JSON.stringify(progress, "\t"))


func mark_tutorial_completed() -> void:
	progress["tutorial_completed"] = true
	save_progress()
	progress_changed.emit()


func record_mission_completion(mission_id: String, elapsed_sec: float, stars: int) -> void:
	var missions: Dictionary = progress.get("missions", {})
	var prev: Dictionary = missions.get(mission_id, {})
	var prev_best: float = float(prev.get("best_time", 999999.0))
	var prev_stars: int = int(prev.get("stars", 0))
	missions[mission_id] = {
		"completed": true,
		"best_time": minf(prev_best, elapsed_sec),
		"stars": maxi(prev_stars, stars),
	}
	progress["missions"] = missions
	save_progress()
	progress_changed.emit()


func get_mission_record(mission_id: String) -> Dictionary:
	var missions: Dictionary = progress.get("missions", {})
	return missions.get(mission_id, {})


func reset_progress() -> void:
	progress = {
		"tutorial_completed": false,
		"missions": {},
	}
	clear_autosave()
	save_progress()
	progress_changed.emit()


func has_autosave() -> bool:
	return FileAccess.file_exists(AUTOSAVE_PATH)


func clear_autosave() -> void:
	if FileAccess.file_exists(AUTOSAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(AUTOSAVE_PATH))


func resolve_quality_profile() -> String:
	var pref: String = str(settings.get("quality_profile", "auto"))
	if pref in ["low", "medium", "high"]:
		resolved_quality = pref
		return resolved_quality

	var cores: int = OS.get_processor_count()
	var mem_info: Dictionary = OS.get_memory_info()
	var phys_bytes: int = int(mem_info.get("physical", 0))
	var adapter: String = ""
	if DisplayServer.get_name() != "headless":
		adapter = RenderingServer.get_video_adapter_name().to_lower()

	if (phys_bytes > 0 and phys_bytes < 4_200_000_000) or cores <= 4:
		resolved_quality = "low"
	elif "adreno" in adapter and ("610" in adapter or "618" in adapter or "619" in adapter):
		resolved_quality = "low"
	elif "mali-g5" in adapter or "mali-g68" in adapter or OS.has_feature("mobile"):
		resolved_quality = "medium"
	elif cores >= 8 and phys_bytes >= 7_500_000_000:
		resolved_quality = "high"
	else:
		resolved_quality = "medium"
	return resolved_quality


func get_quality_config() -> Dictionary:
	match resolved_quality:
		"low":
			return {
				"id": "low",
				"render_scale": 0.65,
				"msaa": Viewport.MSAA_DISABLED,
				"shadows_enabled": false,
				"shadow_size": 1024,
				"max_chunk_commits_per_frame": 2,
				"max_active_debris_bodies": 10,
				"max_active_fires": 24,
				"max_particles_budget": 48,
				"view_distance": 95.0,
			}
		"high":
			return {
				"id": "high",
				"render_scale": 1.0,
				"msaa": Viewport.MSAA_2X,
				"shadows_enabled": true,
				"shadow_size": 2048,
				"max_chunk_commits_per_frame": 6,
				"max_active_debris_bodies": 36,
				"max_active_fires": 96,
				"max_particles_budget": 240,
				"view_distance": 175.0,
			}
		_:
			return {
				"id": "medium",
				"render_scale": 0.85,
				"msaa": Viewport.MSAA_DISABLED,
				"shadows_enabled": true,
				"shadow_size": 1024,
				"max_chunk_commits_per_frame": 4,
				"max_active_debris_bodies": 22,
				"max_active_fires": 48,
				"max_particles_budget": 128,
				"view_distance": 135.0,
			}


func apply_quality_to_viewport(viewport: Viewport) -> void:
	if viewport == null or DisplayServer.get_name() == "headless":
		return
	var cfg: Dictionary = get_quality_config()
	viewport.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
	viewport.scaling_3d_scale = float(cfg["render_scale"])
	viewport.msaa_3d = int(cfg["msaa"])


func vibrate(duration_ms: int = 25) -> void:
	if not bool(settings.get("haptics_enabled", true)):
		return
	if DisplayServer.get_name() == "headless":
		return
	if OS.has_feature("mobile") or OS.get_name() == "Android":
		Input.vibrate_handheld(clampi(duration_ms, 8, 250))


func format_time(seconds: float) -> String:
	var s := maxi(0, int(floorf(seconds)))
	var mins: int = s / 60
	var secs: int = s % 60
	return "%02d:%02d" % [mins, secs]
