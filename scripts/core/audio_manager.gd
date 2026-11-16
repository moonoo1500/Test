extends Node
## Pooled audio playback manager with safe mobile focus/pause handling.

const SFX_PATHS := {
	"impact_stone": "res://assets/audio/impact_stone.wav",
	"impact_wood": "res://assets/audio/impact_wood.wav",
	"impact_glass": "res://assets/audio/impact_glass.wav",
	"impact_metal": "res://assets/audio/impact_metal.wav",
	"lance_beam": "res://assets/audio/lance_beam.wav",
	"charge_beep": "res://assets/audio/charge_beep.wav",
	"explosion": "res://assets/audio/explosion.wav",
	"foam_spray": "res://assets/audio/foam_spray.wav",
	"bridge_place": "res://assets/audio/bridge_place.wav",
	"alarm_beep": "res://assets/audio/alarm_beep.wav",
	"objective_pickup": "res://assets/audio/objective_pickup.wav",
	"mission_clear": "res://assets/audio/mission_clear.wav",
	"ui_click": "res://assets/audio/ui_click.wav",
	"engine_hum": "res://assets/audio/engine_hum.wav",
}

const POOL_SIZE := 12

var _streams: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _pool_cursor: int = 0
var _loop_player: AudioStreamPlayer
var _master_volume: float = 0.85
var _muted_by_focus: bool = false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	for key in SFX_PATHS.keys():
		var path: String = SFX_PATHS[key]
		if ResourceLoader.exists(path):
			_streams[key] = load(path)
	for i in range(POOL_SIZE):
		var p := AudioStreamPlayer.new()
		p.name = "SfxPlayer_%d" % i
		add_child(p)
		_pool.append(p)
	_loop_player = AudioStreamPlayer.new()
	_loop_player.name = "LoopPlayer"
	add_child(_loop_player)
	var gs := AppServices.game_state()
	if gs != null:
		set_master_volume(float(gs.settings.get("sfx_volume", 0.85)))


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_muted_by_focus = true
		stop_loop()
		_update_bus_volume()
	elif what == NOTIFICATION_APPLICATION_RESUMED or what == NOTIFICATION_APPLICATION_FOCUS_IN:
		_muted_by_focus = false
		_update_bus_volume()


func set_master_volume(vol: float) -> void:
	_master_volume = clampf(vol, 0.0, 1.0)
	_update_bus_volume()


func play_sfx(key: String, volume_db_offset: float = 0.0, pitch_jitter: float = 0.08) -> void:
	if DisplayServer.get_name() == "headless" or _muted_by_focus or _master_volume <= 0.01:
		return
	if not _streams.has(key):
		return
	var player: AudioStreamPlayer = _pool[_pool_cursor]
	_pool_cursor = (_pool_cursor + 1) % POOL_SIZE
	player.stream = _streams[key]
	player.volume_db = linear_to_db(_master_volume) + volume_db_offset
	if pitch_jitter > 0.0:
		player.pitch_scale = randf_range(1.0 - pitch_jitter, 1.0 + pitch_jitter)
	else:
		player.pitch_scale = 1.0
	player.play()


func play_loop(key: String, pitch: float = 1.0, volume_db_offset: float = -6.0) -> void:
	if DisplayServer.get_name() == "headless" or _muted_by_focus or _master_volume <= 0.01:
		return
	if not _streams.has(key):
		return
	if _loop_player.stream != _streams[key]:
		_loop_player.stream = _streams[key]
	_loop_player.pitch_scale = clampf(pitch, 0.5, 2.0)
	_loop_player.volume_db = linear_to_db(_master_volume) + volume_db_offset
	if not _loop_player.playing:
		_loop_player.play()


func stop_loop() -> void:
	if _loop_player != null and _loop_player.playing:
		_loop_player.stop()


func _update_bus_volume() -> void:
	var bus := AudioServer.get_bus_index("Master")
	if bus >= 0:
		var muted := _muted_by_focus or _master_volume <= 0.01
		AudioServer.set_bus_mute(bus, muted)
		if not muted:
			AudioServer.set_bus_volume_db(bus, linear_to_db(_master_volume))
