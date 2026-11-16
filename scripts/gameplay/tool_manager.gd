class_name ToolManager
extends Node
## Manages 6 original demolition/engineering tools, ammo, viewmodels, and VFX beams.

signal tool_changed(tool_id: int)
signal charges_changed(active_count: int)
signal tutorial_action(action_tag: String)

enum ToolId {
	HAMMER = 0,
	LANCE = 1,
	CHARGE = 2,
	FOAM = 3,
	BRIDGE = 4,
	GRAB = 5,
}

const TOOL_KEYS := [
	"TOOL_HAMMER_NAME",
	"TOOL_LANCE_NAME",
	"TOOL_CHARGE_NAME",
	"TOOL_FOAM_NAME",
	"TOOL_BRIDGE_NAME",
	"TOOL_GRAB_NAME",
]

const TOOL_DESC_KEYS := [
	"TOOL_HAMMER_DESC",
	"TOOL_LANCE_DESC",
	"TOOL_CHARGE_DESC",
	"TOOL_FOAM_DESC",
	"TOOL_BRIDGE_DESC",
	"TOOL_GRAB_DESC",
]

const TOOL_COLORS := [
	Color(0.95, 0.58, 0.16),
	Color(1.0, 0.42, 0.14),
	Color(0.92, 0.24, 0.20),
	Color(0.32, 0.85, 0.98),
	Color(0.24, 0.82, 0.52),
	Color(0.92, 0.80, 0.25),
]

var active_tool: ToolId = ToolId.HAMMER
var sandbox_infinite: bool = false
var ammo: Dictionary = {
	ToolId.CHARGE: 8,
	ToolId.BRIDGE: 18,
}

var _player: PlayerController
var _world: VoxelWorld
var _parent_3d: Node3D
var _cooldown: float = 0.0
var _primary_held: bool = false
var _active_charges: Array[SeismicCharge] = []
var _held_body: RigidBody3D = null
var _beam_mesh: MeshInstance3D
var _bridge_preview: MeshInstance3D
var _vm_mesh: MeshInstance3D
var _vm_mat: StandardMaterial3D
var _spray_accum: float = 0.0


func setup(p_player: PlayerController, p_world: VoxelWorld, p_parent_3d: Node3D, p_sandbox: bool) -> void:
	_player = p_player
	_world = p_world
	_parent_3d = p_parent_3d
	sandbox_infinite = p_sandbox
	_setup_visuals()
	select_tool(ToolId.HAMMER)


func _setup_visuals() -> void:
	if _player != null and _player.viewmodel_anchor != null:
		_vm_mesh = MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.11, 0.12, 0.42)
		_vm_mesh.mesh = bm
		_vm_mat = StandardMaterial3D.new()
		_vm_mat.albedo_color = TOOL_COLORS[0]
		_vm_mat.metallic = 0.45
		_vm_mat.roughness = 0.35
		_vm_mesh.material_override = _vm_mat
		_player.viewmodel_anchor.add_child(_vm_mesh)

	_beam_mesh = MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.035
	cyl.bottom_radius = 0.035
	cyl.height = 1.0
	cyl.radial_segments = 8
	_beam_mesh.mesh = cyl
	var bmat := StandardMaterial3D.new()
	bmat.albedo_color = Color(1.0, 0.65, 0.2)
	bmat.emission_enabled = true
	bmat.emission = Color(1.0, 0.48, 0.1)
	bmat.emission_energy_multiplier = 3.2
	bmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_beam_mesh.material_override = bmat
	_beam_mesh.visible = false
	_parent_3d.add_child(_beam_mesh)

	_bridge_preview = MeshInstance3D.new()
	var pm := BoxMesh.new()
	pm.size = Vector3(1.1, 0.25, 1.0)
	_bridge_preview.mesh = pm
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.25, 0.92, 0.55, 0.48)
	pmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	pmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_bridge_preview.material_override = pmat
	_bridge_preview.visible = false
	_parent_3d.add_child(_bridge_preview)


