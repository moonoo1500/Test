class_name VoxelWorld
extends Node3D
## Sparse chunked voxel world with WorkerThreadPool greedy meshing, DDA raycast,
## incremental structural collapse, bounded fire, and MultiMesh debris pooling.

signal explosion_occurred(world_pos: Vector3, radius: float)
signal voxels_changed(destroyed_count: int)

const CHUNK_SIZE := VoxelMesher.CHUNK_SIZE
const VOXEL_SIZE := VoxelMesher.VOXEL_SIZE
const MAX_EXPLOSION_DEPTH := 3

var chunks: Dictionary = {} # Vector3i -> VoxelChunk
var dirty_queue: Array[Vector3i] = []
var dirty_set: Dictionary = {}
var shared_material: ShaderMaterial
var fire_sim: VoxelFire

var anchor_max_y: int = 1
var voxels_destroyed_total: int = 0
var max_commits_per_frame: int = 4
var max_active_debris_bodies: int = 22
var max_particles_budget: int = 128

# Telemetry stats for debug HUD & Benchmark
var last_chunk_build_ms: float = 0.0
var total_triangles: int = 0
var total_colliders: int = 0

var _build_mutex: Mutex = Mutex.new()
var _completed_builds: Array[Dictionary] = []
var _pending_tasks: Array[int] = []
var _detached_bodies: Array[Dictionary] = [] # {"body": RigidBody3D, "age": float}
var _debris_multimesh: MultiMeshInstance3D
var _particles: Array[Dictionary] = []
var _fire_multimesh: MultiMeshInstance3D
var _explosion_depth: int = 0
var _world_epoch: int = 0


func _ready() -> void:
	shared_material = VoxelMaterials.create_voxel_shader_material()
	fire_sim = VoxelFire.new()
	_setup_particle_pools()
	apply_quality_settings()


func _exit_tree() -> void:
	_wait_all_pending_tasks()


func apply_quality_settings() -> void:
	var cfg := AppServices.quality_cfg()
	max_commits_per_frame = int(cfg.get("max_chunk_commits_per_frame", 4))
	max_active_debris_bodies = int(cfg.get("max_active_debris_bodies", 22))
	max_particles_budget = int(cfg.get("max_particles_budget", 128))
	if fire_sim != null:
		fire_sim.max_active_fires = int(cfg.get("max_active_fires", 48))
	if _debris_multimesh != null and _debris_multimesh.multimesh != null:
		_debris_multimesh.multimesh.instance_count = max_particles_budget


func _process(dt: float) -> void:
	_dispatch_dirty_chunks()
	_commit_completed_chunks()
	if fire_sim != null:
		fire_sim.step(dt, self)
	_update_particles(dt)
	_update_detached_bodies(dt)
	_update_fire_visuals()


func clear_world() -> void:
	_world_epoch += 1
	_wait_all_pending_tasks()
	_build_mutex.lock()
	_completed_builds.clear()
	_build_mutex.unlock()

	dirty_queue.clear()
	dirty_set.clear()

	for k in chunks.keys():
		var ch: VoxelChunk = chunks[k]
		if ch != null and is_instance_valid(ch):
			ch.queue_free()
	chunks.clear()

	for item in _detached_bodies:
		var body: RigidBody3D = item["body"]
		if body != null and is_instance_valid(body):
			body.queue_free()
	_detached_bodies.clear()
	_particles.clear()
	if fire_sim != null:
		fire_sim.clear()
	voxels_destroyed_total = 0
	total_triangles = 0
	total_colliders = 0


func cell_to_chunk_coord(cell: Vector3i) -> Vector3i:
	return Vector3i(
		floori(float(cell.x) / float(CHUNK_SIZE)),
		floori(float(cell.y) / float(CHUNK_SIZE)),
		floori(float(cell.z) / float(CHUNK_SIZE))
	)


