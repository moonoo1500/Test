class_name TouchJoystick
extends Control
## Multi-touch virtual thumbstick with smooth deadzone and crisp custom vector draw.

signal stick_moved(vector: Vector2)

var output: Vector2 = Vector2.ZERO
var deadzone: float = 0.14
var base_radius: float = 68.0
var knob_radius: float = 28.0

var _touch_index: int = -1
var _knob_offset: Vector2 = Vector2.ZERO


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(180.0, 180.0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed and _touch_index == -1:
			_touch_index = st.index
			_update_knob(st.position)
			accept_event()
		elif not st.pressed and st.index == _touch_index:
			_reset_stick()
			accept_event()
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		if sd.index == _touch_index:
			_update_knob(sd.position)
			accept_event()
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_touch_index = 99
				_update_knob(mb.position)
			else:
				_reset_stick()
			accept_event()
	elif event is InputEventMouseMotion and _touch_index == 99:
		_update_knob((event as InputEventMouseMotion).position)
		accept_event()


func _update_knob(local_pos: Vector2) -> void:
	var center := size * 0.5
	var r := minf(base_radius, minf(size.x, size.y) * 0.42)
	var delta := local_pos - center
	if delta.length() > r:
		delta = delta.normalized() * r
	_knob_offset = delta
	var norm := delta / maxf(r, 1.0)
	if norm.length() < deadzone:
		output = Vector2.ZERO
	else:
		var mag := (norm.length() - deadzone) / (1.0 - deadzone)
		output = norm.normalized() * clampf(mag, 0.0, 1.0)
	stick_moved.emit(output)
	queue_redraw()


func _reset_stick() -> void:
	_touch_index = -1
	_knob_offset = Vector2.ZERO
	output = Vector2.ZERO
	stick_moved.emit(output)
	queue_redraw()


func _draw() -> void:
	var center := size * 0.5
	var r := minf(base_radius, minf(size.x, size.y) * 0.42)
	draw_circle(center, r, Color(0.08, 0.11, 0.15, 0.45))
	draw_arc(center, r, 0.0, TAU, 36, Color(0.75, 0.85, 0.95, 0.55), 2.5, true)
	draw_circle(center + _knob_offset, knob_radius, Color(0.95, 0.62, 0.20, 0.85))
	draw_arc(center + _knob_offset, knob_radius, 0.0, TAU, 24, Color(1.0, 0.95, 0.85, 0.9), 2.0, true)