func select_tool(tid: int) -> void:
	active_tool = clampi(tid, 0, ToolId.GRAB) as ToolId
	_primary_held = false
	_stop_continuous_effects()
	if _vm_mat != null:
		_vm_mat.albedo_color = TOOL_COLORS[int(active_tool)]
	tool_changed.emit(int(active_tool))


func cycle_tool(delta: int) -> void:
	var next := posmod(int(active_tool) + delta, ToolId.GRAB + 1)
	select_tool(next)


func set_primary_held(held: bool) -> void:
	if held and not _primary_held:
		_on_primary_pressed()
	elif not held and _primary_held:
		_stop_continuous_effects()
	_primary_held = held


func get_ammo_label(tid: int) -> String:
	if sandbox_infinite or not ammo.has(tid):
		return tr("HUD_AMMO_INF")
	return str(int(ammo[tid]))


func get_active_charge_count() -> int:
	_prune_charges()
	return _active_charges.size()


func is_holding_object() -> bool:
	return _held_body != null and is_instance_valid(_held_body)


func trigger_grab_or_release() -> void:
	if is_holding_object():
		_release_held_body(0.0)
	else:
		_try_pickup_body()


func detonate_all_charges() -> int:
	_prune_charges()
	var count := _active_charges.size()
	if count == 0:
		return 0
	var list := _active_charges.duplicate()
	_active_charges.clear()
	for ch in list:
		if is_instance_valid(ch):
			ch.trigger_explosion()
	if _player != null:
		_player.add_trauma(0.75)
	charges_changed.emit(0)
	tutorial_action.emit("charge_detonated")
	return count


func _process(dt: float) -> void:
	if _player == null or _world == null or _player.in_vehicle:
		_stop_continuous_effects()
		if _bridge_preview != null:
			_bridge_preview.visible = false
		return

	_cooldown = maxf(0.0, _cooldown - dt)

	# Viewmodel gentle return
	if _vm_mesh != null:
		_vm_mesh.position = _vm_mesh.position.lerp(Vector3.ZERO, clampf(dt * 14.0, 0.0, 1.0))

	# Keep held object anchored in front of camera
	if is_holding_object():
		var cam := _player.camera
		var target_pos := cam.global_position + (-cam.global_transform.basis.z) * 2.3
		var diff := target_pos - _held_body.global_position
		_held_body.linear_velocity = diff * 11.0
		_held_body.angular_velocity *= 0.85

	# Continuous hold tools
	if _primary_held:
		if active_tool == ToolId.LANCE:
			_process_thermal_lance(dt)
		elif active_tool == ToolId.FOAM:
			_process_cryo_foam(dt)
		elif active_tool == ToolId.HAMMER and _cooldown <= 0.0:
			_fire_hammer()
	else:
		_stop_continuous_effects()

	_update_bridge_preview()


func _on_primary_pressed() -> void:
	if _player == null or _player.in_vehicle:
		return
	if is_holding_object():
		_release_held_body(13.5)
		return

	match active_tool:
		ToolId.HAMMER:
			if _cooldown <= 0.0:
				_fire_hammer()
		ToolId.CHARGE:
			if _cooldown <= 0.0:
				_throw_charge()
		ToolId.BRIDGE:
			if _cooldown <= 0.0:
				_place_bridge()
		ToolId.GRAB:
			_try_pickup_body()


func _fire_hammer() -> void:
	_cooldown = 0.28
	if _vm_mesh != null:
		_vm_mesh.position = Vector3(0.0, -0.05, 0.14)

	var cam := _player.camera
	var origin := cam.global_position
	var dir := -cam.global_transform.basis.z

	# Check PhysicsProp hit first
	var space := _player.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(origin, origin + dir * 4.2, 4)
	var phit := space.intersect_ray(q)
	if not phit.is_empty() and phit.get("collider") is PhysicsProp:
		var prop := phit["collider"] as PhysicsProp
		prop.apply_prop_damage(16.0, dir * 18.0)
		AppServices.play_sfx("impact_metal", 0.0, 0.12)
		AppServices.vibrate(25)
		return

	var rc := _world.raycast(origin, dir, 4.2)
	if bool(rc.get("hit", false)):
		var mat_id: int = int(rc["mat_id"])
		var hit_pos: Vector3 = rc["position"]
		if VoxelMaterials.is_hammer_immune(mat_id):
			AppServices.play_sfx("impact_metal", -2.0, 0.1)
			_world.spawn_fx_burst(hit_pos, Color(1.0, 0.85, 0.35), 4)
			AppServices.vibrate(14)
			return
		var destroyed := _world.carve_sphere(hit_pos, 0.72, 28.0, false, true)
		AppServices.play_sfx(VoxelMaterials.get_impact_sfx(mat_id), 0.0, 0.1)
		_player.add_trauma(0.14)
		AppServices.vibrate(28)
		if destroyed > 0:
			tutorial_action.emit("hammer_break")