func cell_to_local(cell: Vector3i) -> Vector3i:
	return Vector3i(
		posmod(cell.x, CHUNK_SIZE),
		posmod(cell.y, CHUNK_SIZE),
		posmod(cell.z, CHUNK_SIZE)
	)


func world_to_cell(pos: Vector3) -> Vector3i:
	return Vector3i(
		floori(pos.x / VOXEL_SIZE),
		floori(pos.y / VOXEL_SIZE),
		floori(pos.z / VOXEL_SIZE)
	)


func cell_to_world_center(cell: Vector3i) -> Vector3:
	return (Vector3(cell) + Vector3(0.5, 0.5, 0.5)) * VOXEL_SIZE


func get_voxel(cell: Vector3i) -> int:
	var cc := cell_to_chunk_coord(cell)
	if not chunks.has(cc):
		return 0
	var ch: VoxelChunk = chunks[cc]
	if ch == null or ch.is_empty():
		return 0
	var loc := cell_to_local(cell)
	return ch.get_voxel(loc.x, loc.y, loc.z)


func set_voxel(cell: Vector3i, mat_id: int) -> bool:
	var cc := cell_to_chunk_coord(cell)
	var ch: VoxelChunk = chunks.get(cc, null)
	if ch == null:
		if mat_id == 0:
			return false
		ch = VoxelChunk.new(cc)
		chunks[cc] = ch
		add_child(ch)

	var loc := cell_to_local(cell)
	var changed := ch.set_voxel(loc.x, loc.y, loc.z, mat_id)
	if changed:
		_mark_dirty(cc)
		_mark_boundary_neighbors(cc, loc)
	return changed


func restore_chunk_voxels(cc: Vector3i, voxels: PackedByteArray) -> void:
	if voxels.size() != VoxelChunk.VOLUME:
		return
	var solid := 0
	for b in voxels:
		if b != 0:
			solid += 1
	if solid == 0:
		return
	var ch: VoxelChunk = chunks.get(cc, null)
	if ch == null:
		ch = VoxelChunk.new(cc)
		chunks[cc] = ch
		add_child(ch)
	ch.voxels = voxels
	ch.solid_count = solid
	ch.damage_map.clear()
	ch.dirty = true
	_mark_dirty(cc)


func fill_box(min_cell: Vector3i, max_cell: Vector3i, mat_id: int) -> void:
	for y in range(min_cell.y, max_cell.y + 1):
		for z in range(min_cell.z, max_cell.z + 1):
			for x in range(min_cell.x, max_cell.x + 1):
				set_voxel(Vector3i(x, y, z), mat_id)


func _mark_dirty(cc: Vector3i) -> void:
	if not chunks.has(cc):
		return
	var ch: VoxelChunk = chunks[cc]
	ch.dirty = true
	if not dirty_set.has(cc):
		dirty_set[cc] = true
		dirty_queue.append(cc)


func _mark_boundary_neighbors(cc: Vector3i, loc: Vector3i) -> void:
	if loc.x == 0:
		_mark_dirty(cc + Vector3i(-1, 0, 0))
	elif loc.x == CHUNK_SIZE - 1:
		_mark_dirty(cc + Vector3i(1, 0, 0))
	if loc.y == 0:
		_mark_dirty(cc + Vector3i(0, -1, 0))
	elif loc.y == CHUNK_SIZE - 1:
		_mark_dirty(cc + Vector3i(0, 1, 0))
	if loc.z == 0:
		_mark_dirty(cc + Vector3i(0, 0, -1))
	elif loc.z == CHUNK_SIZE - 1:
		_mark_dirty(cc + Vector3i(0, 0, 1))


