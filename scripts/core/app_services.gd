class_name AppServices
extends RefCounted
## Safe runtime lookup for project autoloads across --import, --script tests, and full runtime.


static func _root() -> Window:
	var ml := Engine.get_main_loop()
	if ml is SceneTree:
		return (ml as SceneTree).root
	return null


static func game_state() -> Node:
	var r := _root()
	return r.get_node_or_null("GameState") if r != null else null


static func audio() -> Node:
	var r := _root()
	return r.get_node_or_null("AudioManager") if r != null else null


static func loc() -> Node:
	var r := _root()
	return r.get_node_or_null("LocalizationManager") if r != null else null


static func play_sfx(key: String, vol_db: float = 0.0, jitter: float = 0.08) -> void:
	var a := audio()
	if a != null:
		a.play_sfx(key, vol_db, jitter)


static func play_loop(key: String, pitch: float = 1.0, vol_db: float = -6.0) -> void:
	var a := audio()
	if a != null:
		a.play_loop(key, pitch, vol_db)


static func stop_loop() -> void:
	var a := audio()
	if a != null:
		a.stop_loop()


static func vibrate(ms: int = 25) -> void:
	var gs := game_state()
	if gs != null:
		gs.vibrate(ms)


static func apply_quality(vp: Viewport) -> void:
	var gs := game_state()
	if gs != null:
		gs.apply_quality_to_viewport(vp)


static func quality_cfg() -> Dictionary:
	var gs := game_state()
	if gs != null:
		return gs.get_quality_config()
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


static func settings() -> Dictionary:
	var gs := game_state()
	if gs != null:
		return gs.settings
	return {}
