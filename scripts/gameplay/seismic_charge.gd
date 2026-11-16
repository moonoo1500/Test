class_name SeismicCharge
extends Node3D
## Sticky timed & remote-triggerable seismic demolition charge.

signal detonated(world_pos: Vector3)

var velocity: Vector3 = Vector3.ZERO
var stuck: bool = false
var fuse_remaining: float = 5.0
var auto_fuse_enabled: bool = false

var _voxel_world: VoxelWorld
var _led_mat: StandardMaterial3D
var _beep_accum: float = 0.0
var _exploded: bool = false


func setup(p_world: VoxelWorld, initial_vel: Vector3, auto_fuse: bool = false) -> void:
	_voxel_world = p_world
	velocity = initial_vel
	auto_fuse_enabled = auto_fuse
	_build_mesh()


func _build_mesh() -> void:
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.28, 0.14, 0.28)
	body.mesh = bm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.24, 0.28, 0.34)
	mat.metallic = 0.5
	mat.roughness = 0.4
	body.material_override = mat
	add_child(body)

	var led := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.065
	sm.height = 0.13
	led.mesh = sm
	led.position = Vector3(0.0, 0.09, 0.0)
	_led_mat = StandardMaterial3D.new()
	_led_mat.albedo_color = Color(1.0, 0.3, 0.1)
	_led_mat.emission_enabled = true
	_led_mat.emission = Color(1.0, 0.35, 0.08)
	_led_mat.emission_energy_multiplier = 2.5
	led.material_override = _led_mat
	add_child(led)


func _physics_process(dt: float) -> void:
	if _exploded:
		return

	if not stuck and _voxel_world != null:
		var speed := velocity.length()
		if speed > 0.05:
			var step_dist := speed * dt + 0.16
			var rc := _voxel_world.raycast(global_position, velocity.normalized(), step_dist)
			if bool(rc.get("hit", false)):
				var hit_pos: Vector3 = rc["position"]
				var normal := Vector3(rc.get("normal", Vector3i.UP))
				global_position = hit_pos + normal * 0.08
				stuck = true
				velocity = Vector3.ZERO
				AppServices.play_sfx("charge_beep", -4.0, 0.05)
			else:
				velocity.y -= 14.0 * dt
				global_position += velocity * dt
				if global_position.y < 0.2:
					global_position.y = 0.2
					stuck = true
					velocity = Vector3.ZERO

	_beep_accum += dt
	var pulse := 0.5 + 0.5 * sin(float(Time.get_ticks_msec()) * 0.015)
	if _led_mat != null:
		_led_mat.emission_energy_multiplier = 1.2 + 2.8 * pulse
	if _beep_accum >= 1.1:
		_beep_accum = 0.0
		AppServices.play_sfx("charge_beep", -10.0, 0.02)

	if auto_fuse_enabled and stuck:
		fuse_remaining -= dt
		if fuse_remaining <= 0.0:
			trigger_explosion()


func trigger_explosion() -> void:
	if _exploded:
		return
	_exploded = true
	var pos := global_position
	queue_free()
	if _voxel_world != null:
		_voxel_world.detonate_explosion(pos, 2.75, 115.0, true)
	AppServices.play_sfx("explosion", 1.5, 0.08)
	AppServices.vibrate(95)
	detonated.emit(pos)
