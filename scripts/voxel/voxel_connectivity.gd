class_name VoxelConnectivity
extends RefCounted
## Incremental local BFS structural stability analyzer for severed voxel islands.

const DIRS := [
	Vector3i(1, 0, 0),
	Vector3i(-1, 0, 0),
	Vector3i(0, 1, 0),
	Vector3i(0, -1, 0),
	Vector3i(0, 0, 1),
	Vector3i(0, 0, -1),
]


static func find_unsupported_clusters(
	world: Node,
	destroyed_cells: Array[Vector3i],
	anchor_max_y: int = 1,
	max_scan: int = 2048
) -> Array[Dictionary]:
	var clusters: Array[Dictionary] = []
	if destroyed_cells.is_empty():
		return clusters

	var seed_candidates: Array[Vector3i] = []
	var seed_seen: Dictionary = {}
	for dc in destroyed_cells:
		for d in DIRS:
			var nb: Vector3i = dc + d
			if seed_seen.has(nb):
				continue
			seed_seen[nb] = true
			if nb.y <= anchor_max_y:
				continue
			var mat: int = world.get_voxel(nb)
			if mat != 0 and not VoxelMaterials.is_indestructible(mat):
				seed_candidates.append(nb)

	if seed_candidates.is_empty():
		return clusters

	var global_confirmed_anchored: Dictionary = {}
	var global_detached: Dictionary = {}

	for s in seed_candidates:
		if global_confirmed_anchored.has(s) or global_detached.has(s):
			continue
		var s_mat: int = world.get_voxel(s)
		if s_mat == 0 or VoxelMaterials.is_indestructible(s_mat):
			continue

		var queue: Array[Vector3i] = [s]
		var local_mats: Dictionary = {s: s_mat}
		var head := 0
		var anchored := false
		var hit_scan_cap := false

		while head < queue.size():
			var cur: Vector3i = queue[head]
			head += 1

			for d in DIRS:
				var nb: Vector3i = cur + d
				if global_confirmed_anchored.has(nb):
					anchored = true
					break
				if local_mats.has(nb) or global_detached.has(nb):
					continue
				var nb_mat: int = world.get_voxel(nb)
				if nb_mat == 0:
					continue
				if nb.y <= anchor_max_y or VoxelMaterials.is_indestructible(nb_mat):
					anchored = true
					break

				local_mats[nb] = nb_mat
				queue.append(nb)
				if queue.size() >= max_scan:
					anchored = true
					hit_scan_cap = true
					break

			if anchored:
				break

		if anchored:
			if not hit_scan_cap:
				for k in local_mats.keys():
					global_confirmed_anchored[k] = true
		else:
			var cells: Array[Vector3i] = []
			var mats := PackedByteArray()
			cells.resize(queue.size())
			mats.resize(queue.size())
			for i in range(queue.size()):
				var c: Vector3i = queue[i]
				cells[i] = c
				mats[i] = int(local_mats[c])
				global_detached[c] = true
			clusters.append({
				"cells": cells,
				"mats": mats,
			})

	return clusters