func _pack_padded_snapshot(cc: Vector3i) -> Dictionary:
	var padded := PackedByteArray()
	padded.resize(VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE)
	var center_chunk: VoxelChunk = chunks.get(cc, null)
	if center_chunk == null or center_chunk.is_empty():
		return {"padded": padded, "core": PackedByteArray()}

	var core := center_chunk.get_core_copy()
	# Copy 16x16x16 core into padded[1..16, 1..16, 1..16]
	for y in range(CHUNK_SIZE):
		for z in range(CHUNK_SIZE):
			var src_row := (y << 8) | (z << 4)
			var dst_row := ((y + 1) * VoxelMesher.PADDED_SIZE + (z + 1)) * VoxelMesher.PADDED_SIZE + 1
			for x in range(CHUNK_SIZE):
				padded[dst_row + x] = core[src_row + x]

	# Copy 6 immediate neighbor faces (plus edge/corner voxels for accurate AO)
	for dy in range(-1, 2):
		for dz in range(-1, 2):
			for dx in range(-1, 2):
				if dx == 0 and dy == 0 and dz == 0:
					continue
				var nb_chunk: VoxelChunk = chunks.get(cc + Vector3i(dx, dy, dz), null)
				if nb_chunk == null or nb_chunk.is_empty():
					continue
				var nb_vox := nb_chunk.voxels
				var x_range := _border_range(dx)
				var y_range := _border_range(dy)
				var z_range := _border_range(dz)
				for py in y_range:
					var sy: int = py - 1 - dy * CHUNK_SIZE
					for pz in z_range:
						var sz: int = pz - 1 - dz * CHUNK_SIZE
						var p_base := (py * VoxelMesher.PADDED_SIZE + pz) * VoxelMesher.PADDED_SIZE
						var s_base := (sy << 8) | (sz << 4)
						for px in x_range:
							var sx: int = px - 1 - dx * CHUNK_SIZE
							padded[p_base + px] = nb_vox[s_base + sx]

	return {"padded": padded, "core": core}


func _border_range(delta: int) -> Array[int]:
	if delta == -1:
		return [0]
	if delta == 1:
		return [VoxelMesher.PADDED_SIZE - 1]
	var out: Array[int] = []
	for i in range(1, CHUNK_SIZE + 1):
		out.append(i)
	return out


func rebuild_dirty_sync() -> void:
	_wait_all_pending_tasks()
	var t0 := Time.get_ticks_usec()
	while not dirty_queue.is_empty():
		var cc: Vector3i = dirty_queue.pop_front()
		dirty_set.erase(cc)
		var ch: VoxelChunk = chunks.get(cc, null)
		if ch == null:
			continue
		var snap := _pack_padded_snapshot(cc)
		var geom := VoxelMesher.build_chunk_geometry(snap["padded"])
		var boxes := VoxelMesher.build_greedy_boxes(snap["core"])
		ch.apply_geometry(geom, boxes, shared_material)
		if ch.is_empty():
			chunks.erase(cc)
			ch.queue_free()
	last_chunk_build_ms = float(Time.get_ticks_usec() - t0) / 1000.0
	_recompute_world_stats()


func _dispatch_dirty_chunks() -> void:
	var budget := maxi(2, max_commits_per_frame * 2)
	var dispatched := 0
	while not dirty_queue.is_empty() and dispatched < budget:
		var cc: Vector3i = dirty_queue.pop_front()
		dirty_set.erase(cc)
		var ch: VoxelChunk = chunks.get(cc, null)
		if ch == null or ch.rebuild_queued:
			continue
		ch.rebuild_queued = true
		var snap := _pack_padded_snapshot(cc)
		var epoch := _world_epoch
		var task_id := WorkerThreadPool.add_task(func() -> void:
			var t0 := Time.get_ticks_usec()
			var geom := VoxelMesher.build_chunk_geometry(snap["padded"])
			var boxes := VoxelMesher.build_greedy_boxes(snap["core"])
			var elapsed_ms := float(Time.get_ticks_usec() - t0) / 1000.0
			_build_mutex.lock()
			_completed_builds.append({
				"epoch": epoch,
				"coord": cc,
				"geom": geom,
				"boxes": boxes,
				"ms": elapsed_ms,
			})
			_build_mutex.unlock()
		)
		_pending_tasks.append(task_id)
		dispatched += 1