func _process_thermal_lance(dt: float) -> void:
	var cam := _player.camera
	var origin := cam.global_position
	var dir := -cam.global_transform.basis.z
	var rc := _world.raycast(origin, dir, 6.2)
	var end_pos := origin + dir * 6.2
	if bool(rc.get("hit", false)):
		end_pos = rc["position"]
		var mat_id: int = int(rc["mat_id"])
		var cut := _world.carve_sphere(end_pos, 0.44, 210.0 * dt, true, true)
		if _world.fire_sim != null:
			_world.fire_sim.ignite_sphere(end_pos, 0.75, _world)
		_spray_accum += dt
		if _spray_accum >= 0.07:
			_spray_accum = 0.0
			_world.spawn_fx_burst(end_pos, Color(1.0, 0.62, 0.18), 4)
			AppServices.vibrate(10)
		if cut > 0 and mat_id == VoxelMaterials.Id.STEEL:
			tutorial_action.emit("lance_cut_steel")
	else:
		# Allow cutting/heating barrels directly
		var space := _player.get_world_3d().direct_space_state
		var q := PhysicsRayQueryParameters3D.create(origin, end_pos, 4)
		var phit := space.intersect_ray(q)
		if not phit.is_empty() and phit.get("collider") is PhysicsProp:
			end_pos = phit["position"]
			(phit["collider"] as PhysicsProp).apply_prop_damage(45.0 * dt, dir * 1.5)

	_show_beam(origin + cam.global_transform.basis.x * 0.24 + Vector3(0.0, -0.15, 0.0), end_pos)
	AppServices.play_loop("lance_beam", 1.05, -5.0)


func _process_cryo_foam(dt: float) -> void:
	var cam := _player.camera
	var origin := cam.global_position
	var dir := -cam.global_transform.basis.z
	var rc := _world.raycast(origin, dir, 8.0)
	var target: Vector3 = rc["position"] if bool(rc.get("hit", false)) else origin + dir * 6.0

	var extinguished := 0
	if _world.fire_sim != null:
		extinguished += _world.fire_sim.extinguish_sphere(target, 2.3)
		extinguished += _world.fire_sim.extinguish_sphere(origin + dir * 3.0, 2.0)

	_spray_accum += dt
	if _spray_accum >= 0.08:
		_spray_accum = 0.0
		_world.spawn_fx_burst(target, Color(0.76, 0.96, 1.0), 5)
		AppServices.play_sfx("foam_spray", -4.0, 0.12)
	if extinguished > 0:
		tutorial_action.emit("fire_extinguished")


func _throw_charge() -> void:
	if not sandbox_infinite:
		var left := int(ammo.get(ToolId.CHARGE, 0))
		if left <= 0:
			return
		ammo[ToolId.CHARGE] = left - 1

	_cooldown = 0.35
	var cam := _player.camera
	var dir := -cam.global_transform.basis.z
	var charge := SeismicCharge.new()
	charge.position = cam.global_position + dir * 0.65
	_parent_3d.add_child(charge)
	charge.setup(_world, dir * 13.5 + Vector3(0.0, 2.8, 0.0), false)
	_active_charges.append(charge)
	AppServices.play_sfx("charge_beep", -2.0, 0.05)
	AppServices.vibrate(18)
	charges_changed.emit(_active_charges.size())


