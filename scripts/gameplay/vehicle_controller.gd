class_name VehicleController
extends RigidBody3D
## Stabilized raycast-assisted drivable industrial vehicle with voxel wall ramming.

signal driver_entered(vehicle: VehicleController)
signal driver_exited(vehicle: VehicleController)

enum Kind {
	LOADER = 0,  # Погрузчик «Бурлак-2»
	CRAWLER = 1, # Гусеничный таран «Крот-Т»
}

var kind: Kind = Kind.LOADER
var throttle_input: float = 0.0
var steer_input: float = 0.0
var has_driver: bool = false
var speed_kmh: int = 0

var chase_camera: Camera3D
var _voxel_world: VoxelWorld
var _cam_pivot: Node3D
var _ram_cooldown: float = 0.0
var _hover_rays: Array[Vector3] = []
var _ram_speed_threshold: float = 3.2
var _can_smash_concrete: bool = false
var _max_drive_speed: float = 11.5
var _accel_force: float = 24.0


func setup(p_kind: Kind, p_world: VoxelWorld) -> void:
	kind = p_kind
	_voxel_world = p_world
	_configure_stats()
	_build_chassis()


func _configure_stats() -> void:
	collision_layer = 4
	collision_mask = 1 | 2 | 4
	linear_damp = 1.4
	angular_damp = 4.5
	can_sleep = false

	if kind == Kind.LOADER:
		mass = 120.0
		_max_drive_speed = 12.0
		_accel_force = 24.0
		_ram_speed_threshold = 3.6
		_can_smash_concrete = false
		_hover_rays = [
			Vector3(-0.9, 0.2, -1.2),
			Vector3(0.9, 0.2, -1.2),
			Vector3(-0.9, 0.2, 1.2),
			Vector3(0.9, 0.2, 1.2),
		]
	else:
		mass = 240.0
		_max_drive_speed = 9.0
		_accel_force = 28.0
		_ram_speed_threshold = 2.0
		_can_smash_concrete = true
		_hover_rays = [
			Vector3(-1.1, 0.2, -1.35),
			Vector3(1.1, 0.2, -1.35),
			Vector3(-1.1, 0.2, 1.35),
			Vector3(1.1, 0.2, 1.35),
		]


func _build_chassis() -> void:
	var body_size := Vector3(2.1, 1.1, 3.2) if kind == Kind.LOADER else Vector3(2.45, 1.25, 3.4)
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = body_size
	cs.shape = bs
	cs.position = Vector3(0.0, 0.72, 0.0)
	add_child(cs)

	var main_color := Color(0.90, 0.62, 0.16) if kind == Kind.LOADER else Color(0.28, 0.56, 0.42)
	var dark_color := Color(0.18, 0.21, 0.25)

	# Lower frame
	var frame := MeshInstance3D.new()
	var fm := BoxMesh.new()
	fm.size = Vector3(body_size.x, 0.65, body_size.z)
	frame.mesh = fm
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = main_color
	fmat.roughness = 0.48
	fmat.metallic = 0.35
	frame.material_override = fmat
	frame.position = Vector3(0.0, 0.55, 0.0)
	add_child(frame)

	# Cabin
	var cab := MeshInstance3D.new()
	var cm := BoxMesh.new()
	cm.size = Vector3(body_size.x * 0.76, 0.75, 1.25)
	cab.mesh = cm
	var cmat := StandardMaterial3D.new()
	cmat.albedo_color = Color(0.60, 0.84, 0.94)
	cmat.roughness = 0.2
	cab.material_override = cmat
	cab.position = Vector3(0.0, 1.18, -0.35 if kind == Kind.LOADER else 0.15)
	add_child(cab)

	# Front ram blade / bumper
	var blade := MeshInstance3D.new()
	var blm := BoxMesh.new()
	blm.size = Vector3(body_size.x + 0.25, 0.72 if kind == Kind.CRAWLER else 0.38, 0.42)
	blade.mesh = blm
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = dark_color
	bmat.metallic = 0.7
	bmat.roughness = 0.35
	blade.material_override = bmat
	blade.position = Vector3(0.0, 0.52, -body_size.z * 0.5 - 0.18)
	add_child(blade)

	# 4 Wheels or Track pods
	for hp in _hover_rays:
		var wheel := MeshInstance3D.new()
		var wm := CylinderMesh.new()
		wm.top_radius = 0.36
		wm.bottom_radius = 0.36
		wm.height = 0.32
		wm.radial_segments = 12
		wheel.mesh = wm
		wheel.material_override = bmat
		wheel.rotation.z = PI * 0.5
		wheel.position = Vector3(hp.x, 0.36, hp.z)
		add_child(wheel)

	# Chase camera pivot
	_cam_pivot = Node3D.new()
	_cam_pivot.position = Vector3(0.0, 2.2, 0.0)
	add_child(_cam_pivot)

	chase_camera = Camera3D.new()
	chase_camera.fov = 75.0
	chase_camera.near = 0.1
	chase_camera.far = 200.0
	chase_camera.position = Vector3(0.0, 2.1, 6.2)
	chase_camera.rotation.x = deg_to_rad(-14.0)
	_cam_pivot.add_child(chase_camera)


