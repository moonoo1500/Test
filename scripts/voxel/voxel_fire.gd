class_name VoxelFire
extends RefCounted
## Bounded sparse fire and combustion manager with Cryo-Foam suppression.

const SPREAD_DIRS := [
	Vector3i(1, 0, 0),
	Vector3i(-1, 0, 0),
	Vector3i(0, 1, 0),
	Vector3i(0, -1, 0),
	Vector3i(0, 0, 1),
	Vector3i(0, 0, -1),
]

const STEP_INTERVAL := 0.35

var active_fires: Dictionary = {} # Vector3i -> float (remaining burn seconds)
var max_active_fires: int = 48
var extinguished_total: int = 0
var _accum: float = 0.0


func clear() -> void:
	active_fires.clear()
	_accum = 0.0


func ignite_cell(cell: Vector3i, world: Node, duration: float = 7.5) -> bool:
	if active_fires.has(cell):
		return false
	if active_fires.size() >= max_active_fires:
		return false
	var mat: int = world.get_voxel(cell)
	if not VoxelMaterials.is_flammable(mat):
		return false
	active_fires[cell] = duration
	return true


func ignite_sphere(world_pos: Vector3, radius: float, world: Node) -> int:
	var vs := VoxelMesher.VOXEL_SIZE
	var min_c := Vector3i(floor((world_pos - Vector3.ONE * radius) / vs))
	var max_c := Vector3i(ceil((world_pos + Vector3.ONE * radius) / vs))
	var r2 := radius * radius
	var count := 0
	for y in range(min_c.y, max_c.y + 1):
		for z in range(min_c.z, max_c.z + 1):
			for x in range(min_c.x, max_c.x + 1):
				var c := Vector3i(x, y, z)
				var cp := (Vector3(c) + Vector3(0.5, 0.5, 0.5)) * vs
				if cp.distance_squared_to(world_pos) <= r2:
					if ignite_cell(c, world):
						count += 1
						if active_fires.size() >= max_active_fires:
							return count
	return count


func extinguish_sphere(world_pos: Vector3, radius: float) -> int:
	var vs := VoxelMesher.VOXEL_SIZE
	var r2 := radius * radius
	var removed := 0
	var keys := active_fires.keys()
	for k in keys:
		var cell: Vector3i = k
		var cp := (Vector3(cell) + Vector3(0.5, 0.5, 0.5)) * vs
		if cp.distance_squared_to(world_pos) <= r2:
			active_fires.erase(cell)
			removed += 1
	extinguished_total += removed
	return removed


func step(dt: float, world: Node) -> Array[Vector3i]:
	var ignited_list: Array[Vector3i] = []
	if active_fires.is_empty():
		return ignited_list
	_accum += dt
	if _accum < STEP_INTERVAL:
		return ignited_list
	_accum = 0.0

	var keys := active_fires.keys()
	var fuel_blasts: Array[Vector3] = []
	for k in keys:
		var cell: Vector3i = k
		var mat: int = world.get_voxel(cell)
		if mat == 0 or not VoxelMaterials.is_flammable(mat):
			active_fires.erase(cell)
			continue

		if mat == VoxelMaterials.Id.FUEL:
			active_fires.erase(cell)
			fuel_blasts.append((Vector3(cell) + Vector3(0.5, 0.5, 0.5)) * VoxelMesher.VOXEL_SIZE)
			continue

		var rem: float = float(active_fires[cell]) - STEP_INTERVAL
		if rem <= 0.0:
			active_fires.erase(cell)
			world.set_voxel(cell, VoxelMaterials.Id.CHARRED)
		else:
			active_fires[cell] = rem
			if active_fires.size() < max_active_fires:
				for d in SPREAD_DIRS:
					if active_fires.size() >= max_active_fires:
						break
					var nb: Vector3i = cell + d
					if not active_fires.has(nb):
						var nb_mat: int = world.get_voxel(nb)
						if VoxelMaterials.is_flammable(nb_mat) and randf() < 0.24:
							active_fires[nb] = randf_range(5.5, 9.0)
							ignited_list.append(nb)

	for bpos in fuel_blasts:
		world.detonate_explosion(bpos, 3.2, 75.0, false)

	return ignited_list
