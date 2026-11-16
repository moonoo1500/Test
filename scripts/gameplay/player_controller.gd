class_name PlayerController
extends CharacterBody3D
## First-person character controller supporting touch joysticks, swipe look, gamepad, and desktop input.

const WALK_SPEED := 6.4
const CROUCH_SPEED := 3.6
const JUMP_VELOCITY := 6.8
const GRAVITY := 19.5
const STAND_HEIGHT := 1.72
const CROUCH_HEIGHT := 1.05
const STAND_EYE_Y := 1.50
const CROUCH_EYE_Y := 0.86

var move_input: Vector2 = Vector2.ZERO
var is_crouching: bool = false
var in_vehicle: bool = false
var current_vehicle: VehicleController = null
var camera_yaw: float = 0.0
var camera_pitch: float = 0.0
var camera_shake: float = 0.0

var head: Node3D
var camera: Camera3D
var viewmodel_anchor: Node3D
var _collider: CollisionShape3D
var _capsule: CapsuleShape3D
var _coyote_timer: float = 0.0
var _jump_requested: bool = false


func _ready() -> void:
	collision_layer = 8
	collision_mask = 1 | 2 | 4
	floor_max_angle = deg_to_rad(50.0)
	floor_snap_length = 0.35

	_capsule = CapsuleShape3D.new()
	_capsule.radius = 0.35
	_capsule.height = STAND_HEIGHT
	_collider = CollisionShape3D.new()
	_collider.shape = _capsule
	_collider.position = Vector3(0.0, STAND_HEIGHT * 0.5, 0.0)
	add_child(_collider)

	head = Node3D.new()
	head.name = "Head"
	head.position = Vector3(0.0, STAND_EYE_Y, 0.0)
	add_child(head)

	camera = Camera3D.new()
	camera.name = "PlayerCamera"
	camera.fov = 74.0
	camera.near = 0.08
	camera.far = 220.0
	head.add_child(camera)

	viewmodel_anchor = Node3D.new()
	viewmodel_anchor.name = "ViewmodelAnchor"
	viewmodel_anchor.position = Vector3(0.28, -0.22, -0.45)
	camera.add_child(viewmodel_anchor)

	apply_quality_far_plane()


func apply_quality_far_plane() -> void:
	if camera != null and GameState != null:
		var cfg := GameState.get_quality_config()
		camera.far = float(cfg.get("view_distance", 140.0))


func set_look_angles(yaw: float, pitch: float) -> void:
	camera_yaw = yaw
	camera_pitch = clampf(pitch, deg_to_rad(-82.0), deg_to_rad(82.0))
	rotation.y = camera_yaw
	if head != null:
		head.rotation.x = camera_pitch


func add_look_delta(dx_rad: float, dy_rad: float) -> void:
	var sens := float(GameState.settings.get("camera_sensitivity", 1.0)) if GameState != null else 1.0
	var inv := -1.0 if (GameState != null and bool(GameState.settings.get("invert_y", false))) else 1.0
	camera_yaw -= dx_rad * sens
	camera_pitch = clampf(camera_pitch - dy_rad * sens * inv, deg_to_rad(-82.0), deg_to_rad(82.0))
	rotation.y = camera_yaw
	if head != null:
		head.rotation.x = camera_pitch


func add_trauma(amount: float) -> void:
	camera_shake = minf(1.0, camera_shake + amount)


func request_jump() -> void:
	_jump_requested = true


func toggle_crouch() -> void:
	is_crouching = not is_crouching


func set_in_vehicle(vehicle: VehicleController) -> void:
	current_vehicle = vehicle
	in_vehicle = vehicle != null
	_collider.disabled = in_vehicle
	visible = not in_vehicle
	if camera != null:
		camera.current = not in_vehicle


func _physics_process(dt: float) -> void:
	if in_vehicle:
		if current_vehicle != null and is_instance_valid(current_vehicle):
			global_position = current_vehicle.global_position + Vector3(0.0, 1.5, 0.0)
		return

	# Smooth crouch transition
	var target_h := CROUCH_HEIGHT if is_crouching else STAND_HEIGHT
	var target_eye := CROUCH_EYE_Y if is_crouching else STAND_EYE_Y
	_capsule.height = lerpf(_capsule.height, target_h, dt * 12.0)
	_collider.position.y = _capsule.height * 0.5
	head.position.y = lerpf(head.position.y, target_eye, dt * 12.0)

	# Collect combined input (Touch virtual stick + Gamepad + Desktop fallback)
	var stick := move_input
	var kb := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		kb.y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		kb.y += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		kb.x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		kb.x += 1.0
	if kb.length_squared() > 0.01:
		stick = kb.normalized()

	# Bluetooth Gamepad left stick + right stick look
	var gp_move := Vector2(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(0, JOY_AXIS_LEFT_Y))
	if gp_move.length() > 0.18:
		stick = gp_move.limit_length(1.0)
	var gp_look := Vector2(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y))
	if gp_look.length() > 0.16:
		add_look_delta(gp_look.x * dt * 2.4, gp_look.y * dt * 2.0)

	var forward := -global_transform.basis.z
	var right := global_transform.basis.x
	var wish_dir := (right * stick.x + forward * stick.y)
	wish_dir.y = 0.0
	if wish_dir.length_squared() > 1.0:
		wish_dir = wish_dir.normalized()

	var speed := CROUCH_SPEED if is_crouching else WALK_SPEED
	velocity.x = lerpf(velocity.x, wish_dir.x * speed, clampf(dt * 14.0, 0.0, 1.0))
	velocity.z = lerpf(velocity.z, wish_dir.z * speed, clampf(dt * 14.0, 0.0, 1.0))

	if is_on_floor():
		_coyote_timer = 0.14
		if velocity.y < 0.0:
			velocity.y = -0.2
	else:
		_coyote_timer = maxf(0.0, _coyote_timer - dt)
		velocity.y -= GRAVITY * dt

	if _jump_requested or Input.is_key_pressed(KEY_SPACE):
		_jump_requested = false
		if _coyote_timer > 0.0:
			velocity.y = JUMP_VELOCITY
			_coyote_timer = 0.0

	var was_grounded := is_on_floor()
	var pre_pos := global_position
	move_and_slide()

	# Gentle 0.55m voxel step-up assist when hitting low voxel ledges while walking
	if was_grounded and is_on_wall() and wish_dir.length_squared() > 0.05:
		var moved_xz := Vector2(global_position.x - pre_pos.x, global_position.z - pre_pos.z).length()
		if moved_xz < speed * dt * 0.35:
			var test_xform := global_transform.translated(Vector3(0.0, 0.56, 0.0))
			if not test_move(test_xform, wish_dir * 0.35):
				global_position.y += 0.54
				global_position += wish_dir * 0.22

	# Push nearby PhysicsProps gently on contact
	for idx in range(get_slide_collision_count()):
		var col := get_slide_collision(idx)
		var collider := col.get_collider()
		if collider is PhysicsProp:
			var prop := collider as PhysicsProp
			prop.apply_central_impulse(-col.get_normal() * 4.5)

	# Decay camera shake
	if camera_shake > 0.0:
		camera_shake = maxf(0.0, camera_shake - dt * 2.4)
		var amp := camera_shake * camera_shake * 0.09
		camera.h_offset = randf_range(-amp, amp)
		camera.v_offset = randf_range(-amp, amp)
	else:
		camera.h_offset = 0.0
		camera.v_offset = 0.0

	if global_position.y < -15.0:
		global_position = Vector3(12.0, 6.0, 12.0)
		velocity = Vector3.ZERO
