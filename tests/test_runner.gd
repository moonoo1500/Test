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
	_test_main_scene_smoke()

	print("=== Test Summary: %d passed, %d failed ===" % [_passed, _failed])
	quit(0 if _failed == 0 else 1)


func _test_localization() -> void:
	var loc := root.get_node_or_null("LocalizationManager")
	_assert_true(loc != null, "LocalizationManager autoload present")
	if loc == null:
		return
	var parity: Dictionary = loc.verify_parity()
	_assert_true(bool(parity.get("ok", false)), "RU/EN localization keys match 100%")
	_assert_true(int(parity.get("ru_count", 0)) >= 100, "Localization has full key catalog")

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


func _test_main_scene_smoke() -> void:
	var packed: PackedScene = load("res://scenes/MainMenu.tscn")
	_assert_true(packed != null, "MainMenu.tscn loads cleanly")
	if packed != null:
		var inst := packed.instantiate()
		_assert_true(inst != null, "MainMenu.tscn instantiates cleanly")
		root.add_child(inst)
		await process_frame
		_assert_true(inst.is_inside_tree(), "MainMenu enters SceneTree without errors")
		inst.queue_free()
		await process_frame
