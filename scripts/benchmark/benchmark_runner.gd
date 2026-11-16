extends SceneTree
## Headless reproducible 4-phase benchmark for CI profiling & optimization validation.

var _world: VoxelWorld
var _entity_root: Node3D
var _phase_stats: Array[Dictionary] = []


func _initialize() -> void:
	print("=== Fracture Line Reproducible Benchmark ===")
	call_deferred("_run_benchmark")


func _run_benchmark() -> void:
	_world = VoxelWorld.new()
	root.add_child(_world)
	_entity_root = Node3D.new()
	root.add_child(_entity_root)

	var t_build0 := Time.get_ticks_usec()
	LevelBuilder.build_level(_world, _entity_root, "dock", "mission_1_dock", false)
	var initial_build_ms := float(Time.get_ticks_usec() - t_build0) / 1000.0
	await process_frame

	# Phase 1: Baseline idle / traverse
	_phase_stats.append(await _measure_phase("flythrough", 40, func(_step: int) -> void:
		pass
	))

	# Phase 2: Rapid local breaches (simulating hammer/lance across wall)
	_phase_stats.append(await _measure_phase("breach_series", 30, func(step: int) -> void:
		if step % 3 == 0:
			var p := Vector3(8.0 + float(step) * 0.45, 2.0, 6.2)
			_world.carve_sphere(p, 0.72, 35.0, false, true)
	))

	# Phase 3: Heavy explosion + fuel chain
	_phase_stats.append(await _measure_phase("mega_blast", 35, func(step: int) -> void:
		if step == 2:
			_world.detonate_explosion(Vector3(36.5, 2.0, 11.5), 3.0, 120.0, true)
	))

	# Phase 4: Multi-pillar crane container structural collapse
	_phase_stats.append(await _measure_phase("pillar_collapse", 45, func(step: int) -> void:
		if step == 2:
			_world.carve_sphere(Vector3(40.25, 2.0, 23.25), 1.0, 200.0, true, true)
		elif step == 6:
			_world.carve_sphere(Vector3(43.75, 2.0, 23.25), 1.0, 200.0, true, true)
	))

	var mem_static_mb := float(OS.get_static_memory_usage()) / (1024.0 * 1024.0)
	var report := {
		"engine": Engine.get_version_info().get("string", "4.7.2"),
		"headless": DisplayServer.get_name() == "headless",
		"initial_level_build_ms": snappedf(initial_build_ms, 0.01),
		"static_memory_mb": snappedf(mem_static_mb, 0.01),
		"final_active_chunks": _world.get_active_chunk_count(),
		"final_triangles": _world.total_triangles,
		"final_colliders": _world.total_colliders,
		"final_rigid_bodies": _world.get_active_debris_body_count(),
		"voxels_destroyed": _world.voxels_destroyed_total,
		"phases": _phase_stats,
	}

	var json_str := JSON.stringify(report, "  ")
	print("BENCHMARK_JSON_BEGIN")
	print(json_str)
	print("BENCHMARK_JSON_END")

	var f := FileAccess.open("user://benchmark_report.json", FileAccess.WRITE)
	if f != null:
		f.store_string(json_str)

	_entity_root.queue_free()
	_world.queue_free()
	await process_frame
	quit(0)


func _measure_phase(phase_name: String, frames: int, step_cb: Callable) -> Dictionary:
	var times_ms: Array[float] = []
	var max_chunk_ms := 0.0
	for i in range(frames):
		var t0 := Time.get_ticks_usec()
		step_cb.call(i)
		await process_frame
		var dt_ms := float(Time.get_ticks_usec() - t0) / 1000.0
		times_ms.append(dt_ms)
		max_chunk_ms = maxf(max_chunk_ms, _world.last_chunk_build_ms)

	times_ms.sort()
	var total := 0.0
	for t in times_ms:
		total += t
	var avg := total / maxf(float(times_ms.size()), 1.0)
	var p95_idx := mini(times_ms.size() - 1, int(floorf(float(times_ms.size()) * 0.95)))
	return {
		"phase": phase_name,
		"frames": frames,
		"cpu_frame_avg_ms": snappedf(avg, 0.02),
		"cpu_frame_p95_ms": snappedf(times_ms[p95_idx], 0.02),
		"cpu_frame_max_ms": snappedf(times_ms[times_ms.size() - 1], 0.02),
		"max_chunk_build_ms": snappedf(max_chunk_ms, 0.02),
		"active_chunks": _world.get_active_chunk_count(),
		"triangles": _world.total_triangles,
		"rigid_bodies": _world.get_active_debris_body_count(),
		"particles": _world.get_active_particle_count(),
	}