func _commit_completed_chunks() -> void:
	var finished_tasks: Array[int] = []
	for tid in _pending_tasks:
		if WorkerThreadPool.is_task_completed(tid):
			WorkerThreadPool.wait_for_task_completion(tid)
		else:
			finished_tasks.append(tid)
	_pending_tasks = finished_tasks

	var commits := 0
	while commits < max_commits_per_frame:
		var item: Dictionary = {}
		_build_mutex.lock()
		if not _completed_builds.is_empty():
			item = _completed_builds.pop_front()
		_build_mutex.unlock()
		if item.is_empty():
			break
		if int(item.get("epoch", -1)) != _world_epoch:
			continue
		var cc: Vector3i = item["coord"]
		var ch: VoxelChunk = chunks.get(cc, null)
		if ch != null and is_instance_valid(ch):
			ch.apply_geometry(item["geom"], item["boxes"], shared_material)
			last_chunk_build_ms = float(item.get("ms", 0.0))
			if ch.is_empty() and not ch.dirty:
				chunks.erase(cc)
				ch.queue_free()
		commits += 1

	if commits > 0:
		_recompute_world_stats()


func _wait_all_pending_tasks() -> void:
	for tid in _pending_tasks:
		WorkerThreadPool.wait_for_task_completion(tid)
	_pending_tasks.clear()


func _recompute_world_stats() -> void:
	var tris := 0
	var cols := 0
	for k in chunks.keys():
		var ch: VoxelChunk = chunks[k]
		if ch != null and is_instance_valid(ch):
			tris += ch.triangle_count
			cols += ch.collider_count
	total_triangles = tris
	total_colliders = cols


func raycast(origin: Vector3, dir: Vector3, max_dist: float = 30.0) -> Dictionary:
	var n_dir := dir.normalized()
	if n_dir.length_squared() < 0.001:
		return {"hit": false}

	var pos := origin / VOXEL_SIZE
	var cell := Vector3i(floori(pos.x), floori(pos.y), floori(pos.z))

	var step := Vector3i(
		1 if n_dir.x >= 0.0 else -1,
		1 if n_dir.y >= 0.0 else -1,
		1 if n_dir.z >= 0.0 else -1
	)

	var t_delta := Vector3(
		absf(1.0 / n_dir.x) if absf(n_dir.x) > 1e-6 else 1e9,
		absf(1.0 / n_dir.y) if absf(n_dir.y) > 1e-6 else 1e9,
		absf(1.0 / n_dir.z) if absf(n_dir.z) > 1e-6 else 1e9
	)

	var t_max := Vector3(
		((float(cell.x + (1 if step.x > 0 else 0)) - pos.x) / n_dir.x) if absf(n_dir.x) > 1e-6 else 1e9,
		((float(cell.y + (1 if step.y > 0 else 0)) - pos.y) / n_dir.y) if absf(n_dir.y) > 1e-6 else 1e9,
		((float(cell.z + (1 if step.z > 0 else 0)) - pos.z) / n_dir.z) if absf(n_dir.z) > 1e-6 else 1e9
	)

	var max_vox_dist := max_dist / VOXEL_SIZE
	var dist := 0.0
	var hit_normal := Vector3i.ZERO

	for _iter in range(160):
		var mat := get_voxel(cell)
		if mat != 0 and dist > 0.001:
			return {
				"hit": true,
				"cell": cell,
				"normal": hit_normal,
				"mat_id": mat,
				"distance": dist * VOXEL_SIZE,
				"position": origin + n_dir * (dist * VOXEL_SIZE),
			}

		if t_max.x < t_max.y and t_max.x < t_max.z:
			dist = t_max.x
			t_max.x += t_delta.x
			cell.x += step.x
			hit_normal = Vector3i(-step.x, 0, 0)
		elif t_max.y < t_max.z:
			dist = t_max.y
			t_max.y += t_delta.y
			cell.y += step.y
			hit_normal = Vector3i(0, -step.y, 0)
		else:
			dist = t_max.z
			t_max.z += t_delta.z
			cell.z += step.z
			hit_normal = Vector3i(0, 0, -step.z)

		if dist > max_vox_dist:
			break

	return {"hit": false}


