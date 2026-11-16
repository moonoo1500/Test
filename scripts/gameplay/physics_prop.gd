class_name PhysicsProp
extends RigidBody3D
## Interactive physical object: supply crate, explosive fuel barrel, objective core, or steel counterweight.

signal collected(prop: PhysicsProp)

enum Kind {
	CRATE = 0,
	FUEL_BARREL = 1,
	OBJECTIVE_CORE = 2,
	STEEL_WEIGHT = 3,
}

var kind: Kind = Kind.CRATE
var objective_id: String = ""
var is_collected: bool = false
var is_held: bool = false
var hp: float = 25.0

var _voxel_world: VoxelWorld
var _beacon_mesh: MeshInstance3D
var _detonated: bool = false


func setup(p_kind: Kind, p_world: VoxelWorld, p_obj_id: String = "") -> void:
	kind = p_kind
	_voxel_world = p_world
	objective_id = p_obj_id
	_build_visual_and_shape()


func _ready() -> void:
	collision_layer = 4
	collision_mask = 1 | 2 | 4
	can_sleep = true
	contact_monitor = true
	max_contacts_reported = 4


func _process(dt: float) -> void:
	if _beacon_mesh != null and not is_collected:
		_beacon_mesh.rotate_y(dt * 2.2)
		var s := 1.0 + 0.12 * sin(float(Time.get_ticks_msec()) * 0.006)
		_beacon_mesh.scale = Vector3.ONE * s


func _build_visual_and_shape() -> void:
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	var mi := MeshInstance3D.new()
	var mat := StandardMaterial3D.new()

	match kind:
		Kind.CRATE:
			mass = 12.0
			hp = 20.0
			bs.size = Vector3(0.85, 0.85, 0.85)
			var bm := BoxMesh.new()
			bm.size = bs.size
			mi.mesh = bm
			mat.albedo_color = Color(0.68, 0.49, 0.28)
			mat.roughness = 0.82
		Kind.FUEL_BARREL:
			mass = 18.0
			hp = 12.0
			bs.size = Vector3(0.72, 1.05, 0.72)
			var cyl := CylinderMesh.new()
			cyl.top_radius = 0.36
			cyl.bottom_radius = 0.36
			cyl.height = 1.05
			cyl.radial_segments = 12
			mi.mesh = cyl
			mat.albedo_color = Color(0.86, 0.20, 0.16)
			mat.emission_enabled = true
			mat.emission = Color(0.25, 0.04, 0.02)
			mat.roughness = 0.45
		Kind.OBJECTIVE_CORE:
			mass = 8.0
			hp = 9999.0
			bs.size = Vector3(0.68, 0.68, 0.68)
			var bm := BoxMesh.new()
			bm.size = Vector3(0.62, 0.62, 0.62)
			mi.mesh = bm
			mat.albedo_color = Color(0.14, 0.82, 0.96)
			mat.emission_enabled = true
			mat.emission = Color(0.18, 0.88, 1.0)
			mat.emission_energy_multiplier = 1.8
			mat.roughness = 0.25
			mat.metallic = 0.6

			_beacon_mesh = MeshInstance3D.new()
			var ring := TorusMesh.new()
			ring.inner_radius = 0.42
			ring.outer_radius = 0.52
			ring.rings = 16
			ring.ring_segments = 8
			_beacon_mesh.mesh = ring
			var bmat := StandardMaterial3D.new()
			bmat.albedo_color = Color(1.0, 0.76, 0.18)
			bmat.emission_enabled = true
			bmat.emission = Color(1.0, 0.72, 0.12)
			bmat.emission_energy_multiplier = 2.0
			_beacon_mesh.material_override = bmat
			_beacon_mesh.position = Vector3(0.0, 0.65, 0.0)
			add_child(_beacon_mesh)
		Kind.STEEL_WEIGHT:
			mass = 40.0
			hp = 300.0
			bs.size = Vector3(1.1, 0.9, 1.1)
			var bm := BoxMesh.new()
			bm.size = bs.size
			mi.mesh = bm
			mat.albedo_color = Color(0.32, 0.42, 0.52)
			mat.metallic = 0.7
			mat.roughness = 0.4

	cs.shape = bs
	mi.material_override = mat
	add_child(cs)
	add_child(mi)


func set_held(held: bool) -> void:
	is_held = held
	gravity_scale = 0.0 if held else 1.0
	linear_damp = 8.0 if held else 0.05
	angular_damp = 8.0 if held else 0.05
	if held:
		sleeping = false


func apply_prop_damage(dmg: float, impulse_vec: Vector3 = Vector3.ZERO) -> void:
	if is_collected:
		return
	if impulse_vec.length_squared() > 0.001:
		sleeping = false
		apply_central_impulse(impulse_vec)
	if kind == Kind.OBJECTIVE_CORE:
		return
	hp -= dmg
	if hp <= 0.0:
		if kind == Kind.FUEL_BARREL:
			detonate()
		else:
			if _voxel_world != null:
				_voxel_world.spawn_fx_burst(global_position, Color(0.65, 0.48, 0.28), 8)
			queue_free()


func detonate() -> void:
	if _detonated:
		return
	_detonated = true
	var pos := global_position
	queue_free()
	if _voxel_world != null:
		_voxel_world.detonate_explosion(pos, 3.2, 95.0, true)


func collect() -> void:
	if is_collected or kind != Kind.OBJECTIVE_CORE:
		return
	is_collected = true
	collected.emit(self)
	queue_free()
