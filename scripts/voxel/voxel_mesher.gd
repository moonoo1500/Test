class_name VoxelMesher
extends RefCounted
## Thread-safe greedy meshing with corner vertex AO and 3D greedy BoxShape3D decomposition.

const CHUNK_SIZE := 16
const PADDED_SIZE := 18
const VOXEL_SIZE := 0.5
const CHUNK_WORLD_SIZE := 8.0

# Face directions: 0:+X, 1:-X, 2:+Y, 3:-Y, 4:+Z, 5:-Z
const NORMALS := [
	Vector3(1.0, 0.0, 0.0),
	Vector3(-1.0, 0.0, 0.0),
	Vector3(0.0, 1.0, 0.0),
	Vector3(0.0, -1.0, 0.0),
	Vector3(0.0, 0.0, 1.0),
	Vector3(0.0, 0.0, -1.0),
]

# Axis mappings per direction: [normal_axis, u_axis, v_axis, axis_sign]
# Chosen so v_axis x u_axis == outward normal (Godot CW front-face invariant!)
const FACE_AXES := [
	[0, 2, 1, 1],   # +X: (+Y) x (+Z) = +X
	[0, 1, 2, -1],  # -X: (+Z) x (+Y) = -X
	[1, 0, 2, 1],   # +Y: (+Z) x (+X) = +Y
	[1, 2, 0, -1],  # -Y: (+X) x (+Z) = -Y
	[2, 1, 0, 1],   # +Z: (+X) x (+Y) = +Z
	[2, 0, 1, -1],  # -Z: (+Y) x (+X) = -Z
]

const AO_LEVELS := [1.0, 0.85, 0.70, 0.56]


static func core_index(x: int, y: int, z: int) -> int:
	return (y << 8) | (z << 4) | x


static func padded_index(x: int, y: int, z: int) -> int:
	return (y * PADDED_SIZE + z) * PADDED_SIZE + x


static func _is_solid_padded(padded: PackedByteArray, px: int, py: int, pz: int) -> int:
	if px < 0 or px >= PADDED_SIZE or py < 0 or py >= PADDED_SIZE or pz < 0 or pz >= PADDED_SIZE:
		return 0
	return 1 if padded[(py * PADDED_SIZE + pz) * PADDED_SIZE + px] != 0 else 0


static func _vertex_ao(s1: int, s2: int, corner: int) -> int:
	if s1 != 0 and s2 != 0:
		return 3
	return s1 + s2 + corner


