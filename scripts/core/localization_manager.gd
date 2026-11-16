extends Node
## Manages runtime UTF-8 localization tables (Russian & English fallback) and UI fonts.

signal language_changed(locale: String)

const RU_PATH := "res://localization/ru.json"
const EN_PATH := "res://localization/en.json"
const FONT_REGULAR_PATH := "res://assets/fonts/FiraSans-Regular.ttf"
const FONT_BOLD_PATH := "res://assets/fonts/FiraSans-Bold.ttf"
const FONT_MONO_PATH := "res://assets/fonts/FiraMono-Regular.ttf"

var _translations_loaded: bool = false
var _ru_dict: Dictionary = {}
var _en_dict: Dictionary = {}
var _active_locale: String = "ru"


func _ready() -> void:
	load_translations()
	_apply_default_theme_font()


func load_translations() -> void:
	if _translations_loaded:
		return
	_en_dict = _read_json_dict(EN_PATH)
	_ru_dict = _read_json_dict(RU_PATH)

	_register_locale("en", _en_dict)
	_register_locale("ru", _ru_dict)
	_translations_loaded = true


func apply_language_preference(pref: String) -> void:
	load_translations()
	var target: String = pref
	if pref == "auto" or pref.is_empty():
		var sys_lang: String = OS.get_locale_language().to_lower()
		target = "ru" if sys_lang == "ru" else "en"
	elif target != "ru" and target != "en":
		target = "en"

	_active_locale = target
	TranslationServer.set_locale(target)
	language_changed.emit(target)


func get_active_locale() -> String:
	return _active_locale


func get_available_keys(locale: String) -> PackedStringArray:
	load_translations()
	var d: Dictionary = _ru_dict if locale == "ru" else _en_dict
	var keys := PackedStringArray()
	for k in d.keys():
		keys.append(str(k))
	keys.sort()
	return keys


func verify_parity() -> Dictionary:
	load_translations()
	var missing_in_en: Array[String] = []
	var missing_in_ru: Array[String] = []
	var empty_values: Array[String] = []

	for k in _ru_dict.keys():
		var ks := str(k)
		if not _en_dict.has(ks):
			missing_in_en.append(ks)
		elif str(_ru_dict[ks]).strip_edges().is_empty():
			empty_values.append("ru:" + ks)

	for k in _en_dict.keys():
		var ks := str(k)
		if not _ru_dict.has(ks):
			missing_in_ru.append(ks)
		elif str(_en_dict[ks]).strip_edges().is_empty():
			empty_values.append("en:" + ks)

	return {
		"ok": missing_in_en.is_empty() and missing_in_ru.is_empty() and empty_values.is_empty(),
		"ru_count": _ru_dict.size(),
		"en_count": _en_dict.size(),
		"missing_in_en": missing_in_en,
		"missing_in_ru": missing_in_ru,
		"empty_values": empty_values,
	}


func get_mono_font() -> Font:
	if ResourceLoader.exists(FONT_MONO_PATH):
		return load(FONT_MONO_PATH)
	return ThemeDB.fallback_font


func get_bold_font() -> Font:
	if ResourceLoader.exists(FONT_BOLD_PATH):
		return load(FONT_BOLD_PATH)
	return ThemeDB.fallback_font


func _register_locale(locale: String, dict: Dictionary) -> void:
	var tr_obj := Translation.new()
	tr_obj.locale = locale
	for k in dict.keys():
		tr_obj.add_message(StringName(str(k)), StringName(str(dict[k])))
	TranslationServer.add_translation(tr_obj)


func _read_json_dict(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Localization file missing: " + path)
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Cannot open localization file: " + path)
		return {}
	var text := file.get_as_text()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Invalid JSON dictionary in: " + path)
		return {}
	return parsed


func _apply_default_theme_font() -> void:
	if DisplayServer.get_name() == "headless":
		return
	if ResourceLoader.exists(FONT_REGULAR_PATH):
		var font: Font = load(FONT_REGULAR_PATH)
		if font != null and get_tree() != null and get_tree().root != null:
			var t: Theme = get_tree().root.theme
			if t == null:
				t = Theme.new()
				get_tree().root.theme = t
			t.default_font = font
			t.default_font_size = 18