func damage_voxel(
	cell: Vector3i,
	amount: float,
	allow_steel_cut: bool = false,
	check_collapse: bool = true
) -> Dictionary:
	var cc := cell_to_chunk_coord(cell)
	var ch: VoxelChunk = chunks.get(cc, null)
	if ch == null:
		return {"destroyed": false, "mat_id": 0}
	var loc := cell_to_local(cell)
	var mat := ch.get_voxel(loc.x, loc.y, loc.z)
	if mat == 0 or VoxelMaterials.is_indestructible(mat):
		return {"destroyed": false, "mat_id": mat}
	if VoxelMaterials.is_hammer_immune(mat) and not allow_steel_cut:
		return {"destroyed": false, "mat_id": mat, "blocked": true}

	var res := ch.apply_damage(loc.x, loc.y, loc.z, amount)
	if bool(res["destroyed"]):
		_mark_dirty(cc)
		_mark_boundary_neighbors(cc, loc)
		voxels_destroyed_total += 1
		var wpos := cell_to_world_center(cell)
		_spawn_debris_burst(wpos, VoxelMaterials.get_color(mat), 4)
		var exp_r := VoxelMaterials.get_explosive_radius(mat)
		if exp_r > 0.0:
			detonate_explosion(wpos, exp_r, 85.0, true)
		elif check_collapse:
			_handle_structural_collapse([cell], wpos)
		voxels_changed.emit(1)
		return {"destroyed": true, "mat_id": mat}
	return {"destroyed": false, "mat_id": mat}


func carve_sphere(
	world_pos: Vector3,
	radius: float,
	base_damage: float,
	allow_steel_cut: bool = false,
	check_collapse: bool = true
) -> int:
	var min_c := Vector3i(floor((world_pos - Vector3.ONE * radius) / VOXEL_SIZE))
	var max_c := Vector3i(ceil((world_pos + Vector3.ONE * radius) / VOXEL_SIZE))
	var r2 := radius * radius
	var destroyed_cells: Array[Vector3i] = []
	var fuel_blasts: Array[Vector3] = []

	for y in range(min_c.y, max_c.y + 1):
		for z in range(min_c.z, max_c.z + 1):
			for x in range(min_c.x, max_c.x + 1):
				var cell := Vector3i(x, y, z)
				var cp := cell_to_world_center(cell)
				var d2 := cp.distance_squared_to(world_pos)
				if d2 > r2:
					continue
				var mat := get_voxel(cell)
				if mat == 0 or VoxelMaterials.is_indestructible(mat):
					continue
				if VoxelMaterials.is_hammer_immune(mat) and not allow_steel_cut:
					continue

				var falloff := clampf(1.0 - sqrt(d2) / maxf(radius, 0.01), 0.15, 1.0)
				var resist := VoxelMaterials.get_blast_resist(mat)
				var effective := base_damage * falloff * (1.15 - resist)
				var cc := cell_to_chunk_coord(cell)
				var ch: VoxelChunk = chunks.get(cc, null)
				if ch == null:
					continue
				var loc := cell_to_local(cell)
				var res := ch.apply_damage(loc.x, loc.y, loc.z, effective)
				if bool(res["destroyed"]):
					_mark_dirty(cc)
					_mark_boundary_neighbors(cc, loc)
					destroyed_cells.append(cell)
					if VoxelMaterials.get_explosive_radius(mat) > 0.0:
						fuel_blasts.append(cp)
					elif destroyed_cells.size() % 3 == 0:
						_spawn_debris_burst(cp, VoxelMaterials.get_color(mat), 2)

	if not destroyed_cells.is_empty():
		voxels_destroyed_total += destroyed_cells.size()
		voxels_changed.emit(destroyed_cells.size())
		if check_collapse:
			_handle_structural_collapse(destroyed_cells, world_pos)

	for fb in fuel_blasts:
		detonate_explosion(fb, 3.2, 85.0, true)

	return destroyed_cells.size()