static func build_chunk_geometry(padded: PackedByteArray) -> Dictionary:
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var uv2s := PackedVector2Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()

	var mask := PackedInt32Array()
	mask.resize(CHUNK_SIZE * CHUNK_SIZE)

	for d in range(6):
		var axis_cfg: Array = FACE_AXES[d]
		var n_axis: int = axis_cfg[0]
		var u_axis: int = axis_cfg[1]
		var v_axis: int = axis_cfg[2]
		var n_sign: int = axis_cfg[3]
		var normal: Vector3 = NORMALS[d]
		var slice_offset: int = 1 if n_sign > 0 else 0

		for w in range(CHUNK_SIZE):
			mask.fill(0)
			var any_face := false

			for v in range(CHUNK_SIZE):
				for u in range(CHUNK_SIZE):
					var p := [0, 0, 0]
					p[n_axis] = w + 1
					p[u_axis] = u + 1
					p[v_axis] = v + 1
					var mat: int = padded[padded_index(p[0], p[1], p[2])]
					if mat == 0:
						continue

					var np := [p[0], p[1], p[2]]
					np[n_axis] += n_sign
					var neighbor: int = padded[padded_index(np[0], np[1], np[2])]
					if neighbor != 0:
						continue

					# Compute 4 corner AO values in neighbor plane np
					var ao0 := _sample_corner_ao(padded, np, u_axis, v_axis, -1, -1)
					var ao1 := _sample_corner_ao(padded, np, u_axis, v_axis, 1, -1)
					var ao2 := _sample_corner_ao(padded, np, u_axis, v_axis, 1, 1)
					var ao3 := _sample_corner_ao(padded, np, u_axis, v_axis, -1, 1)
					var key: int = mat | (ao0 << 8) | (ao1 << 10) | (ao2 << 12) | (ao3 << 14)
					mask[v * CHUNK_SIZE + u] = key
					any_face = true

			if not any_face:
				continue

			# Greedy merge 2D mask
			for v in range(CHUNK_SIZE):
				var u := 0
				while u < CHUNK_SIZE:
					var key: int = mask[v * CHUNK_SIZE + u]
					if key == 0:
						u += 1
						continue

					var quad_w := 1
					while u + quad_w < CHUNK_SIZE and mask[v * CHUNK_SIZE + (u + quad_w)] == key:
						quad_w += 1

					var quad_h := 1
					var can_expand := true
					while v + quad_h < CHUNK_SIZE and can_expand:
						var row_off: int = (v + quad_h) * CHUNK_SIZE
						for k in range(quad_w):
							if mask[row_off + u + k] != key:
								can_expand = false
								break
						if can_expand:
							quad_h += 1

					for dv in range(quad_h):
						var row_off: int = (v + dv) * CHUNK_SIZE
						for du in range(quad_w):
							mask[row_off + u + du] = 0

					var mat_id: int = key & 0xFF
					var ao0: int = (key >> 8) & 0x3
					var ao1: int = (key >> 10) & 0x3
					var ao2: int = (key >> 12) & 0x3
					var ao3: int = (key >> 14) & 0x3
					var base_col: Color = VoxelMaterials.get_color(mat_id)

					var base_p := [0.0, 0.0, 0.0]
					base_p[n_axis] = float(w + slice_offset) * VOXEL_SIZE
					base_p[u_axis] = float(u) * VOXEL_SIZE
					base_p[v_axis] = float(v) * VOXEL_SIZE

					var du_vec := [0.0, 0.0, 0.0]
					du_vec[u_axis] = float(quad_w) * VOXEL_SIZE
					var dv_vec := [0.0, 0.0, 0.0]
					dv_vec[v_axis] = float(quad_h) * VOXEL_SIZE

					var p0 := Vector3(base_p[0], base_p[1], base_p[2])
					var du3 := Vector3(du_vec[0], du_vec[1], du_vec[2])
					var dv3 := Vector3(dv_vec[0], dv_vec[1], dv_vec[2])
					var p1 := p0 + du3
					var p2 := p0 + du3 + dv3
					var p3 := p0 + dv3

					var vi := verts.size()
					verts.append(p0)
					verts.append(p1)
					verts.append(p2)
					verts.append(p3)

					norms.append(normal)
					norms.append(normal)
					norms.append(normal)
					norms.append(normal)

					uvs.append(Vector2(0.0, 0.0))
					uvs.append(Vector2(float(quad_w), 0.0))
					uvs.append(Vector2(float(quad_w), float(quad_h)))
					uvs.append(Vector2(0.0, float(quad_h)))

					var uv2_val := Vector2(float(mat_id), 0.0)
					uv2s.append(uv2_val)
					uv2s.append(uv2_val)
					uv2s.append(uv2_val)
					uv2s.append(uv2_val)

					colors.append(_shade_ao(base_col, ao0))
					colors.append(_shade_ao(base_col, ao1))
					colors.append(_shade_ao(base_col, ao2))
					colors.append(_shade_ao(base_col, ao3))

					# Godot CW front-face winding with AO diagonal flip
					# Verified against BoxMesh: (V[i2] - V[i0]).cross(V[i1] - V[i0]) == +normal
					if ao0 + ao2 > ao1 + ao3:
						indices.append(vi + 1)
						indices.append(vi + 2)
						indices.append(vi + 3)
						indices.append(vi + 1)
						indices.append(vi + 3)
						indices.append(vi + 0)
					else:
						indices.append(vi + 0)
						indices.append(vi + 1)
						indices.append(vi + 2)
						indices.append(vi + 0)
						indices.append(vi + 2)
						indices.append(vi + 3)

					u += quad_w

	return {
		"verts": verts,
		"norms": norms,
		"uvs": uvs,
		"uv2s": uv2s,
		"colors": colors,
		"indices": indices,
	}