func _place_bridge() -> void:
	if not sandbox_infinite:
		var left := int(ammo.get(ToolId.BRIDGE, 0))
		if left <= 0:
			return
		ammo[ToolId.BRIDGE] = left - 1

	_cooldown = 0.30
	var span := _compute_bridge_endpoints()
	var placed := _world.place_bridge_span(span["start"], span["end"], 2)
	if placed > 0:
		AppServices.play_sfx("bridge_place", 0.0, 0.08)
		AppServices.vibrate(20)
		tutorial_action.emit("bridge_placed")


func _compute_bridge_endpoints() -> Dictionary:
	var cam := _player.camera
	var origin := cam.global_position
	var dir := -cam.global_transform.basis.z
	var rc := _world.raycast(origin, dir, 10.5)
	var start := _player.global_position + Vector3(0.0, 0.15, 0.0) + dir.slide(Vector3.UP).normalized() * 1.1
	var end := start + dir.slide(Vector3.UP).normalized() * 5.0
	if bool(rc.get("hit", false)):
		end = rc["position"]
		if start.distance_to(end) > 10.0:
			start = end - (end - start).normalized() * 7.5
	return {"start": start, "end": end}


func _update_bridge_preview() -> void:
	if _bridge_preview == null:
		return
	if active_tool != ToolId.BRIDGE:
		_bridge_preview.visible = false
		return
	var span := _compute_bridge_endpoints()
	var a: Vector3 = span["start"]
	var b: Vector3 = span["end"]
	var dist := a.distance_to(b)
	if dist < 0.4:
		_bridge_preview.visible = false
		return
	_bridge_preview.visible = true
	_bridge_preview.global_position = (a + b) * 0.5
	_bridge_preview.look_at(b, Vector3.UP)
	_bridge_preview.scale = Vector3(1.0, 1.0, dist)


func _try_pickup_body() -> void:
	var cam := _player.camera
	var origin := cam.global_position
	var dir := -cam.global_transform.basis.z
	var space := _player.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(origin, origin + dir * 4.5, 2 | 4)
	var hit := space.intersect_ray(q)
	if hit.is_empty():
		return
	var col: Variant = hit.get("collider")
	if col is PhysicsProp:
		var prop := col as PhysicsProp
		if prop.kind == PhysicsProp.Kind.OBJECTIVE_CORE:
			prop.collect()
			return
		prop.set_held(true)
		_held_body = prop
		AppServices.play_sfx("ui_click", -2.0, 0.1)
	elif col is RigidBody3D:
		var rb := col as RigidBody3D
		rb.gravity_scale = 0.0
		rb.linear_damp = 8.0
		rb.sleeping = false
		_held_body = rb


func _release_held_body(throw_speed: float) -> void:
	if not is_holding_object():
		_held_body = null
		return
	if _held_body is PhysicsProp:
		(_held_body as PhysicsProp).set_held(false)
	else:
		_held_body.gravity_scale = 1.0
		_held_body.linear_damp = 0.05
	if throw_speed > 0.1 and _player != null:
		var dir := -_player.camera.global_transform.basis.z
		_held_body.linear_velocity = dir * throw_speed
		AppServices.play_sfx("impact_wood", -5.0, 0.1)
	_held_body = null


func _show_beam(a: Vector3, b: Vector3) -> void:
	if _beam_mesh == null:
		return
	var d := a.distance_to(b)
	if d < 0.05:
		_beam_mesh.visible = false
		return
	_beam_mesh.visible = true
	_beam_mesh.global_position = (a + b) * 0.5
	_beam_mesh.look_at(b, Vector3.UP)
	_beam_mesh.rotate_object_local(Vector3.RIGHT, PI * 0.5)
	_beam_mesh.scale = Vector3(1.0, d, 1.0)


func _stop_continuous_effects() -> void:
	if _beam_mesh != null:
		_beam_mesh.visible = false
	AppServices.stop_loop()


func _prune_charges() -> void:
	var kept: Array[SeismicCharge] = []
	for c in _active_charges:
		if is_instance_valid(c):
			kept.append(c)
	_active_charges = kept