func get_display_name() -> String:
	return tr("VEHICLE_LOADER_NAME") if kind == Kind.LOADER else tr("VEHICLE_CRAWLER_NAME")


func set_driver(active: bool) -> void:
	has_driver = active
	if chase_camera != null:
		chase_camera.current = active
	if active:
		driver_entered.emit(self)
	else:
		throttle_input = 0.0
		steer_input = 0.0
		AudioManager.stop_loop()
		driver_exited.emit(self)


func get_exit_position() -> Vector3:
	return global_position + global_transform.basis.x * 2.1 + Vector3(0.0, 0.5, 0.0)


func _physics_process(dt: float) -> void:
	_ram_cooldown = maxf(0.0, _ram_cooldown - dt)

	var thr := throttle_input
	var str_in := steer_input

	if has_driver:
		# Desktop & Gamepad driving fallback
		if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
			thr = 1.0
		elif Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
			thr = -1.0
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
			str_in = 1.0
		elif Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
			str_in = -1.0

		var gp_steer := -Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
		if absf(gp_steer) > 0.18:
			str_in = gp_steer
		var gp_gas := Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT)
		var gp_rev := Input.get_joy_axis(0, JOY_AXIS_TRIGGER_LEFT)
		if gp_gas > 0.1 or gp_rev > 0.1:
			thr = gp_gas - gp_rev

	# Raycast spring suspension across 4 corners
	var space := get_world_3d().direct_space_state
	var grounded_wheels := 0
	for local_pt in _hover_rays:
		var world_pt := global_transform * local_pt
		var down := -global_transform.basis.y
		var q := PhysicsRayQueryParameters3D.create(world_pt, world_pt + down * 0.85, 1 | 2)
		var hit := space.intersect_ray(q)
		if not hit.is_empty():
			grounded_wheels += 1
			var dist: float = world_pt.distance_to(hit["position"])
			var comp := clampf(0.75 - dist, -0.2, 0.65)
			var up_vel := linear_velocity.dot(Vector3.UP)
			var force_y := (comp * 26.0 - up_vel * 2.8) * (mass * 0.25)
			apply_force(Vector3.UP * force_y, world_pt - global_position)

	# Upright stabilization so phone driving feels smooth and predictable
	var up_cur := global_transform.basis.y
	var upright_axis := up_cur.cross(Vector3.UP)
	apply_torque(upright_axis * mass * 7.5 - angular_velocity * Vector3(mass * 1.8, 0.0, mass * 1.8))

	var fwd := -global_transform.basis.z
	fwd.y = 0.0
	if fwd.length_squared() > 0.001:
		fwd = fwd.normalized()
	var fwd_speed := linear_velocity.dot(fwd)
	speed_kmh = int(roundf(absf(fwd_speed) * 3.6))

	if grounded_wheels > 0 and has_driver:
		if absf(fwd_speed) < _max_drive_speed or signf(thr) != signf(fwd_speed):
			apply_central_force(fwd * thr * _accel_force * mass)
		var turn_sign := 1.0 if fwd_speed >= -0.4 else -1.0
		if absf(str_in) > 0.05:
			var speed_factor := clampf(0.45 + absf(fwd_speed) * 0.15, 0.45, 1.0)
			apply_torque(Vector3.UP * str_in * turn_sign * speed_factor * mass * 5.2)

		var pitch := 0.8 + clampf(absf(fwd_speed) / _max_drive_speed, 0.0, 1.0) * 0.75
		AudioManager.play_loop("engine_hum", pitch, -9.0)

		if absf(fwd_speed) > _ram_speed_threshold and _ram_cooldown <= 0.0:
			_try_ram_voxels(fwd, absf(fwd_speed))


func _try_ram_voxels(fwd: Vector3, spd: float) -> void:
	if _voxel_world == null:
		return
	var bumper := global_position + fwd * 1.9 + Vector3(0.0, 0.65, 0.0)
	var rc := _voxel_world.raycast(bumper - fwd * 0.4, fwd, 1.1)
	if not bool(rc.get("hit", false)):
		return
	var mat_id: int = int(rc["mat_id"])
	if VoxelMaterials.is_indestructible(mat_id) or VoxelMaterials.is_hammer_immune(mat_id):
		return
	if mat_id == VoxelMaterials.Id.CONCRETE and not _can_smash_concrete:
		return
	_ram_cooldown = 0.22
	var dmg := spd * (14.0 if _can_smash_concrete else 6.5)
	_voxel_world.carve_sphere(rc["position"], 0.95 if _can_smash_concrete else 0.75, dmg, false, true)
	AudioManager.play_sfx(VoxelMaterials.get_impact_sfx(mat_id), 0.0, 0.1)
	if GameState != null:
		GameState.vibrate(40)
