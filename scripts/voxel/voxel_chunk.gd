class_name VoxelChunk
extends Node3D
## Sparse 16x16x16 voxel chunk owning mesh and aggregated greedy BoxShape3D colliders.

const SIZE := VoxelMesher.CHUNK_SIZE
const VOLUME := SIZE * SIZE * SIZE

var coord: Vector3i = Vector3i.ZERO
var voxels: PackedByteArray = PackedByteArray()
var solid_count: int = 0
var damage_map: Dictionary = {}
var dirty: bool = false
var rebuild_queued: bool = false
var triangle_count: int = 0
var collider_count: int = 0

var _mesh_instance: MeshInstance3D
var _static_body: StaticBody3D
var _shape_nodes: Array[CollisionShape3D] = []


func _init(p_coord: Vector3i = Vector3i.ZERO) -> void:
	coord = p_coord
	name = "Chunk_%d_%d_%d" % [coord.x, coord.y, coord.z]
	position = Vector3(coord) * VoxelMesher.CHUNK_WORLD_SIZE


func _ready() -> void:
	_ensure_nodes()


func _ensure_nodes() -> void:
	if _mesh_instance == null:
		_mesh_instance = MeshInstance3D.new()
		_mesh_instance.name = "Mesh"
		add_child(_mesh_instance)
	if _static_body == null:
		_static_body = StaticBody3D.new()
		_static_body.name = "Collision"
		_static_body.collision_layer = 1
		_static_body.collision_mask = 0
		add_child(_static_body)


func is_empty() -> bool:
	return solid_count <= 0 or voxels.is_empty()


func get_voxel(lx: int, ly: int, lz: int) -> int:
	if voxels.is_empty():
		return 0
	return voxels[(ly << 8) | (lz << 4) | lx]


func set_voxel(lx: int, ly: int, lz: int, mat_id: int) -> bool:
	var idx := (ly << 8) | (lz << 4) | lx
	if mat_id == 0:
		if voxels.is_empty():
			return false
		var prev := voxels[idx]
		if prev == 0:
			return false
		voxels[idx] = 0
		damage_map.erase(idx)
		solid_count -= 1
		if solid_count <= 0:
			solid_count = 0
			voxels = PackedByteArray()
			damage_map.clear()
		dirty = true
		return true

	if voxels.is_empty():
		voxels = PackedByteArray()
		voxels.resize(VOLUME)
	var prev_solid := voxels[idx]
	if prev_solid == mat_id:
		return false
	if prev_solid == 0:
		solid_count += 1
	voxels[idx] = mat_id
	damage_map.erase(idx)
	dirty = true
	return true


func apply_damage(lx: int, ly: int, lz: int, dmg: float) -> Dictionary:
	var idx := (ly << 8) | (lz << 4) | lx
	if voxels.is_empty():
		return {"destroyed": false, "prev_mat": 0}
	var mat_id := voxels[idx]
	if mat_id == 0 or VoxelMaterials.is_indestructible(mat_id):
		return {"destroyed": false, "prev_mat": mat_id}

	var cur_hp: float = float(damage_map.get(idx, VoxelMaterials.get_hp(mat_id)))
	cur_hp -= dmg
	if cur_hp <= 0.0:
		set_voxel(lx, ly, lz, 0)
		return {"destroyed": true, "prev_mat": mat_id}
	damage_map[idx] = cur_hp
	return {"destroyed": false, "prev_mat": mat_id}


func get_core_copy() -> PackedByteArray:
	if voxels.is_empty():
		return PackedByteArray()
	return voxels.duplicate()


func apply_geometry(geom: Dictionary, boxes: Array[Dictionary], shared_material: Material) -> void:
	_ensure_nodes()
	var indices: PackedInt32Array = geom.get("indices", PackedInt32Array())
	triangle_count = indices.size() / 3
	if triangle_count == 0:
		_mesh_instance.mesh = null
		_mesh_instance.visible = false
	else:
		_mesh_instance.mesh = VoxelMesher.create_array_mesh(geom)
		_mesh_instance.material_override = shared_material
		_mesh_instance.visible = true

	collider_count = boxes.size()
	while _shape_nodes.size() < collider_count:
		var cs := CollisionShape3D.new()
		cs.shape = BoxShape3D.new()
		_static_body.add_child(cs)
		_shape_nodes.append(cs)

	for i in range(_shape_nodes.size()):
		var cs: CollisionShape3D = _shape_nodes[i]
		if i < collider_count:
			var b: Dictionary = boxes[i]
			var box_shape: BoxShape3D = cs.shape as BoxShape3D
			box_shape.size = b["size"]
			cs.position = b["center"]
			cs.disabled = false
		else:
			cs.disabled = true

	dirty = false
	rebuild_queued = false
