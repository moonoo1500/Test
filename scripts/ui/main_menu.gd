extends Control
## Main menu placeholder controller (expanded in Iteration 4 with full Campaign, Sandbox, Settings, Benchmark).

@onready var _title_label: Label = $SafeMargin/CenterPanel/VBox/TitleLabel
@onready var _subtitle_label: Label = $SafeMargin/CenterPanel/VBox/SubtitleLabel
@onready var _version_label: Label = $SafeMargin/CenterPanel/VBox/VersionLabel


func _ready() -> void:
	LocalizationManager.language_changed.connect(_on_language_changed)
	GameState.apply_quality_to_viewport(get_viewport())
	_refresh_texts()


func _refresh_texts() -> void:
	_title_label.text = tr("GAME_TITLE")
	_subtitle_label.text = tr("GAME_SUBTITLE")
	_version_label.text = tr("GAME_VERSION_LABEL") % GameState.APP_VERSION


func _on_language_changed(_locale: String) -> void:
	_refresh_texts()
