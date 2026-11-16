class_name VoxelSerializer
extends RefCounted
## Compact versioned binary world state serializer (FLSV v1 with RLE + ZSTD compression).

const MAGIC := "FLSV"
const FORMAT_VERSION := 1


static func serialize_world(world: Node, meta_state: Dictionary = {}) -> PackedByteArray:
	var buf := StreamPeerBuffer.new()
	buf.big_endian = false
	buf.put_data(MAGIC.to_ascii_buffer())
	buf.put_u16(FORMAT_VERSION)
	buf.put_u16(0)

	var meta_json := JSON.stringify(meta_state).to_utf8_buffer()
	buf.put_u32(meta_json.size())
	buf.put_data(meta_json)

	# Collect active non-empty chunks sorted deterministically
	var coords: Array[Vector3i] = []
	for k in world.chunks.keys():
		var ch: VoxelChunk = world.chunks[k]
		if ch != null and not ch.is_empty():
			coords.append(ch.coord)
	coords.sort_custom(func(a: Vector3i, b: Vector3i) -> bool:
		if a.y != b.y:
			return a.y < b.y
		if a.z != b.z:
			return a.z < b.z
		return a.x < b.x
	)

	buf.put_u32(coords.size())
	for c in coords:
		var ch: VoxelChunk = world.chunks[c]
		buf.put_32(c.x)
		buf.put_32(c.y)
		buf.put_32(c.z)
		var rle := _encode_rle(ch.voxels)
		buf.put_u32(rle.size())
		buf.put_data(rle)

	# Active fire coordinates
	var fires: Dictionary = world.fire_sim.active_fires if world.fire_sim != null else {}
	buf.put_u32(fires.size())
	for fk in fires.keys():
		var fc: Vector3i = fk
		buf.put_32(fc.x)
		buf.put_32(fc.y)
		buf.put_32(fc.z)
		buf.put_float(float(fires[fk]))

	var raw: PackedByteArray = buf.data_array
	var compressed: PackedByteArray = raw.compress(FileAccess.COMPRESSION_ZSTD)
	var out := StreamPeerBuffer.new()
	out.big_endian = false
	out.put_data(MAGIC.to_ascii_buffer())
	out.put_u32(raw.size())
	out.put_data(compressed)
	return out.data_array


static func deserialize_into_world(packet: PackedByteArray, world: Node) -> Dictionary:
	if packet.size() < 12:
		return {"ok": false, "error": "packet_too_small"}

	var outer := StreamPeerBuffer.new()
	outer.big_endian = false
	outer.data_array = packet
	var outer_magic := outer.get_data(4)
	if int(outer_magic[0]) != OK or PackedByteArray(outer_magic[1]).get_string_from_ascii() != MAGIC:
		return {"ok": false, "error": "invalid_magic"}

	var raw_size := outer.get_u32()
	if raw_size <= 0 or raw_size > 16_000_000:
		return {"ok": false, "error": "invalid_uncompressed_size"}

	var comp_res := outer.get_data(outer.get_available_bytes())
	if int(comp_res[0]) != OK:
		return {"ok": false, "error": "corrupt_payload"}

	var raw: PackedByteArray = PackedByteArray(comp_res[1]).decompress(raw_size, FileAccess.COMPRESSION_ZSTD)
	if raw.size() != raw_size:
		return {"ok": false, "error": "decompress_failed"}

	var buf := StreamPeerBuffer.new()
	buf.big_endian = false
	buf.data_array = raw
	var inner_magic := buf.get_data(4)
	if int(inner_magic[0]) != OK or PackedByteArray(inner_magic[1]).get_string_from_ascii() != MAGIC:
		return {"ok": false, "error": "invalid_inner_magic"}

	var version := buf.get_u16()
	var flags := buf.get_u16()
	if version != FORMAT_VERSION or flags > 65535:
		return {"ok": false, "error": "unsupported_version"}

	var meta_len := buf.get_u32()
	var meta_data := buf.get_data(meta_len)
	if int(meta_data[0]) != OK:
		return {"ok": false, "error": "corrupt_meta"}
	var meta_str := PackedByteArray(meta_data[1]).get_string_from_utf8()
	var meta_parsed: Variant = JSON.parse_string(meta_str)
	var meta: Dictionary = meta_parsed if typeof(meta_parsed) == TYPE_DICTIONARY else {}

	world.clear_world()
	var chunk_count := buf.get_u32()
	for _i in range(chunk_count):
		var cx := buf.get_32()
		var cy := buf.get_32()
		var cz := buf.get_32()
		var rle_len := buf.get_u32()
		var rle_res := buf.get_data(rle_len)
		if int(rle_res[0]) != OK:
			return {"ok": false, "error": "corrupt_chunk"}
		var voxels := _decode_rle(PackedByteArray(rle_res[1]), VoxelChunk.VOLUME)
		if voxels.size() != VoxelChunk.VOLUME:
			return {"ok": false, "error": "bad_rle_length"}
		world.restore_chunk_voxels(Vector3i(cx, cy, cz), voxels)

	var fire_count := buf.get_u32()
	for _j in range(fire_count):
		var fx := buf.get_32()
		var fy := buf.get_32()
		var fz := buf.get_32()
		var f_rem := buf.get_float()
		if world.fire_sim != null:
			world.fire_sim.active_fires[Vector3i(fx, fy, fz)] = f_rem

	return {"ok": true, "meta": meta}


static func save_to_file(path: String, world: Node, meta_state: Dictionary) -> bool:
	var bytes := serialize_world(world, meta_state)
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_buffer(bytes)
	return true


static func load_from_file(path: String, world: Node) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "error": "not_found"}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {"ok": false, "error": "open_failed"}
	var bytes := f.get_buffer(f.get_length())
	return deserialize_into_world(bytes, world)


static func _encode_rle(voxels: PackedByteArray) -> PackedByteArray:
	var out := PackedByteArray()
	if voxels.is_empty():
		return out
	var n := voxels.size()
	var i := 0
	while i < n:
		var val := voxels[i]
		var run := 1
		while i + run < n and voxels[i + run] == val and run < 255:
			run += 1
		out.append(run)
		out.append(val)
		i += run
	return out


static func _decode_rle(rle: PackedByteArray, expected_size: int) -> PackedByteArray:
	var out := PackedByteArray()
	var i := 0
	while i + 1 < rle.size():
		var run := rle[i]
		var val := rle[i + 1]
		for _k in range(run):
			out.append(val)
		i += 2
	if out.size() != expected_size:
		return PackedByteArray()
	return out