static func _sample_corner_ao(
	padded: PackedByteArray,
	np: Array,
	u_axis: int,
	v_axis: int,
	su: int,
	sv: int
) -> int:
	var p_u := [np[0], np[1], np[2]]
	p_u[u_axis] += su
	var p_v := [np[0], np[1], np[2]]
	p_v[v_axis] += sv
	var p_c := [np[0], np[1], np[2]]
	p_c[u_axis] += su
	p_c[v_axis] += sv

	var s1 := _is_solid_padded(padded, p_u[0], p_u[1], p_u[2])
	var s2 := _is_solid_padded(padded, p_v[0], p_v[1], p_v[2])
	var c := _is_solid_padded(padded, p_c[0], p_c[1], p_c[2])
	return _vertex_ao(s1, s2, c)


static func _shade_ao(base: Color, ao: int) -> Color:
	var f: float = AO_LEVELS[ao]
	return Color(base.r * f, base.g * f, base.b * f, base.a)


static func build_greedy_boxes(core: PackedByteArray) -> Array[Dictionary]:
	var boxes: Array[Dictionary] = []
	if core.size() != CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE:
		return boxes

	var visited := PackedByteArray()
	visited.resize(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE)

	for y in range(CHUNK_SIZE):
		for z in range(CHUNK_SIZE):
			for x in range(CHUNK_SIZE):
				var idx := (y << 8) | (z << 4) | x
				if core[idx] == 0 or visited[idx] != 0:
					continue

				# Expand X
				var sx := 1
				while x + sx < CHUNK_SIZE:
					var nidx := (y << 8) | (z << 4) | (x + sx)
					if core[nidx] == 0 or visited[nidx] != 0:
						break
					sx += 1

				# Expand Z
				var sz := 1
				var z_ok := true
				while z + sz < CHUNK_SIZE and z_ok:
					var row_base := (y << 8) | ((z + sz) << 4) | x
					for dx in range(sx):
						if core[row_base + dx] == 0 or visited[row_base + dx] != 0:
							z_ok = false
							break
					if z_ok:
						sz += 1

				# Expand Y
				var sy := 1
				var y_ok := true
				while y + sy < CHUNK_SIZE and y_ok:
					var y_base := ((y + sy) << 8) | (z << 4) | x
					for dz in range(sz):
						var row_base := y_base + (dz << 4)
						for dx in range(sx):
							if core[row_base + dx] == 0 or visited[row_base + dx] != 0:
								y_ok = false
								break
						if not y_ok:
							break
					if y_ok:
						sy += 1

				# Mark visited
				for dy in range(sy):
					var y_base := ((y + dy) << 8) | (z << 4) | x
					for dz in range(sz):
						var row_base := y_base + (dz << 4)
						for dx in range(sx):
							visited[row_base + dx] = 1

				var size_v := Vector3(float(sx), float(sy), float(sz)) * VOXEL_SIZE
				var origin_v := Vector3(float(x), float(y), float(z)) * VOXEL_SIZE
				boxes.append({
					"center": origin_v + size_v * 0.5,
					"size": size_v,
				})

	return boxes


static func create_array_mesh(geom: Dictionary) -> ArrayMesh:
	var verts: PackedVector3Array = geom.get("verts", PackedVector3Array())
	if verts.is_empty():
		return null
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = geom["norms"]
	arrays[Mesh.ARRAY_TEX_UV] = geom["uvs"]
	arrays[Mesh.ARRAY_TEX_UV2] = geom["uv2s"]
	arrays[Mesh.ARRAY_COLOR] = geom["colors"]
	arrays[Mesh.ARRAY_INDEX] = geom["indices"]
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