func detonate_explosion(
	world_pos: Vector3,
	radius: float,
	blast_damage: float = 95.0,
	ignite_nearby: bool = true
) -> int:
	if _explosion_depth >= MAX_EXPLOSION_DEPTH:
		return 0
	_explosion_depth += 1
	var destroyed := carve_sphere(world_pos, radius, blast_damage, true, true)
	if ignite_nearby and fire_sim != null:
		fire_sim.ignite_sphere(world_pos, radius * 1.15, self)
	_spawn_debris_burst(world_pos, Color(1.0, 0.58, 0.16), 14)
	_spawn_debris_burst(world_pos, Color(0.28, 0.28, 0.30), 10)
	explosion_occurred.emit(world_pos, radius)
	_explosion_depth -= 1
	return destroyed


func place_bridge_span(start_world: Vector3, end_world: Vector3, width_voxels: int = 2) -> int:
	var dist := start_world.distance_to(end_world)
	if dist < 0.3 or dist > 16.0:
		return 0
	var steps := maxi(2, int(ceil(dist / (VOXEL_SIZE * 0.75))))
	var right_dir := (end_world - start_world).cross(Vector3.UP)
	if right_dir.length_squared() < 0.01:
		right_dir = Vector3.RIGHT
	right_dir = right_dir.normalized()

	var placed := 0
	for i in range(steps + 1):
		var t := float(i) / float(steps)
		var p := start_world.lerp(end_world, t)
		for w in range(-width_voxels + 1, width_voxels):
			var wp := p + right_dir * (float(w) * VOXEL_SIZE * 0.65)
			var c := world_to_cell(wp)
			if c.y <= 0:
				continue
			if get_voxel(c) == 0:
				if set_voxel(c, VoxelMaterials.Id.BRIDGE):
					placed += 1
	return placed


func _handle_structural_collapse(destroyed_cells: Array[Vector3i], impulse_origin: Vector3) -> void:
	var clusters := VoxelConnectivity.find_unsupported_clusters(self, destroyed_cells, anchor_max_y, 1536)
	for cl in clusters:
		var cells: Array[Vector3i] = cl["cells"]
		var mats: PackedByteArray = cl["mats"]
		for c in cells:
			set_voxel(c, 0)
		if cells.size() >= 4:
			_spawn_detached_cluster_body(cells, mats, impulse_origin)
		else:
			for i in range(cells.size()):
				_spawn_debris_burst(cell_to_world_center(cells[i]), VoxelMaterials.get_color(mats[i]), 3)


func _spawn_detached_cluster_body(
	cells: Array[Vector3i],
	mats: PackedByteArray,
	impulse_origin: Vector3
) -> void:
	if DisplayServer.get_name() == "headless" and cells.size() > 512:
		return
	while _detached_bodies.size() >= max_active_debris_bodies:
		var oldest: Dictionary = _detached_bodies.pop_front()
		var old_body: RigidBody3D = oldest["body"]
		if old_body != null and is_instance_valid(old_body):
			old_body.queue_free()

	var min_c := cells[0]
	var max_c := cells[0]
	for c in cells:
		min_c = min_c.min(c)
		max_c = max_c.max(c)

	var span := max_c - min_c + Vector3i.ONE
	# If cluster spans <= 16^3, reuse greedy mesher + greedy boxes directly!
	var center_world := (Vector3(min_c) + Vector3(span) * 0.5) * VOXEL_SIZE
	var body := RigidBody3D.new()
	body.name = "DetachedCluster"
	body.position = center_world
	body.mass = clampf(float(cells.size()) * 1.4, 4.0, 220.0)
	body.collision_layer = 2
	body.collision_mask = 1 | 2
	body.can_sleep = true

	var mesh_inst := MeshInstance3D.new()
	if span.x <= CHUNK_SIZE and span.y <= CHUNK_SIZE and span.z <= CHUNK_SIZE:
		var padded := PackedByteArray()
		padded.resize(VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE * VoxelMesher.PADDED_SIZE)
		var core := PackedByteArray()
		core.resize(VoxelChunk.VOLUME)
		for i in range(cells.size()):
			var loc := cells[i] - min_c
			core[(loc.y << 8) | (loc.z << 4) | loc.x] = mats[i]
			padded[VoxelMesher.padded_index(loc.x + 1, loc.y + 1, loc.z + 1)] = mats[i]

		var geom := VoxelMesher.build_chunk_geometry(padded)
		var offset := Vector3(span) * VOXEL_SIZE * 0.5
		var verts: PackedVector3Array = geom["verts"]
		for vi in range(verts.size()):
			verts[vi] -= offset
		geom["verts"] = verts
		mesh_inst.mesh = VoxelMesher.create_array_mesh(geom)
		mesh_inst.material_override = shared_material

		var boxes := VoxelMesher.build_greedy_boxes(core)
		for b in boxes:
			var cs := CollisionShape3D.new()
			var bs := BoxShape3D.new()
			bs.size = b["size"]
			cs.shape = bs
			cs.position = Vector3(b["center"]) - offset
			body.add_child(cs)
	else:
		# Simplified bounding hull + sampled visual cubes for huge multi-chunk collapses
		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(span) * VOXEL_SIZE
		cs.shape = bs
		body.add_child(cs)
		var box_m := BoxMesh.new()
		box_m.size = bs.size
		mesh_inst.mesh = box_m
		var std := StandardMaterial3D.new()
		std.albedo_color = VoxelMaterials.get_color(mats[0])
		mesh_inst.material_override = std

	body.add_child(mesh_inst)
	add_child(body)
	var push := (center_world - impulse_origin).normalized()
	if push.length_squared() < 0.01:
		push = Vector3(0.2, 0.5, 0.1).normalized()
	body.apply_impulse((push + Vector3(0.0, 0.25, 0.0)) * body.mass * 1.4)
	body.apply_torque_impulse(Vector3(randf_range(-1.5, 1.5), randf_range(-1.0, 1.0), randf_range(-1.5, 1.5)) * body.mass)
	_detached_bodies.append({"body": body, "age": 0.0})


func _setup_particle_pools() -> void:
	_debris_multimesh = MultiMeshInstance3D.new()
	_debris_multimesh.name = "DebrisMultiMesh"
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.instance_count = max_particles_budget
	var cube := BoxMesh.new()
	cube.size = Vector3(0.16, 0.16, 0.16)
	mm.mesh = cube
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.85
	mm.mesh.material = mat
	_debris_multimesh.multimesh = mm
	add_child(_debris_multimesh)

	_fire_multimesh = MultiMeshInstance3D.new()
	_fire_multimesh.name = "FireMultiMesh"
	var fmm := MultiMesh.new()
	fmm.transform_format = MultiMesh.TRANSFORM_3D
	fmm.use_colors = true
	fmm.instance_count = 96
	var fbox := BoxMesh.new()
	fbox.size = Vector3(0.42, 0.52, 0.42)
	fmm.mesh = fbox
	var fmat := StandardMaterial3D.new()
	fmat.vertex_color_use_as_albedo = true
	fmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fmm.mesh.material = fmat
	_fire_multimesh.multimesh = fmm
	add_child(_fire_multimesh)


func spawn_fx_burst(world_pos: Vector3, color: Color, count: int) -> void:
	_spawn_debris_burst(world_pos, color, count)


func _spawn_debris_burst(world_pos: Vector3, color: Color, count: int) -> void:
	for _i in range(count):
		if _particles.size() >= max_particles_budget:
			_particles.pop_front()
		var vel := Vector3(
			randf_range(-4.5, 4.5),
			randf_range(1.5, 6.5),
			randf_range(-4.5, 4.5)
		)
		_particles.append({
			"pos": world_pos + Vector3(randf_range(-0.15, 0.15), randf_range(-0.15, 0.15), randf_range(-0.15, 0.15)),
			"vel": vel,
			"col": color,
			"age": 0.0,
			"life": randf_range(0.55, 1.35),
			"scale": randf_range(0.7, 1.4),
		})


func _update_particles(dt: float) -> void:
	if _debris_multimesh == null or _debris_multimesh.multimesh == null:
		return
	var mm: MultiMesh = _debris_multimesh.multimesh
	var alive: Array[Dictionary] = []
	for p in _particles:
		var age: float = float(p["age"]) + dt
		if age >= float(p["life"]):
			continue
		var vel: Vector3 = p["vel"]
		vel.y -= 13.5 * dt
		var pos: Vector3 = p["pos"] + vel * dt
		if pos.y < 0.55:
			pos.y = 0.55
			vel.y *= -0.35
			vel.x *= 0.7
			vel.z *= 0.7
		p["age"] = age
		p["vel"] = vel
		p["pos"] = pos
		alive.append(p)
	_particles = alive

	var count := mm.instance_count
	var hidden_xform := Transform3D(Basis.IDENTITY.scaled(Vector3.ZERO), Vector3(0.0, -500.0, 0.0))
	for i in range(count):
		if i < _particles.size():
			var p: Dictionary = _particles[i]
			var s: float = float(p["scale"]) * (1.0 - float(p["age"]) / float(p["life"]))
			var xform := Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * maxf(s, 0.05)), p["pos"])
			mm.set_instance_transform(i, xform)
			mm.set_instance_color(i, p["col"])
		else:
			mm.set_instance_transform(i, hidden_xform)


func _update_detached_bodies(dt: float) -> void:
	var kept: Array[Dictionary] = []
	for item in _detached_bodies:
		var body: RigidBody3D = item["body"]
		if body == null or not is_instance_valid(body):
			continue
		var age: float = float(item["age"]) + dt
		if age > 16.0 or body.position.y < -30.0:
			body.queue_free()
			continue
		item["age"] = age
		kept.append(item)
	_detached_bodies = kept


func _update_fire_visuals() -> void:
	if _fire_multimesh == null or _fire_multimesh.multimesh == null or fire_sim == null:
		return
	var fmm: MultiMesh = _fire_multimesh.multimesh
	var fires := fire_sim.active_fires.keys()
	var t := float(Time.get_ticks_msec()) * 0.008
	var hidden := Transform3D(Basis.IDENTITY.scaled(Vector3.ZERO), Vector3(0.0, -500.0, 0.0))
	for i in range(fmm.instance_count):
		if i < fires.size():
			var c: Vector3i = fires[i]
			var wpos := cell_to_world_center(c)
			var flick := 0.85 + 0.25 * sin(t + float(i) * 1.7)
			var xf := Transform3D(Basis.IDENTITY.scaled(Vector3(flick, flick * 1.35, flick)), wpos + Vector3(0.0, 0.12, 0.0))
			fmm.set_instance_transform(i, xf)
			var col := Color(1.0, 0.45 + 0.35 * sin(t + float(i)), 0.08, 1.0)
			fmm.set_instance_color(i, col)
		else:
			fmm.set_instance_transform(i, hidden)


func get_active_chunk_count() -> int:
	return chunks.size()


func get_active_debris_body_count() -> int:
	return _detached_bodies.size()


func get_active_particle_count() -> int:
	return _particles.size()
